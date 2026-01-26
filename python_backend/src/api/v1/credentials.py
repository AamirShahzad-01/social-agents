"""
Credentials API Router
Platform connection status and disconnect functionality

Uses Meta Business SDK for Meta platform (Facebook, Instagram, Meta Ads)
"""

import logging
from typing import Literal, Dict, Any
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends

from src.services.supabase_service import get_supabase_client, get_supabase_admin_client
from src.services.credentials import MetaCredentialsService
from src.middleware.auth import get_current_user


router = APIRouter(prefix="/api/v1/credentials", tags=["Credentials"])
logger = logging.getLogger(__name__)


# ================== CONSTANTS ==================

VALID_PLATFORMS = ["twitter", "linkedin", "facebook", "instagram", "tiktok", "youtube", "meta_ads"]
META_PLATFORMS = ["facebook", "instagram", "meta_ads"]

Platform = Literal["twitter", "linkedin", "facebook", "instagram", "tiktok", "youtube", "meta_ads"]


# ================== HELPERS ==================

def check_token_status(expires_at_str):
    """Check if token is expired or expiring soon"""
    if not expires_at_str:
        return False, False
    try:
        if isinstance(expires_at_str, str):
            if expires_at_str.endswith("Z"):
                expires_at_str = expires_at_str.replace("Z", "+00:00")
            expires_at = datetime.fromisoformat(expires_at_str)
        else:
            expires_at = expires_at_str
        now = datetime.now(timezone.utc)
        is_expired = now > expires_at
        is_expiring_soon = not is_expired and (expires_at - now) < timedelta(days=7)
        return is_expired, is_expiring_soon
    except:
        return False, False


def _safe_parse_datetime(value: Any) -> Optional[datetime]:
    """Parse ISO datetime string safely for sorting."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            if value.endswith("Z"):
                value = value.replace("Z", "+00:00")
            return datetime.fromisoformat(value)
        except Exception:
            return None
    return None


# ================== ENDPOINTS ==================

@router.get("/status")
async def get_connection_status(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /api/v1/credentials/status
    Get connection status for all platforms.
    
    Returns which platforms are connected for the user's workspace.
    """
    try:
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Use admin client to bypass RLS - we already verified user has access via JWT
        supabase = get_supabase_admin_client()
        
        # Get all credentials for the workspace
        result = supabase.table("social_accounts").select(
            "*"
        ).eq("workspace_id", workspace_id).execute()
        
        # Build status map
        status = {}
        connected_credentials = result.data or []
        
        for platform in VALID_PLATFORMS:
            platform_records = [
                c for c in connected_credentials if c.get("platform") == platform
            ]
            connected_records = [
                c for c in platform_records if c.get("is_connected")
            ]
            candidates = connected_records or platform_records

            cred = None
            if candidates:
                cred = max(
                    candidates,
                    key=lambda c: _safe_parse_datetime(c.get("updated_at") or c.get("created_at"))
                    or datetime.min
                )
            
            if cred and cred.get("is_connected"):
                is_expired, is_expiring_soon = check_token_status(cred.get("expires_at"))
                is_connected = not is_expired
                if platform == "youtube" and is_expired:
                    is_connected = True
                status[platform] = {
                    "isConnected": is_connected,
                    "accountId": cred.get("account_id"),
                    "accountName": cred.get("account_name"),
                    "pageId": cred.get("page_id"),
                    "pageName": cred.get("page_name"),
                    "igUserId": cred.get("ig_user_id"),
                    "username": cred.get("username"),
                    "connectedAt": cred.get("connected_at") or cred.get("created_at"),
                    "expiresAt": cred.get("expires_at"),
                    "isExpired": is_expired,
                    "isExpiringSoon": is_expiring_soon
                }
            else:
                status[platform] = {
                    "isConnected": False
                }
        
        # For Facebook, also check ads capability if connected
        if status.get("facebook", {}).get("isConnected"):
            try:
                logger.info(f"Checking ads capability for workspace {workspace_id}")
                ads_capability = await MetaCredentialsService.check_ads_capability(workspace_id)
                
                status["facebook"]["canRunAds"] = ads_capability.get("has_ads_access", False)
                status["facebook"]["adAccountId"] = ads_capability.get("ad_account_id")
                status["facebook"]["adAccountName"] = ads_capability.get("ad_account_name")
                
                if not ads_capability.get("has_ads_access"):
                    status["facebook"]["missingForAds"] = ads_capability.get("missing_permissions", [])
                
                logger.info(f"Ads capability: {ads_capability}")
            except Exception as ads_error:
                logger.error(f"Error checking ads capability: {ads_error}")
                status["facebook"]["canRunAds"] = False
                status["facebook"]["missingForAds"] = ["Error checking ads capability"]
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting connection status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check status")


