"""
Facebook API Router
Production-ready Facebook posting endpoints
Supports: text posts, photos, videos, carousels, reels, stories
"""
import logging
from typing import Optional, List, Literal
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field

from ....services.social_service import social_service
from ....services.supabase_service import verify_jwt, db_select, db_update
from ....services.credentials import MetaCredentialsService
from ....services.storage_service import storage_service
from ....services.rate_limit_service import get_rate_limit_service
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/social/facebook", tags=["Facebook"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class FacebookPostRequest(BaseModel):
    """Facebook post request"""
    message: str = Field(default="", max_length=63206, description="Post message (max 63,206 chars)")
    imageUrl: Optional[str] = Field(default=None, description="Image or video URL")
    link: Optional[str] = Field(default=None, description="Link to share")
    mediaType: Optional[Literal["image", "video"]] = Field(default=None, description="Media type")
    postType: Optional[Literal["post", "reel", "story"]] = Field(default="post", description="Post type")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")


class FacebookCarouselRequest(BaseModel):
    """Facebook carousel request"""
    message: str = Field(..., description="Post message")
    imageUrls: List[str] = Field(..., min_items=2, description="At least 2 image URLs")


class FacebookUploadMediaRequest(BaseModel):
    """Facebook media upload request"""
    mediaData: str = Field(..., description="Base64 encoded media data")


class FacebookPostResponse(BaseModel):
    """Facebook post response"""
    success: bool
    postId: str
    postUrl: str
    message: str
    postType: str


class FacebookCarouselResponse(BaseModel):
    """Facebook carousel response"""
    success: bool
    postId: str
    postUrl: str
    imageCount: int


