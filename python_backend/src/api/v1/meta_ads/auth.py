"""
Meta Ads API - OAuth Authentication Endpoints
Handles OAuth flow for Meta Ads connection
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse

from ._helpers import get_user_context
from ....services.supabase_service import get_supabase_admin_client
from ....config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Auth"])


@router.get("/auth/url")
async def get_auth_url(request: Request):
    """
    GET /api/v1/meta-ads/auth/url
    
    Generate OAuth authorization URL for Meta Ads
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        app_id = settings.FACEBOOK_APP_ID
        if not app_id:
            raise HTTPException(
                status_code=500,
                detail="Meta App ID not configured"
            )
        
        # Generate CSRF state token
        state = str(uuid.uuid4())
        
        # Store state for validation
        client = get_supabase_admin_client()
        client.table("oauth_states").insert({
            "state": state,
            "workspace_id": workspace_id,
            "platform": "meta_ads",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        }).execute()
        
        # Build redirect URI
        redirect_uri = settings.META_ADS_REDIRECT_URI or f"{settings.NEXT_PUBLIC_APP_URL}/api/meta-ads/auth/callback"
        
        # Required scopes for Meta Marketing API
        scopes = ",".join([
            "ads_management",
            "ads_read",
            "business_management",
            "pages_read_engagement",
            "pages_show_list",
            "pages_manage_ads"
        ])
        
        auth_url = (
            f"https://www.facebook.com/v24.0/dialog/oauth?"
            f"client_id={app_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scopes}"
            f"&response_type=code"
            f"&state={state}"
        )
        
        return JSONResponse(content={"url": auth_url})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating auth URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate authorization URL")


@router.get("/auth/callback")
async def auth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None)
):
    """
    GET /api/v1/meta-ads/auth/callback
    
    OAuth callback handler for Meta Ads
    Exchanges code for access token and stores credentials
    """
    # This endpoint is typically handled by Next.js frontend
    # Include basic implementation for completeness
    
    if error:
        return RedirectResponse(
            url=f"{settings.NEXT_PUBLIC_APP_URL}/dashboard/meta-ads?error={error}"
        )
    
    if not code or not state:
        return RedirectResponse(
            url=f"{settings.NEXT_PUBLIC_APP_URL}/dashboard/meta-ads?error=missing_params"
        )
    
    # In production, validate state and exchange code for token
    # For now, redirect to frontend which handles the full flow
    return RedirectResponse(
        url=f"{settings.NEXT_PUBLIC_APP_URL}/dashboard/meta-ads?code={code}&state={state}"
    )
