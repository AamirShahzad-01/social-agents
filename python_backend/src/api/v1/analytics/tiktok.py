"""
TikTok Analytics API
Provides TikTok video and account analytics endpoints.
"""
import logging
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field

from ....services.analytics import (
    tiktok_analytics_service,
    TikTokAnalytics,
    TikTokUserMetrics,
    TikTokVideoMetrics,
    DateRange,
    DatePreset
)
from ....dependencies import get_credentials_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tiktok", tags=["TikTok Analytics"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class TikTokAnalyticsResponse(BaseModel):
    """TikTok analytics response wrapper."""
    success: bool = True
    data: TikTokAnalytics
    message: Optional[str] = None


class TikTokUserResponse(BaseModel):
    """TikTok user info response wrapper."""
    success: bool = True
    data: TikTokUserMetrics
    message: Optional[str] = None


class TikTokVideosResponse(BaseModel):
    """TikTok videos response wrapper."""
    success: bool = True
    data: List[TikTokVideoMetrics]
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


async def get_tiktok_credentials(
    user_id: str,
    workspace_id: str,
    credentials_service
) -> dict:
    """Get TikTok credentials from credentials service."""
    try:
        credentials = await credentials_service.get_credentials(
            user_id=user_id,
            workspace_id=workspace_id,
            platform="tiktok"
        )
        
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="TikTok credentials not found. Please connect your TikTok account."
            )
        
        if not credentials.get("access_token"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TikTok access token not available"
            )
        
        return credentials
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting TikTok credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve TikTok credentials"
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get(
    "/insights",
    response_model=TikTokAnalyticsResponse,
    summary="Get TikTok Analytics Overview",
    description="Fetches TikTok account and video analytics"
)
async def get_tiktok_analytics(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(
        DatePreset.LAST_30D,
        description="Predefined date range"
    ),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    max_videos: int = Query(20, ge=1, le=50, description="Max videos to analyze"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get TikTok Analytics Overview.
    
    Returns account and video analytics including:
    - Follower count and profile stats
    - Video list with engagement metrics
    - Aggregated view, like, comment, share counts
    - Top performing videos
    
    Note: TikTok Display API provides limited metrics compared to other platforms.
    """
    try:
        
        credentials = await get_tiktok_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        analytics = await tiktok_analytics_service.get_analytics_overview(
            access_token=access_token,
            date_range=date_range,
            max_videos=max_videos
        )
        
        return TikTokAnalyticsResponse(
            success=True,
            data=analytics,
            message="TikTok analytics retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching TikTok analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch TikTok analytics: {str(e)}"
        )


@router.get(
    "/user",
    response_model=TikTokUserResponse,
    summary="Get TikTok User Info",
    description="Fetches TikTok user profile information"
)
async def get_tiktok_user_info(
    workspace_id: str = Query(..., description="Workspace ID"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get TikTok user profile information.
    
    Returns:
    - Display name and avatar
    - Follower and following counts
    - Total likes received
    - Video count
    """
    try:
        
        credentials = await get_tiktok_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        
        user_info = await tiktok_analytics_service.get_user_info(
            access_token=access_token
        )
        
        return TikTokUserResponse(
            success=True,
            data=user_info,
            message="TikTok user info retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching TikTok user info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch TikTok user info: {str(e)}"
        )


@router.get(
    "/videos",
    response_model=TikTokVideosResponse,
    summary="Get TikTok Videos with Stats",
    description="Fetches user's TikTok videos with engagement statistics"
)
async def get_tiktok_videos(
    workspace_id: str = Query(..., description="Workspace ID"),
    max_count: int = Query(20, ge=1, le=50, description="Maximum videos to fetch"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get TikTok videos with statistics.
    
    Returns list of videos with:
    - Video ID and metadata
    - View, like, comment, share counts
    - Cover image and share URL
    - Engagement rate
    """
    try:
        
        credentials = await get_tiktok_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        
        videos = await tiktok_analytics_service.get_videos_with_stats(
            access_token=access_token,
            max_count=max_count
        )
        
        return TikTokVideosResponse(
            success=True,
            data=videos,
            message=f"Retrieved {len(videos)} videos"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching TikTok videos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch TikTok videos: {str(e)}"
        )


@router.post(
    "/videos/stats",
    response_model=TikTokVideosResponse,
    summary="Get Stats for Specific Videos",
    description="Fetches statistics for specific video IDs"
)
async def get_video_stats(
    video_ids: List[str],
    workspace_id: str = Query(..., description="Workspace ID"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get statistics for specific TikTok videos.
    
    Provide a list of video IDs to fetch their current statistics.
    """
    try:
        
        if not video_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one video_id is required"
            )
        
        credentials = await get_tiktok_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        
        videos = await tiktok_analytics_service.get_video_stats(
            access_token=access_token,
            video_ids=video_ids
        )
        
        return TikTokVideosResponse(
            success=True,
            data=videos,
            message=f"Retrieved stats for {len(videos)} videos"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching video stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch video stats: {str(e)}"
        )