class FacebookUploadResponse(BaseModel):
    """Facebook upload response"""
    success: bool
    imageUrl: str
    fileName: str


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_facebook_credentials(
    user_id: str,
    workspace_id: str,
    is_cron: bool = False
):
    """
    Get Facebook credentials using centralized MetaCredentialsService
    
    Args:
        user_id: User ID
        workspace_id: Workspace ID
        is_cron: Whether this is a cron request (False = refresh if needed, True = use cache)
        
    Returns:
        Facebook credentials dict
        
    Raises:
        HTTPException: If credentials not found or expired
    """
    # Use centralized credentials service
    # refresh_if_needed=True for publish button, False for cron jobs
    refresh_if_needed = not is_cron
    credentials = await MetaCredentialsService.get_meta_credentials(
        workspace_id, 
        refresh_if_needed=refresh_if_needed
    )
    
    if not credentials:
        raise HTTPException(status_code=400, detail="Facebook not connected")
    
    if credentials.get("is_expired"):
        raise HTTPException(
            status_code=401,
            detail="Access token expired. Please reconnect your Facebook account."
        )
    
    if not credentials.get("access_token") or not credentials.get("page_id"):
        raise HTTPException(status_code=400, detail="Invalid Facebook configuration")
    
    # Return in expected format for social_service
    return {
        "accessToken": credentials.get("access_token"),
        "pageId": credentials.get("page_id"),
        "pageName": credentials.get("page_name"),
        "pageAccessToken": credentials.get("page_access_token") or credentials.get("access_token"),
        "expiresAt": credentials.get("expires_at"),
    }


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/post", response_model=FacebookPostResponse)
async def post_to_facebook(
    request_body: FacebookPostRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/facebook/post
    
    Post content to Facebook Page
    
    Supports:
    - Text posts
    - Photo posts
    - Video posts
    - Facebook Reels (short-form vertical video)
    - Facebook Stories (24-hour temporary posts)
    - Link sharing
    
    Features:
    - Automatic token refresh (7 days before expiration)
    - Cron job support for scheduled posts
    - App secret proof for enhanced security
    - Post type detection (text, photo, video, reel, story)
    
    Args:
        request_body: Post request data
        request: FastAPI request
        x_cron_secret: Cron secret header (for scheduled posts)
        
    Returns:
        FacebookPostResponse with post ID and URL
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
        has_media = request_body.imageUrl or request_body.mediaType == "video"
        final_message = request_body.message or ""
        
        if not final_message and not has_media:
            raise HTTPException(status_code=400, detail="Message or media is required")
        
        # Get Facebook credentials
        credentials = await get_facebook_credentials(user_id, workspace_id, is_cron)
        
        # Get app secret
        app_secret = settings.FACEBOOK_CLIENT_SECRET
        if not app_secret:
            raise HTTPException(status_code=500, detail="Facebook app secret not configured")
        
        # Detect post type
        is_video = (
            request_body.mediaType == "video" or
            (request_body.imageUrl and any(ext in request_body.imageUrl.lower() for ext in ['.mp4', '.mov', 'video']))
        )
        is_reel = request_body.postType == "reel"
        is_story = request_body.postType == "story"
        
        # Post to Facebook
        result = None
        post_type_label = "post"
        
        if is_reel and request_body.imageUrl:
            # Upload as Facebook Reel
            post_type_label = "reel"
            result = await social_service.facebook_upload_reel(
                credentials["pageId"],
                credentials["accessToken"],
                request_body.imageUrl,
                final_message
            )
        elif is_story and request_body.imageUrl:
            # Upload as Facebook Story
            post_type_label = "story"
            result = await social_service.facebook_upload_story(
                credentials["pageId"],
                credentials["accessToken"],
                request_body.imageUrl,
                is_video
            )
        elif request_body.imageUrl and is_video:
            # Upload regular video
            post_type_label = "video"
            result = await social_service.facebook_upload_video(
                credentials["pageId"],
                credentials["accessToken"],
                request_body.imageUrl,
                final_message
            )
        elif request_body.imageUrl:
            # Upload photo
            post_type_label = "photo"
            result = await social_service.facebook_post_photo(
                credentials["pageId"],
                credentials["accessToken"],
                request_body.imageUrl,
                final_message
            )
        else:
            # Post text only or with link
            post_type_label = "text"
            result = await social_service.facebook_post_to_page(
                credentials["pageId"],
                credentials["accessToken"],
                final_message,
                request_body.link
            )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to post"))
        
        # Generate post URL
        post_id = result.get("post_id") or result.get("id")
        post_url = f"https://www.facebook.com/{post_id}"
        
        # Track rate limit usage
        try:
            rate_limit_service = get_rate_limit_service()
            await rate_limit_service.increment_usage(workspace_id, "facebook", 1)
        except Exception as rl_err:
            logger.warning(f"Rate limit tracking failed (non-critical): {rl_err}")
        
        logger.info(f"Posted to Facebook - workspace: {workspace_id}, type: {post_type_label}")
        
        return FacebookPostResponse(
            success=True,
            postId=post_id,
            postUrl=post_url,
            message=final_message,
            postType=post_type_label
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Facebook post error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to post to Facebook: {str(e)}")


@router.post("/carousel", response_model=FacebookCarouselResponse)
async def post_carousel_to_facebook(
    request_body: FacebookCarouselRequest,
    request: Request
):
    """
    POST /api/v1/social/facebook/carousel
    
    Post multi-photo carousel to Facebook
    
    Process:
    1. Upload each photo as unpublished
    2. Create post with attached_media array
    
    Args:
        request_body: Carousel request data
        request: FastAPI request
        
    Returns:
        FacebookCarouselResponse with post ID and URL
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
        
        # Get Facebook credentials
        credentials = await get_facebook_credentials(user["id"], workspace_id)
        
        # Get app secret
        app_secret = settings.FACEBOOK_CLIENT_SECRET
        if not app_secret:
            raise HTTPException(status_code=500, detail="Facebook app secret not configured")
        
        # Upload each photo as unpublished
        photo_ids = []
        for i, image_url in enumerate(request_body.imageUrls):
            upload_result = await social_service.facebook_upload_photo_unpublished(
                credentials["pageId"],
                credentials["accessToken"],
                image_url
            )
            
            if not upload_result.get("success"):
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload photo {i + 1}: {upload_result.get('error')}"
                )
            
            photo_ids.append(upload_result["photo_id"])
        
        # Create carousel post
        carousel_result = await social_service.facebook_create_carousel(
            credentials["pageId"],
            credentials["accessToken"],
            photo_ids,
            request_body.message
        )
        
        if not carousel_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create carousel: {carousel_result.get('error')}"
            )
        
        post_id = carousel_result["post_id"]
        post_url = f"https://www.facebook.com/{post_id.replace('_', '/posts/')}"
        
        # Track rate limit usage
        try:
            rate_limit_service = get_rate_limit_service()
            await rate_limit_service.increment_usage(workspace_id, "facebook", 1)
        except Exception as rl_err:
            logger.warning(f"Rate limit tracking failed (non-critical): {rl_err}")
        
        logger.info(f"Posted carousel to Facebook - workspace: {workspace_id}, images: {len(photo_ids)}")
        
        return FacebookCarouselResponse(
            success=True,
            postId=post_id,
            postUrl=post_url,
            imageCount=len(request_body.imageUrls)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Facebook carousel error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to post carousel: {str(e)}")


@router.post("/upload-media", response_model=FacebookUploadResponse)
async def upload_media_for_facebook(
    request_body: FacebookUploadMediaRequest,
    request: Request
):
    """
    POST /api/v1/social/facebook/upload-media
    
    Upload media to storage and return public URL for Facebook API
    
    Facebook accepts public URLs for images/videos.
    This endpoint uploads to Supabase Storage and returns the public URL.
    
    Args:
        request_body: Upload request with base64 media data
        request: FastAPI request
        
    Returns:
        FacebookUploadResponse with public URL
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
        
        # Get Facebook credentials (to verify connection)
        await get_facebook_credentials(user["id"], workspace_id)
        
        # Parse base64 data
        import re
        import base64
        
        match = re.match(r'^data:(.+);base64,(.+)$', request_body.mediaData)
        if not match:
            raise HTTPException(status_code=400, detail="Invalid base64 format")
        
        content_type = match.group(1)
        base64_content = match.group(2)
        
        # Decode base64
        file_data = base64.b64decode(base64_content)
        
        # Validate file size (max 10MB for Facebook images)
        if len(file_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size exceeds 10MB limit")
        
        # Generate filename
        import mimetypes
        ext = mimetypes.guess_extension(content_type) or ".jpg"
        filename = f"facebook_{int(datetime.utcnow().timestamp())}_{workspace_id[:8]}{ext}"
        
        # Upload to storage
        upload_result = await storage_service.upload_file(
            file_path=f"{workspace_id}/{filename}",
            file_data=file_data,
            content_type=content_type,
            bucket="media"
        )
        
        if not upload_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload: {upload_result.get('error')}"
            )
        
        logger.info(f"Uploaded media for Facebook - workspace: {workspace_id}")
        
        return FacebookUploadResponse(
            success=True,
            imageUrl=upload_result["url"],
            fileName=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Facebook upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload media: {str(e)}")


@router.get("/verify")
async def verify_facebook_connection(request: Request):
    """
    GET /api/v1/social/facebook/verify
    
    Verify Facebook connection status
    
    Returns:
        Connection status and page info
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
        
        # Get Facebook credentials
        try:
            credentials = await get_facebook_credentials(user["id"], workspace_id)
            
            return {
                "success": True,
                "connected": True,
                "pageId": credentials.get("pageId"),
                "pageName": credentials.get("pageName"),
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
        logger.error(f"Facebook verify error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def facebook_api_info():
    """Facebook API information"""
    return {
        "success": True,
        "message": "Facebook API is operational",
        "version": "1.0.0",
        "graphApiVersion": "v24.0",
        "endpoints": {
            "post": "POST /post - Post content to Facebook",
            "carousel": "POST /carousel - Post multi-photo carousel",
            "uploadMedia": "POST /upload-media - Upload media to storage",
            "verify": "GET /verify - Verify connection status"
        },
        "supportedPostTypes": ["text", "photo", "video", "reel", "story", "carousel"]
    }
