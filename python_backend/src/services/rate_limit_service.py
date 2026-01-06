"""
Rate Limit Service
Enterprise-grade rate limiting for social media post publishing

Handles:
- Quota tracking per workspace/platform/day
- Pre-publish validation
- Usage statistics
- Automatic daily reset
"""
import logging
from datetime import datetime, date, timezone
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass

from .supabase_service import get_supabase_admin_client, is_supabase_configured
from .rate_limit_constants import (
    Platform, 
    PlatformLimit,
    PLATFORM_LIMITS,
    QUOTA_WARNING_THRESHOLD,
    QUOTA_CRITICAL_THRESHOLD,
    get_platform_limit,
    get_daily_post_limit,
    is_meta_platform
)

logger = logging.getLogger(__name__)


@dataclass
class QuotaStatus:
    """Quota status for a platform"""
    platform: str
    used: int
    limit: int
    remaining: int
    percentage: float
    is_exceeded: bool
    is_warning: bool
    is_critical: bool
    resets_at: str
    description: str = ""


@dataclass
class QuotaCheckResult:
    """Result of pre-publish quota check"""
    allowed: bool
    platform: str
    used: int
    limit: int
    remaining: int
    message: str
    error_code: Optional[str] = None


class RateLimitService:
    """
    Enterprise rate limiting service for social media publishing
    
    Features:
    - Per-workspace quota tracking
    - Platform-specific limits based on official docs
    - Warning/critical thresholds
    - Daily automatic reset (midnight UTC)
    """
    
    # =========================================================================
    # QUOTA CHECKING
    # =========================================================================
    
    @staticmethod
    async def check_can_publish(
        workspace_id: str,
        platform: str,
        post_count: int = 1
    ) -> QuotaCheckResult:
        """
        Check if publishing is allowed before attempting to post.
        
        Args:
            workspace_id: Workspace ID
            platform: Platform name (facebook, instagram, etc.)
            post_count: Number of posts to publish (default: 1)
            
        Returns:
            QuotaCheckResult with allowed status and details
        """
        try:
            platform_lower = platform.lower()
            limit = get_daily_post_limit(platform_lower)
            
            # Get current usage
            usage = await RateLimitService._get_today_usage(workspace_id, platform_lower)
            remaining = max(0, limit - usage)
            
            if usage + post_count > limit:
                return QuotaCheckResult(
                    allowed=False,
                    platform=platform_lower,
                    used=usage,
                    limit=limit,
                    remaining=remaining,
                    message=f"Daily quota exceeded for {platform}. Used {usage}/{limit} posts today. Resets at midnight UTC.",
                    error_code="QUOTA_EXCEEDED"
                )
            
            return QuotaCheckResult(
                allowed=True,
                platform=platform_lower,
                used=usage,
                limit=limit,
                remaining=remaining,
                message=f"Publishing allowed. {remaining - post_count} posts remaining after this publish."
            )
            
        except Exception as e:
            logger.error(f"Quota check error: {e}")
            # Fail open - allow publishing if we can't check quota
            return QuotaCheckResult(
                allowed=True,
                platform=platform.lower(),
                used=0,
                limit=get_daily_post_limit(platform),
                remaining=get_daily_post_limit(platform),
                message="Quota check unavailable, publishing allowed",
                error_code="CHECK_FAILED"
            )
    
    # =========================================================================
    # USAGE TRACKING
    # =========================================================================
    
    @staticmethod
    async def increment_usage(
        workspace_id: str,
        platform: str,
        count: int = 1
    ) -> bool:
        """
        Increment usage after successful post.
        Call this AFTER a post is successfully published.
        
        Args:
            workspace_id: Workspace ID
            platform: Platform name
            count: Number of posts (default: 1)
            
        Returns:
            True if successful
        """
        try:
            if not is_supabase_configured():
                logger.warning("Supabase not configured, skipping usage tracking")
                return True
            
            client = get_supabase_admin_client()
            today = date.today().isoformat()
            platform_lower = platform.lower()
            limit = get_daily_post_limit(platform_lower)
            
            # Check if record exists - handle None result from maybe_single()
            try:
                result = client.table("rate_limit_usage").select("id, posts_count").eq(
                    "workspace_id", workspace_id
                ).eq("platform", platform_lower).eq("date", today).maybe_single().execute()
            except Exception as query_err:
                # Table might not exist - log and return success (non-critical)
                logger.warning(f"Rate limit table query failed (table may not exist): {query_err}")
                return True
            
            # maybe_single() can return None when no rows match or on error
            if result is None:
                # No result object - try to insert new record
                try:
                    client.table("rate_limit_usage").insert({
                        "workspace_id": workspace_id,
                        "platform": platform_lower,
                        "date": today,
                        "posts_count": count,
                        "daily_limit": limit,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).execute()
                except Exception as insert_err:
                    logger.warning(f"Rate limit insert failed (non-critical): {insert_err}")
                    return True
            elif result.data:
                # Update existing record
                new_count = result.data["posts_count"] + count
                client.table("rate_limit_usage").update({
                    "posts_count": new_count,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", result.data["id"]).execute()
            else:
                # Result exists but data is None/empty - insert new record
                try:
                    client.table("rate_limit_usage").insert({
                        "workspace_id": workspace_id,
                        "platform": platform_lower,
                        "date": today,
                        "posts_count": count,
                        "daily_limit": limit,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).execute()
                except Exception as insert_err:
                    logger.warning(f"Rate limit insert failed (non-critical): {insert_err}")
                    return True
            
            logger.info(f"Usage incremented: {workspace_id}/{platform_lower} +{count}")
            return True
            
        except Exception as e:
            logger.error(f"Increment usage error: {e}")
            return False
    
    @staticmethod
    async def _get_today_usage(workspace_id: str, platform: str) -> int:
        """Get today's usage count for a platform"""
        try:
            if not is_supabase_configured():
                return 0
            
            # Lazy cleanup: 1% chance to clean old records (no cron needed)
            import random
            if random.random() < 0.01:  # 1% of requests
                await RateLimitService._lazy_cleanup()
            
            client = get_supabase_admin_client()
            today = date.today().isoformat()
            
            try:
                result = client.table("rate_limit_usage").select("posts_count").eq(
                    "workspace_id", workspace_id
                ).eq("platform", platform.lower()).eq("date", today).maybe_single().execute()
            except Exception as query_err:
                # Table might not exist - return 0 (non-critical)
                logger.warning(f"Rate limit table query failed (table may not exist): {query_err}")
                return 0
            
            # Handle None result from maybe_single()
            if result is not None and result.data:
                return result.data.get("posts_count", 0)
            return 0
            
        except Exception as e:
            logger.error(f"Get usage error: {e}")
            return 0
    
    @staticmethod
    async def _lazy_cleanup() -> None:
        """
        Probabilistic cleanup of old records (30+ days).
        Called randomly on ~1% of API requests.
        No cron job required - cleanup happens automatically.
        """
        try:
            if not is_supabase_configured():
                return
            
            import datetime as dt
            client = get_supabase_admin_client()
            cutoff_date = (date.today() - dt.timedelta(days=30)).isoformat()
            
            result = client.table("rate_limit_usage").delete().lt("date", cutoff_date).execute()
            
            deleted_count = len(result.data) if result.data else 0
            if deleted_count > 0:
                logger.info(f"Lazy cleanup: deleted {deleted_count} old rate limit records")
                
        except Exception as e:
            # Don't fail the main request if cleanup fails
            logger.warning(f"Lazy cleanup error (non-critical): {e}")
    
    # =========================================================================
    # STATUS & REPORTING
    # =========================================================================
    
    @staticmethod
    async def get_quota_status(
        workspace_id: str,
        platform: str
    ) -> QuotaStatus:
        """Get detailed quota status for a single platform"""
        platform_lower = platform.lower()
        limit_config = get_platform_limit(platform_lower)
        limit = limit_config.posts_per_day
        used = await RateLimitService._get_today_usage(workspace_id, platform_lower)
        remaining = max(0, limit - used)
        percentage = (used / limit * 100) if limit > 0 else 0
        
        # Calculate reset time (next midnight UTC)
        now = datetime.now(timezone.utc)
        tomorrow = date.today() + __import__('datetime').timedelta(days=1)
        reset_time = datetime.combine(tomorrow, datetime.min.time()).replace(tzinfo=timezone.utc)
        
        return QuotaStatus(
            platform=platform_lower,
            used=used,
            limit=limit,
            remaining=remaining,
            percentage=round(percentage, 1),
            is_exceeded=used >= limit,
            is_warning=percentage >= QUOTA_WARNING_THRESHOLD * 100,
            is_critical=percentage >= QUOTA_CRITICAL_THRESHOLD * 100,
            resets_at=reset_time.isoformat(),
            description=limit_config.description
        )
    
    @staticmethod
    async def get_all_quotas(workspace_id: str) -> Dict[str, Any]:
        """
        Get quota status for all platforms.
        Used for dashboard display.
        """
        quotas = {}
        warnings = []
        exceeded = []
        
        for platform in Platform:
            status = await RateLimitService.get_quota_status(workspace_id, platform.value)
            quotas[platform.value] = {
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
            
            if status.is_exceeded:
                exceeded.append(platform.value)
            elif status.is_warning:
                warnings.append(platform.value)
        
        return {
            "quotas": quotas,
            "summary": {
                "totalPlatforms": len(Platform),
                "exceededCount": len(exceeded),
                "warningCount": len(warnings),
                "exceededPlatforms": exceeded,
                "warningPlatforms": warnings
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    # =========================================================================
    # ADMIN / CRON METHODS
    # =========================================================================
    
    @staticmethod
    async def reset_daily_quotas() -> Dict[str, Any]:
        """
        Reset all quotas for a new day.
        Should be called by cron job at midnight UTC.
        
        Note: This doesn't actually need to delete old records.
        The system automatically uses today's date for queries.
        This method is for cleanup of old records.
        """
        try:
            if not is_supabase_configured():
                return {"success": True, "message": "No cleanup needed (Supabase not configured)"}
            
            client = get_supabase_admin_client()
            
            # Delete records older than 30 days (keep for analytics)
            cutoff_date = (date.today() - __import__('datetime').timedelta(days=30)).isoformat()
            
            result = client.table("rate_limit_usage").delete().lt("date", cutoff_date).execute()
            
            deleted_count = len(result.data) if result.data else 0
            
            logger.info(f"Rate limit cleanup: deleted {deleted_count} old records")
            
            return {
                "success": True,
                "message": f"Cleaned up {deleted_count} records older than 30 days",
                "deleted_count": deleted_count
            }
            
        except Exception as e:
            logger.error(f"Reset quotas error: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def get_usage_history(
        workspace_id: str,
        platform: Optional[str] = None,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        """Get usage history for analytics"""
        try:
            if not is_supabase_configured():
                return []
            
            client = get_supabase_admin_client()
            cutoff_date = (date.today() - __import__('datetime').timedelta(days=days)).isoformat()
            
            query = client.table("rate_limit_usage").select("*").eq(
                "workspace_id", workspace_id
            ).gte("date", cutoff_date).order("date", desc=True)
            
            if platform:
                query = query.eq("platform", platform.lower())
            
            result = query.execute()
            
            return result.data or []
            
        except Exception as e:
            logger.error(f"Get history error: {e}")
            return []


# Singleton instance
_rate_limit_service: Optional[RateLimitService] = None


def get_rate_limit_service() -> RateLimitService:
    """Get RateLimitService singleton"""
    global _rate_limit_service
    if _rate_limit_service is None:
        _rate_limit_service = RateLimitService()
    return _rate_limit_service
