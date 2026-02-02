"""
Analytics Services Package
Provides organic content analytics for Facebook, Instagram, YouTube, and TikTok.
Following official platform API documentation (2025-2026).
"""
from .analytics_types import (
    # Enums
    AnalyticsPeriod,
    DatePreset,
    Platform,
    # Base Types
    DateRange,
    MetricTrend,
    TimeSeriesDataPoint,
    PlatformMetrics,
    # Facebook
    FacebookInsights,
    FacebookPostInsights,
    # Instagram
    InstagramInsights,
    InstagramMediaInsights,
    InstagramAudienceDemographics,
    # YouTube
    YouTubeAnalytics,
    YouTubeVideoMetrics,
    YouTubeTrafficSource,
    # TikTok
    TikTokAnalytics,
    TikTokUserMetrics,
    TikTokVideoMetrics,
    # Unified Dashboard
    PlatformSummary,
    TopPerformingPost,
    AggregatedMetrics,
    PlatformComparisonData,
    UnifiedDashboardData,
)
from .facebook_analytics_service import FacebookAnalyticsService, facebook_analytics_service
from .instagram_analytics_service import InstagramAnalyticsService, instagram_analytics_service
from .youtube_analytics_service import YouTubeAnalyticsService, youtube_analytics_service
from .tiktok_analytics_service import TikTokAnalyticsService, tiktok_analytics_service
from .unified_analytics_service import UnifiedAnalyticsService, unified_analytics_service

__all__ = [
    # Enums
    "AnalyticsPeriod",
    "DatePreset",
    "Platform",
    # Base Types
    "DateRange",
    "MetricTrend",
    "TimeSeriesDataPoint",
    "PlatformMetrics",
    # Facebook
    "FacebookInsights",
    "FacebookPostInsights",
    # Instagram
    "InstagramInsights",
    "InstagramMediaInsights",
    "InstagramAudienceDemographics",
    # YouTube
    "YouTubeAnalytics",
    "YouTubeVideoMetrics",
    "YouTubeTrafficSource",
    # TikTok
    "TikTokAnalytics",
    "TikTokUserMetrics",
    "TikTokVideoMetrics",
    # Unified Dashboard
    "PlatformSummary",
    "TopPerformingPost",
    "AggregatedMetrics",
    "PlatformComparisonData",
    "UnifiedDashboardData",
    # Services
    "FacebookAnalyticsService",
    "facebook_analytics_service",
    "InstagramAnalyticsService",
    "instagram_analytics_service",
    "YouTubeAnalyticsService",
    "youtube_analytics_service",
    "TikTokAnalyticsService",
    "tiktok_analytics_service",
    "UnifiedAnalyticsService",
    "unified_analytics_service",
]


