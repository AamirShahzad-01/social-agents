"""
Unified Analytics Service
Aggregates analytics from all connected platforms into a unified dashboard view.
Provides cross-platform comparison and unified metrics.
"""
import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from .analytics_types import (
    UnifiedDashboardData,
    AggregatedMetrics,
    PlatformSummary,
    PlatformComparisonData,
    TopPerformingPost,
    MetricTrend,
    DateRange,
    DatePreset,
    Platform,
    FacebookInsights,
    InstagramInsights,
    YouTubeAnalytics,
    TikTokAnalytics
)
from .facebook_analytics_service import facebook_analytics_service
from .instagram_analytics_service import instagram_analytics_service
from .youtube_analytics_service import youtube_analytics_service
from .tiktok_analytics_service import tiktok_analytics_service
from ..credentials import MetaCredentialsService
from ...config import settings

logger = logging.getLogger(__name__)


class UnifiedAnalyticsService:
    """
    Unified Analytics Service.
    
    Aggregates data from Facebook, Instagram, YouTube, and TikTok
    into a single dashboard view with cross-platform comparisons.
    """
    
    def __init__(self):
        pass
    
    # =========================================================================
    # PUBLIC API METHODS
    # =========================================================================
    
    async def get_dashboard_data(
        self,
        user_id: str,
        workspace_id: str,
        date_range: DateRange,
        platforms: Optional[List[Platform]] = None,
        include_top_posts: bool = True,
        include_comparison: bool = True,
        credentials_getter = None
    ) -> UnifiedDashboardData:
        """
        Get unified dashboard data from all connected platforms.
        
        Args:
            user_id: User ID
            workspace_id: Workspace ID
            date_range: Date range for analytics
            platforms: List of platforms to include (None = all connected)
            include_top_posts: Whether to include top posts section
            include_comparison: Whether to include platform comparison
            credentials_getter: Function to get platform credentials
            
        Returns:
            UnifiedDashboardData with aggregated and per-platform metrics
        """
        try:
            # Determine which platforms to fetch
            target_platforms = platforms or [
                Platform.FACEBOOK,
                Platform.INSTAGRAM,
                Platform.YOUTUBE,
                Platform.TIKTOK
            ]
            
            # Fetch data from all platforms concurrently
            results = await self._fetch_all_platforms(
                user_id=user_id,
                workspace_id=workspace_id,
                date_range=date_range,
                platforms=target_platforms,
                credentials_getter=credentials_getter
            )
            
            # Build platform summaries
            platform_summaries = {}
            facebook_data = None
            instagram_data = None
            youtube_data = None
            tiktok_data = None
            
            for platform, data in results.items():
                if data.get("error"):
                    platform_summaries[platform] = PlatformSummary(
                        platform=platform,
                        connected=False,
                        followers=MetricTrend(current=0),
                        views=MetricTrend(current=0),
                        engagement=MetricTrend(current=0),
                        engagement_rate=0,
                        posts_count=0,
                        error=data.get("error")
                    )
                else:
                    insights = data.get("insights")
                    if platform == Platform.FACEBOOK and insights:
                        facebook_data = insights
                        platform_summaries[platform] = self._facebook_to_summary(insights)
                    elif platform == Platform.INSTAGRAM and insights:
                        instagram_data = insights
                        platform_summaries[platform] = self._instagram_to_summary(insights)
                    elif platform == Platform.YOUTUBE and insights:
                        youtube_data = insights
                        platform_summaries[platform] = self._youtube_to_summary(insights)
                    elif platform == Platform.TIKTOK and insights:
                        tiktok_data = insights
                        platform_summaries[platform] = self._tiktok_to_summary(insights)
            
            # Calculate aggregated metrics
            aggregated = self._calculate_aggregated_metrics(platform_summaries)
            
            # Get top posts across all platforms
            top_posts = []
            if include_top_posts:
                top_posts = self._aggregate_top_posts(
                    facebook=facebook_data,
                    instagram=instagram_data,
                    youtube=youtube_data,
                    tiktok=tiktok_data,
                    limit=10
                )
            
            # Build platform comparison
            comparison = PlatformComparisonData(
                platforms=list(platform_summaries.values()),
                metrics_comparison=self._build_comparison_metrics(platform_summaries)
            )
            
            return UnifiedDashboardData(
                aggregated=aggregated,
                platforms=platform_summaries,
                facebook=facebook_data,
                instagram=instagram_data,
                youtube=youtube_data,
                tiktok=tiktok_data,
                top_posts=top_posts,
                platform_comparison=comparison,
                date_range=date_range,
                generated_at=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error building unified dashboard: {e}")
            raise
    
    async def get_platform_comparison(
        self,
        user_id: str,
        workspace_id: str,
        date_range: DateRange,
        credentials_getter = None
    ) -> PlatformComparisonData:
        """
        Get platform comparison data only.
        
        Args:
            user_id: User ID
            workspace_id: Workspace ID
            date_range: Date range for analytics
            credentials_getter: Function to get platform credentials
            
        Returns:
            PlatformComparisonData with cross-platform metrics
        """
        dashboard = await self.get_dashboard_data(
            user_id=user_id,
            workspace_id=workspace_id,
            date_range=date_range,
            include_top_posts=False,
            include_comparison=True,
            credentials_getter=credentials_getter
        )
        return dashboard.platform_comparison
    
    async def get_top_performing_posts(
        self,
        user_id: str,
        workspace_id: str,
        date_range: DateRange,
        limit: int = 10,
        credentials_getter = None
    ) -> List[TopPerformingPost]:
        """
        Get top performing posts across all platforms.
        
        Args:
            user_id: User ID
            workspace_id: Workspace ID
            date_range: Date range for analytics
            limit: Maximum number of posts to return
            credentials_getter: Function to get platform credentials
            
        Returns:
            List of TopPerformingPost sorted by engagement rate
        """
        dashboard = await self.get_dashboard_data(
            user_id=user_id,
            workspace_id=workspace_id,
            date_range=date_range,
            include_top_posts=True,
            include_comparison=False,
            credentials_getter=credentials_getter
        )
        return dashboard.top_posts[:limit]
    
    # =========================================================================
    # PLATFORM DATA FETCHING
    # =========================================================================
    
    async def _fetch_all_platforms(
        self,
        user_id: str,
        workspace_id: str,
        date_range: DateRange,
        platforms: List[Platform],
        credentials_getter = None
    ) -> Dict[Platform, Dict[str, Any]]:
        """
        Fetch analytics from all specified platforms concurrently.
        """
        tasks = []
        platform_tasks = []
        
        for platform in platforms:
            task = self._fetch_platform_data(
                platform=platform,
                user_id=user_id,
                workspace_id=workspace_id,
                date_range=date_range,
                credentials_getter=credentials_getter
            )
            tasks.append(task)
            platform_tasks.append(platform)
        
        # Execute all fetches concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Map results back to platforms
        platform_results = {}
        for platform, result in zip(platform_tasks, results):
            if isinstance(result, Exception):
                logger.warning(f"Error fetching {platform.value} analytics: {result}")
                platform_results[platform] = {"error": str(result)}
            else:
                platform_results[platform] = result
        
        return platform_results
    
    async def _fetch_platform_data(
        self,
        platform: Platform,
        user_id: str,
        workspace_id: str,
        date_range: DateRange,
        credentials_getter = None
    ) -> Dict[str, Any]:
        """
        Fetch analytics for a single platform.
        """
        try:
            # Get credentials for platform
            credentials = None
            if credentials_getter:
                credentials = await credentials_getter(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    platform=platform.value
                )
            
            if not credentials:
                return {"error": f"No credentials for {platform.value}"}
            
            access_token = credentials.get("access_token")
            if not access_token:
                return {"error": f"No access token for {platform.value}"}
            
            # Fetch based on platform
            if platform == Platform.FACEBOOK:
                page_id = credentials.get("page_id")
                if not page_id:
                    return {"error": "No Facebook page_id configured"}
                
                insights = await facebook_analytics_service.get_page_insights(
                    page_id=page_id,
                    access_token=access_token,
                    date_range=date_range
                )
                return {"insights": insights}
                
            elif platform == Platform.INSTAGRAM:
                ig_user_id = credentials.get("instagram_user_id") or credentials.get("ig_user_id")
                if not ig_user_id and credentials.get("page_id"):
                    ig_user_id = await MetaCredentialsService._get_instagram_from_facebook_page(
                        credentials["page_id"],
                        credentials.get("page_access_token") or access_token
                    )

                if not ig_user_id:
                    return {"error": "No Instagram user_id configured"}
                
                insights = await instagram_analytics_service.get_account_insights(
                    ig_user_id=ig_user_id,
                    access_token=access_token,
                    date_range=date_range
                )
                return {"insights": insights}
                
            elif platform == Platform.YOUTUBE:
                insights = await youtube_analytics_service.get_channel_analytics(
                    access_token=access_token,
                    date_range=date_range
                )
                return {"insights": insights}
                
            elif platform == Platform.TIKTOK:
                insights = await tiktok_analytics_service.get_analytics_overview(
                    access_token=access_token,
                    date_range=date_range
                )
                return {"insights": insights}
            
            return {"error": f"Unknown platform: {platform}"}
            
        except Exception as e:
            logger.error(f"Error fetching {platform.value} data: {e}")
            return {"error": str(e)}
    
    # =========================================================================
    # SUMMARY BUILDERS
    # =========================================================================
    
    def _facebook_to_summary(self, insights: FacebookInsights) -> PlatformSummary:
        """Convert Facebook insights to platform summary."""
        metrics = insights.page_metrics
        
        # Calculate engagement rate
        views = metrics.page_views_total.current
        engagement = metrics.page_post_engagements.current
        engagement_rate = (engagement / views * 100) if views > 0 else 0
        
        return PlatformSummary(
            platform=Platform.FACEBOOK,
            connected=True,
            followers=metrics.page_fans,
            views=metrics.page_views_total,
            engagement=metrics.page_post_engagements,
            engagement_rate=round(engagement_rate, 2),
            posts_count=len(insights.top_posts) if insights.top_posts else 0,
            top_post_id=insights.top_posts[0].post_id if insights.top_posts else None
        )
    
    def _instagram_to_summary(self, insights: InstagramInsights) -> PlatformSummary:
        """Convert Instagram insights to platform summary."""
        metrics = insights.account_metrics
        
        # Calculate engagement rate
        views = metrics.views.current
        engagement = metrics.total_likes or 0
        engagement_rate = (engagement / views * 100) if views > 0 else 0
        
        return PlatformSummary(
            platform=Platform.INSTAGRAM,
            connected=True,
            followers=metrics.follower_count,
            views=metrics.views,
            engagement=MetricTrend.calculate(float(engagement), None),
            engagement_rate=round(engagement_rate, 2),
            posts_count=len(insights.top_media) if insights.top_media else 0,
            top_post_id=insights.top_media[0].media_id if insights.top_media else None
        )
    
    def _youtube_to_summary(self, insights: YouTubeAnalytics) -> PlatformSummary:
        """Convert YouTube analytics to platform summary."""
        metrics = insights.channel_metrics
        
        # Calculate engagement rate
        views = metrics.views.current
        engagement = (metrics.likes or 0) + (metrics.comments or 0) + (metrics.shares or 0)
        engagement_rate = (engagement / views * 100) if views > 0 else 0
        
        return PlatformSummary(
            platform=Platform.YOUTUBE,
            connected=True,
            followers=metrics.subscriber_count,
            views=metrics.views,
            engagement=MetricTrend.calculate(float(engagement), None),
            engagement_rate=round(engagement_rate, 2),
            posts_count=len(insights.top_videos) if insights.top_videos else 0,
            top_post_id=insights.top_videos[0].video_id if insights.top_videos else None
        )
    
    def _tiktok_to_summary(self, insights: TikTokAnalytics) -> PlatformSummary:
        """Convert TikTok analytics to platform summary."""
        metrics = insights.user_metrics
        
        # Calculate engagement rate from totals
        views = insights.total_views or 0
        engagement = (insights.total_likes or 0) + (insights.total_comments or 0) + (insights.total_shares or 0)
        engagement_rate = (engagement / views * 100) if views > 0 else 0
        
        return PlatformSummary(
            platform=Platform.TIKTOK,
            connected=True,
            followers=metrics.follower_count,
            views=MetricTrend.calculate(float(views), None),
            engagement=MetricTrend.calculate(float(engagement), None),
            engagement_rate=round(engagement_rate, 2),
            posts_count=len(insights.top_videos) if insights.top_videos else 0,
            top_post_id=insights.top_videos[0].video_id if insights.top_videos else None
        )
    
    # =========================================================================
    # AGGREGATION HELPERS
    # =========================================================================
    
    def _calculate_aggregated_metrics(
        self,
        platform_summaries: Dict[Platform, PlatformSummary]
    ) -> AggregatedMetrics:
        """Calculate aggregated metrics across all platforms."""
        total_followers = 0
        total_views = 0
        total_engagement = 0
        total_posts = 0
        engagement_rates = []
        platforms_connected = 0
        
        for summary in platform_summaries.values():
            if summary.connected:
                platforms_connected += 1
                total_followers += summary.followers.current
                total_views += summary.views.current
                total_engagement += summary.engagement.current
                total_posts += summary.posts_count
                if summary.engagement_rate > 0:
                    engagement_rates.append(summary.engagement_rate)
        
        avg_engagement_rate = (
            sum(engagement_rates) / len(engagement_rates)
            if engagement_rates else 0
        )
        
        return AggregatedMetrics(
            total_followers=MetricTrend.calculate(float(total_followers), None),
            total_views=MetricTrend.calculate(float(total_views), None),
            total_engagement=MetricTrend.calculate(float(total_engagement), None),
            average_engagement_rate=round(avg_engagement_rate, 2),
            total_posts=total_posts,
            platforms_connected=platforms_connected
        )
    
    def _aggregate_top_posts(
        self,
        facebook: Optional[FacebookInsights],
        instagram: Optional[InstagramInsights],
        youtube: Optional[YouTubeAnalytics],
        tiktok: Optional[TikTokAnalytics],
        limit: int = 10
    ) -> List[TopPerformingPost]:
        """Aggregate and rank top posts across all platforms."""
        all_posts = []
        
        # Add Facebook posts
        if facebook and facebook.top_posts:
            for post in facebook.top_posts[:5]:
                engagement = post.post_engaged_users
                views = post.post_impressions or 1
                all_posts.append(TopPerformingPost(
                    platform=Platform.FACEBOOK,
                    post_id=post.post_id,
                    content_preview=post.message[:100] if post.message else None,
                    created_at=post.created_time,
                    views=post.post_impressions or 0,
                    likes=post.reactions_like,
                    comments=post.comments,
                    shares=post.shares,
                    engagement_rate=round((engagement / views * 100), 2),
                    post_url=f"https://facebook.com/{post.post_id}"
                ))
        
        # Add Instagram posts
        if instagram and instagram.top_media:
            for media in instagram.top_media[:5]:
                engagement = media.likes + media.comments + media.saves
                views = media.views or 1
                all_posts.append(TopPerformingPost(
                    platform=Platform.INSTAGRAM,
                    post_id=media.media_id,
                    content_preview=media.caption[:100] if media.caption else None,
                    thumbnail_url=media.thumbnail_url,
                    created_at=media.timestamp,
                    views=media.views,
                    likes=media.likes,
                    comments=media.comments,
                    shares=media.shares,
                    engagement_rate=round((engagement / views * 100), 2) if views else 0,
                    post_url=media.permalink
                ))
        
        # Add YouTube videos
        if youtube and youtube.top_videos:
            for video in youtube.top_videos[:5]:
                engagement = video.likes + video.comments + video.shares
                views = video.views or 1
                all_posts.append(TopPerformingPost(
                    platform=Platform.YOUTUBE,
                    post_id=video.video_id,
                    content_preview=video.title[:100] if video.title else None,
                    thumbnail_url=video.thumbnail_url,
                    created_at=video.published_at,
                    views=video.views,
                    likes=video.likes,
                    comments=video.comments,
                    shares=video.shares,
                    engagement_rate=round((engagement / views * 100), 2),
                    post_url=f"https://youtube.com/watch?v={video.video_id}"
                ))
        
        # Add TikTok videos
        if tiktok and tiktok.top_videos:
            for video in tiktok.top_videos[:5]:
                engagement = video.like_count + video.comment_count + video.share_count
                views = video.view_count or 1
                all_posts.append(TopPerformingPost(
                    platform=Platform.TIKTOK,
                    post_id=video.video_id,
                    content_preview=video.title[:100] if video.title else None,
                    thumbnail_url=video.cover_image_url,
                    created_at=video.create_time,
                    views=video.view_count,
                    likes=video.like_count,
                    comments=video.comment_count,
                    shares=video.share_count,
                    engagement_rate=round((engagement / views * 100), 2),
                    post_url=video.share_url
                ))
        
        # Sort by engagement rate and return top posts
        all_posts.sort(key=lambda p: p.engagement_rate, reverse=True)
        return all_posts[:limit]
    
    def _build_comparison_metrics(
        self,
        platform_summaries: Dict[Platform, PlatformSummary]
    ) -> Dict[str, Dict[str, float]]:
        """Build metrics comparison dictionary for charts."""
        comparison = {
            "followers": {},
            "views": {},
            "engagement": {},
            "engagement_rate": {}
        }
        
        for platform, summary in platform_summaries.items():
            if summary.connected:
                platform_name = platform.value
                comparison["followers"][platform_name] = summary.followers.current
                comparison["views"][platform_name] = summary.views.current
                comparison["engagement"][platform_name] = summary.engagement.current
                comparison["engagement_rate"][platform_name] = summary.engagement_rate
        
        return comparison


# Singleton instance
unified_analytics_service = UnifiedAnalyticsService()
