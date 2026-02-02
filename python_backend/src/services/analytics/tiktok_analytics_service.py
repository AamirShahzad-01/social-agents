"""
TikTok Analytics Service
Production-ready TikTok Display API integration for video analytics
Follows official documentation: https://developers.tiktok.com/doc/display-api-overview

Note: TikTok Display API provides limited analytics.
Full analytics require Research API approval.

Available via Display API:
- User profile info (follower_count, likes_count, video_count)
- Video list with basic metrics (view_count, like_count, comment_count, share_count)
"""
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

import httpx

from .analytics_types import (
    TikTokAnalytics,
    TikTokUserMetrics,
    TikTokVideoMetrics,
    MetricTrend,
    DateRange,
    DatePreset
)
from ...config import settings

logger = logging.getLogger(__name__)


class TikTokAnalyticsService:
    """
    TikTok Display API Service for Analytics.
    
    Provides video and account analytics using TikTok's Display API.
    Limited metrics compared to other platforms.
    """
    
    DISPLAY_API_BASE = "https://open.tiktokapis.com/v2"
    
    # Available fields for user info
    USER_FIELDS = [
        "open_id",
        "union_id",
        "avatar_url",
        "avatar_url_100",
        "avatar_large_url",
        "display_name",
        "bio_description",
        "profile_deep_link",
        "is_verified",
        "follower_count",
        "following_count",
        "likes_count",
        "video_count"
    ]
    
    # Available fields for videos
    VIDEO_FIELDS = [
        "id",
        "title",
        "create_time",
        "cover_image_url",
        "share_url",
        "video_description",
        "duration",
        "height",
        "width",
        "embed_html",
        "embed_link",
        "like_count",
        "comment_count",
        "share_count",
        "view_count"
    ]
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
    
    # =========================================================================
    # PUBLIC API METHODS
    # =========================================================================
    
    async def get_analytics_overview(
        self,
        access_token: str,
        date_range: DateRange,
        max_videos: int = 20
    ) -> TikTokAnalytics:
        """
        Get TikTok analytics overview.
        
        Due to API limitations, we aggregate metrics from user info and video list.
        
        Args:
            access_token: TikTok access token with user.info.basic and video.list scopes
            date_range: Date range (used for filtering videos by create_time)
            max_videos: Maximum number of videos to fetch for aggregation
            
        Returns:
            TikTokAnalytics with user metrics and video breakdown
        """
        try:
            # Fetch user info
            user_info = await self._get_user_info(access_token)
            
            # Build user metrics
            user_metrics = TikTokUserMetrics(
                open_id=user_info.get("open_id", ""),
                display_name=user_info.get("display_name", ""),
                avatar_url=user_info.get("avatar_url"),
                follower_count=MetricTrend.calculate(
                    float(user_info.get("follower_count", 0)),
                    None  # TikTok doesn't provide historical data
                ),
                following_count=user_info.get("following_count"),
                likes_count=user_info.get("likes_count"),
                video_count=user_info.get("video_count")
            )
            
            # Fetch videos with stats
            videos = await self.get_videos_with_stats(
                access_token, 
                max_count=max_videos
            )
            
            # Filter videos by date range and aggregate
            filtered_videos = []
            total_views = 0
            total_likes = 0
            total_comments = 0
            total_shares = 0
            
            for video in videos:
                video_date = video.create_time.date()
                if date_range.start_date <= video_date <= date_range.end_date:
                    filtered_videos.append(video)
                    total_views += video.view_count
                    total_likes += video.like_count
                    total_comments += video.comment_count
                    total_shares += video.share_count
            
            # Sort by views for top videos
            filtered_videos.sort(key=lambda v: v.view_count, reverse=True)
            
            return TikTokAnalytics(
                user_metrics=user_metrics,
                top_videos=filtered_videos[:10],  # Top 10 by views
                total_views=total_views,
                total_likes=total_likes,
                total_comments=total_comments,
                total_shares=total_shares,
                date_range=date_range
            )
            
        except httpx.HTTPStatusError as e:
            logger.error(f"TikTok API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error fetching TikTok analytics: {e}")
            raise
    
    async def get_user_info(
        self,
        access_token: str
    ) -> TikTokUserMetrics:
        """
        Get TikTok user profile information.
        
        Args:
            access_token: TikTok access token
            
        Returns:
            TikTokUserMetrics with profile info and follower counts
        """
        user_info = await self._get_user_info(access_token)
        
        return TikTokUserMetrics(
            open_id=user_info.get("open_id", ""),
            display_name=user_info.get("display_name", ""),
            avatar_url=user_info.get("avatar_url"),
            follower_count=MetricTrend.calculate(
                float(user_info.get("follower_count", 0)),
                None
            ),
            following_count=user_info.get("following_count"),
            likes_count=user_info.get("likes_count"),
            video_count=user_info.get("video_count")
        )
    
    async def get_videos_with_stats(
        self,
        access_token: str,
        max_count: int = 20,
        cursor: Optional[int] = None
    ) -> List[TikTokVideoMetrics]:
        """
        Get user's videos with engagement statistics.
        
        Args:
            access_token: TikTok access token
            max_count: Maximum number of videos to fetch (max 20 per request)
            cursor: Pagination cursor for next page
            
        Returns:
            List of TikTokVideoMetrics with engagement data
        """
        try:
            url = f"{self.DISPLAY_API_BASE}/video/list/"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            body = {
                "max_count": min(max_count, 20),  # API max is 20
                "fields": self.VIDEO_FIELDS
            }
            
            if cursor:
                body["cursor"] = cursor
            
            response = await self.client.post(url, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
            
            if data.get("error", {}).get("code") != "ok":
                error_msg = data.get("error", {}).get("message", "Unknown error")
                logger.error(f"TikTok API error: {error_msg}")
                return []
            
            videos_data = data.get("data", {}).get("videos", [])
            
            videos = []
            for video in videos_data:
                try:
                    # Calculate engagement rate
                    view_count = video.get("view_count", 0)
                    engagement = (
                        video.get("like_count", 0) +
                        video.get("comment_count", 0) +
                        video.get("share_count", 0)
                    )
                    engagement_rate = (engagement / view_count * 100) if view_count > 0 else 0
                    
                    videos.append(TikTokVideoMetrics(
                        video_id=video.get("id", ""),
                        title=video.get("title") or video.get("video_description"),
                        create_time=datetime.fromtimestamp(video.get("create_time", 0)),
                        cover_image_url=video.get("cover_image_url"),
                        share_url=video.get("share_url"),
                        duration=video.get("duration"),
                        view_count=view_count,
                        like_count=video.get("like_count", 0),
                        comment_count=video.get("comment_count", 0),
                        share_count=video.get("share_count", 0),
                        engagement_rate=round(engagement_rate, 2)
                    ))
                except Exception as e:
                    logger.warning(f"Error parsing TikTok video: {e}")
                    continue
            
            return videos
            
        except Exception as e:
            logger.error(f"Error fetching TikTok videos: {e}")
            return []
    
    async def get_video_stats(
        self,
        access_token: str,
        video_ids: List[str]
    ) -> List[TikTokVideoMetrics]:
        """
        Get stats for specific videos.
        
        Args:
            access_token: TikTok access token
            video_ids: List of video IDs to fetch stats for
            
        Returns:
            List of TikTokVideoMetrics for specified videos
        """
        try:
            url = f"{self.DISPLAY_API_BASE}/video/query/"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            body = {
                "filters": {
                    "video_ids": video_ids
                },
                "fields": self.VIDEO_FIELDS
            }
            
            response = await self.client.post(url, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
            
            if data.get("error", {}).get("code") != "ok":
                error_msg = data.get("error", {}).get("message", "Unknown error")
                logger.error(f"TikTok API error: {error_msg}")
                return []
            
            videos_data = data.get("data", {}).get("videos", [])
            
            videos = []
            for video in videos_data:
                try:
                    view_count = video.get("view_count", 0)
                    engagement = (
                        video.get("like_count", 0) +
                        video.get("comment_count", 0) +
                        video.get("share_count", 0)
                    )
                    engagement_rate = (engagement / view_count * 100) if view_count > 0 else 0
                    
                    videos.append(TikTokVideoMetrics(
                        video_id=video.get("id", ""),
                        title=video.get("title") or video.get("video_description"),
                        create_time=datetime.fromtimestamp(video.get("create_time", 0)),
                        cover_image_url=video.get("cover_image_url"),
                        share_url=video.get("share_url"),
                        duration=video.get("duration"),
                        view_count=view_count,
                        like_count=video.get("like_count", 0),
                        comment_count=video.get("comment_count", 0),
                        share_count=video.get("share_count", 0),
                        engagement_rate=round(engagement_rate, 2)
                    ))
                except Exception as e:
                    logger.warning(f"Error parsing TikTok video: {e}")
                    continue
            
            return videos
            
        except Exception as e:
            logger.error(f"Error fetching TikTok video stats: {e}")
            return []
    
    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================
    
    async def _get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Fetch TikTok user info from Display API."""
        url = f"{self.DISPLAY_API_BASE}/user/info/"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        body = {
            "fields": self.USER_FIELDS
        }
        
        response = await self.client.post(url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
        
        if data.get("error", {}).get("code") != "ok":
            error_msg = data.get("error", {}).get("message", "Unknown error")
            raise ValueError(f"TikTok API error: {error_msg}")
        
        return data.get("data", {}).get("user", {})


# Singleton instance
tiktok_analytics_service = TikTokAnalyticsService()


async def close_tiktok_analytics_service():
    """Close the TikTok analytics service HTTP client."""
    await tiktok_analytics_service.close()
