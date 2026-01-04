"""
Meta Ads Business Portfolio API
Handles business and ad account listing for Meta Ads
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import logging

from ...services.meta_ads_service import get_meta_ads_service
from ...services.meta_credentials_service import MetaCredentialsService
from ...services.supabase_service import ensure_user_workspace

router = APIRouter()
logger = logging.getLogger(__name__)


async def get_user_context(request: Request):
    """Extract user_id and workspace_id from authenticated request"""
    user = getattr(request.state, 'user', None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    user_id = user.get('id')
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    workspace_id = await ensure_user_workspace(user_id, user.get('email'))
    return user_id, workspace_id


async def get_credentials(workspace_id: str, user_id: str):
    """Get Meta Ads credentials"""
    credentials = await MetaCredentialsService.get_ads_credentials(workspace_id, user_id)
    
    if not credentials or not credentials.get('access_token'):
        raise HTTPException(status_code=401, detail="Meta Ads not connected")
    
    return credentials


@router.get("/businesses")
async def get_user_businesses(request: Request):
    """
    Get user's business portfolios
    
    Returns list of businesses the user belongs to
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_user_businesses(credentials["access_token"])
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "businesses": result.get("businesses", []),
            "count": len(result.get("businesses", []))
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching businesses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/businesses/{business_id}/ad-accounts")
async def get_business_ad_accounts(request: Request, business_id: str):
    """
    Get ad accounts owned by a business
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_business_ad_accounts(
            business_id, credentials["access_token"]
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "ad_accounts": result.get("ad_accounts", []),
            "count": len(result.get("ad_accounts", []))
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching business ad accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))
