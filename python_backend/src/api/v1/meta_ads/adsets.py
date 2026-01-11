"""
Meta Ads API - Ad Set Endpoints
Handles Ad Set CRUD operations
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Path
from fastapi.responses import JSONResponse

from ._helpers import get_user_context, get_verified_credentials
from ....services.supabase_service import get_supabase_admin_client
from ....services.meta_ads.meta_ads_service import get_meta_ads_service
from ....schemas.meta_ads import CreateAdSetRequest, UpdateAdSetRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Ad Sets"])


@router.get("/adsets")
async def list_adsets(request: Request):
    """
    GET /api/v1/meta-ads/adsets
    
    List all ad sets
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_adsets(
            credentials["account_id"],
            credentials["access_token"]
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ad sets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/adsets")
async def create_adset(request: Request, body: CreateAdSetRequest):
    """
    POST /api/v1/meta-ads/adsets
    
    Create a new ad set
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        # Build targeting dict
        targeting = {}
        if body.targeting:
            if body.targeting.geo_locations:
                targeting["geo_locations"] = body.targeting.geo_locations.model_dump(exclude_none=True)
            if body.targeting.age_min:
                targeting["age_min"] = body.targeting.age_min
            if body.targeting.age_max:
                targeting["age_max"] = body.targeting.age_max
            if body.targeting.genders:
                targeting["genders"] = body.targeting.genders
            if body.targeting.interests:
                targeting["interests"] = [i.model_dump() for i in body.targeting.interests]
        
        # Build attribution_spec if provided (v24.0 2026 - validate windows)
        attribution_spec = None
        if body.attribution_spec:
            attribution_spec = []
            for spec in body.attribution_spec:
                # Validate 2026 standards: view-through limited to 1 day
                if spec.event_type == "VIEW_THROUGH" and spec.window_days > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). "
                               "7-day and 28-day view windows are deprecated."
                    )
                attribution_spec.append({
                    "event_type": spec.event_type,
                    "window_days": spec.window_days
                })
        
        service = get_meta_ads_service()
        
        # Check if campaign uses Campaign Budget Optimization (CBO)
        # If campaign has budget set, we cannot set ad set budget
        # Fetch campaigns list and find the specific campaign
        campaigns_result = await service.fetch_campaigns(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"]
        )
        
        campaign_uses_cbo = False
        if campaigns_result.get("data"):
            campaign_data = next((c for c in campaigns_result["data"] if c.get("id") == body.campaign_id), None)
            if campaign_data:
                campaign_uses_cbo = bool(campaign_data.get("daily_budget") or campaign_data.get("lifetime_budget"))
                logger.info(f"Campaign {body.campaign_id} CBO check: {campaign_uses_cbo}, daily_budget={campaign_data.get('daily_budget')}, lifetime_budget={campaign_data.get('lifetime_budget')}")
        
        # Calculate budget (convert to cents) - only if campaign doesn't use CBO
        daily_budget = None
        lifetime_budget = None
        if campaign_uses_cbo:
            # Campaign uses CBO - do NOT set ad set budget (it will cause error)
            logger.info(f"Campaign uses CBO - skipping ad set budget for campaign {body.campaign_id}")
        else:
            # Campaign doesn't use CBO - set ad set budget from request
            if body.budget_type == "daily" and body.budget_amount and body.budget_amount > 0:
                daily_budget = int(body.budget_amount * 100)
            elif body.budget_type == "lifetime" and body.budget_amount and body.budget_amount > 0:
                lifetime_budget = int(body.budget_amount * 100)
            
            # Validate that at least one budget is provided (only if campaign doesn't use CBO)
            if not daily_budget and not lifetime_budget:
                raise HTTPException(
                    status_code=400,
                    detail="Either daily_budget or lifetime_budget must be provided with a positive amount. Please set budget_type and budget_amount > 0. (Note: If campaign uses Campaign Budget Optimization, budget is set at campaign level)"
                )
        
        result = await service.create_adset(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            campaign_id=body.campaign_id,
            targeting=targeting or {"geo_locations": {"countries": ["US"]}},
            optimization_goal=body.optimization_goal or "LINK_CLICKS",
            billing_event=body.billing_event.value if body.billing_event else "IMPRESSIONS",
            status=body.status.value if body.status else "PAUSED",
            daily_budget=daily_budget,
            lifetime_budget=lifetime_budget,
            start_time=body.start_time,
            end_time=body.end_time,
            # bid_amount is expected in dollars by service layer (will be converted to cents)
            bid_amount=body.bid_amount,
            promoted_object=body.promoted_object.model_dump() if body.promoted_object else None,
            destination_type=body.destination_type.value if body.destination_type else None,
            advantage_audience=body.advantage_audience if body.advantage_audience is not None else True,  # v24.0 2026 default
            # v24.0 2026 Required Parameters
            is_adset_budget_sharing_enabled=body.is_adset_budget_sharing_enabled,
            placement_soft_opt_out=body.placement_soft_opt_out,
            attribution_spec=attribution_spec
        )
        
        if not result.get("success"):
            error_detail = result.get("error", "Unknown error creating ad set")
            logger.error(f"Ad set creation failed: {error_detail}")
            raise HTTPException(status_code=400, detail=error_detail)
        
        
        # Store in database for audit
        try:
            client = get_supabase_admin_client()
            adset_data = result.get("adset", {})
            client.table("meta_adsets").insert({
                "workspace_id": workspace_id,
                "user_id": user_id,
                "meta_adset_id": adset_data.get("id"),
                "meta_campaign_id": body.campaign_id,
                "name": body.name,
                "status": body.status.value if body.status else "PAUSED",
                "optimization_goal": body.optimization_goal or "LINK_CLICKS",
                "billing_event": body.billing_event.value if body.billing_event else "IMPRESSIONS",
                "bid_strategy": body.bid_strategy.value if body.bid_strategy else None,
                "bid_amount": int(body.bid_amount * 100) if body.bid_amount else None,
                "daily_budget": int(body.budget_amount * 100) if body.budget_type == "daily" and body.budget_amount else None,
                "lifetime_budget": int(body.budget_amount * 100) if body.budget_type == "lifetime" and body.budget_amount else None,
                "destination_type": body.destination_type.value if body.destination_type else None,
                "targeting": targeting,
                "promoted_object": body.promoted_object.model_dump() if body.promoted_object else None,
                "start_time": body.start_time,
                "end_time": body.end_time,
                "advantage_audience": body.advantage_audience if body.advantage_audience is not None else True,  # v24.0 2026
                "last_synced_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        except Exception as db_error:
            logger.warning(f"Failed to store ad set in DB: {db_error}")
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/adsets/{adset_id}")
async def update_adset(
    request: Request,
    adset_id: str = Path(...),
    body: UpdateAdSetRequest = None
):
    """
    PATCH /api/v1/meta-ads/adsets/{adset_id}
    
    Update an ad set
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        updates = {}
        if body:
            if body.name:
                updates["name"] = body.name
            if body.status:
                updates["status"] = body.status.value
            if body.budget_amount:
                # Convert budget based on type (dollars to cents)
                if body.budget_type == "lifetime":
                    updates["lifetime_budget"] = int(body.budget_amount * 100)
                else:
                    updates["daily_budget"] = int(body.budget_amount * 100)
            if body.bid_amount:
                updates["bid_amount"] = body.bid_amount  # In dollars, service layer converts to cents
            if body.targeting:
                updates["targeting"] = body.targeting.model_dump(exclude_unset=True)
            if body.start_time:
                updates["start_time"] = body.start_time
            if body.end_time:
                updates["end_time"] = body.end_time
            # v24.0 2026 Advantage+ Audience
            if body.advantage_audience is not None:
                updates["advantage_audience"] = body.advantage_audience
            # v24.0 2026 Required Parameters
            if body.is_adset_budget_sharing_enabled is not None:
                updates["is_adset_budget_sharing_enabled"] = body.is_adset_budget_sharing_enabled
            if body.placement_soft_opt_out is not None:
                updates["placement_soft_opt_out"] = body.placement_soft_opt_out
            # Attribution Spec (v24.0 2026): Validate and convert
            if body.attribution_spec:
                # Validate attribution_spec for 2026 standards
                attribution_spec = []
                for spec in body.attribution_spec:
                    if spec.event_type == "VIEW_THROUGH" and spec.window_days > 1:
                        raise HTTPException(
                            status_code=400,
                            detail="View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). "
                                   "7-day and 28-day view windows are deprecated."
                        )
                    attribution_spec.append({
                        "event_type": spec.event_type,
                        "window_days": spec.window_days
                    })
                updates["attribution_spec"] = attribution_spec
        
        service = get_meta_ads_service()
        result = await service.update_adset(
            adset_id,
            credentials["access_token"],
            **updates
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        # Check if budget was skipped due to Campaign Budget Optimization
        data = result.get("data", {})
        response = {"success": True}
        if data.get("budget_skipped_due_to_cbo"):
            response["warning"] = "Budget update was skipped: This ad set's campaign uses Campaign Budget Optimization (CBO). To change budget, edit the campaign budget instead."
        
        return JSONResponse(content=response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# PUT alias for PATCH - frontend uses PUT
@router.put("/adsets/{adset_id}")
async def update_adset_put(
    request: Request,
    adset_id: str = Path(...),
    body: UpdateAdSetRequest = None
):
    """
    PUT /api/v1/meta-ads/adsets/{adset_id}
    
    Update an ad set (alias for PATCH)
    """
    return await update_adset(request, adset_id, body)


@router.delete("/adsets/{adset_id}")
async def delete_adset(request: Request, adset_id: str = Path(...)):
    """
    DELETE /api/v1/meta-ads/adsets/{adset_id}
    
    Delete an ad set
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.delete_adset(
            adset_id,
            credentials["access_token"]
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Ad set deleted"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/adsets/{adset_id}/duplicate")
async def duplicate_adset(
    request: Request,
    adset_id: str = Path(...),
    body: dict = None
):
    """
    POST /api/v1/meta-ads/adsets/{adset_id}/duplicate
    
    Duplicate an ad set using Meta's Ad Copies API
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        new_name = body.get("new_name") if body else None
        
        service = get_meta_ads_service()
        result = await service.duplicate_adset(
            adset_id,
            credentials["access_token"],
            new_name=new_name
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "adset_id": result.get("adset_id"),
            "message": "Ad set duplicated successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/adsets/{adset_id}/archive")
async def archive_adset(request: Request, adset_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/adsets/{adset_id}/archive
    
    Archive an ad set (sets status to ARCHIVED)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.update_adset(
            adset_id,
            credentials["access_token"],
            status="ARCHIVED"
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Ad set archived"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/adsets/{adset_id}/unarchive")
async def unarchive_adset(request: Request, adset_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/adsets/{adset_id}/unarchive
    
    Unarchive an ad set (sets status to PAUSED)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.update_adset(
            adset_id,
            credentials["access_token"],
            status="PAUSED"
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Ad set unarchived"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))
