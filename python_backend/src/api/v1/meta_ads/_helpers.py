"""
Meta Ads API - Shared Helper Functions
Common utilities used across all Meta Ads endpoint modules
"""
import logging
from typing import Tuple
import hmac
import hashlib

from fastapi import HTTPException, Request

from ....services.supabase_service import ensure_user_workspace
from ....services.credentials import MetaCredentialsService
from ....config import settings

logger = logging.getLogger(__name__)


async def get_user_context(request: Request) -> Tuple[str, str]:
    """Extract user_id and workspace_id from authenticated request"""
    user = getattr(request.state, 'user', None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    user_id = user.get('id')
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    # Ensure workspace exists
    workspace_id = await ensure_user_workspace(user_id, user.get('email'))
    
    return user_id, workspace_id


async def get_verified_credentials(workspace_id: str, user_id: str):
    """Get and verify Meta Ads credentials"""
    credentials = await MetaCredentialsService.get_ads_credentials(
        workspace_id,
        refresh_if_needed=False  # Status check doesn't need refresh
    )
    
    if not credentials or not credentials.get('access_token'):
        raise HTTPException(
            status_code=401, 
            detail="Meta Ads not connected. Please connect your Meta account."
        )
    
    if not credentials.get('account_id'):
        raise HTTPException(
            status_code=400,
            detail="No Ad Account configured. Please ensure your Facebook account has access to an Ad Account."
        )
    
    return credentials


def generate_appsecret_proof(access_token: str) -> str:
    """Generate appsecret_proof for Meta API server-side calls"""
    app_secret = settings.FACEBOOK_APP_SECRET
    if not app_secret:
        return None
    
    return hmac.new(
        app_secret.encode('utf-8'),
        access_token.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
