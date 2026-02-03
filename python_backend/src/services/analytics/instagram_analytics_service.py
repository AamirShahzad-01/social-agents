"""
Instagram Analytics Service
Production-ready Instagram Business/Creator Account Insights using Graph API v24.0
Follows official documentation: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights

Key 2025-2026 Changes:
- 'impressions' deprecated for v22+, use 'views'
- 'profile_views' deprecated Jan 2025
- 'plays' deprecated Apr 2025, use 'views' for reels
- New 'skip_rate' metric coming Dec 2025
"""
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

import httpx

from .analytics_types import (
    InstagramInsights,
    InstagramAccountMetrics,
    InstagramMediaInsights,
    InstagramAudienceDemographics,
    MetricTrend,
    TimeSeriesDataPoint,
    DateRange,
    AnalyticsPeriod,
    DatePreset
)
from ...config import settings

logger = logging.getLogger(__name__)


class InstagramAnalyticsService:
    """
    Instagram Business/Creator Account Insights Service.
    
    Uses Facebook Graph API v24.0 to fetch Instagram organic content analytics.
    Requires Instagram Business or Creator account connected to a Facebook Page.
    """
    
    GRAPH_API_VERSION = "v24.0"
    GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
    
    # Account-level metrics (2025-2026 compliant)
    ACCOUNT_METRICS = {
        "basic": [
            "follower_count",  # Total followers
            "follows_count",  # Total following (limited availability)
        ],
        "engagement": [
            "views",  # Replaces impressions for v22+
            "reach",  # Unique accounts reached
            "total_interactions",  # Sum of likes, comments, saves, shares
        ],
        "profile": [
            # Note: profile_views deprecated Jan 2025
            # "profile_views",
            # website_clicks deprecated
        ],
        "content": [
            "accounts_engaged",  # Unique engaged accounts
        ]
    }
    
    # Media-level metrics
    MEDIA_METRICS = {
        "image": ["views", "reach", "likes", "comments", "saved", "shares"],
        "video": ["views", "reach", "likes", "comments", "saved", "shares"],
        "carousel": ["views", "reach", "likes", "comments", "saved", "shares"],
        "reels": ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"]
    }
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
    
    # =========================================================================
    # PUBLIC API METHODS
    # =========================================================================
    
    async def get_account_insights(
        self,
        ig_user_id: str,
        access_token: str,
        date_range: DateRange,
        period: AnalyticsPeriod = AnalyticsPeriod.DAY,
        include_time_series: bool = True,
        include_audience: bool = True
    ) -> InstagramInsights:
        """
        Get comprehensive Instagram Account Insights.
        
        Args:
            ig_user_id: Instagram User ID (Business/Creator account)
            access_token: Access Token with instagram_basic, instagram_manage_insights
            date_range: Date range for analytics
            period: Aggregation period
            include_time_series: Whether to include daily time series
            include_audience: Whether to include audience demographics
            
        Returns:
            InstagramInsights with account metrics, time series, and top media
        """
        try:
            # Fetch account info
            account_info = await self._get_account_info(ig_user_id, access_token)
            
            # Fetch current period metrics
            current_metrics = await self._fetch_account_metrics(
                ig_user_id, access_token, date_range
            )
            
            # Fetch previous period for trend comparison
            previous_range = self._get_previous_period(date_range)
            previous_metrics = await self._fetch_account_metrics(
                ig_user_id, access_token, previous_range
            )
            
            # Build account metrics with trends
            account_metrics = self._build_account_metrics(
                ig_user_id=ig_user_id,
                username=account_info.get("username", ""),
                current=current_metrics,
                previous=previous_metrics,
                account_info=account_info
            )
            
            # Get time series if requested
            time_series = None
            if include_time_series:
                time_series = await self._fetch_time_series(
                    ig_user_id, access_token, date_range
                )
            
            # Get top media
            top_media = await self.get_top_media(
                ig_user_id, access_token, date_range, limit=10
            )
            
            # Get audience demographics if requested
            audience = None
            if include_audience:
                audience = await self.get_audience_demographics(
                    ig_user_id, access_token
                )
            
            return InstagramInsights(
                account_metrics=account_metrics,
                time_series=time_series,
                top_media=top_media,
                audience=audience,
                period=period,
                date_range=date_range
            )
            
        except httpx.HTTPStatusError as e:
            logger.error(f"Instagram API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error fetching Instagram insights: {e}")
            raise
    
    async def get_media_insights(
        self,
        media_id: str,
        access_token: str
    ) -> InstagramMediaInsights:
        """
        Get insights for a specific Instagram media.
        
        Args:
            media_id: Instagram Media ID
            access_token: Access Token
            
        Returns:
            InstagramMediaInsights with engagement metrics
        """
        try:
            # Fetch media details
            media_url = f"{self.GRAPH_API_BASE}/{media_id}"
            media_params = {
                "access_token": access_token,
                "fields": "id,media_type,caption,timestamp,permalink,thumbnail_url,like_count,comments_count"
            }
            
            media_response = await self.client.get(media_url, params=media_params)
            media_response.raise_for_status()
            media_data = media_response.json()
            
            # Determine media type for proper metrics
            media_type = media_data.get("media_type", "IMAGE")
            
            # Fetch media insights
            insights_url = f"{self.GRAPH_API_BASE}/{media_id}/insights"
            
            # Select metrics based on media type
            if media_type == "REELS":
                metrics = "views,reach,likes,comments,saved,shares,total_interactions"
            elif media_type == "VIDEO":
                metrics = "views,reach,likes,comments,saved,shares"
            else:
                metrics = "views,reach,likes,comments,saved"
            
            insights_params = {
                "access_token": access_token,
                "metric": metrics
            }
            
            insights_response = await self.client.get(insights_url, params=insights_params)
            insights_response.raise_for_status()
            insights_data = insights_response.json()
            
            # Parse insights
            metrics_dict = self._parse_media_insights(insights_data.get("data", []))
            
            # Calculate engagement rate
            views = metrics_dict.get("views", 0)
            engagement = (
                metrics_dict.get("likes", 0) + 
                metrics_dict.get("comments", 0) + 
                metrics_dict.get("saved", 0) +
                metrics_dict.get("shares", 0)
            )
            engagement_rate = (engagement / views * 100) if views > 0 else 0
            
            return InstagramMediaInsights(
                media_id=media_id,
                media_type=media_type,
                caption=media_data.get("caption"),
                timestamp=datetime.fromisoformat(media_data["timestamp"].replace("Z", "+00:00")),
                permalink=media_data.get("permalink"),
                thumbnail_url=media_data.get("thumbnail_url"),
                views=metrics_dict.get("views", 0),
                reach=metrics_dict.get("reach", 0),
                likes=media_data.get("like_count", 0),
                comments=media_data.get("comments_count", 0),
                saves=metrics_dict.get("saved", 0),
                shares=metrics_dict.get("shares", 0),
                plays=metrics_dict.get("plays"),  # Deprecated but may still return
                engagement_rate=round(engagement_rate, 2)
            )
            
        except Exception as e:
            logger.error(f"Error fetching media insights for {media_id}: {e}")
            raise
    
    async def get_top_media(
        self,
        ig_user_id: str,
        access_token: str,
        date_range: DateRange,
        limit: int = 3
    ) -> List[InstagramMediaInsights]:
        """
        Get top performing media within date range.
        
        OPTIMIZED: Uses concurrent insights fetching with asyncio.gather
        to parallelize API calls and reduce total request time.
        
        Uses Instagram Graph API v24.0 Media Insights.
        Available metrics per media type:
        - FEED (posts): views, reach, likes, comments, shares, saved, total_interactions
        - REELS: views, reach, likes, comments, shares, saved, total_interactions
        - STORY: views, reach, shares, total_interactions, navigation, replies
        
        Deprecated metrics (April 21, 2025): impressions, plays, clips_replays_count
        
        Args:
            ig_user_id: Instagram User ID
            access_token: Access Token
            date_range: Date range to filter media
            limit: Maximum number of media to return
            
        Returns:
            List of InstagramMediaInsights sorted by engagement
        """
        import asyncio
        
        try:
            # Fetch recent media with basic fields
            media_url = f"{self.GRAPH_API_BASE}/{ig_user_id}/media"
            media_params = {
                "access_token": access_token,
                "fields": "id,media_type,caption,timestamp,permalink,thumbnail_url,like_count,comments_count",
                "limit": min(limit * 2, 50)  # Fetch more to filter by date
            }
            
            response = await self.client.get(media_url, params=media_params)
            response.raise_for_status()
            media_list = response.json().get("data", [])
            
            # Filter media by date range first
            filtered_media = []
            for media in media_list:
                try:
                    timestamp = datetime.fromisoformat(media["timestamp"].replace("Z", "+00:00"))
                    media_date = timestamp.date()
                    
                    # Filter by date range
                    if date_range.start_date <= media_date <= date_range.end_date:
                        filtered_media.append((media, timestamp))
                except Exception:
                    continue
            
            # OPTIMIZED: Concurrent insights fetching using asyncio.gather
            # This parallelizes all insights API calls for maximum efficiency
            async def fetch_media_insights(media_data: tuple) -> Optional[tuple]:
                media, timestamp = media_data
                try:
                    likes = media.get("like_count", 0) or 0
                    comments = media.get("comments_count", 0) or 0
                    media_type = media.get("media_type", "IMAGE")
                    
                    views = 0
                    reach = 0
                    saves = 0
                    shares = 0
                    
                    # Fetch media insights
                    insights_url = f"{self.GRAPH_API_BASE}/{media['id']}/insights"
                    metrics = "views,reach,saved,shares"
                    
                    insights_params = {
                        "access_token": access_token,
                        "metric": metrics
                    }
                    
                    try:
                        insights_response = await self.client.get(insights_url, params=insights_params)
                        if insights_response.status_code == 200:
                            insights_data = insights_response.json().get("data", [])
                            for metric in insights_data:
                                metric_name = metric.get("name")
                                # Handle both total_value and values array response formats
                                total_value = metric.get("total_value")
                                if total_value is not None:
                                    if isinstance(total_value, dict):
                                        val = total_value.get("value", 0)
                                    else:
                                        val = total_value
                                else:
                                    values = metric.get("values", [])
                                    val = values[-1].get("value", 0) if values else 0
                                
                                if isinstance(val, (int, float)):
                                    if metric_name == "views":
                                        views = int(val)
                                    elif metric_name == "reach":
                                        reach = int(val)
                                    elif metric_name == "saved":
                                        saves = int(val)
                                    elif metric_name == "shares":
                                        shares = int(val)
                    except Exception as e:
                        logger.debug(f"Could not fetch insights for media {media['id']}: {e}")
                    
                    # Calculate total engagement
                    engagement = likes + comments + saves + shares
                    
                    media_insight = InstagramMediaInsights(
                        media_id=media["id"],
                        media_type=media_type,
                        caption=media.get("caption"),
                        timestamp=timestamp,
                        permalink=media.get("permalink"),
                        thumbnail_url=media.get("thumbnail_url"),
                        likes=likes,
                        comments=comments,
                        views=views,
                        reach=reach,
                        saves=saves,
                        shares=shares
                    )
                    return (engagement, media_insight)
                    
                except Exception as e:
                    logger.warning(f"Error processing media {media.get('id')}: {e}")
                    return None
            
            # Execute all insights fetches concurrently
            results = await asyncio.gather(
                *[fetch_media_insights(m) for m in filtered_media],
                return_exceptions=True
            )
            
            # Filter out None results and exceptions
            media_with_engagement = [
                r for r in results 
                if r is not None and not isinstance(r, Exception)
            ]
            
            # Sort by engagement and return top media
            media_with_engagement.sort(key=lambda x: x[0], reverse=True)
            logger.info(f"Instagram top media: fetched {len(media_with_engagement)} posts concurrently, returning top {min(limit, len(media_with_engagement))}")
            return [media for _, media in media_with_engagement[:limit]]
            
        except Exception as e:
            logger.error(f"Error fetching top media for {ig_user_id}: {e}")
            return []
    
    async def get_audience_demographics(
        self,
        ig_user_id: str,
        access_token: str
    ) -> Optional[InstagramAudienceDemographics]:
        """
        Get audience demographics for Instagram account.
        
        Note: Requires minimum follower count (usually 100+).
        
        Args:
            ig_user_id: Instagram User ID
            access_token: Access Token
            
        Returns:
            InstagramAudienceDemographics or None if not available
        """
        try:
            insights_url = f"{self.GRAPH_API_BASE}/{ig_user_id}/insights"
            params = {
                "access_token": access_token,
                "metric": "follower_demographics",
                "period": "lifetime",
                "metric_type": "total_value",
                "breakdown": "age,gender,city,country"
            }
            
            response = await self.client.get(insights_url, params=params)
            
            # Demographics may not be available for all accounts
            if response.status_code == 400:
                logger.info(f"Demographics not available for account {ig_user_id}")
                return None
            
            response.raise_for_status()
            data = response.json().get("data", [])
            
            demographics = InstagramAudienceDemographics()
            
            for metric in data:
                breakdown_results = metric.get("total_value", {}).get("breakdowns", [])
                for breakdown in breakdown_results:
                    dimension = breakdown.get("dimension_key")
                    results = breakdown.get("results", [])
                    
                    result_dict = {r["dimension_values"][0]: r["value"] for r in results}
                    
                    if dimension == "age" or dimension == "gender":
                        demographics.age_gender = result_dict
                    elif dimension == "city":
                        demographics.top_cities = result_dict
                    elif dimension == "country":
                        demographics.top_countries = result_dict
            
            return demographics
            
        except Exception as e:
            logger.warning(f"Error fetching audience demographics: {e}")
            return None
    
    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================
    
    async def _get_account_info(
        self,
        ig_user_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch basic Instagram account information."""
        url = f"{self.GRAPH_API_BASE}/{ig_user_id}"
        params = {
            "access_token": access_token,
            "fields": "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography"
        }
        
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    
    async def _fetch_account_metrics(
        self,
        ig_user_id: str,
        access_token: str,
        date_range: DateRange
    ) -> Dict[str, Any]:
        """
        Fetch account insights metrics for a date range.
        """
        clamped_end_date = min(date_range.end_date, date_range.start_date + timedelta(days=29))
        url = f"{self.GRAPH_API_BASE}/{ig_user_id}/insights"
        
        # Use views and reach as primary metrics (2025+ compliant)
        params = {
            "access_token": access_token,
            "metric": "views,reach,accounts_engaged,total_interactions",
            "metric_type": "total_value",
            "period": "day",
            "since": int(datetime.combine(date_range.start_date, datetime.min.time()).timestamp()),
            "until": int(datetime.combine(clamped_end_date, datetime.max.time()).timestamp())
        }
        
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        return self._parse_account_insights(data.get("data", []))
    
    async def _fetch_time_series(
        self,
        ig_user_id: str,
        access_token: str,
        date_range: DateRange
    ) -> List[TimeSeriesDataPoint]:
        """
        Fetch daily time series data for engagement.
        
        Per Instagram Graph API v24.0 docs:
        - 'reach' supports metric_type=time_series
        - 'total_interactions', 'likes', 'comments', 'shares', 'saved' only support total_value
        
        So we use the official reach time_series from insights API.
        """
        try:
            # Use Instagram Insights API with reach (supports time_series)
            # API docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights
            clamped_end_date = min(date_range.end_date, date_range.start_date + timedelta(days=29))
            
            url = f"{self.GRAPH_API_BASE}/{ig_user_id}/insights"
            params = {
                "access_token": access_token,
                "metric": "reach",
                "metric_type": "time_series",
                "period": "day",
                "since": int(datetime.combine(date_range.start_date, datetime.min.time()).timestamp()),
                "until": int(datetime.combine(clamped_end_date, datetime.max.time()).timestamp())
            }
            
            response = await self.client.get(url, params=params)
            response.raise_for_status()
            data = response.json().get("data", [])
            
            time_series = []
            for metric in data:
                if metric.get("name") == "reach":
                    values = metric.get("values", [])
                    for v in values:
                        end_time = v.get("end_time", "")
                        value = v.get("value", 0)
                        if end_time:
                            try:
                                dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                                time_series.append(TimeSeriesDataPoint(
                                    date=dt.date(),
                                    value=float(value) if isinstance(value, (int, float)) else 0.0,
                                    label="Reach"
                                ))
                            except (ValueError, TypeError):
                                continue
            
            logger.info(f"Instagram time series: found {len(time_series)} data points from reach metric")
            return time_series
            
        except Exception as e:
            logger.warning(f"Failed to fetch Instagram time series from insights API: {e}", exc_info=True)
            # Fallback: aggregate engagement from media posts
            return await self._fetch_time_series_from_media(ig_user_id, access_token, date_range)
    
    async def _fetch_time_series_from_media(
        self,
        ig_user_id: str,
        access_token: str,
        date_range: DateRange
    ) -> List[TimeSeriesDataPoint]:
        """
        Fallback: Compute engagement time series from individual media posts.
        Uses like_count + comments_count aggregated by post date.
        """
        try:
            media_url = f"{self.GRAPH_API_BASE}/{ig_user_id}/media"
            media_params = {
                "access_token": access_token,
                "fields": "id,timestamp,like_count,comments_count",
                "limit": 100
            }
            
            response = await self.client.get(media_url, params=media_params)
            response.raise_for_status()
            media_list = response.json().get("data", [])
            
            # Group engagement by date
            daily_engagement: Dict[date, int] = {}
            for media in media_list:
                try:
                    timestamp_str = media.get("timestamp", "")
                    if timestamp_str:
                        dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                        media_date = dt.date()
                        
                        if not (date_range.start_date <= media_date <= date_range.end_date):
                            continue
                        
                        likes = media.get("like_count", 0) or 0
                        comments = media.get("comments_count", 0) or 0
                        engagement = likes + comments
                        
                        daily_engagement[media_date] = daily_engagement.get(media_date, 0) + engagement
                except (ValueError, TypeError):
                    continue
            
            # Convert to time series (don't fill missing dates with 0 - only show days with data)
            time_series = []
            for post_date, engagement in sorted(daily_engagement.items()):
                time_series.append(TimeSeriesDataPoint(
                    date=post_date,
                    value=float(engagement),
                    label="Engagement"
                ))
            
            logger.info(f"Instagram time series (fallback): found {len(time_series)} data points from media")
            return time_series
            
        except Exception as e:
            logger.warning(f"Failed to fetch Instagram time series from media: {e}", exc_info=True)
            return []
    
    def _parse_account_insights(self, data: List[Dict]) -> Dict[str, Any]:
        """Parse Instagram account insights response.
        
        Handles both total_value (when metric_type=total_value) and 
        values array (when metric_type=time_series) formats.
        
        API Response format for total_value:
        {
            "name": "views",
            "period": "day",
            "total_value": {
                "value": 1234
            }
        }
        """
        metrics: Dict[str, float] = {}
        
        for metric in data:
            name = metric.get("name")
            if not name:
                continue
            
            # Try total_value format first (metric_type=total_value)
            total_value = metric.get("total_value")
            if total_value is not None:
                if isinstance(total_value, dict):
                    value = total_value.get("value")
                    if isinstance(value, (int, float)):
                        metrics[name] = float(value)
                        continue
                elif isinstance(total_value, (int, float)):
                    metrics[name] = float(total_value)
                    continue
            
            # Fall back to values array format (metric_type=time_series)
            values = metric.get("values", [])
            if values:
                total = 0.0
                for v in values:
                    val = v.get("value")
                    if isinstance(val, (int, float)):
                        total += float(val)
                    elif isinstance(val, dict) and isinstance(val.get("value"), (int, float)):
                        total += float(val["value"])
                metrics[name] = total

        return metrics
    
    def _parse_media_insights(self, data: List[Dict]) -> Dict[str, Any]:
        """Parse Instagram media insights response."""
        metrics = {}
        for metric in data:
            name = metric.get("name")
            values = metric.get("values", [])
            if values:
                value = values[0].get("value", 0)
                if isinstance(value, dict):
                    value = value.get("value", 0)
                metrics[name] = value
        return metrics
    
    def _build_account_metrics(
        self,
        ig_user_id: str,
        username: str,
        current: Dict[str, Any],
        previous: Dict[str, Any],
        account_info: Dict[str, Any]
    ) -> InstagramAccountMetrics:
        """Build InstagramAccountMetrics with trend calculations."""
        
        # Get follower count from account info (real-time)
        current_followers = account_info.get("followers_count", 0)
        total_interactions = current.get("total_interactions")
        if total_interactions is None:
            total_interactions = current.get("accounts_engaged")
        
        return InstagramAccountMetrics(
            ig_user_id=ig_user_id,
            username=username,
            follower_count=MetricTrend.calculate(
                current_followers,
                None  # Historical follower data not available via API
            ),
            follows_count=account_info.get("follows_count"),
            views=MetricTrend.calculate(
                current.get("views", 0),
                previous.get("views")
            ),
            reach=MetricTrend.calculate(
                current.get("reach", 0),
                previous.get("reach")
            ),
            total_likes=total_interactions,
            total_comments=None,
            total_saves=None,
            total_shares=None
        )
    
    def _get_previous_period(self, date_range: DateRange) -> DateRange:
        """Calculate the previous period for trend comparison."""
        period_days = (date_range.end_date - date_range.start_date).days
        return DateRange(
            start_date=date_range.start_date - timedelta(days=period_days + 1),
            end_date=date_range.start_date - timedelta(days=1)
        )


# Singleton instance
instagram_analytics_service = InstagramAnalyticsService()


async def close_instagram_analytics_service():
    """Close the Instagram analytics service HTTP client."""
    await instagram_analytics_service.close()
