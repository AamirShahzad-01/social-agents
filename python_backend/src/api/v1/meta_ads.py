"""
Meta Ads API Router
Production-ready FastAPI endpoints for Meta Ads management

Provides endpoints for:
- Connection status
- OAuth flow
- Campaign CRUD
- Ad Set CRUD
- Ad CRUD with creative uploads
- Draft management
- Audience listing
- Business portfolio switching
"""
import asyncio
import logging
import uuid
from typing import Optional, Dict, List
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException, Query, Path
from fastapi.responses import JSONResponse, RedirectResponse

from ...services.supabase_service import (
    get_supabase_admin_client,
    ensure_user_workspace,
    log_activity
)
from ...services.meta_ads_service import get_meta_ads_service
from ...services.meta_sdk_client import create_meta_sdk_client
from ...services.meta_credentials_service import MetaCredentialsService
from ...schemas.advantage_plus import (
    CreateAdvantagePlusCampaignRequest,
    ValidateAdvantageConfigRequest,
    AdvantagePlusCampaignResponse,
    ValidateAdvantageConfigResponse
)
from ...schemas.meta_ads import (

    UpdateCampaignRequest,
    CreateAdSetRequest,
    UpdateAdSetRequest,
    CreateAdRequest,
    UpdateAdRequest,
    CreateAdDraftRequest,
    SwitchBusinessRequest,
    MetaAdsStatusResponse,
    CampaignListResponse,
    AudienceListResponse,
    OAuthUrlResponse,
    SuccessResponse,
    ErrorResponse,
)
from ...config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/meta-ads", tags=["Meta Ads"])

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def get_user_context(request: Request) -> tuple[str, str]:
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
    credentials = await MetaCredentialsService.get_ads_credentials(workspace_id, user_id)
    
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


# ============================================================================
# STATUS ENDPOINTS
# ============================================================================

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
        
        # Get ads capability
        capability = await MetaCredentialsService.check_ads_capability(workspace_id, user_id)
        
        # Get credentials for additional info
        credentials = await MetaCredentialsService.get_ads_credentials(workspace_id, user_id)
        
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
        
    except HTTPException:
        raise
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


# ============================================================================
# AUTH ENDPOINTS
# ============================================================================

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
            f"https://www.facebook.com/v25.0/dialog/oauth?"
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


# ============================================================================
# BUSINESS PORTFOLIO ENDPOINTS
# ============================================================================

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
        businesses = await MetaCredentialsService.get_available_businesses(workspace_id, user_id)
        
        # Get current credentials to find active business/ad account
        credentials = await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
        
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


