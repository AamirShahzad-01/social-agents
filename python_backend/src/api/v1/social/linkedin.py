"""
LinkedIn API Router
Production-ready LinkedIn posting endpoints
Supports: text posts, images, videos, carousels
Uses LinkedIn REST API v2 with API Version 202411
"""
import logging
import mimetypes
from typing import Optional, List, Literal
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field
import httpx

from ....services.platforms.linkedin_service import linkedin_service
from ....services.supabase_service import verify_jwt, db_select, db_update
from ....services.storage_service import storage_service
from ....services.rate_limit_service import get_rate_limit_service
from ....services.token_refresh_service import token_refresh_service
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/social/linkedin", tags=["LinkedIn"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class LinkedInPostRequest(BaseModel):
    """LinkedIn post request"""
    text: str = Field(default="", max_length=3000, description="Post text (max 3,000 chars)")
    visibility: Literal["PUBLIC", "CONNECTIONS"] = Field(default="PUBLIC", description="Post visibility")
    mediaUrn: Optional[str] = Field(default=None, description="Media URN from upload")
    mediaUrl: Optional[str] = Field(default=None, description="Media URL (alias for mediaUrn)")
    mediaType: Optional[Literal["image", "video"]] = Field(default=None, description="Media type for mediaUrl")
    postToPage: Optional[bool] = Field(default=None, description="Post to organization page")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")


class LinkedInCarouselRequest(BaseModel):
    """LinkedIn carousel request"""
    text: str = Field(..., description="Post text")
    imageUrls: List[str] = Field(..., min_items=2, max_items=20, description="2-20 image URLs")
    visibility: Literal["PUBLIC", "CONNECTIONS"] = Field(default="PUBLIC", description="Post visibility")
    postToPage: Optional[bool] = Field(default=None, description="Post to organization page")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")


class LinkedInUploadMediaRequest(BaseModel):
    """LinkedIn media upload request"""
    mediaData: str = Field(..., description="Base64 encoded media data")
    mediaType: Literal["image", "video"] = Field(default="image", description="Media type")


class LinkedInPostResponse(BaseModel):
    """LinkedIn post response"""
    success: bool
    postId: str
    postUrl: str
    text: str


class LinkedInCarouselResponse(BaseModel):
    """LinkedIn carousel response"""
    success: bool
    postId: str
    postUrl: str
    imageCount: int


class LinkedInUploadResponse(BaseModel):
    """LinkedIn upload response"""
    success: bool
    mediaUrn: str
    mediaType: str


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _infer_media_type(
    media_type: Optional[str],
    content_type: Optional[str],
    url: Optional[str]
) -> Optional[str]:
    if media_type in ("image", "video"):
        return media_type
    if content_type:
        if content_type.startswith("video/"):
            return "video"
        if content_type.startswith("image/"):
            return "image"
    if url:
        guessed_type, _ = mimetypes.guess_type(url)
        if guessed_type and guessed_type.startswith("video/"):
            return "video"
        if guessed_type and guessed_type.startswith("image/"):
            return "image"
    return None


