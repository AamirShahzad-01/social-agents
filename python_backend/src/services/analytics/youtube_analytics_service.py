"""
YouTube Analytics Service
Production-ready YouTube Channel and Video Analytics using YouTube Analytics API
Follows official documentation: https://developers.google.com/youtube/analytics/reference

Required OAuth Scope: https://www.googleapis.com/auth/yt-analytics.readonly
Also needs: https://www.googleapis.com/auth/youtube.readonly for channel info
"""
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

import httpx

from .analytics_types import (
    YouTubeAnalytics,
    YouTubeChannelMetrics,
    YouTubeVideoMetrics,
    YouTubeTrafficSource,
    MetricTrend,
    TimeSeriesDataPoint,
    DateRange,
    DatePreset
)
from ...config import settings

logger = logging.getLogger(__name__)


class YouTubeAnalyticsService:
    """
    YouTube Analytics API Service.
    
    Provides channel and video analytics using YouTube Analytics API v2.
    Requires appropriate OAuth scopes for analytics access.
    """
    
    ANALYTICS_API_URL = "https://youtubeanalytics.googleapis.com/v2/reports"
    DATA_API_URL = "https://www.googleapis.com/youtube/v3"
    
    # Core channel metrics
    CHANNEL_METRICS = [
        "views",
        "estimatedMinutesWatched",
        "averageViewDuration",
        "subscribersGained",
        "subscribersLost",
        "likes",
        "dislikes",  # Returns 0 since 2021
        "comments",
        "shares"
    ]
    
    # Video-level metrics
    VIDEO_METRICS = [
        "views",
        "estimatedMinutesWatched",
        "averageViewDuration",
        "averageViewPercentage",
        "likes",
        "comments",
        "shares"
    ]
    
    # Traffic source types
    TRAFFIC_SOURCE_TYPES = [
        "ADVERTISING",
        "ANNOTATION",
        "CAMPAIGN_CARD",
        "END_SCREEN",
        "EXT_URL",
        "HASHTAGS",
        "NO_LINK_EMBEDDED",
        "NO_LINK_OTHER",
        "NOTIFICATION",
        "PLAYLIST",
        "PROMOTED",
        "RELATED_VIDEO",
        "SHORTS",
        "SUBSCRIBER",
        "YT_CHANNEL",
        "YT_OTHER_PAGE",
        "YT_SEARCH"
    ]
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
    
    # =========================================================================
    # PUBLIC API METHODS
    # =========================================================================
    
    async def get_channel_analytics(
        self,
        access_token: str,
        date_range: DateRange,
        include_time_series: bool = True,
        include_top_videos: bool = True,
        top_videos_limit: int = 10
    ) -> YouTubeAnalytics:
        """
        Get comprehensive YouTube channel analytics.
        
        Args:
            access_token: OAuth access token with yt-analytics.readonly scope
            date_range: Date range for analytics
            include_time_series: Whether to include daily time series
            include_top_videos: Whether to include top performing videos
            top_videos_limit: Number of top videos to return
            
        Returns:
            YouTubeAnalytics with channel metrics, time series, and top videos
        """
        try:
            # Get channel info first
            channel_info = await self._get_channel_info(access_token)
            channel_id = channel_info.get("id")
            
            if not channel_id:
                raise ValueError("Could not retrieve channel ID")
            
            # Fetch current period metrics
            current_metrics = await self._fetch_channel_metrics(
                access_token, channel_id, date_range
            )
            
            # Fetch previous period for trend comparison
            previous_range = self._get_previous_period(date_range)
            previous_metrics = await self._fetch_channel_metrics(
                access_token, channel_id, previous_range
            )
            
            # Get subscriber count from Data API (real-time)
            subscriber_count = channel_info.get("statistics", {}).get("subscriberCount", 0)
            
            # Build channel metrics with trends
            channel_metrics = self._build_channel_metrics(
                channel_id=channel_id,
                channel_title=channel_info.get("snippet", {}).get("title", ""),
                current=current_metrics,
                previous=previous_metrics,
                subscriber_count=int(subscriber_count)
            )
            
            # Get time series if requested
            time_series = None
            if include_time_series:
                time_series = await self._fetch_time_series(
                    access_token, channel_id, date_range
                )
            
            # Get top videos if requested
            top_videos = None
            if include_top_videos:
                top_videos = await self.get_top_videos(
                    access_token, channel_id, date_range, limit=top_videos_limit
                )
            
            # Get traffic sources
            traffic_sources = await self.get_traffic_sources(
                access_token, channel_id, date_range
            )
            
            return YouTubeAnalytics(
                channel_metrics=channel_metrics,
                time_series=time_series,
                top_videos=top_videos,
                traffic_sources=traffic_sources,
                date_range=date_range
            )
            
        except httpx.HTTPStatusError as e:
            logger.error(f"YouTube API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error fetching YouTube analytics: {e}")
            raise
    
    async def get_video_analytics(
        self,
        access_token: str,
        video_id: str,
        date_range: Optional[DateRange] = None
    ) -> YouTubeVideoMetrics:
        """
        Get analytics for a specific video.
        
        Args:
            access_token: OAuth access token
            video_id: YouTube video ID
            date_range: Optional date range (defaults to lifetime)
            
        Returns:
            YouTubeVideoMetrics with video performance data
        """
        try:
            # Get video info from Data API
            video_info = await self._get_video_info(access_token, video_id)
            
            if not video_info:
                raise ValueError(f"Video {video_id} not found")
            
            snippet = video_info.get("snippet", {})
            statistics = video_info.get("statistics", {})
            
            # If date range provided, get analytics from Analytics API
            if date_range:
                channel_info = await self._get_channel_info(access_token)
                channel_id = channel_info.get("id")
                
                analytics = await self._fetch_video_analytics(
                    access_token, channel_id, video_id, date_range
                )
                
                return YouTubeVideoMetrics(
                    video_id=video_id,
                    title=snippet.get("title", ""),
                    published_at=datetime.fromisoformat(
                        snippet.get("publishedAt", "").replace("Z", "+00:00")
                    ),
                    thumbnail_url=snippet.get("thumbnails", {}).get("high", {}).get("url"),
                    views=analytics.get("views", 0),
                    estimated_minutes_watched=analytics.get("estimatedMinutesWatched", 0),
                    average_view_duration=analytics.get("averageViewDuration", 0),
                    average_view_percentage=analytics.get("averageViewPercentage"),
                    likes=analytics.get("likes", 0),
                    comments=analytics.get("comments", 0),
                    shares=analytics.get("shares", 0)
                )
            else:
                # Use lifetime statistics from Data API
                return YouTubeVideoMetrics(
                    video_id=video_id,
                    title=snippet.get("title", ""),
                    published_at=datetime.fromisoformat(
                        snippet.get("publishedAt", "").replace("Z", "+00:00")
                    ),
                    thumbnail_url=snippet.get("thumbnails", {}).get("high", {}).get("url"),
                    views=int(statistics.get("viewCount", 0)),
                    estimated_minutes_watched=0,  # Not available via Data API
                    average_view_duration=0,
                    likes=int(statistics.get("likeCount", 0)),
                    comments=int(statistics.get("commentCount", 0)),
                    shares=0  # Not available via Data API
                )
                
        except Exception as e:
            logger.error(f"Error fetching video analytics for {video_id}: {e}")
            raise
    
    async def get_top_videos(
        self,
        access_token: str,
        channel_id: str,
        date_range: DateRange,
        limit: int = 10
    ) -> List[YouTubeVideoMetrics]:
        """
        Get top performing videos by views within date range.
        
        Args:
            access_token: OAuth access token
            channel_id: YouTube channel ID
            date_range: Date range for analytics
            limit: Maximum number of videos to return
            
        Returns:
            List of YouTubeVideoMetrics sorted by views
        """
        try:
            params = {
                "ids": f"channel=={channel_id}",
                "startDate": date_range.start_date.isoformat(),
                "endDate": date_range.end_date.isoformat(),
                "metrics": "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares",
                "dimensions": "video",
                "sort": "-views",
                "maxResults": limit
            }
            
            headers = {"Authorization": f"Bearer {access_token}"}
            response = await self.client.get(
                self.ANALYTICS_API_URL,
                params=params,
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            
            rows = data.get("rows", [])
            column_headers = [h.get("name") for h in data.get("columnHeaders", [])]
            
            # Need video info for each video
            videos = []
            for row in rows:
                row_dict = dict(zip(column_headers, row))
                video_id = row_dict.get("video")
                
                if video_id:
                    try:
                        video_info = await self._get_video_info(access_token, video_id)
                        if video_info:
                            snippet = video_info.get("snippet", {})
                            videos.append(YouTubeVideoMetrics(
                                video_id=video_id,
                                title=snippet.get("title", ""),
                                published_at=datetime.fromisoformat(
                                    snippet.get("publishedAt", "").replace("Z", "+00:00")
                                ),
                                thumbnail_url=snippet.get("thumbnails", {}).get("high", {}).get("url"),
                                views=int(row_dict.get("views", 0)),
                                estimated_minutes_watched=float(row_dict.get("estimatedMinutesWatched", 0)),
                                average_view_duration=float(row_dict.get("averageViewDuration", 0)),
                                likes=int(row_dict.get("likes", 0)),
                                comments=int(row_dict.get("comments", 0)),
                                shares=int(row_dict.get("shares", 0))
                            ))
                    except Exception as e:
                        logger.warning(f"Error fetching video info for {video_id}: {e}")
                        continue
            
            return videos
            
        except Exception as e:
            logger.error(f"Error fetching top videos: {e}")
            return []
    
    async def get_traffic_sources(
        self,
        access_token: str,
        channel_id: str,
        date_range: DateRange
    ) -> List[YouTubeTrafficSource]:
        """
        Get traffic source breakdown for channel.
        
        Args:
            access_token: OAuth access token
            channel_id: YouTube channel ID
            date_range: Date range for analytics
            
        Returns:
            List of YouTubeTrafficSource with source breakdown
        """
        try:
            params = {
                "ids": f"channel=={channel_id}",
                "startDate": date_range.start_date.isoformat(),
                "endDate": date_range.end_date.isoformat(),
                "metrics": "views,estimatedMinutesWatched",
                "dimensions": "insightTrafficSourceType",
                "sort": "-views"
            }
            
            headers = {"Authorization": f"Bearer {access_token}"}
            response = await self.client.get(
                self.ANALYTICS_API_URL,
                params=params,
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            
            rows = data.get("rows", [])
            
            # Calculate total views for percentage
            total_views = sum(row[1] for row in rows) if rows else 1
            
            sources = []
            for row in rows:
                source_type = row[0]
                views = int(row[1])
                watch_time = float(row[2])
                
                sources.append(YouTubeTrafficSource(
                    source_type=source_type,
                    views=views,
                    estimated_minutes_watched=watch_time,
                    percentage=round((views / total_views) * 100, 2)
                ))
            
            return sources
            
        except Exception as e:
            logger.error(f"Error fetching traffic sources: {e}")
            return []
    
    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================
    
    async def _get_channel_info(self, access_token: str) -> Dict[str, Any]:
        """Get authenticated user's channel info."""
        url = f"{self.DATA_API_URL}/channels"
        params = {
            "part": "id,snippet,statistics,contentDetails",
            "mine": "true"
        }
        headers = {"Authorization": f"Bearer {access_token}"}
        
        response = await self.client.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        items = data.get("items", [])
        return items[0] if items else {}
    
    async def _get_video_info(
        self,
        access_token: str,
        video_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get video info from Data API."""
        url = f"{self.DATA_API_URL}/videos"
        params = {
            "part": "id,snippet,statistics,contentDetails",
            "id": video_id
        }
        headers = {"Authorization": f"Bearer {access_token}"}
        
        response = await self.client.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        items = data.get("items", [])
        return items[0] if items else None
    
    async def _fetch_channel_metrics(
        self,
        access_token: str,
        channel_id: str,
        date_range: DateRange
    ) -> Dict[str, Any]:
        """Fetch channel metrics from Analytics API."""
        params = {
            "ids": f"channel=={channel_id}",
            "startDate": date_range.start_date.isoformat(),
            "endDate": date_range.end_date.isoformat(),
            "metrics": ",".join(self.CHANNEL_METRICS)
        }
        
        headers = {"Authorization": f"Bearer {access_token}"}
        response = await self.client.get(
            self.ANALYTICS_API_URL,
            params=params,
            headers=headers
        )
        response.raise_for_status()
        data = response.json()
        
        # Parse response
        rows = data.get("rows", [[]])
        column_headers = [h.get("name") for h in data.get("columnHeaders", [])]
        
        if rows and rows[0]:
            return dict(zip(column_headers, rows[0]))
        return {}
    
    async def _fetch_video_analytics(
        self,
        access_token: str,
        channel_id: str,
        video_id: str,
        date_range: DateRange
    ) -> Dict[str, Any]:
        """Fetch analytics for a specific video."""
        params = {
            "ids": f"channel=={channel_id}",
            "filters": f"video=={video_id}",
            "startDate": date_range.start_date.isoformat(),
            "endDate": date_range.end_date.isoformat(),
            "metrics": ",".join(self.VIDEO_METRICS)
        }
        
        headers = {"Authorization": f"Bearer {access_token}"}
        response = await self.client.get(
            self.ANALYTICS_API_URL,
            params=params,
            headers=headers
        )
        response.raise_for_status()
        data = response.json()
        
        rows = data.get("rows", [[]])
        column_headers = [h.get("name") for h in data.get("columnHeaders", [])]
        
        if rows and rows[0]:
            return dict(zip(column_headers, rows[0]))
        return {}
    
    async def _fetch_time_series(
        self,
        access_token: str,
        channel_id: str,
        date_range: DateRange
    ) -> List[TimeSeriesDataPoint]:
        """Fetch daily time series for views."""
        params = {
            "ids": f"channel=={channel_id}",
            "startDate": date_range.start_date.isoformat(),
            "endDate": date_range.end_date.isoformat(),
            "metrics": "views",
            "dimensions": "day",
            "sort": "day"
        }
        
        headers = {"Authorization": f"Bearer {access_token}"}
        response = await self.client.get(
            self.ANALYTICS_API_URL,
            params=params,
            headers=headers
        )
        response.raise_for_status()
        data = response.json()
        
        time_series = []
        for row in data.get("rows", []):
            date_str = row[0]
            views = row[1]
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                time_series.append(TimeSeriesDataPoint(
                    date=dt.date(),
                    value=float(views),
                    label="Views"
                ))
            except (ValueError, IndexError):
                continue
        
        return time_series
    
    def _build_channel_metrics(
        self,
        channel_id: str,
        channel_title: str,
        current: Dict[str, Any],
        previous: Dict[str, Any],
        subscriber_count: int
    ) -> YouTubeChannelMetrics:
        """Build YouTubeChannelMetrics with trend calculations."""
        return YouTubeChannelMetrics(
            channel_id=channel_id,
            channel_title=channel_title,
            subscriber_count=MetricTrend.calculate(
                subscriber_count,
                None  # Historical data not available
            ),
            subscribers_gained=int(current.get("subscribersGained", 0)),
            subscribers_lost=int(current.get("subscribersLost", 0)),
            views=MetricTrend.calculate(
                float(current.get("views", 0)),
                float(previous.get("views")) if previous.get("views") else None
            ),
            estimated_minutes_watched=MetricTrend.calculate(
                float(current.get("estimatedMinutesWatched", 0)),
                float(previous.get("estimatedMinutesWatched")) if previous.get("estimatedMinutesWatched") else None
            ),
            average_view_duration=float(current.get("averageViewDuration", 0)),
            likes=int(current.get("likes", 0)),
            comments=int(current.get("comments", 0)),
            shares=int(current.get("shares", 0))
        )
    
    def _get_previous_period(self, date_range: DateRange) -> DateRange:
        """Calculate the previous period for trend comparison."""
        period_days = (date_range.end_date - date_range.start_date).days
        return DateRange(
            start_date=date_range.start_date - timedelta(days=period_days + 1),
            end_date=date_range.start_date - timedelta(days=1)
        )


# Singleton instance
youtube_analytics_service = YouTubeAnalyticsService()


async def close_youtube_analytics_service():
    """Close the YouTube analytics service HTTP client."""
    await youtube_analytics_service.close()
