"""
Token Refresh API Routes
On-demand token refresh endpoints - no cron jobs required

Uses Meta Business SDK for Meta platforms (Facebook, Instagram, Ads)

Main usage: Call /api/v1/tokens/get/{platform} to get valid credentials
which will automatically refresh if expired.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ...services.token_refresh_service import (
    token_refresh_service,
    CredentialsResult,
    RefreshErrorType
)
from ...services.meta_credentials_service import MetaCredentialsService
from ...services import verify_jwt, get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tokens", tags=["Token Refresh"])

Platform = Literal["twitter", "linkedin", "facebook", "instagram", "tiktok", "youtube", "meta_ads"]
META_PLATFORMS = ["facebook", "instagram", "meta_ads"]


# ============================================================================
# RESPONSE MODELS
# ============================================================================

class TokenStatusResponse(BaseModel):
    """Token status for a platform"""
    platform: str
    account_id: str
    account_name: str
    is_connected: bool
    expires_at: Optional[str]
    expires_in_hours: Optional[int]
    is_expiring_soon: bool  # Within 24 hours
    is_expired: bool
    last_refreshed_at: Optional[str]
    error_count: int
    last_error: Optional[str]


# ============================================================================
# AUTHENTICATION HELPER
# ============================================================================

async def get_user_workspace(request: Request) -> dict:
    """Get workspace ID and user info from authenticated user"""
    auth_header = request.headers.get("authorization", "")
    
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = auth_header.replace("Bearer ", "")
    
    try:
        user = await verify_jwt(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get workspace from users table
        supabase = get_supabase_client()
        response = supabase.table("users").select(
            "workspace_id"
        ).filter("id", "eq", user["sub"]).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="User workspace not found")
        
        return {
            "workspace_id": response.data["workspace_id"],
            "user_id": user["sub"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")


# ============================================================================
# ON-DEMAND TOKEN ENDPOINTS
# ============================================================================

@router.get("/get/{platform}")
async def get_valid_credentials(
    platform: Platform,
    request: Request
):
    """
    Get valid credentials for a platform, refreshing if needed.
    
    This is the primary endpoint for getting tokens. It:
    1. Checks if token is expired or about to expire
    2. If expired, automatically refreshes using the refresh token
    3. Returns valid credentials ready for API use
    
    For Meta platforms (facebook, instagram, meta_ads), uses SDK-based
    credentials service with automatic token refresh.
    
    Returns:
        - success: Whether credentials are valid
        - was_refreshed: Whether token was just refreshed
        - credentials: The access token and other credentials
        - needs_reconnect: If true, user must re-authenticate
    """
    try:
        user_info = await get_user_workspace(request)
        workspace_id = user_info["workspace_id"]
        user_id = user_info["user_id"]
        
        # Use SDK-based service for Meta platforms
        if platform in META_PLATFORMS:
            # Auto-refresh if needed
            credentials = await MetaCredentialsService.auto_refresh_if_needed(
                workspace_id, user_id
            )
            
            if not credentials:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "platform": platform,
                        "error": f"No connected {platform} account",
                        "needs_reconnect": True
                    }
                )
            
            # Check if expired
            if credentials.get("is_expired"):
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "platform": platform,
                        "error": "Token expired and could not be refreshed",
                        "needs_reconnect": True
                    }
                )
            
            # Get platform-specific credentials
            if platform == "meta_ads":
                creds = await MetaCredentialsService.get_ads_credentials(workspace_id, user_id)
            elif platform == "instagram":
                creds = await MetaCredentialsService.get_instagram_credentials(workspace_id, user_id)
            else:
                creds = credentials
            
            return {
                "success": True,
                "platform": platform,
                "was_refreshed": False,  # Auto-refresh handles this
                "credentials": {
                    "accessToken": creds.get("access_token"),
                    "expiresAt": creds.get("expires_at"),
                    "pageId": creds.get("page_id"),
                    "pageName": creds.get("page_name"),
                    "accountId": creds.get("account_id"),
                    "accountName": creds.get("account_name"),
                    "igUserId": creds.get("ig_user_id"),
                    "username": creds.get("username"),
                }
            }
        
        # Use standard token refresh service for non-Meta platforms
        result = await token_refresh_service.get_valid_credentials(
            platform=platform,
            workspace_id=workspace_id
        )
        
        if result.success:
            return {
                "success": True,
                "platform": platform,
                "was_refreshed": result.was_refreshed,
                "credentials": {
                    "accessToken": result.credentials.get("accessToken"),
                    "expiresAt": result.credentials.get("expiresAt"),
                    # Include platform-specific fields
                    **{k: v for k, v in result.credentials.items() 
                       if k in ["pageId", "pageName", "userId", "username", "channelId", "channelTitle", "openId", "displayName"]}
                }
            }
        else:
            return JSONResponse(
                status_code=400 if result.needs_reconnect else 500,
                content={
                    "success": False,
                    "platform": platform,
                    "error": result.error,
                    "error_type": result.error_type.value if result.error_type else None,
                    "needs_reconnect": result.needs_reconnect
                }
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting credentials: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh/{platform}")
async def force_refresh_token(
    platform: Platform,
    request: Request
):
    """
    Force refresh a token even if not expired.
    Useful for troubleshooting or manual refresh.
    
    For Meta platforms, exchanges for long-lived 60-day token.
    """
    try:
        user_info = await get_user_workspace(request)
        workspace_id = user_info["workspace_id"]
        
        # Use SDK-based service for Meta platforms
        if platform in META_PLATFORMS:
            credentials = await MetaCredentialsService.get_meta_credentials(workspace_id)
            
            if not credentials or not credentials.get("access_token"):
                raise HTTPException(status_code=404, detail=f"No connected {platform} account")
            
            # Refresh token
            result = await MetaCredentialsService.refresh_access_token(
                credentials["access_token"],
                workspace_id
            )
            
            if result.get("success"):
                return {
                    "success": True,
                    "message": f"Token for {platform} refreshed successfully",
                    "was_refreshed": True,
                    "expires_at": result.get("expires_at"),
                    "expires_in": result.get("expires_in")
                }
            else:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": result.get("error"),
                        "needs_reconnect": True
                    }
                )
        
        # Standard refresh for non-Meta platforms
        supabase = get_supabase_client()
        response = supabase.table("social_accounts").select(
            "id, credentials_encrypted, expires_at"
        ).filter(
            "workspace_id", "eq", workspace_id
        ).filter(
            "platform", "eq", platform
        ).filter(
            "is_connected", "eq", True
        ).limit(1).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail=f"No connected {platform} account")
        
        # Force a refresh by getting credentials (the service will refresh)
        result = await token_refresh_service.get_valid_credentials(
            platform=platform,
            workspace_id=workspace_id
        )
        
        if result.success:
            return {
                "success": True,
                "message": f"Token for {platform} refreshed" if result.was_refreshed else f"Token for {platform} is still valid",
                "was_refreshed": result.was_refreshed,
                "expires_at": result.credentials.get("expiresAt")
            }
        else:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": result.error,
                    "needs_reconnect": result.needs_reconnect
                }
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Force refresh error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_token_status(request: Request):
    """
    Get token expiration status for all connected platforms.
    Returns detailed status for each platform including expiration info.
    
    For Meta platforms, includes SDK-validated token info.
    """
    try:
        user_info = await get_user_workspace(request)
        workspace_id = user_info["workspace_id"]
        now = datetime.now(timezone.utc)
        
        # Get all connected accounts
        supabase = get_supabase_client()
        response = supabase.table("social_accounts").select(
            "platform, account_id, account_name, is_connected, expires_at, "
            "last_refreshed_at, refresh_error_count, last_error_message"
        ).filter(
            "workspace_id", "eq", workspace_id
        ).execute()
        
        accounts = response.data if response.data else []
        
        statuses = []
        for account in accounts:
            expires_at_str = account.get("expires_at")
            expires_at = None
            expires_in_hours = None
            is_expiring_soon = False
            is_expired = False
            
            if expires_at_str:
                try:
                    if expires_at_str.endswith("Z"):
                        expires_at_str = expires_at_str.replace("Z", "+00:00")
                    expires_at = datetime.fromisoformat(expires_at_str)
                    delta = expires_at - now
                    expires_in_hours = int(delta.total_seconds() / 3600)
                    is_expired = expires_in_hours < 0
                    is_expiring_soon = 0 <= expires_in_hours <= 24
                except Exception:
                    pass
            
            statuses.append({
                "platform": account["platform"],
                "account_id": account["account_id"],
                "account_name": account.get("account_name", "Unknown"),
                "is_connected": account.get("is_connected", False),
                "expires_at": account.get("expires_at"),
                "expires_in_hours": expires_in_hours,
                "is_expiring_soon": is_expiring_soon,
                "is_expired": is_expired,
                "last_refreshed_at": account.get("last_refreshed_at"),
                "error_count": account.get("refresh_error_count", 0),
                "last_error": account.get("last_error_message"),
                "is_meta_platform": account["platform"] in META_PLATFORMS
            })
        
        # Get detailed Meta status using SDK
        meta_status = await MetaCredentialsService.get_connection_status(workspace_id)
        
        # Sort by urgency
        statuses.sort(key=lambda x: (
            not x["is_expired"],
            not x["is_expiring_soon"],
            x["expires_in_hours"] or 9999
        ))
        
        return {
            "success": True,
            "accounts": statuses,
            "meta_details": meta_status,
            "summary": {
                "total": len(statuses),
                "connected": sum(1 for s in statuses if s["is_connected"]),
                "expired": sum(1 for s in statuses if s["is_expired"]),
                "expiring_soon": sum(1 for s in statuses if s["is_expiring_soon"]),
                "healthy": sum(1 for s in statuses if s["is_connected"] and not s["is_expired"] and not s["is_expiring_soon"])
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/meta/validate")
async def validate_meta_tokens(request: Request):
    """
    Validate Meta platform tokens using SDK debug_token API.
    Returns detailed token info including scopes and expiration.
    """
    try:
        user_info = await get_user_workspace(request)
        workspace_id = user_info["workspace_id"]
        
        # Get credentials with validation
        credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id,
            validate_token=True
        )
        
        if not credentials:
            return {
                "success": False,
                "error": "No Meta credentials found"
            }
        
        token_info = credentials.get("token_info", {})
        
        return {
            "success": True,
            "platform": credentials.get("platform"),
            "token_valid": token_info.get("is_valid", False),
            "token_info": {
                "user_id": token_info.get("user_id"),
                "app_id": token_info.get("app_id"),
                "scopes": token_info.get("scopes", []),
                "expires_at": token_info.get("expires_at"),
                "type": token_info.get("type")
            },
            "credentials": {
                "page_id": credentials.get("page_id"),
                "page_name": credentials.get("page_name"),
                "account_id": credentials.get("account_id"),
                "ig_user_id": credentials.get("ig_user_id")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Meta token validation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HEALTH & INFO
# ============================================================================

@router.get("/health")
async def token_refresh_health():
    """Health check endpoint for monitoring"""
    return {
        "success": True,
        "service": "Token Refresh (On-Demand)",
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "supported_platforms": ["twitter", "facebook", "instagram", "linkedin", "tiktok", "youtube", "meta_ads"],
        "meta_sdk_enabled": True
    }


@router.get("/")
async def token_refresh_info():
    """Token refresh API information"""
    return {
        "success": True,
        "service": "Token Refresh API (On-Demand)",
        "version": "3.0.0",
        "description": "On-demand token refresh with Meta SDK integration",
        "endpoints": {
            "/get/{platform}": "GET - Get valid credentials (auto-refreshes if expired)",
            "/refresh/{platform}": "POST - Force refresh token",
            "/status": "GET - Get token status for all platforms",
            "/meta/validate": "GET - Validate Meta tokens with SDK",
            "/health": "GET - Health check"
        },
        "supported_platforms": ["twitter", "facebook", "instagram", "linkedin", "tiktok", "youtube", "meta_ads"],
        "meta_platforms": META_PLATFORMS
    }