async def _upload_media_bytes(
    access_token: str,
    author_id: str,
    media_bytes: bytes,
    media_type: str,
    is_organization: bool,
    text: str
) -> str:
    if media_type == "video":
        if len(media_bytes) > 5 * 1024 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Video size exceeds 5GB limit")

        init_result = await linkedin_service.initialize_video_upload(
            access_token,
            author_id,
            len(media_bytes),
            is_organization
        )
        if not init_result.get("success"):
            raise HTTPException(status_code=500, detail=init_result.get("error", "Failed to initialize video upload"))

        upload_result = await linkedin_service.upload_video_binary(
            init_result["upload_instructions"],
            media_bytes,
            access_token
        )
        if not upload_result.get("success"):
            raise HTTPException(status_code=500, detail=upload_result.get("error", "Failed to upload video"))

        finalize_result = await linkedin_service.finalize_video_upload(
            access_token,
            init_result["asset"],
            upload_result.get("uploaded_part_ids", []),
            init_result.get("upload_token", "")
        )
        if not finalize_result.get("success"):
            raise HTTPException(status_code=500, detail=finalize_result.get("error", "Failed to finalize video upload"))

        return init_result["asset"]

    if len(media_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 10MB limit")

    result = await linkedin_service.upload_image(
        access_token,
        author_id,
        media_bytes,
        is_organization
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to upload image"))

    return result["asset"]


async def _resolve_media_urn(
    media: Optional[str],
    media_type: Optional[str],
    access_token: str,
    author_id: str,
    is_organization: bool,
    text: str
) -> Optional[str]:
    if not media:
        return None
    if media.startswith("urn:li:"):
        return media
    if media.startswith("http://") or media.startswith("https://"):
        async with httpx.AsyncClient() as client:
            response = await client.get(media)
            response.raise_for_status()
            content_type = response.headers.get("content-type")
            resolved_type = _infer_media_type(media_type, content_type, media)
            if not resolved_type:
                raise HTTPException(status_code=400, detail="Unsupported media type")
            return await _upload_media_bytes(
                access_token,
                author_id,
                response.content,
                resolved_type,
                is_organization,
                text
            )
    return media

async def get_linkedin_credentials(
    user_id: str,
    workspace_id: str,
    is_cron: bool = False
):
    """
    Get LinkedIn credentials from database
    
    Args:
        user_id: User ID
        workspace_id: Workspace ID
        is_cron: Whether this is a cron request
        
    Returns:
        LinkedIn credentials dict
        
    Raises:
        HTTPException: If credentials not found or expired
    """
    # Check connection status in social_accounts table
    result = await db_select(
        table="social_accounts",
        columns="account_id,is_connected",
        filters={
            "workspace_id": workspace_id,
            "platform": "linkedin"
        },
        limit=1
    )
    
    if not result.get("success") or not result.get("data"):
        raise HTTPException(status_code=400, detail="LinkedIn not connected")
    
    account = result["data"][0]
    account_id = account.get("account_id")
    
    if not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="LinkedIn account is not connected")
    
    refresh_result = await token_refresh_service.get_valid_credentials(
        platform="linkedin",
        workspace_id=workspace_id,
        account_id=account_id
    )
    
    if not refresh_result.success or not refresh_result.credentials:
        if refresh_result.needs_reconnect:
            raise HTTPException(
                status_code=401,
                detail="Access token expired. Please reconnect your LinkedIn account."
            )
        raise HTTPException(status_code=400, detail=refresh_result.error or "LinkedIn not connected")
    
    credentials = refresh_result.credentials
    
    # Check for profile ID - auth saves as userId, with fallback to profileId
    profile_id = credentials.get("userId") or credentials.get("profileId")
    if not credentials.get("accessToken") or not profile_id:
        raise HTTPException(status_code=400, detail="Invalid LinkedIn configuration")
    
    # Normalize field name for consistency with publishing service
    if not credentials.get("profileId") and profile_id:
        credentials["profileId"] = profile_id
    
    return credentials


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/post", response_model=LinkedInPostResponse)
async def post_to_linkedin(
    request_body: LinkedInPostRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/linkedin/post
    
    Post content to LinkedIn
    
    Supports:
    - Text posts
    - Image posts (with mediaUrn)
    - Video posts (with mediaUrn)
    - Personal profile posts
    - Organization/company page posts
    
    Features:
    - Automatic token refresh (7 days before expiration)
    - Cron job support for scheduled posts
    - Organization page posting support
    - Visibility control (PUBLIC/CONNECTIONS)
    
    Args:
        request_body: Post request data
        request: FastAPI request
        x_cron_secret: Cron secret header (for scheduled posts)
        
    Returns:
        LinkedInPostResponse with post ID and URL
    """
    try:
        # Check if this is a cron request
        is_cron = (
            x_cron_secret == settings.CRON_SECRET and
            request_body.scheduledPublish
        ) if hasattr(settings, 'CRON_SECRET') else False
        
        # Authenticate user
        if is_cron:
            # Cron request: use provided userId and workspaceId
            if not request_body.userId or not request_body.workspaceId:
                raise HTTPException(
                    status_code=400,
                    detail="userId and workspaceId required for scheduled publish"
                )
            user_id = request_body.userId
            workspace_id = request_body.workspaceId
        else:
            # Regular user request: verify JWT
            auth_header = request.headers.get("authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Unauthorized")
            
            token = auth_header.split(" ")[1]
            jwt_result = await verify_jwt(token)
            
            if not jwt_result.get("success") or not jwt_result.get("user"):
                raise HTTPException(status_code=401, detail="Invalid token")
            
            user = jwt_result["user"]
            user_id = user["id"]
            workspace_id = user.get("workspaceId")
            
            if not workspace_id:
                raise HTTPException(status_code=400, detail="No workspace found")
        
        # Validate input
        final_text = request_body.text or ""
        media = request_body.mediaUrn or request_body.mediaUrl
        
        if not final_text and not media:
            raise HTTPException(status_code=400, detail="Text or media is required")
        
        # Get LinkedIn credentials
        credentials = await get_linkedin_credentials(user_id, workspace_id, is_cron)
        
        # Determine if posting to organization page or personal profile
        should_post_to_page = request_body.postToPage if request_body.postToPage is not None else credentials.get("postToPage", False)
        has_organization = bool(credentials.get("organizationId"))
        
        # Use organization ID if posting to page, otherwise use personal profile ID
        author_id = credentials["organizationId"] if (should_post_to_page and has_organization) else credentials["profileId"]
        is_organization = should_post_to_page and has_organization

        resolved_media = await _resolve_media_urn(
            media,
            request_body.mediaType,
            credentials["accessToken"],
            author_id,
            is_organization,
            final_text
        )
        
        # Post to LinkedIn
        result = await linkedin_service.post_to_linkedin(
            credentials["accessToken"],
            author_id,
            final_text,
            request_body.visibility,
            resolved_media,
            is_organization
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to post"))
        
        # Generate post URL
        post_id = result["post_id"]
        post_url = f"https://www.linkedin.com/feed/update/{post_id}"
        
        # Track rate limit usage
        try:
            rate_limit_service = get_rate_limit_service()
            await rate_limit_service.increment_usage(workspace_id, "linkedin", 1)
        except Exception as rl_err:
            logger.warning(f"Rate limit tracking failed (non-critical): {rl_err}")
        
        logger.info(f"Posted to LinkedIn - workspace: {workspace_id}, org: {is_organization}")
        
        return LinkedInPostResponse(
            success=True,
            postId=post_id,
            postUrl=post_url,
            text=final_text
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LinkedIn post error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to post to LinkedIn: {str(e)}")


@router.post("/carousel", response_model=LinkedInCarouselResponse)
async def post_carousel_to_linkedin(
    request_body: LinkedInCarouselRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/linkedin/carousel
    
    Post multi-image carousel to LinkedIn
    
    Process:
    1. Download images from URLs
    2. Upload images concurrently to LinkedIn (max 5 parallel)
    3. Create carousel post with image URNs
    
    Args:
        request_body: Carousel request data
        request: FastAPI request
        
    Returns:
        LinkedInCarouselResponse with post ID and URL
    """
    try:
        # Check if this is a cron request
        is_cron = (
            x_cron_secret == settings.CRON_SECRET and
            request_body.scheduledPublish
        ) if hasattr(settings, 'CRON_SECRET') else False

        # Authenticate user
        if is_cron:
            if not request_body.userId or not request_body.workspaceId:
                raise HTTPException(
                    status_code=400,
                    detail="userId and workspaceId required for scheduled publish"
                )
            user_id = request_body.userId
            workspace_id = request_body.workspaceId
        else:
            auth_header = request.headers.get("authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Unauthorized")

            token = auth_header.split(" ")[1]
            jwt_result = await verify_jwt(token)

            if not jwt_result.get("success") or not jwt_result.get("user"):
                raise HTTPException(status_code=401, detail="Invalid token")

            user = jwt_result["user"]
            user_id = user["id"]
            workspace_id = user.get("workspaceId")

            if not workspace_id:
                raise HTTPException(status_code=400, detail="No workspace found")

        # Get LinkedIn credentials
        credentials = await get_linkedin_credentials(user_id, workspace_id, is_cron)
        
        # Determine author
        should_post_to_page = request_body.postToPage if request_body.postToPage is not None else credentials.get("postToPage", False)
        has_organization = bool(credentials.get("organizationId"))
        author_id = credentials["organizationId"] if (should_post_to_page and has_organization) else credentials["profileId"]
        is_organization = should_post_to_page and has_organization
        
        # Download images
        import httpx
        image_buffers = []
        
        async with httpx.AsyncClient() as client:
            for i, url in enumerate(request_body.imageUrls):
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    image_buffers.append(response.content)
                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to download image {i + 1}: {str(e)}"
                    )
        
        # Upload images and create carousel
        result = await linkedin_service.upload_and_post_carousel(
            credentials["accessToken"],
            author_id,
            request_body.text,
            image_buffers,
            request_body.visibility,
            is_organization,
            concurrency=5
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        
        post_id = result["post_id"]
        post_url = f"https://www.linkedin.com/feed/update/{post_id}"
        
        # Track rate limit usage
        try:
            rate_limit_service = get_rate_limit_service()
            await rate_limit_service.increment_usage(workspace_id, "linkedin", 1)
        except Exception as rl_err:
            logger.warning(f"Rate limit tracking failed (non-critical): {rl_err}")
        
        logger.info(f"Posted carousel to LinkedIn - workspace: {workspace_id}, images: {len(image_buffers)}")
        
        return LinkedInCarouselResponse(
            success=True,
            postId=post_id,
            postUrl=post_url,
            imageCount=len(request_body.imageUrls)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LinkedIn carousel error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to post carousel: {str(e)}")


@router.post("/upload-media", response_model=LinkedInUploadResponse)
async def upload_media_for_linkedin(
    request_body: LinkedInUploadMediaRequest,
    request: Request
):
    """
    POST /api/v1/social/linkedin/upload-media
    
    Upload media to LinkedIn and return URN
    
    Supports:
    - Images (returns urn:li:image:{id})
    - Videos (returns urn:li:video:{id})
    
    Args:
        request_body: Upload request with base64 media data
        request: FastAPI request
        
    Returns:
        LinkedInUploadResponse with media URN
    """
    try:
        # Authenticate user
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        token = auth_header.split(" ")[1]
        jwt_result = await verify_jwt(token)
        
        if not jwt_result.get("success") or not jwt_result.get("user"):
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = jwt_result["user"]
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=400, detail="No workspace found")
        
        # Get LinkedIn credentials
        credentials = await get_linkedin_credentials(user["id"], workspace_id)
        
        # Determine author
        should_post_to_page = credentials.get("postToPage", False)
        has_organization = bool(credentials.get("organizationId"))
        author_id = credentials["organizationId"] if (should_post_to_page and has_organization) else credentials["profileId"]
        is_organization = should_post_to_page and has_organization
        
        media_data = request_body.mediaData

        if media_data.startswith("urn:li:"):
            urn_type = request_body.mediaType or ("video" if media_data.startswith("urn:li:video:") else "image")
            return LinkedInUploadResponse(
                success=True,
                mediaUrn=media_data,
                mediaType=urn_type
            )

        if media_data.startswith("http://") or media_data.startswith("https://"):
            async with httpx.AsyncClient() as client:
                response = await client.get(media_data)
                response.raise_for_status()
                content_type = response.headers.get("content-type")
                resolved_type = _infer_media_type(request_body.mediaType, content_type, media_data)
                if not resolved_type:
                    raise HTTPException(status_code=400, detail="Unsupported media type")

                media_urn = await _upload_media_bytes(
                    credentials["accessToken"],
                    author_id,
                    response.content,
                    resolved_type,
                    is_organization,
                    ""
                )

            logger.info(f"Uploaded {resolved_type} to LinkedIn - workspace: {workspace_id}")

            return LinkedInUploadResponse(
                success=True,
                mediaUrn=media_urn,
                mediaType=resolved_type
            )

        # Parse base64 data
        import re
        import base64

        match = re.match(r'^data:(.+);base64,(.+)$', media_data)
        if not match:
            raise HTTPException(status_code=400, detail="Invalid base64 format")

        content_type = match.group(1)
        base64_content = match.group(2)

        # Decode base64
        file_data = base64.b64decode(base64_content)
        
        # Upload based on media type
        if request_body.mediaType == "video":
            # Validate file size (max 5GB for LinkedIn videos)
            if len(file_data) > 5 * 1024 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Video size exceeds 5GB limit")
            
            # Initialize video upload
            init_result = await linkedin_service.initialize_video_upload(
                credentials["accessToken"],
                author_id,
                len(file_data),
                is_organization
            )
            
            if not init_result.get("success"):
                raise HTTPException(status_code=500, detail=init_result.get("error"))
            
            # Upload video binary
            upload_result = await linkedin_service.upload_video_binary(
                init_result["upload_instructions"],
                file_data,
                credentials["accessToken"]
            )
            
            if not upload_result.get("success"):
                raise HTTPException(status_code=500, detail=upload_result.get("error"))
            
            # Finalize video upload
            finalize_result = await linkedin_service.finalize_video_upload(
                credentials["accessToken"],
                init_result["asset"],
                upload_result.get("uploaded_part_ids", []),
                init_result.get("upload_token", "")
            )
            
            if not finalize_result.get("success"):
                raise HTTPException(status_code=500, detail=finalize_result.get("error"))
            
            media_urn = init_result["asset"]
            
        else:
            # Validate file size (max 10MB for LinkedIn images)
            if len(file_data) > 10 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Image size exceeds 10MB limit")
            
            # Upload image
            result = await linkedin_service.upload_image(
                credentials["accessToken"],
                author_id,
                file_data,
                is_organization
            )
            
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error"))
            
            media_urn = result["asset"]
        
        logger.info(f"Uploaded {request_body.mediaType} to LinkedIn - workspace: {workspace_id}")
        
        return LinkedInUploadResponse(
            success=True,
            mediaUrn=media_urn,
            mediaType=request_body.mediaType
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LinkedIn upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload media: {str(e)}")


@router.get("/verify")
async def verify_linkedin_connection(request: Request):
    """
    GET /api/v1/social/linkedin/verify
    
    Verify LinkedIn connection status
    
    Returns:
        Connection status and profile info
    """
    try:
        # Authenticate user
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        token = auth_header.split(" ")[1]
        jwt_result = await verify_jwt(token)
        
        if not jwt_result.get("success") or not jwt_result.get("user"):
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = jwt_result["user"]
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=400, detail="No workspace found")
        
        # Get LinkedIn credentials
        try:
            credentials = await get_linkedin_credentials(user["id"], workspace_id)
            
            return {
                "success": True,
                "connected": True,
                "profileId": credentials.get("profileId"),
                "organizationId": credentials.get("organizationId"),
                "postToPage": credentials.get("postToPage", False),
                "expiresAt": credentials.get("expiresAt")
            }
        except HTTPException as e:
            return {
                "success": True,
                "connected": False,
                "error": str(e.detail)
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LinkedIn verify error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def linkedin_api_info():
    """LinkedIn API information"""
    return {
        "success": True,
        "message": "LinkedIn API is operational",
        "version": "1.0.0",
        "apiVersion": "202411",
        "endpoints": {
            "post": "POST /post - Post content to LinkedIn",
            "carousel": "POST /carousel - Post multi-image carousel",
            "uploadMedia": "POST /upload-media - Upload media and get URN",
            "verify": "GET /verify - Verify connection status"
        },
        "supportedPostTypes": ["text", "image", "video", "carousel"],
        "notes": [
            "Text max length: 3,000 characters",
            "Carousel: 2-20 images",
            "Image max size: 10MB",
            "Video max size: 5GB",
            "Supports personal and organization page posting",
            "Concurrent carousel uploads (5 parallel)"
        ]
    }
