"""
Instagram Analytics API
Provides Instagram Business/Creator Account Insights endpoints.
"""
import logging
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field

from ....services.analytics import (
    instagram_analytics_service,
    InstagramInsights,
    InstagramMediaInsights,
    InstagramAudienceDemographics,
    DateRange,
    DatePreset,
    AnalyticsPeriod
)
from ....dependencies import get_credentials_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/instagram", tags=["Instagram Analytics"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class InstagramInsightsResponse(BaseModel):
    """Instagram insights response wrapper."""
    success: bool = True
    data: InstagramInsights
    message: Optional[str] = None


class InstagramMediaInsightsResponse(BaseModel):
    """Instagram media insights response wrapper."""
    success: bool = True
    data: InstagramMediaInsights
    message: Optional[str] = None


class InstagramTopMediaResponse(BaseModel):
    """Instagram top media response wrapper."""
    success: bool = True
    data: List[InstagramMediaInsights]
    message: Optional[str] = None


class InstagramAudienceResponse(BaseModel):
    """Instagram audience demographics response wrapper."""
    success: bool = True
    data: Optional[InstagramAudienceDemographics]
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


async def get_instagram_credentials(
    user_id: str,
    workspace_id: str,
    credentials_service
) -> dict:
    """Get Instagram credentials from credentials service."""
    try:
        credentials = await credentials_service.get_credentials(
            user_id=user_id,
            workspace_id=workspace_id,
            platform="instagram"
        )
        
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Instagram credentials not found. Please connect your Instagram account."
            )
        
        if not credentials.get("access_token"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Instagram access token not available"
            )
        
        ig_user_id = credentials.get("instagram_user_id") or credentials.get("ig_user_id")
        if not ig_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Instagram user ID not configured"
            )
        
        return {
            **credentials,
            "ig_user_id": ig_user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Instagram credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve Instagram credentials"
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get(
    "/insights",
    response_model=InstagramInsightsResponse,
    summary="Get Instagram Account Insights",
    description="Fetches comprehensive Instagram account analytics"
)
async def get_instagram_insights(
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
    include_audience: bool = Query(True, description="Include audience demographics"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get Instagram Account Insights.
    
    Returns comprehensive account analytics including:
    - Follower count and growth
    - Views and reach (2025+ compliant metrics)
    - Engagement metrics
    - Time series data
    - Top performing media
    - Audience demographics
    """
    try:
        
        credentials = await get_instagram_credentials(
            "system", workspace_id, credentials_service
        )
        
        ig_user_id = credentials["ig_user_id"]
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        insights = await instagram_analytics_service.get_account_insights(
            ig_user_id=ig_user_id,
            access_token=access_token,
            date_range=date_range,
            period=period,
            include_time_series=include_time_series,
            include_audience=include_audience
        )
        
        return InstagramInsightsResponse(
            success=True,
            data=insights,
            message="Instagram insights retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Instagram insights: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Instagram insights: {str(e)}"
        )


@router.get(
    "/media/{media_id}/insights",
    response_model=InstagramMediaInsightsResponse,
    summary="Get Instagram Media Insights",
    description="Fetches insights for a specific Instagram media"
)
async def get_media_insights(
    media_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get insights for a specific Instagram media.
    
    Returns detailed media metrics including:
    - Views and reach
    - Likes, comments, saves, shares
    - Engagement rate
    - Media-type specific metrics (e.g., plays for Reels)
    """
    try:
        
        credentials = await get_instagram_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        
        media_insights = await instagram_analytics_service.get_media_insights(
            media_id=media_id,
            access_token=access_token
        )
        
        return InstagramMediaInsightsResponse(
            success=True,
            data=media_insights,
            message="Media insights retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching media insights: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch media insights: {str(e)}"
        )


@router.get(
    "/top-media",
    response_model=InstagramTopMediaResponse,
    summary="Get Top Instagram Media",
    description="Get top performing Instagram media by engagement"
)
async def get_top_media(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(DatePreset.LAST_30D),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get top performing Instagram media.
    
    Returns media sorted by engagement within the specified date range.
    """
    try:
        
        credentials = await get_instagram_credentials(
            "system", workspace_id, credentials_service
        )
        
        ig_user_id = credentials["ig_user_id"]
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        top_media = await instagram_analytics_service.get_top_media(
            ig_user_id=ig_user_id,
            access_token=access_token,
            date_range=date_range,
            limit=limit
        )
        
        return InstagramTopMediaResponse(
            success=True,
            data=top_media,
            message=f"Retrieved {len(top_media)} top media"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching top media: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top media: {str(e)}"
        )


@router.get(
    "/audience",
    response_model=InstagramAudienceResponse,
    summary="Get Instagram Audience Demographics",
    description="Get audience demographics for the Instagram account"
)
async def get_audience_demographics(
    workspace_id: str = Query(..., description="Workspace ID"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get Instagram audience demographics.
    
    Returns demographic breakdown including:
    - Age and gender distribution
    - Top cities
    - Top countries
    
    Note: Requires minimum follower count (usually 100+).
    """
    try:
        
        credentials = await get_instagram_credentials(
            "system", workspace_id, credentials_service
        )
        
        ig_user_id = credentials["ig_user_id"]
        access_token = credentials["access_token"]
        
        audience = await instagram_analytics_service.get_audience_demographics(
            ig_user_id=ig_user_id,
            access_token=access_token
        )
        
        if not audience:
            return InstagramAudienceResponse(
                success=True,
                data=None,
                message="Audience demographics not available (may require more followers)"
            )
        
        return InstagramAudienceResponse(
            success=True,
            data=audience,
            message="Audience demographics retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching audience demographics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch audience demographics: {str(e)}"
        )
