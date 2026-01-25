"""
Credential Validator Service
Token validation using Meta's debug_token API
"""
import logging
from typing import Optional, Dict, Any
import httpx

from ...config import settings

logger = logging.getLogger(__name__)

# Cache validation results for 5 minutes
VALIDATION_CACHE_TTL = 300


class CredentialValidator:
    """Token validation service"""
    
    _validation_cache: Dict[str, Dict[str, Any]] = {}
    _cache_timestamps: Dict[str, float] = {}
    
    @staticmethod
    async def validate_token(access_token: str) -> Dict[str, Any]:
        """
        Validate access token using Meta's debug_token API
        
        Args:
            access_token: Access token to validate
            
        Returns:
            Dict with validation info:
            - is_valid: Whether token is valid
            - app_id: App the token belongs to
            - user_id: User ID
            - expires_at: Expiration timestamp
            - scopes: List of granted permissions
            - error: Error message (if invalid)
        """
        # Check cache first
        cache_key = access_token[:20]  # Use first 20 chars as cache key
        import time
        if cache_key in CredentialValidator._validation_cache:
            timestamp = CredentialValidator._cache_timestamps.get(cache_key, 0)
            if time.time() - timestamp < VALIDATION_CACHE_TTL:
                logger.debug("Using cached validation result")
                return CredentialValidator._validation_cache[cache_key]
        
        try:
            app_id = settings.FACEBOOK_APP_ID
            app_secret = settings.FACEBOOK_APP_SECRET
            
            if not app_id or not app_secret:
                result = {"is_valid": False, "error": "App credentials not configured"}
                CredentialValidator._validation_cache[cache_key] = result
                CredentialValidator._cache_timestamps[cache_key] = time.time()
                return result
            
            # Generate app access token
            app_access_token = f"{app_id}|{app_secret}"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://graph.facebook.com/v24.0/debug_token",
                    params={
                        "input_token": access_token,
                        "access_token": app_access_token
                    }
                )
                
                if response.is_success:
                    data = response.json().get("data", {})
                    
                    is_valid = data.get("is_valid", False)
                    
                    if is_valid:
                        expires_at = data.get("expires_at")
                        result = {
                            "is_valid": True,
                            "app_id": data.get("app_id"),
                            "user_id": data.get("user_id"),
                            "expires_at": expires_at,
                            "scopes": data.get("scopes", []),
                            "type": data.get("type"),
                            "issued_at": data.get("issued_at"),
                        }
                    else:
                        error = data.get("error", {})
                        result = {
                            "is_valid": False,
                            "error": error.get("message", "Token is invalid"),
                            "error_code": error.get("code"),
                        }
                    
                    # Cache result
                    CredentialValidator._validation_cache[cache_key] = result
                    CredentialValidator._cache_timestamps[cache_key] = time.time()
                    
                    return result
                else:
                    result = {"is_valid": False, "error": "Failed to validate token"}
                    CredentialValidator._validation_cache[cache_key] = result
                    CredentialValidator._cache_timestamps[cache_key] = time.time()
                    return result
                    
        except Exception as e:
            logger.error(f"Error validating token: {e}", exc_info=True)
            result = {"is_valid": False, "error": str(e)}
            CredentialValidator._validation_cache[cache_key] = result
            CredentialValidator._cache_timestamps[cache_key] = time.time()
            return result
    
    @staticmethod
    def clear_cache():
        """Clear validation cache"""
        CredentialValidator._validation_cache.clear()
        CredentialValidator._cache_timestamps.clear()
