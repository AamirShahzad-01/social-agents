"""
Instagram API Router
Production-ready Instagram posting endpoints
Supports: feed posts, reels, stories, carousels
Uses Facebook Graph API v24.0
"""
import logging
from typing import Optional, List, Literal
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field

from ....services.social_service import social_service
from ....services.supabase_service import verify_jwt, db_select, db_update
from ....services.credentials import MetaCredentialsService
from ....services.storage_service import storage_service
from ....services.rate_limit_service import get_rate_limit_service
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/social/instagram", tags=["Instagram"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class InstagramPostRequest(BaseModel):
    """Instagram post request"""
    caption: str = Field(default="", max_length=2200, description="Post caption (max 2,200 chars)")
    imageUrl: Optional[str] = Field(default=None, description="Image or video URL")
    mediaType: Optional[Literal["image", "video", "reel", "reels", "carousel", "story"]] = Field(default=None, description="Media type")
    carouselUrls: Optional[List[str]] = Field(default=None, description="2-10 URLs for carousel")
    carouselImages: Optional[List[str]] = Field(default=None, description="Alias for carouselUrls (frontend compatibility)")
    postType: Optional[Literal["post", "reel", "story"]] = Field(default="post", description="Post type")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")
    
    def model_post_init(self, __context) -> None:
        # Merge carouselImages into carouselUrls for compatibility
        if self.carouselImages and not self.carouselUrls:
            object.__setattr__(self, 'carouselUrls', self.carouselImages)


class InstagramUploadMediaRequest(BaseModel):
    """Instagram media upload request"""
    mediaData: str = Field(..., description="Base64 encoded media data")


class InstagramPostResponse(BaseModel):
    """Instagram post response"""
    success: bool
    postId: str
    postUrl: str
    caption: str
    postType: str
    mediaCount: int


class InstagramUploadResponse(BaseModel):
    """Instagram upload response"""
    success: bool
    imageUrl: str
    fileName: str


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_instagram_credentials(
    user_id: str,
    workspace_id: str,
    is_cron: bool = False
):
    """
    Get Instagram credentials using centralized MetaCredentialsService
    
    Args:
        user_id: User ID
        workspace_id: Workspace ID
        is_cron: Whether this is a cron request (False = refresh if needed, True = use cache)
        
    Returns:
        Instagram credentials dict
        
    Raises:
        HTTPException: If credentials not found or expired
    """
    # Use centralized credentials service
    # refresh_if_needed=True for publish button, False for cron jobs
    refresh_if_needed = not is_cron
    credentials = await MetaCredentialsService.get_instagram_credentials(
        workspace_id,
        refresh_if_needed=refresh_if_needed
    )
    
    if not credentials:
        raise HTTPException(status_code=400, detail="Instagram not connected")
    
    if credentials.get("is_expired"):
        raise HTTPException(
            status_code=401,
            detail="Access token expired. Please reconnect your Instagram account."
        )
    
    ig_user_id = credentials.get("ig_user_id")
    if not credentials.get("access_token") or not ig_user_id:
        raise HTTPException(status_code=400, detail="Invalid Instagram configuration")
    
    # Return in expected format for social_service
    return {
        "accessToken": credentials.get("access_token"),
        "userId": ig_user_id,
        "instagramAccountId": ig_user_id,
        "username": credentials.get("username"),
        "pageId": credentials.get("page_id"),
        "expiresAt": credentials.get("expires_at"),
    }


