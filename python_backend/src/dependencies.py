"""
Dependencies Module
Provides common dependencies for FastAPI route handlers.
Re-exports authentication and service dependencies.
"""
import logging
from typing import Dict, Any, Optional

from fastapi import Depends, HTTPException, status, Request

from .middleware.auth import get_current_user as _get_current_user

logger = logging.getLogger(__name__)


# =============================================================================
# AUTHENTICATION DEPENDENCIES
# =============================================================================

async def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Get current authenticated user from request.
    
    This is a wrapper around the middleware's get_current_user
    that can be used with FastAPI's Depends().
    
    Returns:
        Dict containing user information from JWT token
        
    Raises:
        HTTPException: If user is not authenticated
    """
    return await _get_current_user(request)


# =============================================================================
# CREDENTIALS SERVICE
# =============================================================================

class CredentialsService:
    """
    Service for managing platform credentials.
    
    Integrates with the existing credentials storage (Supabase).
    """
    
    def __init__(self):
        from .config import settings
        from supabase import create_client
        
        self.supabase = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_ANON_KEY
        )
    
    async def get_credentials(
        self,
        user_id: str,
        workspace_id: str,
        platform: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get platform credentials for a user/workspace.
        
        Args:
            user_id: User ID (not used since we query by workspace)
            workspace_id: Workspace ID
            platform: Platform name (facebook, instagram, youtube, tiktok)
            
        Returns:
            Dict with credentials or None if not found
        """
        try:
            # Query social_accounts table - only select columns that exist
            # Based on projectdb.sql schema
            result = self.supabase.table("social_accounts").select(
                "id, account_id, account_name, platform, workspace_id, "
                "credentials_encrypted, page_id, page_name, platform_user_id, "
                "username, is_connected, expires_at"
            ).eq(
                "workspace_id", workspace_id
            ).eq(
                "platform", platform
            ).eq(
                "is_connected", True
            ).execute()
            
            if not result.data or len(result.data) == 0:
                logger.warning(f"No credentials found for {platform} in workspace {workspace_id}")
                return None
            
            account = result.data[0]
            credentials = account.get("credentials_encrypted", {})
            
            # Handle case where credentials is stored as encrypted string
            if isinstance(credentials, str):
                try:
                    from .services.credentials.credential_encryption import CredentialEncryption
                    credentials = CredentialEncryption.decrypt(credentials, workspace_id) or {}
                except Exception as e:
                    logger.warning(f"Failed to decrypt credentials: {e}")
                    credentials = {}
            
            if not credentials:
                logger.warning(f"No credentials data for {platform}")
                return None
            
            # Build return dict with both snake_case and camelCase for compatibility
            # Instagram user ID and channel ID are stored in credentials_encrypted, not as separate columns
            return {
                "access_token": credentials.get("accessToken") or credentials.get("access_token"),
                "refresh_token": credentials.get("refreshToken") or credentials.get("refresh_token"),
                "page_id": account.get("page_id") or credentials.get("pageId") or credentials.get("page_id"),
                "page_name": account.get("page_name") or credentials.get("pageName"),
                # Instagram user ID from credentials_encrypted
                "instagram_user_id": credentials.get("igUserId") or credentials.get("ig_user_id") or credentials.get("instagram_user_id"),
                "ig_user_id": credentials.get("igUserId") or credentials.get("ig_user_id") or credentials.get("instagram_user_id"),
                # YouTube channel ID from credentials_encrypted
                "channel_id": credentials.get("channelId") or credentials.get("channel_id"),
                "expires_at": account.get("expires_at") or credentials.get("expiresAt"),
                "account_id": account.get("account_id"),
                "account_name": account.get("account_name"),
                "username": account.get("username"),
                # TikTok open_id from credentials_encrypted
                "open_id": credentials.get("openId") or credentials.get("open_id"),
                # Include all other credentials
                **credentials
            }
            
        except Exception as e:
            logger.error(f"Error fetching credentials for {platform}: {e}")
            return None
    
    async def refresh_token_if_needed(
        self,
        user_id: str,
        workspace_id: str,
        platform: str,
        credentials: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Refresh token if expired (platform-specific implementation).
        
        Returns updated credentials or None if refresh failed.
        """
        # This would need platform-specific refresh logic
        # For now, return credentials as-is
        return credentials


# Singleton instance
_credentials_service = None


def get_credentials_service() -> CredentialsService:
    """
    Get credentials service singleton.
    
    Returns:
        CredentialsService instance
    """
    global _credentials_service
    
    if _credentials_service is None:
        _credentials_service = CredentialsService()
    
    return _credentials_service


# =============================================================================
# OPTIONAL: USER WITH WORKSPACE VALIDATION
# =============================================================================

async def get_current_user_with_workspace(
    workspace_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get current user and validate workspace access.
    
    Args:
        workspace_id: Workspace ID to validate
        current_user: Current authenticated user
        
    Returns:
        User dict with workspace_id added
        
    Raises:
        HTTPException: If user doesn't have access to workspace
    """
    user_id = current_user.get("id") or current_user.get("sub")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token"
        )
    
    # TODO: Add workspace access validation if needed
    # For now, just return user with workspace_id
    
    return {
        **current_user,
        "workspace_id": workspace_id
    }
