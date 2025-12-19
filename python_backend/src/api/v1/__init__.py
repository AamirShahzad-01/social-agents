"""API v1 routes"""
from .content import router as content_router
from .improve_media_prompts import router as improve_media_prompts_router
from .media_generating import router as media_generating_router
from .comments import router as comments_router
from .auth import router as auth_router
from .social import facebook_router, instagram_router, linkedin_router, twitter_router, tiktok_router, youtube_router

__all__ = [
    "content_router",
    "improve_media_prompts_router",
    "media_generating_router",
    "comments_router",
    "auth_router",
    "facebook_router",
    "instagram_router",
    "linkedin_router",
    "twitter_router",
    "tiktok_router",
    "youtube_router"
]
