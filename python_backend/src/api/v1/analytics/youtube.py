"""
YouTube Analytics API
Provides YouTube Channel and Video Analytics endpoints.
"""
import logging
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field

from ....services.analytics import (
    youtube_analytics_service,
    YouTubeAnalytics,
    YouTubeVideoMetrics,
    YouTubeTrafficSource,
    DateRange,
    DatePreset
)
from ....dependencies import get_credentials_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/youtube", tags=["YouTube Analytics"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class YouTubeAnalyticsResponse(BaseModel):
    """YouTube analytics response wrapper."""
    success: bool = True
    data: YouTubeAnalytics
    message: Optional[str] = None


class YouTubeVideoResponse(BaseModel):
    """YouTube video analytics response wrapper."""
    success: bool = True
    data: YouTubeVideoMetrics
    message: Optional[str] = None


class YouTubeTopVideosResponse(BaseModel):
    """YouTube top videos response wrapper."""
    success: bool = True
    data: List[YouTubeVideoMetrics]
    message: Optional[str] = None


class YouTubeTrafficSourcesResponse(BaseModel):
    """YouTube traffic sources response wrapper."""
    success: bool = True
    data: List[YouTubeTrafficSource]
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


async def get_youtube_credentials(
    user_id: str,
    workspace_id: str,
    credentials_service
) -> dict:
    """Get YouTube credentials from credentials service."""
    try:
        credentials = await credentials_service.get_credentials(
            user_id=user_id,
            workspace_id=workspace_id,
            platform="youtube"
        )
        
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="YouTube credentials not found. Please connect your YouTube account."
            )
        
        if not credentials.get("access_token"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="YouTube access token not available"
            )
        
        return credentials
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting YouTube credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve YouTube credentials"
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get(
    "/insights",
    response_model=YouTubeAnalyticsResponse,
    summary="Get YouTube Channel Analytics",
    description="Fetches comprehensive YouTube channel analytics"
)
async def get_youtube_analytics(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(
        DatePreset.LAST_30D,
        description="Predefined date range"
    ),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    include_time_series: bool = Query(True, description="Include daily time series"),
    include_top_videos: bool = Query(True, description="Include top videos"),
    top_videos_limit: int = Query(10, ge=1, le=50, description="Number of top videos"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get YouTube Channel Analytics.
    
    Returns comprehensive channel analytics including:
    - Subscriber count and growth
    - Views and watch time
    - Engagement metrics (likes, comments, shares)
    - Time series data
    - Top performing videos
    - Traffic source breakdown
    """
    try:
        
        credentials = await get_youtube_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        analytics = await youtube_analytics_service.get_channel_analytics(
            access_token=access_token,
            date_range=date_range,
            include_time_series=include_time_series,
            include_top_videos=include_top_videos,
            top_videos_limit=top_videos_limit
        )
        
        return YouTubeAnalyticsResponse(
            success=True,
            data=analytics,
            message="YouTube analytics retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching YouTube analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch YouTube analytics: {str(e)}"
        )


@router.get(
    "/videos/{video_id}/analytics",
    response_model=YouTubeVideoResponse,
    summary="Get YouTube Video Analytics",
    description="Fetches analytics for a specific YouTube video"
)
async def get_video_analytics(
    video_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get analytics for a specific YouTube video.
    
    Returns detailed video metrics including:
    - Views and watch time
    - Average view duration and percentage
    - Engagement metrics
    - Audience retention
    """
    try:
        
        credentials = await get_youtube_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        
        # Get date range if provided
        date_range = None
        if start_date and end_date:
            date_range = DateRange(start_date=start_date, end_date=end_date)
        elif date_preset:
            date_range = DateRange.from_preset(date_preset)
        
        video_analytics = await youtube_analytics_service.get_video_analytics(
            access_token=access_token,
            video_id=video_id,
            date_range=date_range
        )
        
        return YouTubeVideoResponse(
            success=True,
            data=video_analytics,
            message="Video analytics retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching video analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch video analytics: {str(e)}"
        )


@router.get(
    "/top-videos",
    response_model=YouTubeTopVideosResponse,
    summary="Get Top YouTube Videos",
    description="Get top performing YouTube videos by views"
)
async def get_top_videos(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(DatePreset.LAST_30D),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get top performing YouTube videos.
    
    Returns videos sorted by views within the specified date range.
    """
    try:
        
        credentials = await get_youtube_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        # Get channel info first to get channel ID
        channel_info = await youtube_analytics_service._get_channel_info(access_token)
        channel_id = channel_info.get("id")
        
        if not channel_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not retrieve YouTube channel ID"
            )
        
        top_videos = await youtube_analytics_service.get_top_videos(
            access_token=access_token,
            channel_id=channel_id,
            date_range=date_range,
            limit=limit
        )
        
        return YouTubeTopVideosResponse(
            success=True,
            data=top_videos,
            message=f"Retrieved {len(top_videos)} top videos"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching top videos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top videos: {str(e)}"
        )


@router.get(
    "/traffic-sources",
    response_model=YouTubeTrafficSourcesResponse,
    summary="Get YouTube Traffic Sources",
    description="Get traffic source breakdown for the channel"
)
async def get_traffic_sources(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(DatePreset.LAST_30D),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get YouTube traffic source breakdown.
    
    Returns where your views are coming from:
    - YouTube Search
    - Suggested Videos
    - External (websites, apps)
    - Browse Features
    - Playlists
    - etc.
    """
    try:
        
        credentials = await get_youtube_credentials(
            "system", workspace_id, credentials_service
        )
        
        access_token = credentials["access_token"]
        date_range = get_date_range(date_preset, start_date, end_date)
        
        channel_info = await youtube_analytics_service._get_channel_info(access_token)
        channel_id = channel_info.get("id")
        
        if not channel_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not retrieve YouTube channel ID"
            )
        
        traffic_sources = await youtube_analytics_service.get_traffic_sources(
            access_token=access_token,
            channel_id=channel_id,
            date_range=date_range
        )
        
        return YouTubeTrafficSourcesResponse(
            success=True,
            data=traffic_sources,
            message="Traffic sources retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching traffic sources: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch traffic sources: {str(e)}"
        )
