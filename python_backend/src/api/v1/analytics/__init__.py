"""
Analytics API Package
RESTful API endpoints for organic content analytics.
"""
from fastapi import APIRouter

from .dashboard import router as dashboard_router
from .facebook import router as facebook_router
from .instagram import router as instagram_router
from .youtube import router as youtube_router
from .tiktok import router as tiktok_router

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# Include platform-specific routers
router.include_router(dashboard_router)
router.include_router(facebook_router)
router.include_router(instagram_router)
router.include_router(youtube_router)
router.include_router(tiktok_router)

__all__ = ["router"]
