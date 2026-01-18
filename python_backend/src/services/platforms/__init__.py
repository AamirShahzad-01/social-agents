"""Platform-specific services for social media platforms"""
from .linkedin_service import linkedin_service, close_linkedin_service
from .twitter_service import twitter_service, close_twitter_service
from .tiktok_service import tiktok_service, close_tiktok_service
from .youtube_service import youtube_service, close_youtube_service
from .comments_service import CommentsService

# Instagram - using ig_service.py (more complete, no singleton issues)
from .ig_service import InstagramService, INSTAGRAM_MEDIA_TYPES

# Facebook Pages - using pages_service.py (more complete, no singleton issues)
from .pages_service import PagesService

# Backward compatibility aliases
IGService = InstagramService
FacebookService = PagesService

__all__ = [
    # LinkedIn
    "linkedin_service",
    "close_linkedin_service",
    # Twitter
    "twitter_service",
    "close_twitter_service",
    # TikTok
    "tiktok_service",
    "close_tiktok_service",
    # YouTube
    "youtube_service",
    "close_youtube_service",
    # Facebook Pages
    "PagesService",
    "FacebookService",  # Alias for backward compatibility
    # Instagram
    "InstagramService",
    "IGService",  # Alias for backward compatibility
    "INSTAGRAM_MEDIA_TYPES",
    # Comments/Engagement
    "CommentsService",
]
