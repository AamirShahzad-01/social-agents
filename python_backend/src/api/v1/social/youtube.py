"""
YouTube API Router
Production-ready YouTube video upload endpoints
Supports: video uploads with metadata
Uses YouTube API v3 with OAuth 2.0 authentication
"""
import logging
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field

from ....services.platforms.youtube_service import youtube_service
from ....services.supabase_service import verify_jwt, db_select, db_update
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/social/youtube", tags=["YouTube"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class YouTubePostRequest(BaseModel):
    """YouTube post request"""
    title: str = Field(..., max_length=100, description="Video title (max 100 chars)")
    description: str = Field(default="", max_length=5000, description="Video description (max 5,000 chars)")
    videoUrl: str = Field(..., description="Publicly accessible video URL")
    tags: Optional[List[str]] = Field(default=None, description="Video tags")
    privacyStatus: Optional[str] = Field(default="private", description="public, private, or unlisted")
    categoryId: Optional[str] = Field(default="22", description="YouTube category ID")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")


class YouTubePostResponse(BaseModel):
    """YouTube post response"""
    success: bool
    videoId: str
    videoUrl: str
    title: str
    description: str
    platform: str = "youtube"
    status: str


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_youtube_credentials(
    user_id: str,
    workspace_id: str,
    is_cron: bool = False
):
    """Get YouTube credentials from database"""
    result = await db_select(
        table="social_accounts",
        columns="credentials,is_active",
        filters={
            "workspace_id": workspace_id,
            "platform": "youtube"
        },
        limit=1
    )
    
    if not result.get("success") or not result.get("data"):
        raise HTTPException(status_code=400, detail="YouTube not connected")
    
    account = result["data"][0]
    
    if not account.get("is_active"):
        raise HTTPException(status_code=400, detail="YouTube account is inactive")
    
    credentials = account.get("credentials", {})
    
    if not credentials.get("accessToken"):
        raise HTTPException(status_code=400, detail="Invalid YouTube configuration")
    
    return credentials


async def refresh_youtube_token_if_needed(
    credentials: dict,
    workspace_id: str
) -> dict:
    """Refresh YouTube token if it expires within 5 minutes"""
    expires_at = credentials.get("expiresAt")
    if not expires_at:
        return credentials
    
    # Refresh if token expires within 5 minutes
    REFRESH_BUFFER = timedelta(minutes=5)
    expiry_date = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    
    if datetime.utcnow() + REFRESH_BUFFER > expiry_date:
        refresh_token = credentials.get("refreshToken")
        if not refresh_token:
            if datetime.utcnow() > expiry_date:
                raise HTTPException(
                    status_code=401,
                    detail="YouTube token expired. Please reconnect your account."
                )
            return credentials
        
        try:
            client_id = settings.YOUTUBE_CLIENT_ID
            client_secret = settings.YOUTUBE_CLIENT_SECRET
            
            if not client_id or not client_secret:
                logger.warning("YouTube client credentials not configured")
                return credentials
            
            refresh_result = await youtube_service.refresh_access_token(
                refresh_token,
                client_id,
                client_secret
            )
            
            if refresh_result.get("success"):
                new_expiry = datetime.utcnow() + timedelta(seconds=refresh_result.get("expires_in", 3600))
                credentials["accessToken"] = refresh_result["access_token"]
                credentials["refreshToken"] = refresh_result.get("refresh_token", refresh_token)
                credentials["expiresAt"] = new_expiry.isoformat()
                
                await db_update(
                    table="social_accounts",
                    data={"credentials": credentials},
                    filters={
                        "workspace_id": workspace_id,
                        "platform": "youtube"
                    }
                )
                
                logger.info(f"Refreshed YouTube token for workspace {workspace_id}")
        except Exception as e:
            logger.warning(f"Failed to refresh YouTube token: {e}")
    
    return credentials


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/post", response_model=YouTubePostResponse)
async def post_to_youtube(
    request_body: YouTubePostRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/youtube/post
    
    Upload video to YouTube
    
    Features:
    - Video upload via URL (server-side fetch)
    - Metadata management (title, description, tags)
    - Privacy control (public, private, unlisted)
    - Automatic token refresh (5 min before expiration)
    - Cron job support for scheduled uploads
    - Resumable upload protocol
    
    Args:
        request_body: Post request data
        request: FastAPI request
        x_cron_secret: Cron secret header
        
    Returns:
        YouTubePostResponse with video ID and URL
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
        
        # Get YouTube credentials
        credentials = await get_youtube_credentials(user_id, workspace_id, is_cron)
        
        # Refresh token if needed
        credentials = await refresh_youtube_token_if_needed(credentials, workspace_id)
        
        # Upload video from URL
        result = await youtube_service.upload_video_from_url(
            credentials["accessToken"],
            request_body.title,
            request_body.description or "",
            request_body.videoUrl,
            request_body.tags,
            request_body.privacyStatus or "private",
            request_body.categoryId or "22"
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload video: {result.get('error')}"
            )
        
        video_id = result["video_id"]
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        
        logger.info(f"Uploaded to YouTube - workspace: {workspace_id}, video_id: {video_id}")
        
        return YouTubePostResponse(
            success=True,
            videoId=video_id,
            videoUrl=video_url,
            title=result.get("title", request_body.title),
            description=result.get("description", request_body.description or ""),
            status=request_body.privacyStatus or "private"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"YouTube upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload to YouTube: {str(e)}")


@router.get("/verify")
async def verify_youtube_connection(request: Request):
    """
    GET /api/v1/social/youtube/verify
    
    Verify YouTube connection status
    """
    try:
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
        
        try:
            credentials = await get_youtube_credentials(user["id"], workspace_id)
            
            # Get channel info
            channel_info = await youtube_service.get_channel_info(credentials["accessToken"])
            
            if channel_info.get("success"):
                return {
                    "success": True,
                    "connected": True,
                    "channelId": channel_info.get("channel_id"),
                    "channelTitle": channel_info.get("title"),
                    "expiresAt": credentials.get("expiresAt")
                }
            else:
                return {
                    "success": True,
                    "connected": True,
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
        logger.error(f"YouTube verify error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def youtube_api_info():
    """YouTube API information"""
    return {
        "success": True,
        "message": "YouTube API is operational",
        "version": "1.0.0",
        "apiVersion": "v3",
        "authMethod": "OAuth 2.0",
        "endpoints": {
            "post": "POST /post - Upload video to YouTube",
            "verify": "GET /verify - Verify connection status"
        },
        "notes": [
            "Title max length: 100 characters",
            "Description max length: 5,000 characters",
            "Video uploaded via URL (server-side fetch)",
            "Privacy: public, private, unlisted",
            "Resumable upload protocol",
            "Tokens expire in 1 hour"
        ]
    }
