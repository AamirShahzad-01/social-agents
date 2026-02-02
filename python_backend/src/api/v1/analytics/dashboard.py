"""
Unified Analytics Dashboard API
Provides aggregated analytics across all connected platforms.
"""
import logging
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field

from ....services.analytics import (
    unified_analytics_service,
    UnifiedDashboardData,
    PlatformComparisonData,
    TopPerformingPost,
    DateRange,
    DatePreset,
    Platform
)
from ....dependencies import get_credentials_service
from ....services.credentials import MetaCredentialsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Analytics Dashboard"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class DashboardRequest(BaseModel):
    """Request parameters for dashboard data."""
    date_preset: Optional[DatePreset] = Field(
        default=DatePreset.LAST_30D,
        description="Predefined date range"
    )
    start_date: Optional[date] = Field(
        None,
        description="Custom start date (YYYY-MM-DD)"
    )
    end_date: Optional[date] = Field(
        None,
        description="Custom end date (YYYY-MM-DD)"
    )
    platforms: Optional[List[str]] = Field(
        None,
        description="Platforms to include (facebook, instagram, youtube, tiktok). None = all"
    )
    include_top_posts: bool = Field(
        default=True,
        description="Include top performing posts section"
    )
    include_comparison: bool = Field(
        default=True,
        description="Include platform comparison data"
    )


class DashboardResponse(BaseModel):
    """Dashboard API response wrapper."""
    success: bool = True
    data: UnifiedDashboardData
    message: Optional[str] = None


class ComparisonResponse(BaseModel):
    """Platform comparison API response."""
    success: bool = True
    data: PlatformComparisonData
    message: Optional[str] = None


class TopPostsResponse(BaseModel):
    """Top posts API response."""
    success: bool = True
    data: List[TopPerformingPost]
    message: Optional[str] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def parse_platforms(platforms: Optional[List[str]]) -> Optional[List[Platform]]:
    """Parse platform strings to Platform enum."""
    if not platforms:
        return None
    
    result = []
    for p in platforms:
        try:
            result.append(Platform(p.lower()))
        except ValueError:
            logger.warning(f"Unknown platform: {p}")
            continue
    
    return result if result else None


def get_date_range(
    date_preset: Optional[DatePreset],
    start_date: Optional[date],
    end_date: Optional[date]
) -> DateRange:
    """Get DateRange from request parameters."""
    if start_date and end_date:
        return DateRange(start_date=start_date, end_date=end_date)
    return DateRange.from_preset(date_preset or DatePreset.LAST_30D)


