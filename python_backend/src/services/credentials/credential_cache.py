"""
Credential Cache Service
In-memory cache for refreshed tokens to avoid repeated database queries

Cache TTL: 1 hour (tokens valid for 60 days, cache shorter for safety)
Cache Key: {workspace_id}:meta
"""
import logging
import time
from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Cache TTL: 1 hour
CACHE_TTL_SECONDS = 3600


class CredentialCache:
    """In-memory cache for Meta credentials"""
    
    def __init__(self):
        """Initialize cache storage"""
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamps: Dict[str, float] = {}
    
    def _get_cache_key(self, workspace_id: str) -> str:
        """Generate cache key for workspace"""
        return f"{workspace_id}:meta"
    
    def get(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        """
        Get credentials from cache if available and not expired
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Cached credentials or None if not found/expired
        """
        cache_key = self._get_cache_key(workspace_id)
        
        if cache_key not in self._cache:
            return None
        
        # Check if expired
        timestamp = self._cache_timestamps.get(cache_key, 0)
        if time.time() - timestamp > CACHE_TTL_SECONDS:
            # Expired, remove from cache
            self._cache.pop(cache_key, None)
            self._cache_timestamps.pop(cache_key, None)
            logger.debug(f"Cache expired for workspace {workspace_id}")
            return None
        
        logger.debug(f"Cache hit for workspace {workspace_id}")
        return self._cache[cache_key]
    
    def set(self, workspace_id: str, credentials: Dict[str, Any]) -> None:
        """
        Store credentials in cache
        
        Args:
            workspace_id: Workspace ID
            credentials: Credentials dict to cache
        """
        cache_key = self._get_cache_key(workspace_id)
        self._cache[cache_key] = credentials
        self._cache_timestamps[cache_key] = time.time()
        logger.debug(f"Cached credentials for workspace {workspace_id}")
    
    def invalidate(self, workspace_id: str) -> None:
        """
        Remove credentials from cache
        
        Args:
            workspace_id: Workspace ID
        """
        cache_key = self._get_cache_key(workspace_id)
        self._cache.pop(cache_key, None)
        self._cache_timestamps.pop(cache_key, None)
        logger.debug(f"Invalidated cache for workspace {workspace_id}")
    
    def clear(self) -> None:
        """Clear all cached credentials"""
        self._cache.clear()
        self._cache_timestamps.clear()
        logger.debug("Cleared all cached credentials")


# Singleton instance
_credential_cache: Optional[CredentialCache] = None


def get_credential_cache() -> CredentialCache:
    """Get singleton credential cache instance"""
    global _credential_cache
    if _credential_cache is None:
        _credential_cache = CredentialCache()
    return _credential_cache