# ============================================================================
# CAMPAIGN ENDPOINTS
# ============================================================================

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
    Create a new Advantage+ Campaign (v25.0+)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.create_advantage_plus_campaign(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            objective=body.objective.value,
            status=body.status.value,
            special_ad_categories=body.special_ad_categories,
            daily_budget=body.daily_budget,
            lifetime_budget=body.lifetime_budget,
            bid_strategy=body.bid_strategy.value if body.bid_strategy else None
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
    """Validate Advantage+ eligibility"""
    try:
        service = get_meta_ads_service()
        result = service.validate_advantage_config(body.model_dump())
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


# ============================================================================
# AD SET ENDPOINTS
# ============================================================================

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
        
        service = get_meta_ads_service()
        result = await service.create_adset(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            campaign_id=body.campaign_id,
            targeting=targeting or {"geo_locations": {"countries": ["US"]}},
            page_id=credentials.get("page_id"),
            optimization_goal=body.optimization_goal,
            billing_event=body.billing_event.value if body.billing_event else "IMPRESSIONS",
            status=body.status.value if body.status else "PAUSED",
            budget_type=body.budget_type or "daily",
            budget_amount=body.budget_amount or 10.0,
            bid_strategy=body.bid_strategy.value if body.bid_strategy else None,
            bid_amount=body.bid_amount,
            start_time=body.start_time,
            end_time=body.end_time,
            promoted_object=body.promoted_object.model_dump() if body.promoted_object else None,
            destination_type=body.destination_type.value if body.destination_type else None,
            advantage_audience=body.advantage_audience if body.advantage_audience is not None else True  # v25.0+ default
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
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
                "advantage_audience": body.advantage_audience if body.advantage_audience is not None else True,  # v25.0+
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
                updates["daily_budget"] = body.budget_amount
            if body.targeting:
                updates["targeting"] = body.targeting.model_dump(exclude_unset=True)
            # v25.0+ Advantage+ Audience
            if body.advantage_audience is not None:
                updates["advantage_audience"] = body.advantage_audience
        
        service = get_meta_ads_service()
        result = await service.update_adset(
            adset_id,
            credentials["access_token"],
            **updates
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ad set: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AD ENDPOINTS
# ============================================================================

@router.get("/ads")
async def list_ads(request: Request):
    """
    GET /api/v1/meta-ads/ads
    
    List all ads
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_ads(
            credentials["account_id"],
            credentials["access_token"]
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads")
async def create_ad(request: Request, body: CreateAdRequest):
    """
    POST /api/v1/meta-ads/ads
    
    Create a new ad with creative
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        page_id = body.page_id or credentials.get("page_id")
        
        if not page_id:
            raise HTTPException(
                status_code=400,
                detail="page_id is required. Please connect a Facebook Page."
            )
        
        # Step 1: Upload image if URL provided
        image_hash = None
        if body.creative.image_url and not body.creative.image_hash:
            upload_result = await service.upload_ad_image(
                credentials["account_id"],
                credentials["access_token"],
                body.creative.image_url,
                body.creative.title
            )
            if upload_result.get("success"):
                image_hash = upload_result["hash"]
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload image: {upload_result.get('error')}"
                )
        else:
            image_hash = body.creative.image_hash
        
        # Step 2: Create ad creative
        creative_result = await service.create_ad_creative(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            page_id=page_id,
            name=f"{body.name} - Creative",
            image_hash=image_hash,
            video_id=body.creative.video_id,
            title=body.creative.title,
            body=body.creative.body,
            link_url=body.creative.link_url,
            call_to_action_type=body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE",
            advantage_plus_creative=body.creative.advantage_plus_creative if body.creative.advantage_plus_creative is not None else True,  # v25.0+ Default
            gen_ai_disclosure=body.creative.gen_ai_disclosure if body.creative.gen_ai_disclosure else False,  # v25.0+ AI transparency
            format_automation=body.creative.format_automation if body.creative.format_automation else False,  # v25.0+ Format Automation
            product_set_id=body.creative.product_set_id  # Catalog product set
        )
        
        if not creative_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to create creative: {creative_result.get('error')}"
            )
        
        # Step 3: Create ad
        ad_result = await service.create_ad(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            adset_id=body.adset_id,
            creative_id=creative_result["creative_id"],
            status=body.status.value if body.status else "PAUSED"
        )
        
        if not ad_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to create ad: {ad_result.get('error')}"
            )
        
        # Store in database
        try:
            client = get_supabase_admin_client()
            ad_data = ad_result.get("ad", {})
            
            # Try to get campaign_id from the creative result or ad data
            campaign_id = ad_data.get("campaign_id") or ad_data.get("campaign", {}).get("id")
            
            client.table("meta_ads").insert({
                "workspace_id": workspace_id,
                "user_id": user_id,
                "meta_ad_id": ad_data.get("id"),
                "meta_creative_id": creative_result["creative_id"],
                "meta_adset_id": body.adset_id,
                "meta_campaign_id": campaign_id,
                "name": body.name,
                "status": body.status.value if body.status else "PAUSED",
                "creative": body.creative.model_dump(),
                "last_synced_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        except Exception as db_error:
            logger.warning(f"Failed to store ad in DB: {db_error}")
        
        return JSONResponse(content={
            "success": True,
            "ad": ad_result.get("ad")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/ads/{ad_id}")
async def update_ad(
    request: Request,
    ad_id: str = Path(...),
    body: UpdateAdRequest = None
):
    """
    PATCH /api/v1/meta-ads/ads/{ad_id}
    
    Update an ad (typically status change)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        updates = {}
        if body:
            if body.status:
                updates["status"] = body.status.value
            if body.name:
                updates["name"] = body.name
        
        service = get_meta_ads_service()
        result = await service.update_ad(
            ad_id,
            credentials["access_token"],
            **updates
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DRAFT ENDPOINTS
# ============================================================================

@router.get("/ads/draft")
async def list_drafts(
    request: Request,
    workspaceId: Optional[str] = Query(None)
):
    """
    GET /api/v1/meta-ads/ads/draft
    
    List ad drafts
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        workspace_id = workspaceId or workspace_id
        
        client = get_supabase_admin_client()
        result = client.table("meta_ad_drafts").select("*").eq(
            "workspace_id", workspace_id
        ).eq("status", "draft").order("created_at", desc=True).execute()
        
        return JSONResponse(content={
            "drafts": result.data or []
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing drafts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads/draft")
async def create_draft(request: Request, body: CreateAdDraftRequest):
    """
    POST /api/v1/meta-ads/ads/draft
    
    Create or update an ad draft
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        client = get_supabase_admin_client()
        
        draft_data = {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "platform": "facebook",  # Database requires platform field
            "ad_type": body.ad_type.value,
            "objective": body.objective,
            "optimization_goal": body.optimization_goal,
            "billing_event": body.billing_event or "IMPRESSIONS",
            "creative": body.creative,
            "targeting": body.targeting,
            "budget": body.budget,
            "schedule": body.schedule,
            "campaign_name": body.campaign_name,
            "adset_name": body.adset_name,
            "ad_name": body.ad_name,
            "destination_type": body.destination_type,
            "bid_strategy": body.bid_strategy,
            "status": "draft",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        result = client.table("meta_ad_drafts").insert(draft_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create draft")
        
        return JSONResponse(content={
            "success": True,
            "draft": result.data[0]
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating draft: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/ads/draft/{draft_id}")
async def delete_draft(
    request: Request,
    draft_id: str = Path(...)
):
    """
    DELETE /api/v1/meta-ads/ads/draft/{draft_id}
    
    Delete an ad draft
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        client = get_supabase_admin_client()
        client.table("meta_ad_drafts").delete().eq(
            "id", draft_id
        ).eq("workspace_id", workspace_id).execute()
        
        return JSONResponse(content={"success": True})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting draft: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AUDIENCE ENDPOINTS
# ============================================================================

@router.get("/audiences")
async def list_audiences(request: Request):
    """
    GET /api/v1/meta-ads/audiences
    
    List custom audiences
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_audiences(
            credentials["account_id"],
            credentials["access_token"]
        )
        
        # Transform to frontend expected format
        audiences = []
        if isinstance(result, dict) and result.get("data"):
            audiences = result["data"]
        
        return JSONResponse(content={"audiences": audiences})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching audiences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/custom")
async def create_custom_audience(request: Request):
    """
    POST /api/v1/meta-ads/audiences/custom
    
    Create a custom audience
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        subtype = body.get("subtype", "CUSTOM")
        rule = body.get("rule")
        
        # Validate that rule-based audiences have a rule
        rule_required_subtypes = ["WEBSITE", "ENGAGEMENT", "VIDEO", "LEAD_AD", "APP"]
        if subtype in rule_required_subtypes and not rule:
            raise HTTPException(
                status_code=400,
                detail=f"rule parameter is required for {subtype} custom audiences"
            )
        
        client = create_meta_sdk_client(credentials["access_token"])
        result = await client.create_custom_audience(
            account_id=credentials["account_id"],
            name=body.get("name"),
            subtype=subtype,
            rule=rule,
            retention_days=body.get("retention_days", 30),
            prefill=body.get("prefill", True),
            customer_file_source=body.get("customer_file_source")
        )
        
        # Check if SDK returned an error
        if isinstance(result, dict) and result.get("success") is False:
            error_msg = result.get("error", "Failed to create custom audience")
            logger.error(f"Meta API error creating custom audience: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        
        return JSONResponse(content={"success": True, "audience": result})
        
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating custom audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/{audience_id}/users")
async def upload_audience_users(audience_id: str, request: Request):
    """
    POST /api/v1/meta-ads/audiences/{audience_id}/users
    
    Upload customer data to a custom audience.
    Data will be normalized and SHA256 hashed before sending to Meta.
    
    Request body:
    {
        "schema": ["EMAIL", "PHONE", "FN", "LN"],
        "data": [
            ["email@example.com", "+1234567890", "John", "Doe"],
            ...
        ]
    }
    
    Supported schema fields:
    - EMAIL, PHONE, FN, LN, CT, ST, ZIP, COUNTRY
    - DOBY, DOBM, DOBD, GEN, EXTERN_ID
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        schema = body.get("schema", [])
        data = body.get("data", [])
        
        if not schema:
            raise HTTPException(status_code=400, detail="schema is required")
        
        if not data:
            raise HTTPException(status_code=400, detail="data is required")
        
        # Validate schema fields
        valid_fields = ["EMAIL", "PHONE", "FN", "LN", "CT", "ST", "ZIP", 
                       "COUNTRY", "DOBY", "DOBM", "DOBD", "GEN", "EXTERN_ID"]
        for field in schema:
            if field not in valid_fields:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid schema field: {field}. Valid fields: {valid_fields}"
                )
        
        client = create_meta_sdk_client(credentials["access_token"])
        result = await client.upload_audience_users(
            audience_id=audience_id,
            schema=schema,
            data=data
        )
        
        if isinstance(result, dict) and result.get("success") is False:
            error_msg = result.get("error", "Failed to upload users")
            logger.error(f"Meta API error uploading users: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        
        return JSONResponse(content={
            "success": True,
            "audience_id": audience_id,
            "num_received": result.get("num_received", 0),
            "num_invalid_entries": result.get("num_invalid_entries", 0)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading audience users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pixels")
async def list_pixels(request: Request):
    """
    GET /api/v1/meta-ads/pixels
    
    List Meta Pixels for the ad account
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Fetch pixels using Meta SDK
        import httpx
        account_id = credentials["account_id"]
        if not account_id.startswith('act_'):
            account_id = f'act_{account_id}'
        
        url = f"https://graph.facebook.com/v24.0/{account_id}/adspixels"
        params = {
            "access_token": credentials["access_token"],
            "fields": "id,name,code"
        }
        
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
        
        return JSONResponse(content={"pixels": data.get("data", [])})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pixels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pages")
async def list_pages(request: Request):
    """
    GET /api/v1/meta-ads/pages
    
    List Facebook Pages for the user
    Returns the connected page stored in credentials
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        pages = []
        
        # First, return the page stored in credentials (the connected page)
        if credentials.get("page_id"):
            pages.append({
                "id": credentials.get("page_id"),
                "name": credentials.get("page_name", "Connected Page"),
                "category": "Connected",
                "access_token": credentials.get("page_access_token")
            })
        
        # Also try to fetch additional pages using the user token
        # This may fail for system/business tokens but shouldn't break
        try:
            import httpx
            url = "https://graph.facebook.com/v24.0/me/accounts"
            params = {
                "access_token": credentials["access_token"],
                "fields": "id,name,category,access_token"
            }
            
            async with httpx.AsyncClient() as http_client:
                response = await http_client.get(url, params=params)
                if response.is_success:
                    data = response.json()
                    api_pages = data.get("data", [])
                    
                    # Add pages that aren't already in the list
                    existing_ids = {p["id"] for p in pages}
                    for page in api_pages:
                        if page.get("id") not in existing_ids:
                            pages.append(page)
        except Exception as e:
            logger.debug(f"Could not fetch additional pages: {e}")
            # Continue with just the connected page
        
        return JSONResponse(content={"pages": pages})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/apps")
async def list_apps(request: Request):
    """
    GET /api/v1/meta-ads/apps
    
    List mobile apps owned by the business
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        # First get businesses
        import httpx
        businesses_url = "https://graph.facebook.com/v24.0/me/businesses"
        businesses_params = {
            "access_token": credentials["access_token"],
            "fields": "id,name"
        }
        
        async with httpx.AsyncClient() as http_client:
            businesses_response = await http_client.get(businesses_url, params=businesses_params)
            businesses_response.raise_for_status()
            businesses_data = businesses_response.json()
            
            apps = []
            # Fetch apps for each business
            for business in businesses_data.get("data", []):
                apps_url = f"https://graph.facebook.com/v24.0/{business['id']}/owned_apps"
                apps_params = {
                    "access_token": credentials["access_token"],
                    "fields": "id,name,namespace"
                }
                apps_response = await http_client.get(apps_url, params=apps_params)
                if apps_response.is_success:
                    apps_data = apps_response.json()
                    apps.extend(apps_data.get("data", []))
        
        return JSONResponse(content={"apps": apps})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching apps: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/lookalike")
async def create_lookalike_audience(request: Request):
    """
    POST /api/v1/meta-ads/audiences/lookalike
    
    Create a lookalike audience - v25.0
    
    IMPORTANT: From January 6, 2026, lookalike_spec format is mandatory
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        service = get_meta_ads_service()
        result = await service.create_lookalike_audience(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.get("name"),
            origin_audience_id=body.get("source_audience_id"),
            country=body.get("country", "US"),
            ratio=body.get("ratio", 0.01),
            lookalike_type=body.get("type", "similarity")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "audience": result.get("audience")})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating lookalike audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ANALYTICS/INSIGHTS ENDPOINTS - v25.0
# ============================================================================

@router.get("/analytics")
async def get_analytics(
    request: Request,
    date_preset: str = Query("last_7d"),
    level: str = Query("account")
):
    """
    GET /api/v1/meta-ads/analytics
    
    Get analytics insights - v25.0
    
    Includes instagram_profile_visits metric (new in v25.0)
    
    Note: From January 12, 2026:
    - 7-day and 28-day view-through attribution data unavailable
    - Breakdown data limited to 13 months
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_insights(
            credentials["account_id"],
            credentials["access_token"],
            level=level,
            date_preset=date_preset
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "insights": result.get("insights", [])
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/breakdown")
async def get_analytics_breakdown(
    request: Request,
    breakdown: str = Query("age", description="Breakdown: age, gender, age,gender, country, publisher_platform, platform_position, device_platform"),
    date_preset: str = Query("last_7d"),
    level: str = Query("account")
):
    """
    GET /api/v1/meta-ads/analytics/breakdown
    
    Get analytics with demographic/placement breakdowns - v25.0
    
    Breakdowns available:
    - age: Age ranges (18-24, 25-34, 35-44, 45-54, 55-64, 65+)
    - gender: Male, Female, Unknown
    - age,gender: Combined breakdown
    - country: By country code
    - publisher_platform: Facebook, Instagram, Audience Network, Messenger
    - platform_position: Feed, Stories, Reels, Search, etc.
    - device_platform: Mobile, Desktop
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_insights_breakdown(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            breakdown=breakdown,
            date_preset=date_preset,
            level=level
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "breakdowns": result.get("breakdowns", []),
            "breakdown_type": breakdown,
            "date_preset": date_preset,
            "level": level
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/{campaign_id}/breakdown")
async def get_campaign_insights_breakdown(
    request: Request,
    campaign_id: str = Path(...),
    breakdown: str = Query("age"),
    date_preset: str = Query("last_7d")
):
    """
    GET /api/v1/meta-ads/insights/{campaign_id}/breakdown
    
    Get insights breakdown for a specific campaign
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_campaign_insights_breakdown(
            campaign_id=campaign_id,
            access_token=credentials["access_token"],
            breakdown=breakdown,
            date_preset=date_preset
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "campaign_id": campaign_id,
            "breakdowns": result.get("breakdowns", []),
            "breakdown_type": breakdown
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching campaign insights breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-status")
async def bulk_update_status(request: Request):
    """
    POST /api/v1/meta-ads/bulk-status
    
    Bulk update status for multiple campaigns, ad sets, or ads.
    
    Request body:
    {
        "entity_type": "campaign" | "adset" | "ad",
        "entity_ids": ["id1", "id2", ...],
        "status": "ACTIVE" | "PAUSED"
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        entity_type = body.get("entity_type")
        entity_ids = body.get("entity_ids", [])
        new_status = body.get("status", "PAUSED")
        
        if not entity_type or not entity_ids:
            raise HTTPException(
                status_code=400,
                detail="entity_type and entity_ids are required"
            )
        
        if entity_type not in ["campaign", "adset", "ad"]:
            raise HTTPException(
                status_code=400,
                detail="entity_type must be 'campaign', 'adset', or 'ad'"
            )
        
        service = get_meta_ads_service()
        result = await service.bulk_update_status(
            access_token=credentials["access_token"],
            entity_type=entity_type,
            entity_ids=entity_ids,
            new_status=new_status
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        # Log activity
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action=f"bulk_status_{entity_type}",
            details={
                "count": len(entity_ids),
                "status": new_status,
                "updated": result.get("updated"),
                "failed": result.get("failed")
            }
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk status update: {e}")
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


@router.get("/insights/{campaign_id}")
async def get_campaign_insights(
    request: Request,
    campaign_id: str = Path(...),
    date_preset: str = Query("last_7d")
):
    """
    GET /api/v1/meta-ads/insights/{campaign_id}
    
    Get insights for a specific campaign - v25.0
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_campaign_insights(
            campaign_id,
            credentials["access_token"],
            date_preset=date_preset
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "insights": result.get("insights")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching campaign insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pages")
async def list_pages(request: Request):
    """
    GET /api/v1/meta-ads/pages
    
    List user's Facebook Pages
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_pages(credentials["access_token"])
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "pages": result.get("pages", [])
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ADVANTAGE+ CAMPAIGN ENDPOINTS - v25.0+ STRICT COMPLIANCE
# =============================================================================

@router.post("/campaigns/advantage-plus")
async def create_advantage_plus_campaign(request: Request):
    """
    POST /api/v1/meta-ads/campaigns/advantage-plus
    
    Create an Advantage+ campaign using v25.0+ API.
    
    v25.0+ REQUIREMENTS for Advantage+ status:
    1. Campaign-level budget (Advantage+ Campaign Budget)
    2. targeting_automation.advantage_audience = 1 (Advantage+ Audience)
    3. No placement exclusions (Advantage+ Placements)
    
    When all three levers are ENABLED, advantage_state_info returns:
    - ADVANTAGE_PLUS_SALES (for OUTCOME_SALES objective)
    - ADVANTAGE_PLUS_APP (for OUTCOME_APP_PROMOTION objective)
    - ADVANTAGE_PLUS_LEADS (for OUTCOME_LEADS objective)
    
    Request body:
    {
        "name": "My Advantage+ Sales Campaign",
        "objective": "OUTCOME_SALES",
        "status": "PAUSED",
        "daily_budget": 5000,  // $50 in cents
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "geo_locations": {"countries": ["US", "CA"]},
        "promoted_object": {
            "pixel_id": "123456789",
            "custom_event_type": "PURCHASE"
        }
    }
    
    DEPRECATED (v25.0+): smart_promotion_type, existing_customer_budget_percentage
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        # Validate required fields
        name = body.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Campaign name is required")
        
        service = get_meta_ads_service()
        result = await service.create_advantage_plus_campaign(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=name,
            objective=body.get("objective", "OUTCOME_SALES"),
            daily_budget=body.get("daily_budget"),
            lifetime_budget=body.get("lifetime_budget"),
            bid_strategy=body.get("bid_strategy", "LOWEST_COST_WITHOUT_CAP"),
            bid_amount=body.get("bid_amount"),
            roas_average_floor=body.get("roas_average_floor"),
            geo_locations=body.get("geo_locations"),
            promoted_object=body.get("promoted_object"),
            status=body.get("status", "PAUSED"),
            start_time=body.get("start_time"),
            end_time=body.get("end_time"),
            special_ad_categories=body.get("special_ad_categories", []),
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        # Log activity
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="create_advantage_plus_campaign",
            details={
                "campaign_id": result.get("campaign_id"),
                "name": name,
                "objective": body.get("objective", "OUTCOME_SALES"),
                "advantage_state": result.get("advantage_state_info", {}).get("advantage_state")
            }
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating Advantage+ campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns/{campaign_id}/advantage-state")
async def get_campaign_advantage_state(
    request: Request,
    campaign_id: str = Path(...)
):
    """
    GET /api/v1/meta-ads/campaigns/{campaign_id}/advantage-state
    
    Get the Advantage+ state of a campaign.
    
    Returns:
    {
        "campaign_id": "120330000000000",
        "name": "My Campaign",
        "objective": "OUTCOME_SALES",
        "advantage_state_info": {
            "advantage_state": "advantage_plus_sales",
            "is_advantage_plus": true,
            "requirements": {
                "campaign_budget": true,
                "advantage_audience": true,
                "advantage_placements": true
            },
            "missing_requirements": []
        }
    }
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


@router.post("/campaigns/validate-advantage")
async def validate_advantage_config(request: Request):
    """
    POST /api/v1/meta-ads/campaigns/validate-advantage
    
    Validate if a configuration qualifies for Advantage+.
    This is a local validation, no actual Meta API call.
    
    Request body:
    {
        "objective": "OUTCOME_SALES",
        "has_campaign_budget": true,
        "audience_type": "ADVANTAGE_PLUS",  // or GEO_ONLY, CUSTOM
        "has_placement_exclusions": false,
        "special_ad_categories": []
    }
    
    Returns:
    {
        "is_eligible": true,
        "expected_advantage_state": "advantage_plus_sales",
        "requirements_met": {
            "campaign_budget": true,
            "advantage_audience": true,
            "advantage_placements": true,
            "no_special_ad_categories": true
        },
        "recommendations": []
    }
    """
    try:
        body = await request.json()
        
        objective = body.get("objective", "OUTCOME_SALES")
        has_campaign_budget = body.get("has_campaign_budget", True)
        has_advantage_audience = body.get("has_advantage_audience", True)
        has_placement_exclusions = body.get("has_placement_exclusions", False)
        special_ad_categories = body.get("special_ad_categories", [])
        
        service = get_meta_ads_service()
        result = service.validate_advantage_config(
            objective=objective,
            has_campaign_budget=has_campaign_budget,
            has_advantage_audience=has_advantage_audience,
            has_placement_exclusions=has_placement_exclusions,
            special_ad_categories=special_ad_categories
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating advantage config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# A/B TESTING ENDPOINTS
# =============================================================================

@router.post("/ab-tests")
async def create_ab_test(request: Request):
    """
    POST /api/v1/meta-ads/ab-tests
    
    Create a new A/B test (ad study) - v25.0+ compliant.
    
    Request body per Meta docs (https://developers.facebook.com/docs/marketing-api/guides/split-testing):
    {
        "name": "Creative Test - Holiday 2026",
        "description": "Test video vs image creatives",
        "test_type": "SPLIT_TEST",
        "cells": [
            {"name": "Group A", "treatment_percentage": 50, "campaigns": ["<CAMPAIGN_ID>"]},
            {"name": "Group B", "treatment_percentage": 50, "campaigns": ["<CAMPAIGN_ID>"]}
        ],
        "start_time": 1704067200,
        "end_time": 1706659200
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        name = body.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Test name is required")
        
        from ...services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Convert cells to proper format if needed
        cells = body.get("cells", [])
        
        result = await client.create_ab_test(
            account_id=credentials["account_id"].replace("act_", ""),
            name=name,
            test_type=body.get("test_type", "SPLIT_TEST"),
            cells=cells,
            description=body.get("description"),
            start_time=body.get("start_time"),
            end_time=body.get("end_time"),
            business_id=body.get("business_id"),
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="create_ab_test",
            details={"test_id": result.get("test_id"), "name": name}
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating A/B test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ab-tests")
async def list_ab_tests(request: Request):
    """
    GET /api/v1/meta-ads/ab-tests
    
    List all A/B tests for the ad account.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.get_ab_tests(
            account_id=credentials["account_id"].replace("act_", "")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"tests": result.get("tests", [])})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing A/B tests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# AUTOMATION RULES ENDPOINTS
# =============================================================================

@router.post("/rules")
async def create_automation_rule(request: Request):
    """
    POST /api/v1/meta-ads/rules
    
    Create an automation rule.
    
    Request body:
    {
        "name": "Pause Low CTR Ads",
        "entity_type": "AD",
        "conditions": [
            {"field": "ctr", "operator": "LESS_THAN", "value": 1.0},
            {"field": "impressions", "operator": "GREATER_THAN", "value": 1000}
        ],
        "execution_type": "PAUSE",
        "evaluation_type": "SCHEDULE",
        "schedule": {"schedule_type": "DAILY"},
        "status": "ENABLED"
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        name = body.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Rule name is required")
        
        # Build evaluation spec from conditions - per Meta Ad Rules Engine docs
        conditions = body.get("conditions", [])
        entity_type = body.get("entity_type", "CAMPAIGN")
        time_preset = body.get("time_preset", "LAST_7D")
        
        # Build filters from conditions
        filters = [
            {
                "field": c["field"],
                "value": c["value"],
                "operator": c["operator"]
            }
            for c in conditions
        ]
        
        # Add entity_type filter per Meta docs
        filters.append({
            "field": "entity_type",
            "value": entity_type,
            "operator": "EQUAL"
        })
        
        evaluation_spec = {
            "evaluation_type": body.get("evaluation_type", "SCHEDULE"),
            "filters": filters,
            "time_preset": time_preset,  # Per Meta docs - insights time range
        }
        
        # Build execution spec from execution_type
        execution_type = body.get("execution_type", "PAUSE")
        execution_spec = {
            "execution_type": execution_type,
        }
        
        # Handle CHANGE_BUDGET and CHANGE_BID execution options per Meta docs
        if execution_type in ["CHANGE_BUDGET", "CHANGE_BID"] and body.get("execution_options"):
            execution_spec["execution_options"] = body["execution_options"]
        
        # Schedule spec
        schedule_spec = None
        if body.get("schedule"):
            schedule = body["schedule"]
            schedule_spec = {
                "schedule_type": schedule.get("schedule_type", "DAILY")
            }
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.create_automation_rule(
            account_id=credentials["account_id"].replace("act_", ""),
            name=name,
            evaluation_spec=evaluation_spec,
            execution_spec=execution_spec,
            schedule_spec=schedule_spec,
            status=body.get("status", "ENABLED"),
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="create_automation_rule",
            details={"rule_id": result.get("rule_id"), "name": name}
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating automation rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rules")
async def list_automation_rules(request: Request):
    """
    GET /api/v1/meta-ads/rules
    
    List all automation rules for the ad account.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.get_automation_rules(
            account_id=credentials["account_id"].replace("act_", "")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"rules": result.get("rules", [])})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing automation rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/rules/{rule_id}")
async def update_automation_rule(
    request: Request,
    rule_id: str = Path(...)
):
    """
    PATCH /api/v1/meta-ads/rules/{rule_id}
    
    Update an automation rule (e.g., enable/disable).
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.update_automation_rule(
            rule_id=rule_id,
            updates=body
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating automation rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/rules/{rule_id}")
async def delete_automation_rule(
    request: Request,
    rule_id: str = Path(...)
):
    """
    DELETE /api/v1/meta-ads/rules/{rule_id}
    
    Delete an automation rule.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.delete_automation_rule(rule_id=rule_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="delete_automation_rule",
            details={"rule_id": rule_id}
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting automation rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rules/templates")
async def get_rule_templates(request: Request):
    """
    GET /api/v1/meta-ads/rules/templates
    
    Get pre-built automation rule templates.
    """
    from ...schemas.automation_rules import RULE_TEMPLATES
    
    return JSONResponse(content={"templates": RULE_TEMPLATES})


# =============================================================================
# CREATIVE HUB ENDPOINTS
# =============================================================================

@router.get("/creative/library")
async def get_creative_library(
    request: Request,
    creative_type: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100)
):
    """
    GET /api/v1/meta-ads/creative/library
    
    Get all creative assets from the ad account.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.get_creative_library(
            account_id=credentials["account_id"].replace("act_", ""),
            creative_type=creative_type,
            limit=limit
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching creative library: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/creative/upload")
async def upload_creative(request: Request):
    """
    POST /api/v1/meta-ads/creative/upload
    
    Upload a new creative asset.
    
    Body: {"name": "My Image", "image_url": "https://..."}
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.upload_creative(
            account_id=credentials["account_id"].replace("act_", ""),
            image_url=body.get("image_url"),
            name=body.get("name")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="upload_creative",
            details={"name": body.get("name"), "hash": result.get("asset_hash")}
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading creative: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/adlibrary/search")
async def search_ad_library(
    request: Request,
    search_terms: Optional[str] = Query(None),
    countries: str = Query("US"),
    limit: int = Query(25, ge=1, le=100)
):
    """
    GET /api/v1/meta-ads/adlibrary/search
    
    Search Meta Ad Library for competitor ads.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        countries_list = [c.strip() for c in countries.split(",")]
        
        result = await client.search_ad_library(
            search_terms=search_terms,
            ad_reached_countries=countries_list,
            limit=limit
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching ad library: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CONVERSIONS API (CAPI) ENDPOINTS
# =============================================================================

@router.post("/capi/events")
async def send_capi_events(request: Request):
    """
    POST /api/v1/meta-ads/capi/events
    
    Send conversion events via Conversions API.
    
    Body: {
        "pixel_id": "123456789",
        "events": [...],
        "test_event_code": "TEST12345"  // Optional for testing
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        pixel_id = body.get("pixel_id")
        events = body.get("events", [])
        
        if not pixel_id:
            raise HTTPException(status_code=400, detail="pixel_id is required")
        if not events:
            raise HTTPException(status_code=400, detail="events array is required")
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.send_capi_events(
            pixel_id=pixel_id,
            events=events,
            test_event_code=body.get("test_event_code")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="send_capi_events",
            details={
                "pixel_id": pixel_id,
                "events_count": len(events),
                "events_received": result.get("events_received")
            }
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending CAPI events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/capi/test")
async def test_capi_event(request: Request):
    """
    POST /api/v1/meta-ads/capi/test
    
    Send a test event (appears in Events Manager Test Events).
    
    Body: {
        "pixel_id": "123456789",
        "event": {...},
        "test_event_code": "TEST12345"
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        pixel_id = body.get("pixel_id")
        event = body.get("event")
        test_code = body.get("test_event_code")
        
        if not pixel_id or not event or not test_code:
            raise HTTPException(
                status_code=400,
                detail="pixel_id, event, and test_event_code are required"
            )
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.send_capi_events(
            pixel_id=pixel_id,
            events=[event],
            test_event_code=test_code
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending test CAPI event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/capi/diagnostics")
async def get_capi_diagnostics(
    request: Request,
    pixel_id: str = Query(...)
):
    """
    GET /api/v1/meta-ads/capi/diagnostics
    
    Get Conversions API diagnostics for a pixel.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.get_capi_diagnostics(pixel_id=pixel_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting CAPI diagnostics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# COMPLIANCE ENDPOINTS
# =============================================================================

@router.post("/compliance/check")
async def check_compliance(request: Request):
    """
    POST /api/v1/meta-ads/compliance/check
    
    Check campaign/adset/ad compliance with special ad categories.
    
    Body: {
        "campaign_id": "123...",  // or campaign config directly
        "special_ad_categories": ["HOUSING"],
        "targeting": {...}
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        body = await request.json()
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client("dummy")  # Local check only
        
        result = client.check_campaign_compliance(
            campaign_data=body,
            special_ad_categories=body.get("special_ad_categories", [])
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking compliance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/compliance/categories")
async def get_special_ad_categories(request: Request):
    """
    GET /api/v1/meta-ads/compliance/categories
    
    Get list of special ad categories with their restrictions.
    """
    from ...schemas.compliance import CATEGORY_RESTRICTIONS, SpecialAdCategory
    
    categories = []
    for cat in SpecialAdCategory:
        restrictions = CATEGORY_RESTRICTIONS.get(cat, {})
        categories.append({
            "value": cat.value,
            "name": cat.value.replace("_", " ").title(),
            "description": restrictions.get("description", ""),
            "restrictions": restrictions
        })
    
    return JSONResponse(content={"categories": categories})


# =============================================================================
# CUSTOM REPORTS ENDPOINTS
# =============================================================================

@router.post("/reports/generate")
async def generate_report(request: Request):
    """
    POST /api/v1/meta-ads/reports/generate
    
    Generate a custom report with selected metrics and breakdowns.
    
    Body: {
        "metrics": ["impressions", "clicks", "spend", "ctr"],
        "breakdowns": ["age", "gender"],
        "date_preset": "last_7d",
        "entity_level": "campaign"
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.generate_report(
            account_id=credentials["account_id"].replace("act_", ""),
            metrics=body.get("metrics", ["impressions", "clicks", "spend"]),
            breakdowns=body.get("breakdowns"),
            date_preset=body.get("date_preset", "last_7d"),
            level=body.get("entity_level", "campaign")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/metrics")
async def get_available_metrics(request: Request):
    """
    GET /api/v1/meta-ads/reports/metrics
    
    Get list of available metrics for reports.
    """
    from ...schemas.reporting import ReportMetric, METRIC_METADATA
    
    metrics = []
    for metric in ReportMetric:
        meta = METRIC_METADATA.get(metric, {})
        metrics.append({
            "value": metric.value,
            "label": meta.get("label", metric.value),
            "format": meta.get("format", "number")
        })
    
    return JSONResponse(content={"metrics": metrics})


@router.get("/reports/breakdowns")
async def get_available_breakdowns(request: Request):
    """
    GET /api/v1/meta-ads/reports/breakdowns
    
    Get list of available breakdowns for reports.
    """
    from ...schemas.reporting import ReportBreakdown
    
    breakdowns = [
        {"value": b.value, "label": b.value.replace("_", " ").title()}
        for b in ReportBreakdown
    ]
    
    return JSONResponse(content={"breakdowns": breakdowns})


# =============================================================================
# AUDIENCES ENDPOINTS
# =============================================================================

@router.get("/audiences")
async def list_audiences(request: Request):
    """
    GET /api/v1/meta-ads/audiences
    
    List all custom and lookalike audiences.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.get_audiences(
            account_id=credentials["account_id"].replace("act_", "")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching audiences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/custom")
async def create_custom_audience(request: Request):
    """
    POST /api/v1/meta-ads/audiences/custom
    
    Create a custom audience.
    
    Body: {
        "name": "Website Visitors - 30 Days",
        "subtype": "WEBSITE",
        "retention_days": 30
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.create_custom_audience(
            account_id=credentials["account_id"].replace("act_", ""),
            name=body.get("name"),
            subtype=body.get("subtype", "WEBSITE"),
            rule=body.get("rule"),
            retention_days=body.get("retention_days", 30)
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        await log_activity(
            user_id=user_id,
            workspace_id=workspace_id,
            action="create_custom_audience",
            details={"name": body.get("name"), "audience_id": result.get("audience_id")}
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating custom audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audiences/{audience_id}/size")
async def get_audience_size(
    request: Request,
    audience_id: str
):
    """
    GET /api/v1/meta-ads/audiences/{audience_id}/size
    
    Get audience size estimation.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.get_audience_size(audience_id=audience_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting audience size: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audiences/lookalike-ratios")
async def get_lookalike_ratios(request: Request):
    """
    GET /api/v1/meta-ads/audiences/lookalike-ratios
    
    Get available lookalike ratio options.
    """
    from ...schemas.audiences import LOOKALIKE_RATIOS
    
    return JSONResponse(content={"ratios": LOOKALIKE_RATIOS})


# =============================================================================
# BUDGET OPTIMIZER ENDPOINTS
# =============================================================================

@router.get("/budget/recommendations")
async def get_budget_recommendations(request: Request):
    """
    GET /api/v1/meta-ads/budget/recommendations
    
    Get budget recommendations based on campaign performance.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Get campaigns with insights
        campaigns = await client.get_campaigns(
            account_id=credentials["account_id"].replace("act_", ""),
            fields=["id", "name", "daily_budget", "spend", "roas", "cost_per_action_type"]
        )
        
        recommendations = client.get_budget_recommendations(
            campaigns=campaigns.get("campaigns", [])
        )
        
        return JSONResponse(content={
            "success": True,
            "recommendations": recommendations,
            "count": len(recommendations)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting budget recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Local feature endpoints removed (Budget Pacing, Placements, Funnel, Health)


# =============================================================================
# BID STRATEGY ENDPOINTS
# =============================================================================

@router.get("/bid-strategy/options")
async def get_bid_strategy_options(request: Request):
    """
    GET /api/v1/meta-ads/bid-strategy/options
    
    Get available bid strategy options.
    """
    from ...schemas.optimization import BID_STRATEGY_OPTIONS
    
    return JSONResponse(content={"options": BID_STRATEGY_OPTIONS})


# =============================================================================
# COMPETITOR ANALYSIS ENDPOINTS
# =============================================================================

# In-memory watchlist storage (replace with DB in production)
_competitor_watchlist: Dict[str, List[Dict]] = {}


@router.get("/competitors/search")
async def search_competitor_ads(
    request: Request,
    q: str,
    country: str = "ALL",
    platform: str = "ALL",
    active_only: bool = True,
    limit: int = 25
):
    """
    GET /api/v1/meta-ads/competitors/search
    
    Search Ad Library for competitor ads.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        result = await client.search_competitor_ads(
            search_term=q,
            country=country,
            platform=platform,
            active_only=active_only,
            limit=limit
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching competitor ads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/competitors/trends")
async def get_competitor_trends(
    request: Request,
    q: str
):
    """
    GET /api/v1/meta-ads/competitors/trends
    
    Get trend analysis for competitor ads.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        from ..services.meta_sdk_client import create_meta_sdk_client
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Search ads first
        result = await client.search_competitor_ads(
            search_term=q,
            limit=50
        )
        
        # Analyze trends
        trends = client.analyze_competitor_trends(
            ads=result.get("ads", [])
        )
        
        return JSONResponse(content={
            "success": True,
            "search_term": q,
            **trends
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting competitor trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/competitors/watchlist")
async def get_watchlist(request: Request):
    """
    GET /api/v1/meta-ads/competitors/watchlist
    
    Get competitor watchlist.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        watchlist = _competitor_watchlist.get(workspace_id, [])
        
        return JSONResponse(content={
            "success": True,
            "watchlist": watchlist
        })
        
    except Exception as e:
        logger.error(f"Error getting watchlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/competitors/watchlist")
async def add_to_watchlist(request: Request):
    """
    POST /api/v1/meta-ads/competitors/watchlist
    
    Add competitor to watchlist.
    
    Body: {
        "page_id": "123456",
        "page_name": "Competitor A",
        "industry": "E-commerce"
    }
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        body = await request.json()
        
        if workspace_id not in _competitor_watchlist:
            _competitor_watchlist[workspace_id] = []
        
        import uuid
        from datetime import datetime
        
        item = {
            "id": str(uuid.uuid4()),
            "page_id": body.get("page_id"),
            "page_name": body.get("page_name"),
            "industry": body.get("industry"),
            "notes": body.get("notes"),
            "added_at": datetime.now().isoformat()
        }
        
        _competitor_watchlist[workspace_id].append(item)
        
        return JSONResponse(content={
            "success": True,
            "item": item
        })
        
    except Exception as e:
        logger.error(f"Error adding to watchlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/competitors/watchlist/{item_id}")
async def remove_from_watchlist(
    request: Request,
    item_id: str
):
    """
    DELETE /api/v1/meta-ads/competitors/watchlist/{item_id}
    
    Remove competitor from watchlist.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        
        if workspace_id in _competitor_watchlist:
            _competitor_watchlist[workspace_id] = [
                item for item in _competitor_watchlist[workspace_id]
                if item.get("id") != item_id
            ]
        
        return JSONResponse(content={"success": True})
        
    except Exception as e:
        logger.error(f"Error removing from watchlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/competitors/industries")
async def get_industries(request: Request):
    """
    GET /api/v1/meta-ads/competitors/industries
    
    Get industry categories for competitor classification.
    """
    from ...schemas.competitors import INDUSTRY_CATEGORIES
    
    return JSONResponse(content={"industries": INDUSTRY_CATEGORIES})

# =============================================================================
# INSIGHTS API (v25.0+)
# Multi-level insights with attribution windows and breakdowns
# =============================================================================

@router.get("/insights/account")
async def get_account_insights(
    request: Request,
    date_preset: str = "last_7d",
    level: str = "account",
    breakdowns: Optional[str] = None,
    action_attribution_windows: Optional[str] = None,
    time_range_since: Optional[str] = None,
    time_range_until: Optional[str] = None
):
    """
    GET /api/v1/meta-ads/insights/account
    
    Get account-level performance insights (v25.0+).
    
    Query params:
    - date_preset: last_7d, last_14d, last_28d, last_30d, last_90d, lifetime
    - level: account, campaign, adset, ad
    - breakdowns: age, gender, country, publisher_platform (comma-separated)
    - action_attribution_windows: 1d_click, 7d_click, 1d_view (comma-separated)
    - time_range_since/until: YYYY-MM-DD for custom date range
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Parse comma-separated values
        breakdown_list = breakdowns.split(",") if breakdowns else None
        attribution_list = action_attribution_windows.split(",") if action_attribution_windows else None
        time_range = None
        if time_range_since and time_range_until:
            time_range = {"since": time_range_since, "until": time_range_until}
        
        insights = await client.get_account_insights(
            ad_account_id=credentials["account_id"],
            date_preset=date_preset,
            level=level,
            breakdowns=breakdown_list,
            action_attribution_windows=attribution_list,
            time_range=time_range
        )
        
        return JSONResponse(content={"success": True, "data": insights})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching account insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/campaigns/{campaign_id}")
async def get_campaign_insights(
    request: Request,
    campaign_id: str,
    date_preset: str = "last_7d",
    breakdowns: Optional[str] = None,
    action_attribution_windows: Optional[str] = None
):
    """
    GET /api/v1/meta-ads/insights/campaigns/{campaign_id}
    
    Get campaign-level insights (v25.0+).
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        breakdown_list = breakdowns.split(",") if breakdowns else None
        attribution_list = action_attribution_windows.split(",") if action_attribution_windows else None
        
        insights = await client.get_campaign_insights(
            campaign_id=campaign_id,
            date_preset=date_preset,
            breakdowns=breakdown_list,
            action_attribution_windows=attribution_list
        )
        
        return JSONResponse(content={"success": True, "data": insights})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching campaign insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/adsets/{adset_id}")
async def get_adset_insights(
    request: Request,
    adset_id: str,
    date_preset: str = "last_7d",
    breakdowns: Optional[str] = None,
    action_attribution_windows: Optional[str] = None
):
    """
    GET /api/v1/meta-ads/insights/adsets/{adset_id}
    
    Get ad set-level insights (v25.0+).
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        breakdown_list = breakdowns.split(",") if breakdowns else None
        attribution_list = action_attribution_windows.split(",") if action_attribution_windows else None
        
        insights = await client.get_adset_insights(
            adset_id=adset_id,
            date_preset=date_preset,
            breakdowns=breakdown_list,
            action_attribution_windows=attribution_list
        )
        
        return JSONResponse(content={"success": True, "data": insights})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching adset insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/ads/{ad_id}")
async def get_ad_insights(
    request: Request,
    ad_id: str,
    date_preset: str = "last_7d",
    breakdowns: Optional[str] = None,
    action_attribution_windows: Optional[str] = None
):
    """
    GET /api/v1/meta-ads/insights/ads/{ad_id}
    
    Get ad-level insights (v25.0+).
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        breakdown_list = breakdowns.split(",") if breakdowns else None
        attribution_list = action_attribution_windows.split(",") if action_attribution_windows else None
        
        insights = await client.get_ad_insights(
            ad_id=ad_id,
            date_preset=date_preset,
            breakdowns=breakdown_list,
            action_attribution_windows=attribution_list
        )
        
        return JSONResponse(content={"success": True, "data": insights})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ad insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ANALYTICS ENDPOINTS
# =============================================================================

@router.get("/analytics")
async def get_analytics(
    request: Request,
    date_preset: str = "last_7d",
    level: str = "account"
):
    """
    GET /api/v1/meta-ads/analytics
    
    Get account-level analytics insights
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        insights = await client.get_account_insights(
            ad_account_id=credentials["account_id"],
            date_preset=date_preset
        )
        
        return JSONResponse(content={"insights": insights or []})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/breakdown")
async def get_analytics_breakdown(
    request: Request,
    breakdown: str = "age",
    date_preset: str = "last_7d",
    level: str = "account"
):
    """
    GET /api/v1/meta-ads/analytics/breakdown
    
    Get analytics with demographic/placement breakdowns
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Parse breakdown types (can be comma-separated like "age,gender")
        breakdown_list = [b.strip() for b in breakdown.split(",") if b.strip()]
        
        insights = await client.get_account_insights(
            ad_account_id=credentials["account_id"],
            date_preset=date_preset,
            breakdowns=breakdown_list
        )
        
        return JSONResponse(content={"breakdowns": insights or []})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# INCLUDE SDK FEATURES ROUTER
# =============================================================================

from .sdk_features import router as sdk_router
router.include_router(sdk_router)