async def get_platform_credentials(
    user_id: str,
    workspace_id: str,
    platform: str,
    credentials_service = None
) -> Optional[dict]:
    """
    Get platform credentials from credentials service.
    This is a wrapper that should integrate with your existing credentials system.
    """
    if not credentials_service:
        return None
    
    try:
        if platform == "facebook":
            credentials = await MetaCredentialsService.get_meta_credentials(
                workspace_id=workspace_id,
                refresh_if_needed=False,
                user_id=user_id
            )
            if not credentials:
                return None
            access_token = credentials.get("page_access_token") or credentials.get("access_token")
            if not access_token or not credentials.get("page_id"):
                return None
            return {
                **credentials,
                "access_token": access_token
            }

        if platform == "instagram":
            credentials = await MetaCredentialsService.get_instagram_credentials(
                workspace_id=workspace_id,
                refresh_if_needed=False,
                user_id=user_id
            )
            if not credentials or not credentials.get("access_token"):
                return None
            return credentials

        # Default to generic credentials service for other platforms
        return await credentials_service.get_credentials(
            user_id=user_id,
            workspace_id=workspace_id,
            platform=platform
        )
    except Exception as e:
        logger.warning(f"Failed to get credentials for {platform}: {e}")
        return None


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get(
    "",
    response_model=DashboardResponse,
    summary="Get Unified Analytics Dashboard",
    description="Fetches aggregated analytics from all connected platforms"
)
async def get_dashboard(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(
        DatePreset.LAST_30D,
        description="Predefined date range"
    ),
    start_date: Optional[date] = Query(
        None,
        description="Custom start date"
    ),
    end_date: Optional[date] = Query(
        None,
        description="Custom end date"
    ),
    platforms: Optional[str] = Query(
        None,
        description="Comma-separated platform list"
    ),
    include_top_posts: bool = Query(True),
    include_comparison: bool = Query(True),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get unified analytics dashboard data.
    
    Aggregates data from Facebook, Instagram, YouTube, and TikTok
    into a single dashboard view with:
    - Aggregated metrics across all platforms
    - Per-platform summaries
    - Top performing posts
    - Platform comparison charts
    """
    try:
        # Public route - use workspace_id for access control
        # user_id is optional since this is a public endpoint
        
        # Parse parameters
        date_range = get_date_range(date_preset, start_date, end_date)
        platform_list = parse_platforms(
            platforms.split(",") if platforms else None
        )
        
        # Create credentials getter function
        async def credentials_getter(user_id: str, workspace_id: str, platform: str):
            return await get_platform_credentials(
                user_id, workspace_id, platform, credentials_service
            )
        
        # Fetch dashboard data
        dashboard_data = await unified_analytics_service.get_dashboard_data(
            user_id="system",  # Public access uses system user
            workspace_id=workspace_id,
            date_range=date_range,
            platforms=platform_list,
            include_top_posts=include_top_posts,
            include_comparison=include_comparison,
            credentials_getter=credentials_getter
        )
        
        return DashboardResponse(
            success=True,
            data=dashboard_data,
            message="Dashboard data retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching dashboard data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard data: {str(e)}"
        )


@router.get(
    "/comparison",
    response_model=ComparisonResponse,
    summary="Get Platform Comparison",
    description="Get side-by-side comparison of metrics across platforms"
)
async def get_platform_comparison(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(DatePreset.LAST_30D),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get platform comparison data for charts.
    
    Returns metrics comparison suitable for rendering
    bar charts, radar charts, or comparison tables.
    """
    try:
        date_range = get_date_range(date_preset, start_date, end_date)
        
        async def credentials_getter(user_id: str, workspace_id: str, platform: str):
            return await get_platform_credentials(
                user_id, workspace_id, platform, credentials_service
            )
        
        comparison = await unified_analytics_service.get_platform_comparison(
            user_id="system",
            workspace_id=workspace_id,
            date_range=date_range,
            credentials_getter=credentials_getter
        )
        
        return ComparisonResponse(
            success=True,
            data=comparison,
            message="Platform comparison retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error fetching platform comparison: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch platform comparison: {str(e)}"
        )


@router.get(
    "/top-posts",
    response_model=TopPostsResponse,
    summary="Get Top Performing Posts",
    description="Get top performing posts across all platforms"
)
async def get_top_posts(
    workspace_id: str = Query(..., description="Workspace ID"),
    date_preset: Optional[DatePreset] = Query(DatePreset.LAST_30D),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, ge=1, le=50, description="Maximum posts to return"),
    credentials_service = Depends(get_credentials_service)
):
    """
    Get top performing posts across all platforms.
    
    Posts are ranked by engagement rate and include
    preview content, thumbnail, and direct post URLs.
    """
    try:
        date_range = get_date_range(date_preset, start_date, end_date)
        
        async def credentials_getter(user_id: str, workspace_id: str, platform: str):
            return await get_platform_credentials(
                user_id, workspace_id, platform, credentials_service
            )
        
        top_posts = await unified_analytics_service.get_top_performing_posts(
            user_id="system",
            workspace_id=workspace_id,
            date_range=date_range,
            limit=limit,
            credentials_getter=credentials_getter
        )
        
        return TopPostsResponse(
            success=True,
            data=top_posts,
            message=f"Retrieved {len(top_posts)} top performing posts"
        )
        
    except Exception as e:
        logger.error(f"Error fetching top posts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top posts: {str(e)}"
        )
