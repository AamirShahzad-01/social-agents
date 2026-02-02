"""
Facebook Analytics API
Provides Facebook Page Insights endpoints for organic content analytics.
"""
import logging
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field

from ....services.analytics import (
    facebook_analytics_service,
    FacebookInsights,
    FacebookPostInsights,
    DateRange,
    DatePreset,
    AnalyticsPeriod
)
from ....dependencies import get_credentials_service
from ....services.credentials import MetaCredentialsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/facebook", tags=["Facebook Analytics"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class FacebookInsightsResponse(BaseModel):
    """Facebook insights response wrapper."""
    success: bool = True
    data: FacebookInsights
    message: Optional[str] = None


class FacebookPostInsightsResponse(BaseModel):
    """Facebook post insights response wrapper."""
    success: bool = True
    data: FacebookPostInsights
    message: Optional[str] = None


class FacebookTopPostsResponse(BaseModel):
    """Facebook top posts response wrapper."""
    success: bool = True
    data: List[FacebookPostInsights]
    message: Optional[str] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_date_range(
    date_preset: Optional[DatePreset],
    start_date: Optional[date],
    end_date: Optional[date]
) -> DateRange:
    """Get DateRange from request parameters."""
    if start_date and end_date:
        return DateRange(start_date=start_date, end_date=end_date)
    return DateRange.from_preset(date_preset or DatePreset.LAST_30D)


async def get_facebook_credentials(
    user_id: str,
    workspace_id: str,
    credentials_service
) -> dict:
    """Get Facebook credentials from credentials service."""
    try:
        credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id=workspace_id,
            refresh_if_needed=False,
            user_id=user_id
        )
        
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Facebook credentials not found. Please connect your Facebook account."
            )
        
        access_token = credentials.get("page_access_token") or credentials.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Facebook access token not available"
            )
        
        if not credentials.get("page_id"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Facebook page_id not configured"
            )
        
        return {
            **credentials,
            "access_token": access_token
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Facebook credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve Facebook credentials"
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get(
    "/insights",
    response_model=FacebookInsightsResponse,
    summary="Get Facebook Page Insights",
    description="Fetches comprehensive Facebook Page analytics"
)
async def get_facebook_insights(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(
        DatePreset.LAST_30D,
        description="Predefined date range"
    ),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    period: AnalyticsPeriod = Query(
        AnalyticsPeriod.DAY,
        description="Aggregation period"
    ),
    include_time_series: bool = Query(True, description="Include daily time series"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get Facebook Page Insights.
    
    Returns comprehensive page analytics including:
    - Page followers and growth
    - Page views and reach
    - Post engagements
    - Time series data
    - Top performing posts
    """
    try:
        
        # Get credentials
        credentials = await get_facebook_credentials(
            "system", workspace_id, credentials_service
        )
        
        page_id = credentials["page_id"]
        access_token = credentials["access_token"]
        
        # Get date range
        date_range = get_date_range(date_preset, start_date, end_date)
        
        # Fetch insights
        insights = await facebook_analytics_service.get_page_insights(
            page_id=page_id,
            access_token=access_token,
            date_range=date_range,
            period=period,
            include_time_series=include_time_series
        )
        
        return FacebookInsightsResponse(
            success=True,
            data=insights,
            message="Facebook insights retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Facebook insights: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Facebook insights: {str(e)}"
        )


@router.get(
    "/posts/{post_id}/insights",
    response_model=FacebookPostInsightsResponse,
    summary="Get Facebook Post Insights",
    description="Fetches insights for a specific Facebook post"
)
async def get_post_insights(
    post_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get insights for a specific Facebook post.
    
    Returns detailed post metrics including:
    - Impressions and reach
    - Engagement breakdown
    - Reaction counts by type
    - Comments and shares
    """
    try:
        
        credentials = await get_facebook_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        
        post_insights = await facebook_analytics_service.get_post_insights(
            post_id=post_id,
            access_token=access_token
        )
        
        return FacebookPostInsightsResponse(
            success=True,
            data=post_insights,
            message="Post insights retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching post insights: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch post insights: {str(e)}"
        )


@router.get(
    "/top-posts",
    response_model=FacebookTopPostsResponse,
    summary="Get Top Facebook Posts",
    description="Get top performing Facebook posts by engagement"
)
async def get_top_posts(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(DatePreset.LAST_30D),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get top performing Facebook posts.
    
    Returns posts sorted by engagement within the specified date range.
    """
    try:
        
        credentials = await get_facebook_credentials(
            "system", workspace_id, credentials_service
        )
        
        page_id = credentials["page_id"]
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        top_posts = await facebook_analytics_service.get_top_posts(
            page_id=page_id,
            access_token=access_token,
            date_range=date_range,
            limit=limit
        )
        
        return FacebookTopPostsResponse(
            success=True,
            data=top_posts,
            message=f"Retrieved {len(top_posts)} top posts"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching top posts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top posts: {str(e)}"
        )


@router.get(
    "/overview",
    summary="Get Facebook Page Overview",
    description="Get quick overview of Facebook page stats"
)
async def get_page_overview(
    workspace_id: str = Query(..., description="Workspace ID"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get quick Facebook page overview.
    
    Returns current page stats without full analytics fetch.
    """
    try:
        
        credentials = await get_facebook_credentials(
            "system", workspace_id, credentials_service
        )
        
        page_id = credentials["page_id"]
        access_token = credentials["access_token"]
        
        overview = await facebook_analytics_service.get_page_overview(
            page_id=page_id,
            access_token=access_token
        )
        
        return {
            "success": True,
            "data": overview,
            "message": "Page overview retrieved successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching page overview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch page overview: {str(e)}"
        )
