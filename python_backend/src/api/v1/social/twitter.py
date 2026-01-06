"""
Twitter/X API Router
Production-ready X posting endpoints
Supports: tweets with text and media
Uses X API v2 with OAuth 1.0a authentication
"""
import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field

from ....services.platforms.twitter_service import twitter_service
from ....services.supabase_service import verify_jwt, db_select
from ....services.storage_service import storage_service
from ....services.rate_limit_service import RateLimitService
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/social/twitter", tags=["Twitter"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class TwitterPostRequest(BaseModel):
    """Twitter post request"""
    text: str = Field(default="", max_length=280, description="Tweet text (max 280 chars)")
    mediaIds: Optional[List[str]] = Field(default=None, description="Media IDs from upload")
    mediaUrl: Optional[str] = Field(default=None, description="Media URL to upload")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")


class TwitterUploadMediaRequest(BaseModel):
    """Twitter media upload request"""
    mediaData: str = Field(..., description="Base64 encoded media data")
    mediaType: Optional[str] = Field(default="image", description="Media type (image/video/gif)")


class TwitterPostResponse(BaseModel):
    """Twitter post response"""
    success: bool
    tweetId: str
    tweetUrl: str
    text: str


class TwitterUploadResponse(BaseModel):
    """Twitter upload response"""
    success: bool
    mediaId: str


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_twitter_credentials(
    user_id: str,
    workspace_id: str,
    is_cron: bool = False
):
    """
    Get Twitter credentials from database
    
    Args:
        user_id: User ID
        workspace_id: Workspace ID
        is_cron: Whether this is a cron request
        
    Returns:
        Twitter credentials dict
        
    Raises:
        HTTPException: If credentials not found
    """
    # Get credentials from social_accounts table
    result = await db_select(
        table="social_accounts",
        columns="credentials,is_active",
        filters={
            "workspace_id": workspace_id,
            "platform": "twitter"
        },
        limit=1
    )
    
    if not result.get("success") or not result.get("data"):
        raise HTTPException(
            status_code=400,
            detail="X not connected. Please connect your X account in Settings."
        )
    
    account = result["data"][0]
    
    if not account.get("is_active"):
        raise HTTPException(status_code=400, detail="X account is inactive")
    
    credentials = account.get("credentials_encrypted", {})
    
    # OAuth 2.0 requires accessToken only
    # OAuth 1.0a also needs accessTokenSecret (for legacy media upload)
    if not credentials.get("accessToken"):
        raise HTTPException(
            status_code=400,
            detail="Invalid X configuration. Please reconnect your account."
        )
    
    # For OAuth 2.0 flow, we don't have accessTokenSecret
    # Set empty string as placeholder for OAuth 1.0a signature if not present
    if not credentials.get("accessTokenSecret"):
        credentials["accessTokenSecret"] = ""
    
    return credentials


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/post", response_model=TwitterPostResponse)
async def post_to_twitter(
    request_body: TwitterPostRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/twitter/post
    
    Post tweet to X (Twitter)
    
    Supports:
    - Text tweets (max 280 characters)
    - Tweets with media (images, videos, GIFs)
    - Multiple media attachments (up to 4 images or 1 video/GIF)
    
    Features:
    - OAuth 1.0a authentication (tokens don't expire)
    - Cron job support for scheduled tweets
    - Media upload support
    
    Args:
        request_body: Post request data
        request: FastAPI request
        x_cron_secret: Cron secret header (for scheduled posts)
        
    Returns:
        TwitterPostResponse with tweet ID and URL
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
        has_media = request_body.mediaIds or request_body.mediaUrl
        
        if not final_text and not has_media:
            raise HTTPException(status_code=400, detail="Text or media is required")
        
        # Get Twitter credentials
        credentials = await get_twitter_credentials(user_id, workspace_id, is_cron)
        
        # Handle media upload if mediaUrl provided
        media_ids = request_body.mediaIds or []
        
        if request_body.mediaUrl and not media_ids:
            # Upload media from URL
            upload_result = await twitter_service.upload_media_from_url(
                credentials["accessToken"],
                credentials["accessTokenSecret"],
                request_body.mediaUrl
            )
            
            if not upload_result.get("success"):
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload media: {upload_result.get('error')}"
                )
            
            media_ids = [upload_result["media_id"]]
        
        # Post tweet
        result = await twitter_service.post_tweet(
            credentials["accessToken"],
            credentials["accessTokenSecret"],
            final_text,
            media_ids if media_ids else None
        )
        
        if not result.get("success"):
            error_msg = result.get("error", "Failed to post")
            
            # Check if it's an authentication error
            if "authentication" in error_msg.lower() or "unauthorized" in error_msg.lower():
                raise HTTPException(
                    status_code=401,
                    detail="X authentication failed. Please reconnect your account."
                )
            
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Generate tweet URL (x.com is the new domain)
        username = credentials.get("username", "user")
        tweet_id = result["tweet_id"]
        tweet_url = f"https://x.com/{username}/status/{tweet_id}"
        
        # Increment rate limit usage
        await RateLimitService.increment_usage(workspace_id, "twitter", 1)
        
        logger.info(f"Posted to X - workspace: {workspace_id}")
        
        return TwitterPostResponse(
            success=True,
            tweetId=tweet_id,
            tweetUrl=tweet_url,
            text=result["text"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"X post error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to post to X: {str(e)}")


@router.post("/upload-media", response_model=TwitterUploadResponse)
async def upload_media_for_twitter(
    request_body: TwitterUploadMediaRequest,
    request: Request
):
    """
    POST /api/v1/social/twitter/upload-media
    
    Upload media to X and return media ID
    
    Supports:
    - Images (JPEG, PNG, GIF)
    - Videos (MP4, MOV)
    - Animated GIFs
    
    Args:
        request_body: Upload request with base64 media data
        request: FastAPI request
        
    Returns:
        TwitterUploadResponse with media ID
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
        
        # Get Twitter credentials
        credentials = await get_twitter_credentials(user["id"], workspace_id)
        
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
        
        # Validate file size
        # Images: max 5MB, Videos: max 512MB, GIFs: max 15MB
        max_size = 512 * 1024 * 1024  # 512MB for videos
        if request_body.mediaType == "image":
            max_size = 5 * 1024 * 1024  # 5MB
        elif request_body.mediaType == "gif":
            max_size = 15 * 1024 * 1024  # 15MB
        
        if len(file_data) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds {max_size // (1024 * 1024)}MB limit"
            )
        
        # Upload media
        result = await twitter_service.upload_media(
            credentials["accessToken"],
            credentials["accessTokenSecret"],
            file_data,
            request_body.mediaType
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload: {result.get('error')}"
            )
        
        logger.info(f"Uploaded {request_body.mediaType} to X - workspace: {workspace_id}")
        
        return TwitterUploadResponse(
            success=True,
            mediaId=result["media_id"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"X upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload media: {str(e)}")


@router.get("/verify")
async def verify_twitter_connection(request: Request):
    """
    GET /api/v1/social/twitter/verify
    
    Verify X connection status
    
    Returns:
        Connection status and user info
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
        
        # Get Twitter credentials
        try:
            credentials = await get_twitter_credentials(user["id"], workspace_id)
            
            # Get user info
            user_info = await twitter_service.get_user_info(
                credentials["accessToken"],
                credentials["accessTokenSecret"]
            )
            
            if user_info.get("success"):
                return {
                    "success": True,
                    "connected": True,
                    "username": user_info.get("username"),
                    "name": user_info.get("name"),
                    "userId": user_info.get("id")
                }
            else:
                return {
                    "success": True,
                    "connected": True,
                    "username": credentials.get("username"),
                    "note": "OAuth 1.0a tokens don't expire"
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
        logger.error(f"X verify error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def twitter_api_info():
    """Twitter/X API information"""
    return {
        "success": True,
        "message": "X (Twitter) API is operational",
        "version": "2.0.0",
        "apiVersion": "v2 (December 2025)",
        "authMethod": "OAuth 1.0a",
        "mediaUploadApi": "v2 chunked upload (INIT/APPEND/FINALIZE)",
        "endpoints": {
            "post": "POST /post - Post tweet to X",
            "uploadMedia": "POST /upload-media - Upload media using v2 API",
            "verify": "GET /verify - Verify connection status"
        },
        "supportedMediaTypes": ["image", "video", "gif"],
        "limits": {
            "text": "280 characters",
            "image": "5MB max, up to 4 per tweet",
            "video": "512MB max, 2min 20sec, 1 per tweet",
            "gif": "15MB max, 1 per tweet"
        },
        "notes": [
            "Uses X API v2 media upload (Dec 2025)",
            "Chunked upload for videos/large files",
            "Async processing for video content",
            "OAuth 1.0a tokens don't expire"
        ]
    }

