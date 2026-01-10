"""
Meta Ads API - Analytics/Insights Endpoints
Handles analytics, insights, and breakdowns
"""
import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Path, Query
from fastapi.responses import JSONResponse

from ._helpers import get_user_context, get_verified_credentials
from ....services.meta_ads.meta_ads_service import get_meta_ads_service
from ....services.meta_ads.meta_sdk_client import create_meta_sdk_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Analytics"])


@router.get("/analytics")
async def get_analytics(
    request: Request,
    date_preset: str = Query("last_7d"),
    level: str = Query("account")
):
    """
    GET /api/v1/meta-ads/analytics
    
    Get analytics insights - v25.0
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        insights = await client.get_account_insights(
            account_id=credentials["account_id"],
            date_preset=date_preset
        )
        
        return JSONResponse(content={"insights": insights.get("data", []) if insights else []})
        
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
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        client = create_meta_sdk_client(credentials["access_token"])
        
        # Parse breakdown types (can be comma-separated like "age,gender")
        breakdown_list = [b.strip() for b in breakdown.split(",") if b.strip()]
        
        insights = await client.get_account_insights(
            account_id=credentials["account_id"],
            date_preset=date_preset,
            breakdowns=breakdown_list
        )
        
        return JSONResponse(content={"breakdowns": insights.get("data", []) if insights else []})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics breakdown: {e}")
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
            account_id=credentials["account_id"],
            date_preset=date_preset,
            level=level,
            breakdowns=breakdown_list,
            action_attribution_windows=attribution_list,
            time_range=time_range
        )
        
        return JSONResponse(content={"success": True, "data": insights.get("data", []) if insights else []})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching account insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/campaigns/{campaign_id}")
async def get_campaign_insights_v2(
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


@router.get("/insights/breakdown")
async def get_insights_with_breakdown(
    request: Request,
    breakdown: str = Query("age", description="Breakdown type: age, gender, age,gender, platform_position, publisher_platform, device_platform"),
    level: str = Query("account", description="Level: account, campaign, adset, ad"),
    date_preset: str = Query("last_7d", description="Date preset: today, yesterday, last_7d, last_14d, last_30d, last_90d"),
    campaign_id: Optional[str] = Query(None),
    adset_id: Optional[str] = Query(None),
    ad_id: Optional[str] = Query(None)
):
    """
    GET /api/v1/meta-ads/insights/breakdown
    
    Get insights with demographic/placement breakdowns.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.get_insights_breakdown(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            breakdown=breakdown,
            level=level,
            date_preset=date_preset,
            campaign_id=campaign_id,
            adset_id=adset_id,
            ad_id=ad_id
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "breakdown": breakdown,
            "level": level,
            "data": result.get("data")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting insights breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/time-series")
async def get_insights_time_series(
    request: Request,
    time_increment: str = Query("1", description="Time increment: 1 (daily), 7 (weekly), monthly, all_days"),
    level: str = Query("account", description="Level: account, campaign, adset, ad"),
    date_preset: str = Query("last_30d", description="Date preset"),
    campaign_id: Optional[str] = Query(None),
    adset_id: Optional[str] = Query(None),
    ad_id: Optional[str] = Query(None)
):
    """
    GET /api/v1/meta-ads/insights/time-series
    
    Get insights with time series data for trend analysis.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.get_insights_time_series(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            time_increment=time_increment,
            level=level,
            date_preset=date_preset,
            campaign_id=campaign_id,
            adset_id=adset_id,
            ad_id=ad_id
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "time_increment": time_increment,
            "level": level,
            "data": result.get("data")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting time series insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights/actions")
async def get_insights_actions(
    request: Request,
    level: str = Query("account", description="Level: account, campaign, adset, ad"),
    date_preset: str = Query("last_7d"),
    campaign_id: Optional[str] = Query(None),
    adset_id: Optional[str] = Query(None),
    ad_id: Optional[str] = Query(None)
):
    """
    GET /api/v1/meta-ads/insights/actions
    
    Get action breakdowns (conversions, clicks, video views, etc.)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.get_insights_actions(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            level=level,
            date_preset=date_preset,
            campaign_id=campaign_id,
            adset_id=adset_id,
            ad_id=ad_id
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "level": level,
            "data": result.get("data")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting action insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget/recommendations")
async def get_budget_recommendations(request: Request):
    """
    GET /api/v1/meta-ads/budget/recommendations
    
    Get budget recommendations based on campaign performance.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
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


@router.get("/bid-strategy/options")
async def get_bid_strategy_options(request: Request):
    """
    GET /api/v1/meta-ads/bid-strategy/options
    
    Get available bid strategy options.
    """
    from ....schemas.optimization import BID_STRATEGY_OPTIONS
    
    return JSONResponse(content={"options": BID_STRATEGY_OPTIONS})
