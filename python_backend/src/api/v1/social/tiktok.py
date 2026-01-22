"""
TikTok API Router
Production-ready TikTok video posting endpoints
Supports: video publishing with PULL_FROM_URL method
Uses TikTok API v2 with OAuth 2.0 authentication
"""
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field

from ....services.platforms.tiktok_service import tiktok_service
from ....services.supabase_service import verify_jwt, db_select, db_update
from ....services.rate_limit_service import RateLimitService
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/social/tiktok", tags=["TikTok"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class TikTokPostRequest(BaseModel):
    """TikTok post request"""
    caption: str = Field(default="", max_length=2200, description="Video caption (max 2,200 chars)")
    videoUrl: str = Field(..., description="Publicly accessible video URL")
    videoSize: Optional[int] = Field(default=None, description="Video size in bytes")
    privacyLevel: Optional[str] = Field(default="SELF_ONLY", description="Privacy level")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID (for cron)")
    userId: Optional[str] = Field(default=None, description="User ID (for cron)")
    scheduledPublish: Optional[bool] = Field(default=False, description="Is scheduled publish")


class TikTokPostResponse(BaseModel):
    """TikTok post response"""
    success: bool
    videoId: str
    shareUrl: str
    caption: str
    platform: str = "tiktok"


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_tiktok_credentials(
    user_id: str,
    workspace_id: str,
    is_cron: bool = False
):
    """Get TikTok credentials from database"""
    result = await db_select(
        table="social_accounts",
        columns="credentials_encrypted,is_connected",
        filters={
            "workspace_id": workspace_id,
            "platform": "tiktok"
        },
        limit=1
    )
    
    if not result.get("success") or not result.get("data"):
        raise HTTPException(status_code=400, detail="TikTok not connected")
    
    account = result["data"][0]
    
    if not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="TikTok account is not connected")
    
    raw_credentials = account.get("credentials_encrypted", {})
    
    # Parse credentials - could be dict (JSONB) or string (JSON)
    if isinstance(raw_credentials, dict):
        credentials = raw_credentials
    elif isinstance(raw_credentials, str):
        import json
        try:
            credentials = json.loads(raw_credentials)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Failed to parse TikTok credentials")
    else:
        raise HTTPException(status_code=400, detail="Invalid TikTok credentials format")
    
    if not credentials.get("accessToken"):
        raise HTTPException(status_code=400, detail="Invalid TikTok configuration")
    
    return credentials


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/post", response_model=TikTokPostResponse)
async def post_to_tiktok(
    request_body: TikTokPostRequest,
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    POST /api/v1/social/tiktok/post
    
    Post video to TikTok
    
    Features:
    - Video publishing via PULL_FROM_URL
    - Automatic token refresh (30 min before expiration)
    - Cron job support for scheduled posts
    - Privacy level control
    
    Important Notes:
    - Video URL must be publicly accessible
    - URL must be from a verified domain (use proxy if needed)
    - Unaudited apps can only post with SELF_ONLY privacy
    - Videos are processed asynchronously by TikTok
    
    Args:
        request_body: Post request data
        request: FastAPI request
        x_cron_secret: Cron secret header
        
    Returns:
        TikTokPostResponse with video ID and share URL
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
        
        # Get TikTok credentials
        credentials = await get_tiktok_credentials(user_id, workspace_id, is_cron)
        
        # Prepare video URL - use proxy if needed
        video_url = request_body.videoUrl
        
        # If we have a base URL configured, create proxy URL
        if hasattr(settings, 'APP_URL') and settings.APP_URL:
            base_url = settings.APP_URL.rstrip('/')
            from urllib.parse import quote
            proxy_url = f"{base_url}/api/v1/social/tiktok/proxy-media?url={quote(video_url)}"
            video_url = proxy_url
        
        # Initialize video publish
        result = await tiktok_service.init_video_publish(
            credentials["accessToken"],
            request_body.caption or "",
            video_url,
            request_body.privacyLevel or "SELF_ONLY"
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to publish video: {result.get('error')}"
            )
        
        publish_id = result["publish_id"]
        
        # Generate share URL
        username = credentials.get("username", "user")
        share_url = f"https://www.tiktok.com/@{username}"
        
        # Increment rate limit usage
        await RateLimitService.increment_usage(workspace_id, "tiktok", 1)
        
        logger.info(f"Posted to TikTok - workspace: {workspace_id}, publish_id: {publish_id}")
        
        return TikTokPostResponse(
            success=True,
            videoId=publish_id,
            shareUrl=share_url,
            caption=request_body.caption or ""
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TikTok post error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to post to TikTok: {str(e)}")


@router.get("/proxy-media")
async def proxy_media(url: str):
    """
    GET /api/v1/social/tiktok/proxy-media
    
    Proxy media URL for TikTok domain verification
    
    TikTok requires video URLs to be from verified domains.
    This endpoint proxies the video through our domain.
    
    Args:
        url: Original video URL
        
    Returns:
        Video content with appropriate headers
    """
    try:
        import httpx
        from fastapi.responses import StreamingResponse
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            
            return StreamingResponse(
                iter([response.content]),
                media_type=response.headers.get('content-type', 'video/mp4'),
                headers={
                    'Content-Length': str(len(response.content)),
                    'Accept-Ranges': 'bytes'
                }
            )
    except Exception as e:
        logger.error(f"TikTok proxy error: {e}")
        raise HTTPException(status_code=500, detail="Failed to proxy media")


@router.get("/verify")
async def verify_tiktok_connection(request: Request):
    """
    GET /api/v1/social/tiktok/verify
    
    Verify TikTok connection status
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
            credentials = await get_tiktok_credentials(user["id"], workspace_id)
            
            # Get user info
            user_info = await tiktok_service.get_user_info(credentials["accessToken"])
            
            if user_info.get("success"):
                return {
                    "success": True,
                    "connected": True,
                    "displayName": user_info.get("display_name"),
                    "openId": user_info.get("open_id"),
                    "expiresAt": credentials.get("expiresAt")
                }
            else:
                return {
                    "success": True,
                    "connected": True,
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
        logger.error(f"TikTok verify error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def tiktok_api_info():
    """TikTok API information"""
    return {
        "success": True,
        "message": "TikTok API is operational",
        "version": "1.0.0",
        "apiVersion": "v2",
        "authMethod": "OAuth 2.0",
        "endpoints": {
            "post": "POST /post - Post video to TikTok",
            "proxyMedia": "GET /proxy-media - Proxy media for domain verification",
            "verify": "GET /verify - Verify connection status"
        },
        "notes": [
            "Caption max length: 2,200 characters",
            "Video URL must be publicly accessible",
            "URL must be from verified domain (use proxy)",
            "Unaudited apps: SELF_ONLY privacy only",
            "Videos processed asynchronously",
            "Tokens expire in ~24 hours"
        ]
    }
