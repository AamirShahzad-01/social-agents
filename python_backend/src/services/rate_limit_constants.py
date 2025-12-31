"""
Rate Limit Constants
Platform-specific rate limits based on official documentation (Dec 2024-2025)

Sources:
- Meta Graph API: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- Instagram API: https://developers.facebook.com/docs/instagram-api/rate-limiting
- Twitter/X API v2: https://developer.x.com/en/docs/twitter-api/rate-limits
- LinkedIn API: https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits
- TikTok API: https://developers.tiktok.com/doc/content-posting-api-get-started
- YouTube Data API v3: https://developers.google.com/youtube/v3/determine_quota_cost
"""
from enum import Enum
from typing import Dict, Any
from dataclasses import dataclass


class Platform(str, Enum):
    """Supported social media platforms"""
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    TWITTER = "twitter"
    LINKEDIN = "linkedin"
    TIKTOK = "tiktok"
    YOUTUBE = "youtube"
    META_ADS = "meta_ads"


@dataclass
class PlatformLimit:
    """Rate limit configuration for a platform"""
    posts_per_day: int
    api_calls_per_hour: int
    api_calls_per_minute: int = 0
    comment_writes_per_hour: int = 0
    description: str = ""
    is_dynamic: bool = False  # Some platforms have dynamic limits


# Official Platform Limits (verified Dec 2024-2025)
PLATFORM_LIMITS: Dict[str, PlatformLimit] = {
    Platform.FACEBOOK.value: PlatformLimit(
        posts_per_day=20,
        api_calls_per_hour=200,
        comment_writes_per_hour=60,
        description="Dynamic limit (20-24), based on user engagement",
        is_dynamic=True
    ),
    Platform.INSTAGRAM.value: PlatformLimit(
        posts_per_day=25,
        api_calls_per_hour=200,
        comment_writes_per_hour=60,
        description="Instagram Content Publishing API limit"
    ),
    Platform.TWITTER.value: PlatformLimit(
        posts_per_day=50,
        api_calls_per_hour=300,
        description="Free tier: 50/day, Basic ($200/mo): 100/day"
    ),
    Platform.LINKEDIN.value: PlatformLimit(
        posts_per_day=50,
        api_calls_per_hour=100,
        description="Not publicly documented, estimated conservative limit"
    ),
    Platform.TIKTOK.value: PlatformLimit(
        posts_per_day=15,
        api_calls_per_hour=360,
        api_calls_per_minute=6,
        description="Direct Post API: 15-25 posts/day"
    ),
    Platform.YOUTUBE.value: PlatformLimit(
        posts_per_day=100,
        api_calls_per_hour=600,
        description="10,000 quota units/day, ~100 units per upload (Dec 2025)"
    ),
    Platform.META_ADS.value: PlatformLimit(
        posts_per_day=1000,  # Ads have different limits
        api_calls_per_hour=200,
        description="Marketing API rate limits (score-based system)"
    ),
}


# Warning thresholds
QUOTA_WARNING_THRESHOLD = 0.80  # 80% usage triggers warning
QUOTA_CRITICAL_THRESHOLD = 0.95  # 95% usage triggers critical alert


def get_platform_limit(platform: str) -> PlatformLimit:
    """Get rate limit configuration for a platform"""
    platform_lower = platform.lower()
    if platform_lower in PLATFORM_LIMITS:
        return PLATFORM_LIMITS[platform_lower]
    # Default conservative limit for unknown platforms
    return PlatformLimit(
        posts_per_day=10,
        api_calls_per_hour=100,
        description="Unknown platform - conservative default"
    )


def get_daily_post_limit(platform: str) -> int:
    """Get daily post limit for a platform"""
    return get_platform_limit(platform).posts_per_day


def get_hourly_api_limit(platform: str) -> int:
    """Get hourly API call limit for a platform"""
    return get_platform_limit(platform).api_calls_per_hour


def is_meta_platform(platform: str) -> bool:
    """Check if platform is a Meta platform (shared limits)"""
    return platform.lower() in [
        Platform.FACEBOOK.value,
        Platform.INSTAGRAM.value,
        Platform.META_ADS.value
    ]