@router.delete("/{platform}/disconnect")
async def disconnect_platform(
    platform: Platform,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    DELETE /api/v1/credentials/{platform}/disconnect
    Disconnect a social platform by setting is_connected to False.
    """
    try:
        workspace_id = user.get("workspaceId")
        user_role = user.get("role")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Only admins can disconnect
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")
        
        if platform not in VALID_PLATFORMS:
            raise HTTPException(status_code=400, detail=f"Invalid platform: {platform}")
        
        supabase = get_supabase_admin_client()
        
        # Update is_connected to False for this platform
        result = supabase.table("social_accounts").update({
            "is_connected": False
        }).eq("workspace_id", workspace_id).eq("platform", platform).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail=f"No connection found for {platform}")
        
        logger.info(f"Disconnected {platform} for workspace {workspace_id}")
        
        return {
            "success": True,
            "message": f"{platform.capitalize()} disconnected successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting {platform}: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect platform")


@router.get("/meta/status")
async def get_meta_connection_status(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /api/v1/credentials/meta/status
    Get detailed connection status for Meta platforms (Facebook, Instagram, Ads)
    using the SDK-based credentials service.
    """
    try:
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Use SDK-based credentials service
        status = await MetaCredentialsService.get_connection_status(workspace_id)
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Meta connection status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check Meta status")


@router.get("/meta/capabilities")
async def get_meta_capabilities(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /api/v1/credentials/meta/capabilities
    Check what Meta features are available (Ads, Instagram posting, etc.)
    """
    try:
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Check ads capability
        ads_cap = await MetaCredentialsService.check_ads_capability(
            workspace_id,
            user.get("id")
        )
        
        # Check Instagram capability
        ig_cap = await MetaCredentialsService.check_instagram_capability(
            workspace_id,
            user.get("id")
        )
        
        return {
            "ads": ads_cap,
            "instagram": ig_cap
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking Meta capabilities: {e}")
        raise HTTPException(status_code=500, detail="Failed to check capabilities")


@router.get("/meta/businesses")
async def get_available_businesses(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /api/v1/credentials/meta/businesses
    Get available business portfolios and their ad accounts.
    """
    try:
        workspace_id = user.get("workspaceId")
        user_id = user.get("id")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        businesses = await MetaCredentialsService.get_available_businesses(
            workspace_id,
            user_id
        )
        
        return {
            "success": True,
            "businesses": businesses
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting businesses: {e}")
        raise HTTPException(status_code=500, detail="Failed to get businesses")


@router.post("/meta/switch-business")
async def switch_business(
    business_id: str,
    ad_account_id: str = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/v1/credentials/meta/switch-business
    Switch to a different business portfolio and ad account.
    """
    try:
        workspace_id = user.get("workspaceId")
        user_id = user.get("id")
        role = user.get("role", "viewer")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Only admins can switch
        if role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only workspace admins can switch business accounts"
            )
        
        result = await MetaCredentialsService.switch_business(
            workspace_id, business_id, ad_account_id, user_id
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error switching business: {e}")
        raise HTTPException(status_code=500, detail="Failed to switch business")


@router.post("/meta/validate-token")
async def validate_meta_token(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/v1/credentials/meta/validate-token
    Validate the current Meta access token using debug_token API.
    """
    try:
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Get credentials (with validation)
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
            "success": token_info.get("is_valid", False),
            "isValid": token_info.get("is_valid", False),
            "expiresAt": token_info.get("expires_at"),
            "scopes": token_info.get("scopes", []),
            "userId": token_info.get("user_id"),
            "error": token_info.get("error")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating token: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate token")


@router.post("/meta/refresh-token")
async def refresh_meta_token(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/v1/credentials/meta/refresh-token
    Refresh Meta access token (exchange for long-lived 60-day token).
    """
    try:
        workspace_id = user.get("workspaceId")
        role = user.get("role", "viewer")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")

        raise HTTPException(
            status_code=403,
            detail="Meta token refresh is only allowed during publish actions"
        )
        
        # Only admins can refresh tokens
        if role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only workspace admins can refresh tokens"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing token: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh token")


@router.delete("/{platform}/disconnect")
async def disconnect_platform(
    platform: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    DELETE /api/v1/credentials/{platform}/disconnect
    Disconnect a platform account.
    
    Requires admin role.
    """
    try:
        # Validate platform
        if platform not in VALID_PLATFORMS:
            raise HTTPException(status_code=400, detail="Invalid platform")
        
        workspace_id = user.get("workspaceId")
        role = user.get("role", "viewer")
        user_id = user.get("id")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Only admins can disconnect
        if role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only workspace admins can manage account connections"
            )
        
        # Use SDK-based service for Meta platforms
        if platform in META_PLATFORMS:
            result = await MetaCredentialsService.disconnect_platform(
                workspace_id, platform
            )
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error"))
        else:
            # Standard disconnect for non-Meta platforms
            supabase = get_supabase_client()
            supabase.table("social_accounts").delete().eq(
                "workspace_id", workspace_id
            ).eq("platform", platform).execute()
        
        # Log activity
        try:
            supabase = get_supabase_client()
            supabase.table("activity_logs").insert({
                "workspace_id": workspace_id,
                "user_id": user_id,
                "action": "disconnect",
                "resource_type": "credential",
                "resource_id": platform,
                "details": {"platform": platform},
                "created_at": datetime.now().isoformat()
            }).execute()
        except Exception:
            pass  # Activity logging is best-effort
        
        return {
            "success": True,
            "message": f"{platform} disconnected successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting platform: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect")


@router.get("/{platform}")
async def get_platform_credential(
    platform: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /api/v1/credentials/{platform}
    Get credential details for a specific platform.
    """
    try:
        # Validate platform
        if platform not in VALID_PLATFORMS:
            raise HTTPException(status_code=400, detail="Invalid platform")
        
        workspace_id = user.get("workspaceId")
        
        if not workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        # Use SDK-based service for Meta platforms
        if platform in META_PLATFORMS:
            if platform == "meta_ads":
                creds = await MetaCredentialsService.get_ads_credentials(workspace_id)
            elif platform == "instagram":
                creds = await MetaCredentialsService.get_instagram_credentials(workspace_id)
            else:  # facebook
                creds = await MetaCredentialsService.get_meta_credentials(workspace_id)
            
            if not creds:
                return {"connected": False, "platform": platform}
            
            return {
                "connected": True,
                "platform": platform,
                "accountId": creds.get("account_id"),
                "accountName": creds.get("account_name"),
                "pageId": creds.get("page_id"),
                "pageName": creds.get("page_name"),
                "igUserId": creds.get("ig_user_id"),
                "username": creds.get("username"),
                "expiresAt": creds.get("expires_at"),
                "isExpired": creds.get("is_expired", False),
                "isExpiringSoon": creds.get("expires_soon", False)
            }
        
        # Standard fetch for non-Meta platforms
        supabase = get_supabase_client()
        
        result = supabase.table("social_accounts").select(
            "platform, account_id, account_name, created_at, expires_at"
        ).eq("workspace_id", workspace_id).eq("platform", platform).single().execute()
        
        if not result.data:
            return {
                "connected": False,
                "platform": platform
            }
        
        cred = result.data
        
        return {
            "connected": True,
            "platform": platform,
            "accountId": cred.get("account_id"),
            "accountName": cred.get("account_name"),
            "connectedAt": cred.get("created_at"),
            "expiresAt": cred.get("expires_at")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Not found is OK
        if "PGRST116" in str(e):
            return {"connected": False, "platform": platform}
        logger.error(f"Error getting platform credential: {e}")
        raise HTTPException(status_code=500, detail="Failed to get credential")


# ================== INFO ENDPOINT ==================

@router.get("/")
async def get_credentials_api_info():
    """Get Credentials API service information"""
    return {
        "service": "Credentials",
        "version": "2.0.0",
        "endpoints": {
            "/status": {
                "GET": "Get connection status for all platforms"
            },
            "/meta/status": {
                "GET": "Get detailed Meta platform status (SDK-based)"
            },
            "/meta/capabilities": {
                "GET": "Check Meta feature capabilities (Ads, Instagram)"
            },
            "/meta/businesses": {
                "GET": "List available business portfolios"
            },
            "/meta/switch-business": {
                "POST": "Switch to different business/ad account"
            },
            "/meta/validate-token": {
                "POST": "Validate current Meta access token"
            },
            "/meta/refresh-token": {
                "POST": "Refresh Meta token (60-day long-lived)"
            },
            "/{platform}": {
                "GET": "Get credential details for a platform"
            },
            "/{platform}/disconnect": {
                "DELETE": "Disconnect a platform (admin only)"
            }
        },
        "supported_platforms": VALID_PLATFORMS,
        "meta_platforms": META_PLATFORMS
    }
