"""
Meta Ads API - Connection Status Endpoints
Provides endpoints for checking Meta Ads connection status
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ._helpers import get_user_context
from ....services.credentials import MetaCredentialsService
from ....services.meta_ads.meta_ads_service import get_meta_ads_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Status"])


@router.get("/status")
async def get_status(request: Request):
    """
    GET /api/v1/meta-ads/status
    
    Returns connection status for Meta Ads including:
    - Connection status
    - Ad account info
    - Facebook page info
    - Platform connection details
    - What's missing for ads (if any)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        # Get connection status
        connection_status = await MetaCredentialsService.get_connection_status(workspace_id)
        
        # Get credentials for additional info (NO refresh for status check)
        credentials = await MetaCredentialsService.get_ads_credentials(
            workspace_id,
            refresh_if_needed=False
        )
        
        # Check ads capability
        has_ads_access = bool(credentials and credentials.get("account_id"))
        missing_permissions = []
        if not has_ads_access:
            if not credentials:
                missing_permissions = ["No Meta platform connected"]
            elif not credentials.get("account_id"):
                missing_permissions = ["No Ad Account found. Please ensure your Facebook account has access to an Ad Account."]
        
        capability = {
            "has_ads_access": has_ads_access,
            "missing_permissions": missing_permissions
        }
        
        if not credentials or not credentials.get('access_token'):
            return JSONResponse(content={
                "isConnected": False,
                "canRunAds": False,
                "message": "No Meta platform connected",
                "platforms": connection_status,
                "suggestion": "Connect your Facebook account to enable Meta Ads"
            })
        
        # Check token expiration
        if credentials.get("is_expired"):
            return JSONResponse(content={
                "isConnected": False,
                "canRunAds": False,
                "tokenExpired": True,
                "message": "Your Meta connection has expired. Please reconnect.",
                "platforms": connection_status
            })
        
        # Get ad account info if available
        ad_account = None
        if credentials.get("account_id"):
            service = get_meta_ads_service()
            ad_account_result = await service.get_ad_account_info(
                credentials["account_id"],
                credentials["access_token"]
            )
            ad_account = ad_account_result.get("adAccount") or {
                "id": f"act_{credentials['account_id']}",
                "account_id": credentials["account_id"],
                "name": credentials.get("account_name", "Ad Account"),
                "currency": "USD",
                "timezone_name": "America/Los_Angeles"
            }
        
        return JSONResponse(content={
            "isConnected": True,
            "canRunAds": capability.get("has_ads_access", False),
            "tokenExpiresSoon": credentials.get("expires_soon", False),
            "expiresAt": credentials.get("expires_at"),
            "adAccount": ad_account,
            "page": {
                "id": credentials.get("page_id"),
                "name": credentials.get("page_name")
            } if credentials.get("page_id") else None,
            "platforms": connection_status,
            "missingForAds": capability.get("missing_permissions"),
            "message": "Ready to run Meta Ads" if capability.get("has_ads_access") else (
                capability.get("missing_permissions", ["Additional setup required"])[0]
            )
        })
        
    except Exception as e:
        logger.error(f"Error getting Meta Ads status: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "isConnected": False,
                "canRunAds": False,
                "error": "Failed to check Meta Ads status",
                "message": str(e)
            }
        )