def validate_media_url(url: str) -> None:
    """
    Validate that media URL is publicly accessible
    
    Args:
        url: Media URL to validate
        
    Raises:
        HTTPException: If URL is not valid
    """
    if url.startswith('blob:') or url.startswith('data:'):
        raise HTTPException(
            status_code=400,
            detail="Instagram requires publicly accessible URLs. Please upload the media first."
        )
    
    # Check for expired Canva URLs
    if 'export-download.canva.com' in url and 'X-Amz-Expires' in url:
        from urllib.parse import urlparse, parse_qs
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            
            if 'X-Amz-Date' in params and 'X-Amz-Expires' in params:
                amz_date = params['X-Amz-Date'][0]
                amz_expires = int(params['X-Amz-Expires'][0])
                
                # Parse date (format: 20251128T041159Z)
                year = amz_date[0:4]
                month = amz_date[4:6]
                day = amz_date[6:8]
                hour = amz_date[9:11]
                minute = amz_date[11:13]
                second = amz_date[13:15]
                
                signed_date = datetime.strptime(
                    f"{year}-{month}-{day}T{hour}:{minute}:{second}Z",
                    "%Y-%m-%dT%H:%M:%SZ"
                )
                expiration_date = signed_date + timedelta(seconds=amz_expires)
                
                if datetime.utcnow() > expiration_date:
                    raise HTTPException(
                        status_code=400,
                        detail="Media URL has expired. Please re-export your Canva design or re-upload the images."
                    )
        except HTTPException:
            raise
        except Exception:
            # If we can't parse, assume it might be expired
            raise HTTPException(
                status_code=400,
                detail="Media URL may have expired. Please re-upload the images."
            )


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/post", response_model=InstagramPostResponse)
async def post_to_instagram(
    request_body: InstagramPostRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/instagram/post
    
    Post content to Instagram
    
    Supports:
    - Feed posts (images)
    - Video posts
    - Instagram Reels (short-form vertical video)
    - Instagram Stories (24-hour temporary posts)
    - Carousels (2-10 mixed images/videos)
    
    Features:
    - Automatic token refresh (7 days before expiration)
    - Cron job support for scheduled posts
    - App secret proof for enhanced security
    - Container status polling for videos
    - URL validation (no blob: or data: URLs)
    
    Args:
        request_body: Post request data
        request: FastAPI request
        x_cron_secret: Cron secret header (for scheduled posts)
        
    Returns:
        InstagramPostResponse with post ID and URL
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
        final_caption = request_body.caption or ""
        is_carousel = request_body.carouselUrls and len(request_body.carouselUrls) >= 2
        
        if not is_carousel and not request_body.imageUrl:
            raise HTTPException(status_code=400, detail="Media URL is required for Instagram")
        
        # Validate URLs
        if is_carousel:
            for url in request_body.carouselUrls:
                validate_media_url(url)
        elif request_body.imageUrl:
            validate_media_url(request_body.imageUrl)
        
        # Get Instagram credentials
        credentials = await get_instagram_credentials(user_id, workspace_id, is_cron)
        
        # Get app secret
        app_secret = settings.FACEBOOK_CLIENT_SECRET or getattr(settings, 'INSTAGRAM_APP_SECRET', None)
        if not app_secret:
            raise HTTPException(status_code=500, detail="Instagram app secret not configured")
        
        # Detect post type
        is_video = (
            request_body.mediaType in ["video", "reel", "reels"] or
            (request_body.imageUrl and any(ext in request_body.imageUrl.lower() for ext in ['.mp4', '.mov', 'video']))
        )
        is_reel = request_body.mediaType in ["reel", "reels"]
        is_story = request_body.postType == "story"
        
        # Post to Instagram
        container_id = None
        post_type_label = "image"
        media_count = 1
        
        if is_story:
            # Create Story container
            post_type_label = "story"
            container_result = await social_service.instagram_create_story_container(
                credentials["userId"],
                credentials["accessToken"],
                request_body.imageUrl,
                is_video
            )
            if not container_result.get("success"):
                raise HTTPException(status_code=500, detail=container_result.get("error"))
            container_id = container_result["container_id"]
            
        elif is_carousel:
            # Create carousel container
            post_type_label = "carousel"
            media_count = len(request_body.carouselUrls)
            container_result = await social_service.instagram_create_carousel_container(
                credentials["userId"],
                credentials["accessToken"],
                request_body.carouselUrls,
                final_caption
            )
            if not container_result.get("success"):
                raise HTTPException(status_code=500, detail=container_result.get("error"))
            container_id = container_result["container_id"]
            
        elif is_reel or is_video:
            # Create Reels container (Instagram deprecated VIDEO media_type)
            post_type_label = "reel" if is_reel else "video"
            container_result = await social_service.instagram_create_reels_container(
                credentials["userId"],
                credentials["accessToken"],
                request_body.imageUrl,
                final_caption,
                share_to_feed=True
            )
            if not container_result.get("success"):
                raise HTTPException(status_code=500, detail=container_result.get("error"))
            container_id = container_result["container_id"]
            
        else:
            # Create image container
            container_result = await social_service.instagram_create_media_container(
                credentials["userId"],
                credentials["accessToken"],
                request_body.imageUrl,
                final_caption
            )
            if not container_result.get("success"):
                raise HTTPException(status_code=500, detail=container_result.get("error"))
            container_id = container_result["container_id"]
        
        # Wait for container to be ready
        needs_more_time = is_video or is_reel or is_carousel or (is_story and is_video)
        max_attempts = 60 if needs_more_time else 30
        delay_ms = 2000 if needs_more_time else 1000
        
        ready = await social_service.instagram_wait_for_container_ready(
            container_id,
            credentials["accessToken"],
            max_attempts=max_attempts,
            delay_ms=delay_ms
        )
        
        if not ready:
            raise HTTPException(status_code=500, detail="Timeout waiting for media container to process")
        
        # Publish the container
        publish_result = await social_service.instagram_publish_media_container(
            credentials["userId"],
            credentials["accessToken"],
            container_id
        )
        
        if not publish_result.get("success"):
            raise HTTPException(status_code=500, detail=publish_result.get("error"))
        
        post_id = publish_result["post_id"]
        
        # Generate post URL
        post_url = (
            f"https://www.instagram.com/stories/{post_id}" if is_story
            else f"https://www.instagram.com/p/{post_id}"
        )
        
        # Track rate limit usage
        try:
            rate_limit_service = get_rate_limit_service()
            await rate_limit_service.increment_usage(workspace_id, "instagram", 1)
        except Exception as rl_err:
            logger.warning(f"Rate limit tracking failed (non-critical): {rl_err}")
        
        logger.info(f"Posted to Instagram - workspace: {workspace_id}, type: {post_type_label}")
        
        return InstagramPostResponse(
            success=True,
            postId=post_id,
            postUrl=post_url,
            caption=final_caption,
            postType=post_type_label,
            mediaCount=media_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Instagram post error: {e}", exc_info=True)
        
        # Provide user-friendly error messages
        error_msg = str(e)
        if "Media ID is not available" in error_msg:
            detail = "Instagram could not process the media. Please ensure the image/video URL is publicly accessible and in a supported format (JPEG, PNG for images; MP4 for videos)."
        elif "Invalid image" in error_msg:
            detail = "The image format is not supported by Instagram. Please use JPEG or PNG format."
        elif "rate limit" in error_msg:
            detail = "Instagram rate limit reached. Please try again later."
        elif "Carousel item processing failed" in error_msg:
            detail = "One or more carousel items failed to process. Please ensure all images are JPEG/PNG and videos are MP4 format with proper encoding."
        elif "Timeout waiting" in error_msg:
            detail = "Video processing timed out. Please try with a shorter video or check the video format (MP4, H.264 codec recommended)."
        elif "container expired" in error_msg:
            detail = "Media container expired. Please try again with a fresh upload."
        elif "could not be fetched" in error_msg or "download has failed" in error_msg:
            detail = "Instagram could not download the media. The URL may have expired. Please re-export from Canva or re-upload the images."
        else:
            detail = f"Failed to post to Instagram: {error_msg}"
        
        raise HTTPException(status_code=500, detail=detail)


@router.post("/upload-media", response_model=InstagramUploadResponse)
async def upload_media_for_instagram(
    request_body: InstagramUploadMediaRequest,
    request: Request
):
    """
    POST /api/v1/social/instagram/upload-media
    
    Upload media to storage and return public URL for Instagram API
    
    Instagram requires publicly accessible URLs for images/videos.
    This endpoint uploads to Supabase Storage and returns the public URL.
    
    Args:
        request_body: Upload request with base64 media data
        request: FastAPI request
        
    Returns:
        InstagramUploadResponse with public URL
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
        
        # Get Instagram credentials (to verify connection)
        await get_instagram_credentials(user["id"], workspace_id)
        
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
        
        # Validate file size (max 8MB for Instagram images, 100MB for videos)
        max_size = 100 * 1024 * 1024 if 'video' in content_type else 8 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds {max_size // (1024 * 1024)}MB limit"
            )
        
        # Generate filename
        import mimetypes
        ext = mimetypes.guess_extension(content_type) or ".jpg"
        filename = f"instagram_{int(datetime.utcnow().timestamp())}_{workspace_id[:8]}{ext}"
        
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
        
        logger.info(f"Uploaded media for Instagram - workspace: {workspace_id}")
        
        return InstagramUploadResponse(
            success=True,
            imageUrl=upload_result["url"],
            fileName=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Instagram upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload media: {str(e)}")


@router.get("/verify")
async def verify_instagram_connection(request: Request):
    """
    GET /api/v1/social/instagram/verify
    
    Verify Instagram connection status
    
    Returns:
        Connection status and account info
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
        
        # Get Instagram credentials
        try:
            credentials = await get_instagram_credentials(user["id"], workspace_id)
            
            return {
                "success": True,
                "connected": True,
                "userId": credentials.get("userId"),
                "username": credentials.get("username"),
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
        logger.error(f"Instagram verify error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def instagram_api_info():
    """Instagram API information"""
    return {
        "success": True,
        "message": "Instagram API is operational",
        "version": "1.0.0",
        "graphApiVersion": "v24.0",
        "endpoints": {
            "post": "POST /post - Post content to Instagram",
            "uploadMedia": "POST /upload-media - Upload media to storage",
            "verify": "GET /verify - Verify connection status"
        },
        "supportedPostTypes": ["image", "video", "reel", "story", "carousel"],
        "notes": [
            "Instagram requires publicly accessible URLs (no blob: or data: URLs)",
            "Caption max length: 2,200 characters",
            "Carousel: 2-10 items (mixed images/videos)",
            "Videos must be MP4 format, H.264 codec recommended",
            "All videos use REELS media_type (VIDEO deprecated)"
        ]
    }
