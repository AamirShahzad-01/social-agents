"""
Analytics Types and Schemas
Pydantic models for organic content analytics across all platforms.
Enterprise-grade type definitions following official API specifications.
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class AnalyticsPeriod(str, Enum):
    """Valid periods for analytics queries."""
    DAY = "day"
    WEEK = "week"
    DAYS_28 = "days_28"
    MONTH = "month"
    LIFETIME = "lifetime"


class DatePreset(str, Enum):
    """Standard date presets for analytics queries."""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7D = "last_7d"
    LAST_14D = "last_14d"
    LAST_30D = "last_30d"
    LAST_90D = "last_90d"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"


class Platform(str, Enum):
    """Supported social media platforms."""
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    YOUTUBE = "youtube"
    TIKTOK = "tiktok"


# =============================================================================
# BASE MODELS
# =============================================================================

class DateRange(BaseModel):
    """Date range for analytics queries."""
    start_date: date = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: date = Field(..., description="End date (YYYY-MM-DD)")
    
    @classmethod
    def from_preset(cls, preset: DatePreset) -> "DateRange":
        """Create DateRange from a preset."""
        from datetime import timedelta
        today = date.today()
        
        preset_map = {
            DatePreset.TODAY: (today, today),
            DatePreset.YESTERDAY: (today - timedelta(days=1), today - timedelta(days=1)),
            DatePreset.LAST_7D: (today - timedelta(days=7), today),
            DatePreset.LAST_14D: (today - timedelta(days=14), today),
            DatePreset.LAST_30D: (today - timedelta(days=30), today),
            DatePreset.LAST_90D: (today - timedelta(days=90), today),
        }
        
        start, end = preset_map.get(preset, (today - timedelta(days=30), today))
        return cls(start_date=start, end_date=end)


class MetricTrend(BaseModel):
    """Represents a metric with its trend compared to previous period."""
    current: float = Field(..., description="Current period value")
    previous: Optional[float] = Field(None, description="Previous period value")
    change: Optional[float] = Field(None, description="Absolute change")
    change_percent: Optional[float] = Field(None, description="Percentage change")
    trend: Optional[Literal["up", "down", "stable"]] = Field(None, description="Trend direction")
    
    @classmethod
    def calculate(cls, current: float, previous: Optional[float] = None) -> "MetricTrend":
        """Calculate trend from current and previous values."""
        if previous is None or previous == 0:
            return cls(current=current, previous=previous)
        
        change = current - previous
        change_percent = (change / previous) * 100
        
        if change_percent > 1:
            trend = "up"
        elif change_percent < -1:
            trend = "down"
        else:
            trend = "stable"
        
        return cls(
            current=current,
            previous=previous,
            change=round(change, 2),
            change_percent=round(change_percent, 2),
            trend=trend
        )


class TimeSeriesDataPoint(BaseModel):
    """Single data point in a time series."""
    date: date
    value: float
    label: Optional[str] = None


class PlatformMetrics(BaseModel):
    """Base metrics available across all platforms."""
    platform: Platform
    followers: MetricTrend
    views: MetricTrend
    engagement: MetricTrend
    engagement_rate: MetricTrend
    posts_count: int = Field(..., description="Number of posts in period")
    last_updated: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# FACEBOOK MODELS (Graph API v24.0)
# =============================================================================

class FacebookPageMetrics(BaseModel):
    """
    Facebook Page Insights metrics.
    Based on Graph API v24.0 Documentation:
    https://developers.facebook.com/docs/graph-api/reference/page/insights
    
    Note: 'impressions' deprecated Nov 2025, replaced by 'page_views'
    """
    page_id: str
    page_name: str
    
    # Core Metrics
    page_fans: MetricTrend = Field(..., description="Total page followers/likes")
    page_fan_adds: Optional[int] = Field(None, description="New followers in period")
    page_fan_removes: Optional[int] = Field(None, description="Lost followers in period")
    
    # Engagement Metrics
    page_views_total: MetricTrend = Field(..., description="Total page views (replaces impressions)")
    page_engaged_users: MetricTrend = Field(..., description="Unique users who engaged")
    page_post_engagements: MetricTrend = Field(..., description="Total post engagements")
    
    # Reach Metrics (limited to 13 months with breakdowns after June 2025)
    page_impressions: Optional[MetricTrend] = Field(None, description="Page impressions (deprecated Nov 2025)")
    page_reach: Optional[MetricTrend] = Field(None, description="Unique users who saw content")
    
    # Additional Metrics
    page_actions_post_reactions_total: Optional[int] = Field(None, description="Total reactions")
    page_content_activity: Optional[int] = Field(None, description="Content creation activity")


class FacebookPostInsights(BaseModel):
    """Insights for individual Facebook posts."""
    post_id: str
    message: Optional[str] = None
    created_time: datetime
    post_type: Optional[str] = None
    
    # Engagement
    post_impressions: int = Field(0, description="Times post was shown")
    post_impressions_unique: int = Field(0, description="Unique users who saw post")
    post_engaged_users: int = Field(0, description="Users who engaged")
    post_clicks: int = Field(0, description="Post clicks")
    
    # Reactions
    reactions_like: int = 0
    reactions_love: int = 0
    reactions_haha: int = 0
    reactions_wow: int = 0
    reactions_sad: int = 0
    reactions_angry: int = 0
    
    # Engagement breakdown
    comments: int = 0
    shares: int = 0
    
    # Video specific (if applicable)
    video_views: Optional[int] = None
    video_view_time: Optional[int] = None


class FacebookInsights(BaseModel):
    """Complete Facebook analytics response."""
    page_metrics: FacebookPageMetrics
    time_series: Optional[List[TimeSeriesDataPoint]] = None
    top_posts: Optional[List[FacebookPostInsights]] = None
    period: AnalyticsPeriod
    date_range: DateRange


# =============================================================================
# INSTAGRAM MODELS (Graph API v24.0)
# =============================================================================

class InstagramAccountMetrics(BaseModel):
    """
    Instagram Business/Creator Account Insights.
    Based on Instagram Graph API v24.0:
    https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights
    
    Note: 'impressions' deprecated for v22+, use 'views'
    Note: 'profile_views' deprecated Jan 2025
    """
    ig_user_id: str
    username: str
    
    # Core Metrics
    follower_count: MetricTrend = Field(..., description="Total followers")
    follows_count: Optional[int] = Field(None, description="Total following")
    
    # Engagement Metrics (using 'views' as primary metric for 2025+)
    views: MetricTrend = Field(..., description="Content views (replaces impressions)")
    reach: MetricTrend = Field(..., description="Unique accounts reached")
    
    # Engagement breakdown
    total_likes: Optional[int] = None
    total_comments: Optional[int] = None
    total_saves: Optional[int] = None
    total_shares: Optional[int] = None  # Available for stories/reels
    
    # Profile Metrics (DEPRECATED - Jan 2025)
    profile_views: Optional[MetricTrend] = Field(None, description="DEPRECATED Jan 2025: Profile visits - no longer returned by API")
    website_clicks: Optional[int] = Field(None, description="DEPRECATED Jan 2025: Website clicks - no longer returned by API")


class InstagramMediaInsights(BaseModel):
    """Insights for individual Instagram media."""
    media_id: str
    media_type: Literal["IMAGE", "VIDEO", "CAROUSEL_ALBUM", "REELS"]
    caption: Optional[str] = None
    timestamp: datetime
    permalink: Optional[str] = None
    thumbnail_url: Optional[str] = None
    
    # Engagement
    views: int = Field(0, description="Total views")
    reach: int = Field(0, description="Unique accounts reached")
    likes: int = 0
    comments: int = 0
    saves: int = 0
    shares: int = 0
    
    # Reels specific (DEPRECATED - Apr 2025)
    plays: Optional[int] = Field(None, description="DEPRECATED Apr 2025: Reels plays - use 'views' instead")
    replays: Optional[int] = Field(None, description="DEPRECATED Apr 2025: Use 'views' for replay counts")
    
    # Calculated
    engagement_rate: Optional[float] = None


class InstagramAudienceDemographics(BaseModel):
    """Audience demographics for Instagram account."""
    age_gender: Optional[Dict[str, int]] = Field(None, description="Age/gender breakdown")
    top_cities: Optional[Dict[str, int]] = Field(None, description="Top cities")
    top_countries: Optional[Dict[str, int]] = Field(None, description="Top countries")
    follower_locale: Optional[Dict[str, int]] = None


class InstagramInsights(BaseModel):
    """Complete Instagram analytics response."""
    account_metrics: InstagramAccountMetrics
    time_series: Optional[List[TimeSeriesDataPoint]] = None
    top_media: Optional[List[InstagramMediaInsights]] = None
    audience: Optional[InstagramAudienceDemographics] = None
    period: AnalyticsPeriod
    date_range: DateRange


# =============================================================================
# YOUTUBE MODELS (YouTube Analytics API)
# =============================================================================

class YouTubeChannelMetrics(BaseModel):
    """
    YouTube Channel Analytics.
    Based on YouTube Analytics API:
    https://developers.google.com/youtube/analytics/reference
    
    Requires OAuth scope: https://www.googleapis.com/auth/yt-analytics.readonly
    """
    channel_id: str
    channel_title: str
    
    # Core Metrics
    subscriber_count: MetricTrend = Field(..., description="Total subscribers")
    subscribers_gained: Optional[int] = Field(None, description="New subscribers")
    subscribers_lost: Optional[int] = Field(None, description="Lost subscribers")
    
    # View Metrics
    views: MetricTrend = Field(..., description="Total organic views")
    estimated_minutes_watched: MetricTrend = Field(..., description="Total watch time")
    average_view_duration: Optional[float] = Field(None, description="Avg view duration (seconds)")
    
    # Engagement
    likes: Optional[int] = None
    dislikes: Optional[int] = Field(None, description="DEPRECATED Dec 2021: Always returns 0 - YouTube disabled public dislike counts")
    comments: Optional[int] = None
    shares: Optional[int] = None
    
    # Revenue (if monetized)
    estimated_revenue: Optional[float] = None
    cpm: Optional[float] = None


class YouTubeVideoMetrics(BaseModel):
    """Analytics for individual YouTube video."""
    video_id: str
    title: str
    published_at: datetime
    thumbnail_url: Optional[str] = None
    
    # View metrics
    views: int = 0
    estimated_minutes_watched: float = 0
    average_view_duration: float = 0
    average_view_percentage: Optional[float] = None
    
    # Engagement
    likes: int = 0
    comments: int = 0
    shares: int = 0
    
    # Retention
    audience_retention: Optional[float] = None
    
    # Source
    traffic_source_type: Optional[Dict[str, int]] = None


class YouTubeTrafficSource(BaseModel):
    """Traffic source breakdown."""
    source_type: str = Field(..., description="e.g., SEARCH, SUGGESTED, EXTERNAL")
    views: int
    estimated_minutes_watched: float
    percentage: float


class YouTubeAnalytics(BaseModel):
    """Complete YouTube analytics response."""
    channel_metrics: YouTubeChannelMetrics
    time_series: Optional[List[TimeSeriesDataPoint]] = None
    top_videos: Optional[List[YouTubeVideoMetrics]] = None
    traffic_sources: Optional[List[YouTubeTrafficSource]] = None
    date_range: DateRange


# =============================================================================
# TIKTOK MODELS (Display API)
# =============================================================================

class TikTokUserMetrics(BaseModel):
    """
    TikTok User/Account Analytics.
    Based on TikTok Display API:
    https://developers.tiktok.com/doc/display-api-overview
    
    Note: Display API provides limited metrics. Full analytics require Research API.
    """
    open_id: str
    display_name: str
    avatar_url: Optional[str] = None
    
    # Core Metrics
    follower_count: MetricTrend = Field(..., description="Total followers")
    following_count: Optional[int] = None
    likes_count: Optional[int] = Field(None, description="Total likes received")
    video_count: Optional[int] = Field(None, description="Total public videos")


class TikTokVideoMetrics(BaseModel):
    """Analytics for individual TikTok video."""
    video_id: str
    title: Optional[str] = None  # Description/caption
    create_time: datetime
    cover_image_url: Optional[str] = None
    share_url: Optional[str] = None
    duration: Optional[int] = Field(None, description="Duration in seconds")
    
    # Engagement (available via Display API)
    view_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    
    # Calculated
    engagement_rate: Optional[float] = None


class TikTokAnalytics(BaseModel):
    """Complete TikTok analytics response."""
    user_metrics: TikTokUserMetrics
    top_videos: Optional[List[TikTokVideoMetrics]] = None
    total_views: Optional[int] = None
    total_likes: Optional[int] = None
    total_comments: Optional[int] = None
    total_shares: Optional[int] = None
    date_range: DateRange


# =============================================================================
# UNIFIED DASHBOARD MODELS
# =============================================================================

class PlatformSummary(BaseModel):
    """Summary metrics for a single platform."""
    platform: Platform
    connected: bool = True
    followers: MetricTrend
    views: MetricTrend
    engagement: MetricTrend
    engagement_rate: float
    posts_count: int
    top_post_id: Optional[str] = None
    error: Optional[str] = None


class TopPerformingPost(BaseModel):
    """Top performing post across all platforms."""
    platform: Platform
    post_id: str
    content_preview: Optional[str] = None
    thumbnail_url: Optional[str] = None
    created_at: datetime
    
    # Universal metrics
    views: int
    likes: int
    comments: int
    shares: int
    engagement_rate: float
    
    # Platform-specific URL
    post_url: Optional[str] = None


class AggregatedMetrics(BaseModel):
    """Aggregated metrics across all connected platforms."""
    total_followers: MetricTrend
    total_views: MetricTrend
    total_engagement: MetricTrend
    average_engagement_rate: float
    total_posts: int
    platforms_connected: int


class PlatformComparisonData(BaseModel):
    """Data for platform comparison charts."""
    platforms: List[PlatformSummary]
    metrics_comparison: Dict[str, Dict[str, float]]  # metric_name -> platform -> value


class UnifiedDashboardData(BaseModel):
    """Complete unified analytics dashboard response."""
    aggregated: AggregatedMetrics
    platforms: Dict[Platform, PlatformSummary]
    facebook: Optional[FacebookInsights] = None
    instagram: Optional[InstagramInsights] = None
    youtube: Optional[YouTubeAnalytics] = None
    tiktok: Optional[TikTokAnalytics] = None
    top_posts: List[TopPerformingPost]
    platform_comparison: PlatformComparisonData
    date_range: DateRange
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# REQUEST MODELS
# =============================================================================

class AnalyticsRequest(BaseModel):
    """Standard analytics request parameters."""
    date_preset: Optional[DatePreset] = DatePreset.LAST_30D
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    period: AnalyticsPeriod = AnalyticsPeriod.DAY
    include_time_series: bool = True
    include_top_posts: bool = True
    top_posts_limit: int = Field(default=10, ge=1, le=50)
    
    def get_date_range(self) -> DateRange:
        """Get DateRange from request parameters."""
        if self.start_date and self.end_date:
            return DateRange(start_date=self.start_date, end_date=self.end_date)
        return DateRange.from_preset(self.date_preset or DatePreset.LAST_30D)


class DashboardRequest(AnalyticsRequest):
    """Request for unified dashboard."""
    platforms: Optional[List[Platform]] = None  # None = all connected platforms
    include_comparison: bool = True
