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
        
        # Phase 5: Attribution spec validation based on optimization goal (will be set later)
        # This will be validated after we determine the optimization_goal
        
        service = get_meta_ads_service()
        
        # Check if campaign uses Campaign Budget Optimization (CBO)
        # If campaign has budget set, we cannot set ad set budget
        # Fetch campaigns list and find the specific campaign
        campaigns_result = await service.fetch_campaigns(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"]
        )
        
        campaign_uses_cbo = False
        campaign_bid_strategy = None
        inherited_promoted_object = None
        campaign_objective = None
        
        if campaigns_result.get("data"):
            campaign_data = next((c for c in campaigns_result["data"] if c.get("id") == body.campaign_id), None)
            if campaign_data:
                campaign_uses_cbo = bool(campaign_data.get("daily_budget") or campaign_data.get("lifetime_budget"))
                campaign_bid_strategy = campaign_data.get("bid_strategy")
                inherited_promoted_object = campaign_data.get("promoted_object")
                campaign_objective = campaign_data.get("objective")
                logger.info(f"Campaign {body.campaign_id} info: objective={campaign_objective}, CBO={campaign_uses_cbo}, bid_strategy={campaign_bid_strategy}, promoted_object={inherited_promoted_object}")
        
        # Phase 2: Validate optimization goal matches campaign objective (workflow alignment)
        optimization_goal = body.optimization_goal
        if campaign_objective:
            from ....services.meta_ads.meta_ads_service import OBJECTIVE_VALID_GOALS, RESTRICTED_ATTRIBUTION_GOALS
            valid_goals = OBJECTIVE_VALID_GOALS.get(campaign_objective, [])
            
            if not optimization_goal:
                # Use default based on campaign objective
                if valid_goals:
                    optimization_goal = valid_goals[0]
                else:
                    optimization_goal = "LINK_CLICKS"
            
            if optimization_goal not in valid_goals:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid optimization goal '{optimization_goal}' for campaign objective '{campaign_objective}'. "
                           f"Valid goals for {campaign_objective} are: {', '.join(valid_goals)}. "
                           f"Please select an optimization goal that aligns with your campaign objective."
                )
            
            # Phase 4: Objective-specific validation for all campaign types (aligned with Meta Ads Manager)
            if campaign_objective == "OUTCOME_SALES":
                # Sales campaigns: OFFSITE_CONVERSIONS requires pixel_id
                if optimization_goal == "OFFSITE_CONVERSIONS":
                    if not promoted_object_dict or not promoted_object_dict.get("pixel_id"):
                        raise HTTPException(
                            status_code=400,
                            detail="For sales campaigns with OFFSITE_CONVERSIONS optimization, promoted_object with pixel_id is required. "
                                   "Please provide a pixel_id in the promoted_object to track conversions."
                        )
                # Sales campaigns: VALUE optimization also benefits from pixel_id
                elif optimization_goal == "VALUE":
                    if not promoted_object_dict or not promoted_object_dict.get("pixel_id"):
                        logger.warning("VALUE optimization for sales campaigns benefits from pixel_id for conversion value tracking")
                
                # Validate placement_soft_opt_out is only used for Sales/Leads
                if body.placement_soft_opt_out is not None and body.placement_soft_opt_out:
                    logger.info("placement_soft_opt_out enabled for sales campaign (v24.0 2026)")
            
            elif campaign_objective == "OUTCOME_LEADS":
                # Leads campaigns: LEAD_GENERATION requires lead_gen_form_id or pixel_id
                if optimization_goal == "LEAD_GENERATION":
                    if not promoted_object_dict or (not promoted_object_dict.get("lead_gen_form_id") and not promoted_object_dict.get("pixel_id")):
                        raise HTTPException(
                            status_code=400,
                            detail="For leads campaigns with LEAD_GENERATION optimization, promoted_object with lead_gen_form_id or pixel_id is required. "
                                   "Please provide a lead form or pixel for lead tracking."
                        )
                # Leads campaigns: QUALITY_LEAD also requires lead form
                elif optimization_goal == "QUALITY_LEAD":
                    if not promoted_object_dict or not promoted_object_dict.get("lead_gen_form_id"):
                        raise HTTPException(
                            status_code=400,
                            detail="QUALITY_LEAD optimization requires lead_gen_form_id in promoted_object. "
                                   "Please provide a lead form ID."
                        )
                # Leads campaigns: CONVERSATIONS requires destination_type
                elif optimization_goal == "CONVERSATIONS":
                    if not body.destination_type:
                        raise HTTPException(
                            status_code=400,
                            detail="CONVERSATIONS optimization for leads campaigns requires destination_type. "
                                   "Please specify MESSENGER, WHATSAPP, or INSTAGRAM_DIRECT."
                        )
                
                # Validate placement_soft_opt_out is only used for Sales/Leads
                if body.placement_soft_opt_out is not None and body.placement_soft_opt_out:
                    logger.info("placement_soft_opt_out enabled for leads campaign (v24.0 2026)")
            
            elif campaign_objective == "OUTCOME_APP_PROMOTION":
                # App promotion: APP_INSTALLS requires application_id
                if optimization_goal == "APP_INSTALLS":
                    if not promoted_object_dict or not promoted_object_dict.get("application_id"):
                        raise HTTPException(
                            status_code=400,
                            detail="For app promotion campaigns with APP_INSTALLS optimization, promoted_object with application_id is required. "
                                   "Please provide an application_id in the promoted_object."
                        )
                # App promotion: APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires both app_id and pixel_id
                elif optimization_goal == "APP_INSTALLS_AND_OFFSITE_CONVERSIONS":
                    if not promoted_object_dict:
                        raise HTTPException(
                            status_code=400,
                            detail="APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires promoted_object with both application_id and pixel_id."
                        )
                    if not promoted_object_dict.get("application_id"):
                        raise HTTPException(
                            status_code=400,
                            detail="APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires application_id in promoted_object."
                        )
                    if not promoted_object_dict.get("pixel_id"):
                        raise HTTPException(
                            status_code=400,
                            detail="APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires pixel_id in promoted_object for conversion tracking."
                        )
                # App promotion: destination_type should be APP
                if not body.destination_type or body.destination_type.value != "APP":
                    logger.warning("App promotion campaigns should use destination_type=APP for optimal performance")
            
            elif campaign_objective == "OUTCOME_TRAFFIC":
                # Traffic campaigns: LANDING_PAGE_VIEWS requires link_url (validated at creative level)
                if optimization_goal == "LANDING_PAGE_VIEWS":
                    logger.info("LANDING_PAGE_VIEWS optimization - ensure creative has link_url")
                # Traffic campaigns: LINK_CLICKS also requires link_url
                elif optimization_goal == "LINK_CLICKS":
                    logger.info("LINK_CLICKS optimization - ensure creative has link_url")
                # Traffic campaigns: destination_type should be WEBSITE
                if not body.destination_type or body.destination_type.value not in ["WEBSITE", "APPLINKS_AUTOMATIC"]:
                    logger.warning("Traffic campaigns should use destination_type=WEBSITE for optimal performance")
            
            elif campaign_objective == "OUTCOME_ENGAGEMENT":
                # Engagement campaigns: POST_ENGAGEMENT doesn't require link_url
                if optimization_goal == "POST_ENGAGEMENT":
                    logger.info("POST_ENGAGEMENT optimization - link_url optional, can use page posts")
                # Engagement campaigns: THRUPLAY requires video
                elif optimization_goal == "THRUPLAY":
                    logger.info("THRUPLAY optimization - ensure creative has video content")
                # Engagement campaigns: CONVERSATIONS requires destination_type
                elif optimization_goal == "CONVERSATIONS":
                    if not body.destination_type:
                        raise HTTPException(
                            status_code=400,
                            detail="CONVERSATIONS optimization for engagement campaigns requires destination_type. "
                                   "Please specify MESSENGER, WHATSAPP, or INSTAGRAM_DIRECT."
                        )
                # Engagement campaigns: PAGE_LIKES doesn't require link_url
                elif optimization_goal == "PAGE_LIKES":
                    logger.info("PAGE_LIKES optimization - link_url not required")
            
            elif campaign_objective == "OUTCOME_AWARENESS":
                # Awareness campaigns: REACH and IMPRESSIONS don't require link_url
                if optimization_goal in ["REACH", "IMPRESSIONS"]:
                    logger.info(f"{optimization_goal} optimization - link_url optional for awareness campaigns")
                # Awareness campaigns: AD_RECALL_LIFT requires video
                elif optimization_goal == "AD_RECALL_LIFT":
                    logger.info("AD_RECALL_LIFT optimization - video content recommended for better recall")
            
            # Phase 5: Feature dependency enforcement - placement_soft_opt_out only for Sales/Leads
            if body.placement_soft_opt_out is not None and body.placement_soft_opt_out:
                if campaign_objective not in ["OUTCOME_SALES", "OUTCOME_LEADS"]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"placement_soft_opt_out is only available for Sales and Leads campaigns. "
                               f"Current campaign objective: {campaign_objective}"
                    )
            
            # Phase 5: Bid strategy validation
            if body.bid_strategy:
                bid_strategy_value = body.bid_strategy.value if hasattr(body.bid_strategy, 'value') else body.bid_strategy
                # LOWEST_COST_WITH_MIN_ROAS only for Sales/Conversions objectives
                if bid_strategy_value == "LOWEST_COST_WITH_MIN_ROAS":
                    if campaign_objective not in ["OUTCOME_SALES"]:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Bid strategy LOWEST_COST_WITH_MIN_ROAS is only available for Sales campaigns. "
                                   f"Current campaign objective: {campaign_objective}"
                        )
            
            # Phase 5: Attribution spec validation for non-conversion goals
            if attribution_spec and optimization_goal:
                if optimization_goal in RESTRICTED_ATTRIBUTION_GOALS:
                    # For restricted goals, only allow click-through: 1 day, no view-through
                    has_view_through = any(s.get("event_type") == "VIEW_THROUGH" for s in attribution_spec)
                    if has_view_through:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Optimization goal '{optimization_goal}' only supports click-through attribution (1-day). "
                                   f"View-through attribution is not available for this goal."
                        )
        elif not body.campaign_id:
            raise HTTPException(
                status_code=400,
                detail="campaign_id is required to create an ad set."
            )
        else:
            logger.warning(f"Campaign {body.campaign_id} not found - skipping optimization goal validation")
            if not optimization_goal:
                optimization_goal = "LINK_CLICKS"
        
        # Use inherited promoted_object if not provided in body
        promoted_object_dict = body.promoted_object.model_dump() if body.promoted_object else inherited_promoted_object
        
        # Validate bid_amount if campaign uses a bid strategy that requires it (v24.0 2026)
        # Per Meta API: LOWEST_COST_WITH_BID_CAP, TARGET_COST, and COST_CAP require bid_amount at ad set level
        BID_STRATEGIES_REQUIRING_AMOUNT = ["LOWEST_COST_WITH_BID_CAP", "TARGET_COST", "COST_CAP"]
        if campaign_bid_strategy in BID_STRATEGIES_REQUIRING_AMOUNT and not body.bid_amount:
            raise HTTPException(
                status_code=400,
                detail=f"bid_amount is required when campaign uses {campaign_bid_strategy} bid strategy. "
                       f"Please provide a bid_amount (in dollars) for this ad set."
            )
        
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
        
        # Determine default optimization goal based on campaign objective if not provided
        optimization_goal = body.optimization_goal
        if not optimization_goal and campaign_objective:
            from ....services.meta_ads.meta_ads_service import OBJECTIVE_VALID_GOALS, RESTRICTED_ATTRIBUTION_GOALS
            valid_goals = OBJECTIVE_VALID_GOALS.get(campaign_objective, [])
            if valid_goals:
                # Use first valid goal as default (typically the recommended one)
                optimization_goal = valid_goals[0]
                logger.info(f"Using default optimization goal '{optimization_goal}' for campaign objective '{campaign_objective}'")
        if not optimization_goal:
            optimization_goal = "LINK_CLICKS"  # Fallback default
        
        result = await service.create_adset(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            campaign_id=body.campaign_id,
            targeting=targeting or {"geo_locations": {"countries": ["US"]}},
            optimization_goal=optimization_goal,
            billing_event=body.billing_event.value if body.billing_event else "IMPRESSIONS",
            status=body.status.value if body.status else "PAUSED",
            daily_budget=daily_budget,
            lifetime_budget=lifetime_budget,
            start_time=body.start_time,
            end_time=body.end_time,
            # bid_amount is expected in dollars by service layer (will be converted to cents)
            bid_amount=body.bid_amount,
            promoted_object=promoted_object_dict,
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
                "optimization_goal": optimization_goal,
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
