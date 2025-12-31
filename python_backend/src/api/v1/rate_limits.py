"""
Rate Limits API Routes
Endpoints for quota management and usage tracking

Endpoints:
- GET /api/v1/rate-limits/status - Get all platform quotas
- GET /api/v1/rate-limits/{platform} - Get single platform quota
- POST /api/v1/rate-limits/check - Pre-publish quota check
- POST /api/v1/rate-limits/cleanup - Admin: cleanup old records (cron)
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from ...services.rate_limit_service import (
    RateLimitService,
    get_rate_limit_service
)
from ...services.rate_limit_constants import Platform, PLATFORM_LIMITS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rate-limits", tags=["Rate Limits"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class QuotaCheckRequest(BaseModel):
    """Request model for quota check"""
    workspace_id: str
    platform: str
    post_count: int = 1


class QuotaCheckResponse(BaseModel):
    """Response model for quota check"""
    success: bool
    allowed: bool
    platform: str
    used: int
    limit: int
    remaining: int
    message: str
    error_code: Optional[str] = None


class IncrementUsageRequest(BaseModel):
    """Request model for incrementing usage"""
    workspace_id: str
    platform: str
    count: int = 1


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/status")
async def get_all_quotas(
    workspace_id: str = Query(..., description="Workspace ID")
):
    """
    Get quota status for all platforms.
    
    Returns usage, limits, and warnings for each platform.
    Use this for dashboard display.
    """
    try:
        service = get_rate_limit_service()
        result = await service.get_all_quotas(workspace_id)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Get quotas error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{platform}")
async def get_platform_quota(
    platform: str,
    workspace_id: str = Query(..., description="Workspace ID")
):
    """
    Get quota status for a specific platform.
    
    Args:
        platform: Platform name (facebook, instagram, twitter, linkedin, tiktok, youtube)
        workspace_id: Workspace ID
    """
    try:
        # Validate platform
        valid_platforms = [p.value for p in Platform]
        if platform.lower() not in valid_platforms:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid platform. Must be one of: {', '.join(valid_platforms)}"
            )
        
        service = get_rate_limit_service()
        status = await service.get_quota_status(workspace_id, platform)
        
        return {
            "success": True,
            "platform": status.platform,
            "used": status.used,
            "limit": status.limit,
            "remaining": status.remaining,
            "percentage": status.percentage,
            "isExceeded": status.is_exceeded,
            "isWarning": status.is_warning,
            "isCritical": status.is_critical,
            "resetsAt": status.resets_at,
            "description": status.description
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get platform quota error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check")
async def check_quota(request: QuotaCheckRequest) -> QuotaCheckResponse:
    """
    Pre-publish quota check.
    
    Call this BEFORE attempting to publish to verify quota is available.
    Returns whether publishing is allowed and quota details.
    """
    try:
        service = get_rate_limit_service()
        result = await service.check_can_publish(
            workspace_id=request.workspace_id,
            platform=request.platform,
            post_count=request.post_count
        )
        
        return QuotaCheckResponse(
            success=True,
            allowed=result.allowed,
            platform=result.platform,
            used=result.used,
            limit=result.limit,
            remaining=result.remaining,
            message=result.message,
            error_code=result.error_code
        )
    except Exception as e:
        logger.error(f"Check quota error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/increment")
async def increment_usage(request: IncrementUsageRequest):
    """
    Increment usage after successful publish.
    
    Call this AFTER a post is successfully published.
    This is typically called by the social service internally.
    """
    try:
        service = get_rate_limit_service()
        success = await service.increment_usage(
            workspace_id=request.workspace_id,
            platform=request.platform,
            count=request.count
        )
        
        if success:
            # Return updated quota status
            status = await service.get_quota_status(request.workspace_id, request.platform)
            return {
                "success": True,
                "message": f"Usage incremented by {request.count}",
                "currentUsage": status.used,
                "remaining": status.remaining,
                "limit": status.limit
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to increment usage")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Increment usage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{workspace_id}")
async def get_usage_history(
    workspace_id: str,
    platform: Optional[str] = None,
    days: int = Query(default=7, ge=1, le=30)
):
    """
    Get usage history for analytics.
    
    Args:
        workspace_id: Workspace ID
        platform: Optional platform filter
        days: Number of days to fetch (1-30, default: 7)
    """
    try:
        service = get_rate_limit_service()
        history = await service.get_usage_history(
            workspace_id=workspace_id,
            platform=platform,
            days=days
        )
        
        return {
            "success": True,
            "history": history,
            "days": days,
            "platform": platform
        }
    except Exception as e:
        logger.error(f"Get history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup")
async def cleanup_old_records(request: Request):
    """
    Admin endpoint: Clean up old rate limit records.
    
    Should be called by cron job. Deletes records older than 30 days.
    Requires CRON_SECRET header for authentication.
    """
    try:
        # Verify cron secret
        cron_secret = request.headers.get("x-cron-secret")
        import os
        expected_secret = os.getenv("CRON_SECRET", "")
        
        if expected_secret and cron_secret != expected_secret:
            raise HTTPException(status_code=401, detail="Invalid cron secret")
        
        service = get_rate_limit_service()
        result = await service.reset_daily_quotas()
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/limits")
async def get_platform_limits():
    """
    Get configured limits for all platforms.
    
    Returns the official rate limits based on platform documentation.
    Useful for displaying limits in the UI.
    """
    try:
        limits = {}
        for platform in Platform:
            limit_config = PLATFORM_LIMITS.get(platform.value)
            if limit_config:
                limits[platform.value] = {
                    "postsPerDay": limit_config.posts_per_day,
                    "apiCallsPerHour": limit_config.api_calls_per_hour,
                    "apiCallsPerMinute": limit_config.api_calls_per_minute,
                    "commentWritesPerHour": limit_config.comment_writes_per_hour,
                    "description": limit_config.description,
                    "isDynamic": limit_config.is_dynamic
                }
        
        return {
            "success": True,
            "limits": limits,
            "platforms": [p.value for p in Platform]
        }
    except Exception as e:
        logger.error(f"Get limits error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def rate_limits_info():
    """Rate Limits API information"""
    return {
        "success": True,
        "message": "Rate Limits API is operational",
        "version": "1.0.0",
        "endpoints": {
            "status": "GET /status - Get all platform quotas",
            "platform": "GET /{platform} - Get single platform quota",
            "check": "POST /check - Pre-publish quota check",
            "increment": "POST /increment - Record successful publish",
            "history": "GET /history/{workspace_id} - Usage history",
            "limits": "GET /limits - Get configured limits",
            "cleanup": "POST /cleanup - Admin cleanup (cron)"
        }
    }
