"""
Meta Ads API - Campaign Endpoints
Handles Campaign CRUD operations and Advantage+ campaigns
"""
import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Query, Path
from fastapi.responses import JSONResponse

from ._helpers import get_user_context, get_verified_credentials
from ....services.supabase_service import get_supabase_admin_client, log_activity
from ....services.meta_ads.meta_ads_service import get_meta_ads_service
from ....schemas.meta_ads import UpdateCampaignRequest
from ....schemas.advantage_plus import (
    CreateAdvantagePlusCampaignRequest,
    ValidateAdvantageConfigRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Campaigns"])


@router.get("/campaigns")
async def list_campaigns(request: Request):
    """
    GET /api/v1/meta-ads/campaigns
    
    List all campaigns with ad sets and ads
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        account_id = credentials["account_id"]
        access_token = credentials["access_token"]
        
        # Fetch campaigns, ad sets, and ads in parallel
        campaigns_result, adsets_result, ads_result = await asyncio.gather(
            service.fetch_campaigns(account_id, access_token),
            service.fetch_adsets(account_id, access_token),
            service.fetch_ads(account_id, access_token),
            return_exceptions=True
        )
        
        # Extract data, handling any errors gracefully
        campaigns = []
        adsets = []
        ads = []
        
        if isinstance(campaigns_result, dict) and campaigns_result.get("data"):
            campaigns = campaigns_result["data"]
        
        if isinstance(adsets_result, dict) and adsets_result.get("data"):
            adsets = adsets_result["data"]
        
        if isinstance(ads_result, dict) and ads_result.get("data"):
            ads = ads_result["data"]
        
        return JSONResponse(content={
            "campaigns": campaigns,
            "adSets": adsets,
            "ads": ads
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/advantage-plus")
async def create_advantage_plus_campaign(
    request: Request,
    body: CreateAdvantagePlusCampaignRequest
):
    """
    POST /api/v1/meta-ads/campaigns/advantage-plus
    Create a new Advantage+ Campaign (v24.0 2026 standards)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        
        # Convert datetime to ISO format strings if provided (v24.0 2026 standards)
        start_time_str = None
        end_time_str = None
        if body.start_time:
            if isinstance(body.start_time, datetime):
                # Ensure timezone-aware datetime (default to UTC if naive)
                if body.start_time.tzinfo is None:
                    start_time_str = body.start_time.replace(tzinfo=timezone.utc).isoformat()
                else:
                    start_time_str = body.start_time.isoformat()
            else:
                start_time_str = str(body.start_time)
        
        if body.end_time:
            if isinstance(body.end_time, datetime):
                # Ensure timezone-aware datetime (default to UTC if naive)
                if body.end_time.tzinfo is None:
                    end_time_str = body.end_time.replace(tzinfo=timezone.utc).isoformat()
                else:
                    end_time_str = body.end_time.isoformat()
            else:
                end_time_str = str(body.end_time)
        
        # Phase 4: Objective-specific validation for all campaign types (aligned with Meta Ads Manager)
        objective_value = body.objective.value
        promoted_object_dict = body.promoted_object.model_dump() if body.promoted_object else None
        bid_strategy_value = body.bid_strategy.value if body.bid_strategy else None
        
        if objective_value == "OUTCOME_SALES":
            # Sales campaigns: promoted_object with pixel_id is recommended for conversion tracking
            if promoted_object_dict and promoted_object_dict.get("pixel_id"):
                logger.info(f"Sales campaign with pixel_id: {promoted_object_dict.get('pixel_id')}")
            else:
                logger.warning("Sales campaign created without pixel_id - conversion tracking may be limited")
        
        elif objective_value == "OUTCOME_LEADS":
            # Leads campaigns: promoted_object with lead_gen_form_id or pixel_id recommended
            if promoted_object_dict:
                if promoted_object_dict.get("lead_gen_form_id"):
                    logger.info(f"Leads campaign with lead_gen_form_id: {promoted_object_dict.get('lead_gen_form_id')}")
                elif promoted_object_dict.get("pixel_id"):
                    logger.info(f"Leads campaign with pixel_id: {promoted_object_dict.get('pixel_id')}")
                else:
                    logger.warning("Leads campaign created without lead_gen_form_id or pixel_id - lead tracking may be limited")
            else:
                logger.warning("Leads campaign created without promoted_object - lead tracking may be limited")
        
        elif objective_value == "OUTCOME_APP_PROMOTION":
            # App promotion: promoted_object with application_id is required
            if promoted_object_dict and promoted_object_dict.get("application_id"):
                logger.info(f"App promotion campaign with application_id: {promoted_object_dict.get('application_id')}")
            else:
                raise HTTPException(
                    status_code=400,
                    detail="App promotion campaigns require promoted_object with application_id. "
                           "Please provide an application_id in the promoted_object."
                )
        
        elif objective_value == "OUTCOME_TRAFFIC":
            # Traffic campaigns: promoted_object with pixel_id optional but recommended
            if promoted_object_dict and promoted_object_dict.get("pixel_id"):
                logger.info(f"Traffic campaign with pixel_id: {promoted_object_dict.get('pixel_id')}")
            else:
                logger.info("Traffic campaign - pixel_id optional but recommended for conversion tracking")
        
        elif objective_value == "OUTCOME_ENGAGEMENT":
            # Engagement campaigns: promoted_object optional, depends on optimization goal
            if promoted_object_dict:
                logger.info("Engagement campaign with promoted_object configured")
            else:
                logger.info("Engagement campaign - promoted_object optional")
        
        elif objective_value == "OUTCOME_AWARENESS":
            # Awareness campaigns: promoted_object not typically required
            if promoted_object_dict:
                logger.info("Awareness campaign with promoted_object configured")
            else:
                logger.info("Awareness campaign - promoted_object not required")
        
        # Phase 5: Bid strategy validation - LOWEST_COST_WITH_MIN_ROAS only for Sales
        if bid_strategy_value == "LOWEST_COST_WITH_MIN_ROAS" and objective_value != "OUTCOME_SALES":
            raise HTTPException(
                status_code=400,
                detail=f"Bid strategy LOWEST_COST_WITH_MIN_ROAS is only available for Sales campaigns. "
                       f"Current objective: {objective_value}"
            )
        
        result = await service.create_advantage_plus_campaign(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            objective=objective_value,
            status=body.status.value,
            special_ad_categories=body.special_ad_categories,
            daily_budget=body.daily_budget,
            lifetime_budget=body.lifetime_budget,
            bid_strategy=body.bid_strategy.value if body.bid_strategy else None,
            geo_locations=body.geo_locations.model_dump() if body.geo_locations else None,
            promoted_object=promoted_object_dict,
            start_time=start_time_str,
            end_time=end_time_str,
            skip_adset=body.skip_adset
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
            
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating Advantage+ campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/validate-advantage")
async def validate_advantage_config(
    request: Request,
    body: ValidateAdvantageConfigRequest
):
    """Validate Advantage+ eligibility (v24.0 2026 standards)"""
    try:
        service = get_meta_ads_service()
        # Convert Pydantic model to dict, handling enum values
        config_dict = body.model_dump(mode='python')
        # Ensure objective is a string value if it's an enum
        if 'objective' in config_dict and hasattr(config_dict['objective'], 'value'):
            config_dict['objective'] = config_dict['objective'].value
        result = service.validate_advantage_config(config=config_dict)
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error validating Advantage+ config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(
    request: Request,
    campaign_id: str = Path(...),
    body: UpdateCampaignRequest = None
):
    """
    PATCH /api/v1/meta-ads/campaigns/{campaign_id}
    
    Update a campaign
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        # Build updates dict
        updates = {}
        if body:
            if body.name:
                updates["name"] = body.name
            if body.status:
                updates["status"] = body.status.value
            if body.budget_amount:
                updates["daily_budget"] = int(body.budget_amount * 100)
        
        service = get_meta_ads_service()
        result = await service.update_campaign(
            campaign_id,
            credentials["access_token"],
            **updates
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    request: Request,
    campaign_id: str = Path(...)
):
    """
    DELETE /api/v1/meta-ads/campaigns/{campaign_id}
    
    Delete a campaign
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.delete_campaign(campaign_id, credentials["access_token"])
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/{campaign_id}/archive")
async def archive_campaign(request: Request, campaign_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/campaigns/{campaign_id}/archive
    
    Archive a campaign (sets status to ARCHIVED)
    Archived campaigns can still have stats queried but won't run.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.update_campaign(
            campaign_id,
            credentials["access_token"],
            status="ARCHIVED"
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Campaign archived"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/{campaign_id}/unarchive")
async def unarchive_campaign(request: Request, campaign_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/campaigns/{campaign_id}/unarchive
    
    Unarchive a campaign (sets status to PAUSED)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.update_campaign(
            campaign_id,
            credentials["access_token"],
            status="PAUSED"
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Campaign unarchived"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/{campaign_id}/duplicate")
async def duplicate_campaign(
    request: Request,
    campaign_id: str = Path(...)
):
    """
    POST /api/v1/meta-ads/campaigns/{campaign_id}/duplicate
    
    Duplicate an existing campaign.
    
    Request body (optional):
    {
        "new_name": "Campaign Name - Copy"
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = {}
        try:
            body = await request.json()
        except:
            pass
        
        new_name = body.get("new_name")
        
        service = get_meta_ads_service()
        result = await service.duplicate_campaign(
            campaign_id=campaign_id,
            access_token=credentials["access_token"],
            new_name=new_name
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns/{campaign_id}/advantage-state")
async def get_campaign_advantage_state(
    request: Request,
    campaign_id: str = Path(...)
):
    """
    GET /api/v1/meta-ads/campaigns/{campaign_id}/advantage-state
    
    Get the Advantage+ state of a campaign.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.get_campaign_advantage_state(
            campaign_id=campaign_id,
            access_token=credentials["access_token"]
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting advantage state: {e}")
        raise HTTPException(status_code=500, detail=str(e))
