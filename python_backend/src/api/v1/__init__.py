"""API v1 routes"""
from .content import router as content_router
from .improve_media_prompts import router as improve_media_prompts_router
from .media_generating import router as media_generating_router
from .comments import router as comments_router
from .auth import router as auth_router
from .media_studio import router as media_studio_router
from .storage import router as storage_router
from .webhooks import router as webhooks_router
from .canva import router as canva_router
from .workspace import router as workspace_router
from .posts import router as posts_router
from .credentials import router as credentials_router
from .cloudinary import router as cloudinary_router
from .social import facebook_router, instagram_router, linkedin_router, twitter_router, tiktok_router, youtube_router

__all__ = [
    "content_router",
    "improve_media_prompts_router",
    "media_generating_router",
    "comments_router",
    "auth_router",
    "media_studio_router",
    "storage_router",
    "webhooks_router",
    "canva_router",
    "workspace_router",
    "posts_router",
    "credentials_router",
    "cloudinary_router",
    "facebook_router",
    "instagram_router",
    "linkedin_router",
    "twitter_router",
    "tiktok_router",
    "youtube_router"
]





