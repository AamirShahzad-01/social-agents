"""
Credentials API Router
Platform connection status and disconnect functionality
"""

import logging
from typing import Literal, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends

from src.services.supabase_service import get_supabase_client
from src.middleware.auth import get_current_user


router = APIRouter(prefix="/api/v1/credentials", tags=["Credentials"])
logger = logging.getLogger(__name__)


# ================== CONSTANTS ==================

VALID_PLATFORMS = ["twitter", "linkedin", "facebook", "instagram", "tiktok", "youtube"]

Platform = Literal["twitter", "linkedin", "facebook", "instagram", "tiktok", "youtube"]


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
        
        supabase = get_supabase_client()
        
        # Get all credentials for the workspace
        result = supabase.table("social_accounts").select(
            "platform, account_id, account_name, created_at, expires_at"
        ).eq("workspace_id", workspace_id).execute()
        
        # Build status map
        status = {}
        connected_credentials = result.data or []
        
        for platform in VALID_PLATFORMS:
            cred = next(
                (c for c in connected_credentials if c.get("platform") == platform),
                None
            )
            
            if cred:
                status[platform] = {
                    "connected": True,
                    "accountId": cred.get("account_id"),
                    "accountName": cred.get("account_name"),
                    "connectedAt": cred.get("created_at"),
                    "expiresAt": cred.get("expires_at")
                }
            else:
                status[platform] = {
                    "connected": False
                }
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting connection status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check status")


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
        
        supabase = get_supabase_client()
        
        # Delete credential
        supabase.table("social_accounts").delete().eq(
            "workspace_id", workspace_id
        ).eq("platform", platform).execute()
        
        # Log activity
        try:
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
        "version": "1.0.0",
        "endpoints": {
            "/status": {
                "GET": "Get connection status for all platforms"
            },
            "/{platform}": {
                "GET": "Get credential details for a platform"
            },
            "/{platform}/disconnect": {
                "DELETE": "Disconnect a platform (admin only)"
            }
        },
        "supported_platforms": VALID_PLATFORMS
    }
