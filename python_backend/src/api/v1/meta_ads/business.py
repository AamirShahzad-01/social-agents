"""
Meta Ads API - Business Portfolio Endpoints
Handles business portfolio switching and listing
"""
import logging

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from ._helpers import get_user_context
from ....services.credentials import MetaCredentialsService
from ....schemas.meta_ads import SwitchBusinessRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Business"])


@router.get("/switch-business")
async def list_businesses(request: Request):
    """
    GET /api/v1/meta-ads/switch-business
    
    List available business portfolios with their ad accounts
    Returns both availableBusinesses and activeBusiness for the frontend
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        # Get available businesses with ad accounts
        businesses = await MetaCredentialsService.get_available_businesses(
            workspace_id,
            user_id
        )
        
        # Get current credentials to find active business/ad account
        credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id,
            refresh_if_needed=False
        )
        
        active_business = None
        if credentials:
            ad_account_id = credentials.get("account_id")
            ad_account_name = credentials.get("account_name")
            business_id = credentials.get("business_id")
            business_name = credentials.get("business_name")
            
            if ad_account_id:
                active_business = {
                    "id": business_id,
                    "name": business_name,
                    "adAccount": {
                        "id": ad_account_id,
                        "name": ad_account_name,
                    }
                }
        
        return JSONResponse(content={
            "availableBusinesses": businesses,
            "activeBusiness": active_business
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing businesses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/switch-business")
async def switch_business(request: Request, body: SwitchBusinessRequest):
    """
    POST /api/v1/meta-ads/switch-business
    
    Switch to a different business portfolio and ad account
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        result = await MetaCredentialsService.switch_business(
            workspace_id,
            body.businessId,
            body.adAccountId,
            user_id
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to switch business"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error switching business: {e}")
        raise HTTPException(status_code=500, detail=str(e))
