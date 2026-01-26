"""
Token Refresh Service - On-Demand Pattern
Production-ready lazy token refresh for all social platforms.

This service follows the on-demand/lazy refresh pattern:
- Tokens are refreshed ONLY when they are about to be used and are expired
- No cron jobs required
- More efficient - unused accounts never make refresh API calls
- Works seamlessly in serverless environments

Supports: Twitter/X, Facebook, Instagram, LinkedIn, TikTok, YouTube

Based on Dec 2025 platform API documentation:
- Twitter: POST https://api.twitter.com/2/oauth2/token
- Facebook: GET https://graph.facebook.com/v24.0/oauth/access_token
- Instagram: GET https://graph.instagram.com/refresh_access_token
- LinkedIn: POST https://www.linkedin.com/oauth/v2/accessToken
- TikTok: POST https://open.tiktokapis.com/v2/oauth/token/
- YouTube: POST https://oauth2.googleapis.com/token
"""
import base64
import httpx
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum

from ..config import settings
from .supabase_service import db_select, db_update, get_supabase_client

logger = logging.getLogger(__name__)


class RefreshErrorType(Enum):
    """Token refresh error types"""
    NETWORK_ERROR = "network_error"           # Transient, retry
    RATE_LIMITED = "rate_limited"             # Transient, retry later
    INVALID_TOKEN = "invalid_token"           # Permanent, needs re-auth
    EXPIRED_TOKEN = "expired_token"           # Permanent, needs re-auth
    INVALID_CREDENTIALS = "invalid_credentials"  # Config issue
    NO_REFRESH_TOKEN = "no_refresh_token"     # Can't refresh
    UNKNOWN = "unknown"


@dataclass
class CredentialsResult:
    """Result of getting valid credentials"""
    success: bool
    credentials: Optional[dict] = None
    was_refreshed: bool = False
    error: Optional[str] = None
    error_type: Optional[RefreshErrorType] = None
    needs_reconnect: bool = False  # True if user must re-authenticate


class TokenRefreshService:
    """
    Production-ready on-demand token refresh service.
    
    Usage:
        result = await token_refresh_service.get_valid_credentials(
            platform="twitter",
            workspace_id="...",
            account_id="..."
        )
        if result.success:
            # Use result.credentials for API calls
            access_token = result.credentials["accessToken"]
        else:
            if result.needs_reconnect:
                # Redirect user to reconnect
            else:
                # Handle error
    """
    
    # Token lifetime defaults (in seconds) based on Dec 2025 documentation
    TOKEN_LIFETIMES = {
        "twitter": 7200,       # 2 hours
        "facebook": 5184000,   # 60 days
        "instagram": 5184000,  # 60 days
        "linkedin": 5184000,   # 60 days
        "tiktok": 86400,       # 24 hours
        "youtube": 3600,       # 1 hour
    }
    
    # Refresh buffer - refresh tokens this many seconds before actual expiry
    REFRESH_BUFFER_SECONDS = 300  # 5 minutes
    
    # API endpoints for token refresh
    REFRESH_ENDPOINTS = {
        "twitter": "https://api.twitter.com/2/oauth2/token",
        "facebook": "https://graph.facebook.com/v24.0/oauth/access_token",
        "instagram": "https://graph.instagram.com/refresh_access_token",
        "linkedin": "https://www.linkedin.com/oauth/v2/accessToken",
        "tiktok": "https://open.tiktokapis.com/v2/oauth/token/",
        "youtube": "https://oauth2.googleapis.com/token",
    }
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()
    
    # =========================================================================
    # MAIN PUBLIC METHOD - ON-DEMAND REFRESH
    # =========================================================================
    
    async def get_valid_credentials(
        self,
        platform: str,
        workspace_id: str,
        account_id: Optional[str] = None
    ) -> CredentialsResult:
        """
        Get valid credentials for a platform, refreshing if needed.
        
        This is the primary method to use for all API calls. It:
        1. Fetches credentials from database
        2. Checks if token is expired or about to expire
        3. If expired, attempts to refresh using the refresh token
        4. Updates database with new tokens if refreshed
        5. Returns valid credentials ready for API use
        
        Args:
            platform: Platform name (twitter, facebook, etc.)
            workspace_id: Workspace UUID
            account_id: Optional specific account ID (uses first if not specified)
            
        Returns:
            CredentialsResult with valid credentials or error info
        """
        try:
            # Fetch account from database
            supabase = get_supabase_client()
            
            query = supabase.table("social_accounts").select(
                "id, account_id, account_name, credentials_encrypted, expires_at, is_connected, refresh_error_count"
            ).eq("workspace_id", workspace_id).eq("platform", platform).eq("is_connected", True)
            
            if account_id:
                query = query.eq("account_id", account_id)
            
            response = query.limit(1).execute()
            
            if not response.data:
                return CredentialsResult(
                    success=False,
                    error=f"No connected {platform} account found",
                    error_type=RefreshErrorType.INVALID_TOKEN,
                    needs_reconnect=True
                )
            
            account = response.data[0]
            credentials = account.get("credentials_encrypted", {})
            if isinstance(credentials, str):
                try:
                    from .credentials.credential_encryption import CredentialEncryption
                    credentials = CredentialEncryption.decrypt(credentials, workspace_id) or {}
                except Exception:
                    credentials = {}
            db_id = account["id"]
            
            if not credentials:
                return CredentialsResult(
                    success=False,
                    error="No credentials stored",
                    error_type=RefreshErrorType.INVALID_TOKEN,
                    needs_reconnect=True
                )
            
            # Check if token needs refresh
            needs_refresh = self._token_needs_refresh(account.get("expires_at"))
            
            if not needs_refresh:
                # Token is still valid
                return CredentialsResult(
                    success=True,
                    credentials=credentials,
                    was_refreshed=False
                )
            
            # Token expired or expiring - attempt refresh
            logger.info(f"Token expired for {platform}/{account['account_id']}, attempting refresh...")
            
            # Check if we can refresh
            if not self._can_refresh(platform, credentials):
                return CredentialsResult(
                    success=False,
                    error="Token expired and no refresh capability",
                    error_type=RefreshErrorType.NO_REFRESH_TOKEN,
                    needs_reconnect=True
                )
            
            # Perform refresh
            refresh_result = await self._refresh_platform_token(platform, credentials)
            
            if refresh_result["success"]:
                # Update credentials with new tokens
                new_credentials = credentials.copy()
                new_credentials["accessToken"] = refresh_result["access_token"]
                
                if refresh_result.get("refresh_token"):
                    new_credentials["refreshToken"] = refresh_result["refresh_token"]
                
                if refresh_result.get("expires_at"):
                    new_credentials["expiresAt"] = refresh_result["expires_at"].isoformat()
                
                # For Facebook, also update userAccessToken
                if platform == "facebook" and refresh_result.get("user_token"):
                    new_credentials["userAccessToken"] = refresh_result["user_token"]
                
                # Save to database
                await self._update_credentials_after_refresh(
                    db_id=db_id,
                    new_credentials=new_credentials,
                    expires_at=refresh_result.get("expires_at")
                )
                
                logger.info(f"Successfully refreshed {platform} token for account {account['account_id']}")
                
                return CredentialsResult(
                    success=True,
                    credentials=new_credentials,
                    was_refreshed=True
                )
            else:
                # Refresh failed
                await self._update_error_count(db_id, refresh_result.get("error", "Unknown error"))
                
                return CredentialsResult(
                    success=False,
                    error=refresh_result.get("error", "Token refresh failed"),
                    error_type=RefreshErrorType(refresh_result.get("error_type", "unknown")),
                    needs_reconnect=refresh_result.get("needs_reconnect", False)
                )
                
        except Exception as e:
            logger.error(f"Error getting valid credentials for {platform}: {e}", exc_info=True)
            return CredentialsResult(
                success=False,
                error=str(e),
                error_type=RefreshErrorType.UNKNOWN
            )
    
    # =========================================================================
    # TOKEN EXPIRY CHECK
    # =========================================================================
    
    def _token_needs_refresh(self, expires_at_str: Optional[str]) -> bool:
        """Check if token needs to be refreshed"""
        if not expires_at_str:
            # No expiry set - assume token is valid
            # (Some platforms don't return expires_in)
            return False
        
        try:
            # Parse expiry timestamp
            if expires_at_str.endswith("Z"):
                expires_at_str = expires_at_str.replace("Z", "+00:00")
            expires_at = datetime.fromisoformat(expires_at_str)
            
            # Check if expired or about to expire (with buffer)
            now = datetime.now(timezone.utc)
            buffer = timedelta(seconds=self.REFRESH_BUFFER_SECONDS)
            
            return now >= (expires_at - buffer)
            
        except Exception as e:
            logger.warning(f"Error parsing expires_at: {e}")
            return False  # Don't refresh if we can't parse
    
    def _can_refresh(self, platform: str, credentials: dict) -> bool:
        """Check if we can refresh this platform's token"""
        if platform in ["twitter", "linkedin", "tiktok", "youtube"]:
            # These require refresh tokens
            return bool(credentials.get("refreshToken") or credentials.get("refresh_token"))
        elif platform in ["facebook", "instagram"]:
            # These use the access token to refresh
            return bool(credentials.get("accessToken") or credentials.get("userAccessToken"))
        return False
    
    # =========================================================================
    # PLATFORM-SPECIFIC REFRESH IMPLEMENTATIONS
    # =========================================================================
    
    async def _refresh_platform_token(self, platform: str, credentials: dict) -> dict:
        """Route to platform-specific refresh method"""
        refresh_methods = {
            "twitter": self._refresh_twitter,
            "facebook": self._refresh_facebook,
            "instagram": self._refresh_instagram,
            "linkedin": self._refresh_linkedin,
            "tiktok": self._refresh_tiktok,
            "youtube": self._refresh_youtube,
        }
        
        method = refresh_methods.get(platform)
        if not method:
            return {
                "success": False,
                "error": f"Unknown platform: {platform}",
                "error_type": "unknown"
            }
        
        return await method(credentials)
    
    async def _refresh_twitter(self, credentials: dict) -> dict:
        """Refresh Twitter/X OAuth 2.0 token"""
        refresh_token = credentials.get("refreshToken") or credentials.get("refresh_token")
        if not refresh_token:
            return {"success": False, "error": "No refresh token", "error_type": "no_refresh_token", "needs_reconnect": True}
        
        client_id = settings.TWITTER_CLIENT_ID
        client_secret = settings.TWITTER_CLIENT_SECRET
        
        if not client_id or not client_secret:
            return {"success": False, "error": "Twitter credentials not configured", "error_type": "invalid_credentials"}
        
        auth_string = f"{client_id}:{client_secret}"
        auth_bytes = base64.b64encode(auth_string.encode()).decode()
        
        try:
            response = await self.http_client.post(
                self.REFRESH_ENDPOINTS["twitter"],
                headers={
                    "Authorization": f"Basic {auth_bytes}",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                expires_in = data.get("expires_in", self.TOKEN_LIFETIMES["twitter"])
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                
                return {
                    "success": True,
                    "access_token": data["access_token"],
                    "refresh_token": data.get("refresh_token"),  # Twitter rotates!
                    "expires_at": expires_at
                }
            else:
                error_data = response.json() if response.content else {}
                needs_reconnect = response.status_code in [400, 401]
                return {
                    "success": False,
                    "error": error_data.get("error_description", "Token refresh failed"),
                    "error_type": "invalid_token" if needs_reconnect else "network_error",
                    "needs_reconnect": needs_reconnect
                }
        except httpx.RequestError as e:
            return {"success": False, "error": str(e), "error_type": "network_error"}
    
    async def _refresh_facebook(self, credentials: dict) -> dict:
        """Refresh Facebook long-lived token"""
        access_token = credentials.get("userAccessToken") or credentials.get("accessToken")
        if not access_token:
            return {"success": False, "error": "No access token", "error_type": "invalid_token", "needs_reconnect": True}
        
        client_id = settings.FACEBOOK_CLIENT_ID
        client_secret = settings.FACEBOOK_CLIENT_SECRET
        
        if not client_id or not client_secret:
            return {"success": False, "error": "Facebook credentials not configured", "error_type": "invalid_credentials"}
        
        try:
            response = await self.http_client.get(
                self.REFRESH_ENDPOINTS["facebook"],
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "fb_exchange_token": access_token
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                new_user_token = data["access_token"]
                expires_in = data.get("expires_in", self.TOKEN_LIFETIMES["facebook"])
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                
                # Also get new page token if page_id exists
                page_id = credentials.get("pageId")
                new_page_token = None
                if page_id:
                    new_page_token = await self._get_facebook_page_token(new_user_token, page_id)
                
                return {
                    "success": True,
                    "access_token": new_page_token or new_user_token,
                    "user_token": new_user_token,
                    "expires_at": expires_at
                }
            else:
                error_data = response.json() if response.content else {}
                error_code = error_data.get("error", {}).get("code")
                needs_reconnect = error_code in [190, 102]
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Token refresh failed"),
                    "error_type": "expired_token" if needs_reconnect else "network_error",
                    "needs_reconnect": needs_reconnect
                }
        except httpx.RequestError as e:
            return {"success": False, "error": str(e), "error_type": "network_error"}
    
    async def _get_facebook_page_token(self, user_token: str, page_id: str) -> Optional[str]:
        """Get new page access token after user token refresh"""
        try:
            response = await self.http_client.get(
                f"https://graph.facebook.com/v24.0/{page_id}",
                params={"fields": "access_token", "access_token": user_token}
            )
            if response.status_code == 200:
                return response.json().get("access_token")
        except Exception as e:
            logger.warning(f"Failed to refresh Facebook page token: {e}")
        return None
    
    async def _refresh_instagram(self, credentials: dict) -> dict:
        """Refresh Instagram long-lived token"""
        access_token = credentials.get("accessToken")
        if not access_token:
            return {"success": False, "error": "No access token", "error_type": "invalid_token", "needs_reconnect": True}
        
        try:
            response = await self.http_client.get(
                self.REFRESH_ENDPOINTS["instagram"],
                params={"grant_type": "ig_refresh_token", "access_token": access_token}
            )
            
            if response.status_code == 200:
                data = response.json()
                expires_in = data.get("expires_in", self.TOKEN_LIFETIMES["instagram"])
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                
                return {
                    "success": True,
                    "access_token": data["access_token"],
                    "expires_at": expires_at
                }
            else:
                error_data = response.json() if response.content else {}
                error_code = error_data.get("error", {}).get("code")
                needs_reconnect = error_code in [190, 102, 10]
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Token refresh failed"),
                    "error_type": "expired_token" if needs_reconnect else "network_error",
                    "needs_reconnect": needs_reconnect
                }
        except httpx.RequestError as e:
            return {"success": False, "error": str(e), "error_type": "network_error"}
    
    async def _refresh_linkedin(self, credentials: dict) -> dict:
        """Refresh LinkedIn OAuth 2.0 token"""
        refresh_token = credentials.get("refreshToken") or credentials.get("refresh_token")
        if not refresh_token:
            return {"success": False, "error": "No refresh token", "error_type": "no_refresh_token", "needs_reconnect": True}
        
        client_id = settings.LINKEDIN_CLIENT_ID
        client_secret = settings.LINKEDIN_CLIENT_SECRET
        
        if not client_id or not client_secret:
            return {"success": False, "error": "LinkedIn credentials not configured", "error_type": "invalid_credentials"}
        
        try:
            response = await self.http_client.post(
                self.REFRESH_ENDPOINTS["linkedin"],
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                expires_in = data.get("expires_in", self.TOKEN_LIFETIMES["linkedin"])
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                
                return {
                    "success": True,
                    "access_token": data["access_token"],
                    "refresh_token": data.get("refresh_token"),
                    "expires_at": expires_at
                }
            else:
                error_data = response.json() if response.content else {}
                needs_reconnect = "invalid" in str(error_data).lower() or response.status_code == 401
                return {
                    "success": False,
                    "error": error_data.get("error_description", "Token refresh failed"),
                    "error_type": "invalid_token" if needs_reconnect else "network_error",
                    "needs_reconnect": needs_reconnect
                }
        except httpx.RequestError as e:
            return {"success": False, "error": str(e), "error_type": "network_error"}
    
    async def _refresh_tiktok(self, credentials: dict) -> dict:
        """Refresh TikTok OAuth 2.0 token"""
        refresh_token = credentials.get("refreshToken")
        if not refresh_token:
            return {"success": False, "error": "No refresh token", "error_type": "no_refresh_token", "needs_reconnect": True}
        
        client_key = settings.TIKTOK_CLIENT_ID
        client_secret = settings.TIKTOK_CLIENT_SECRET
        
        if not client_key or not client_secret:
            return {"success": False, "error": "TikTok credentials not configured", "error_type": "invalid_credentials"}
        
        try:
            response = await self.http_client.post(
                self.REFRESH_ENDPOINTS["tiktok"],
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_key": client_key,
                    "client_secret": client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                token_data = data.get("data", data)
                expires_in = token_data.get("expires_in", self.TOKEN_LIFETIMES["tiktok"])
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                
                return {
                    "success": True,
                    "access_token": token_data["access_token"],
                    "refresh_token": token_data.get("refresh_token"),
                    "expires_at": expires_at
                }
            else:
                needs_reconnect = response.status_code in [400, 401]
                return {
                    "success": False,
                    "error": "Token refresh failed",
                    "error_type": "invalid_token" if needs_reconnect else "network_error",
                    "needs_reconnect": needs_reconnect
                }
        except httpx.RequestError as e:
            return {"success": False, "error": str(e), "error_type": "network_error"}
    
    async def _refresh_youtube(self, credentials: dict) -> dict:
        """Refresh YouTube/Google OAuth 2.0 token"""
        refresh_token = credentials.get("refreshToken") or credentials.get("refresh_token")
        if not refresh_token:
            return {"success": False, "error": "No refresh token", "error_type": "no_refresh_token", "needs_reconnect": True}
        
        client_id = settings.YOUTUBE_CLIENT_ID
        client_secret = settings.YOUTUBE_CLIENT_SECRET
        
        if not client_id or not client_secret:
            return {"success": False, "error": "YouTube credentials not configured", "error_type": "invalid_credentials"}
        
        try:
            response = await self.http_client.post(
                self.REFRESH_ENDPOINTS["youtube"],
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                expires_in = data.get("expires_in", self.TOKEN_LIFETIMES["youtube"])
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                
                return {
                    "success": True,
                    "access_token": data["access_token"],
                    "expires_at": expires_at
                }
            else:
                error_data = response.json() if response.content else {}
                needs_reconnect = "invalid_grant" in str(error_data)
                return {
                    "success": False,
                    "error": error_data.get("error_description", "Token refresh failed"),
                    "error_type": "invalid_token" if needs_reconnect else "network_error",
                    "needs_reconnect": needs_reconnect
                }
        except httpx.RequestError as e:
            return {"success": False, "error": str(e), "error_type": "network_error"}
    
    # =========================================================================
    # DATABASE HELPERS
    # =========================================================================
    
    async def _update_credentials_after_refresh(
        self,
        db_id: str,
        new_credentials: dict,
        expires_at: Optional[datetime]
    ) -> None:
        """Update database after successful refresh"""
        try:
            now = datetime.now(timezone.utc)
            supabase = get_supabase_client()
            
            update_data = {
                "credentials_encrypted": new_credentials,
                "last_refreshed_at": now.isoformat(),
                "refresh_error_count": 0,
                "last_error_message": None,
                "updated_at": now.isoformat()
            }
            
            if expires_at:
                update_data["expires_at"] = expires_at.isoformat()
            
            supabase.table("social_accounts").update(
                update_data
            ).filter("id", "eq", db_id).execute()
            
        except Exception as e:
            logger.error(f"Error updating credentials after refresh: {e}")
    
    async def _update_error_count(self, db_id: str, error_message: str) -> None:
        """Update error tracking after failed refresh"""
        try:
            now = datetime.now(timezone.utc)
            supabase = get_supabase_client()
            
            # Get current error count
            current = supabase.table("social_accounts").select(
                "refresh_error_count"
            ).filter("id", "eq", db_id).single().execute()
            
            error_count = (current.data.get("refresh_error_count", 0) if current.data else 0) + 1
            
            update_data = {
                "refresh_error_count": error_count,
                "last_error_message": error_message,
                "updated_at": now.isoformat()
            }
            
            # Disconnect after 3 consecutive failures
            if error_count >= 3:
                update_data["is_connected"] = False
                logger.warning(f"Disconnected account {db_id} after 3 refresh failures")
            
            supabase.table("social_accounts").update(
                update_data
            ).filter("id", "eq", db_id).execute()
            
        except Exception as e:
            logger.error(f"Error updating error count: {e}")


# Singleton instance
token_refresh_service = TokenRefreshService()


async def close_token_refresh_service():
    """Close token refresh service"""
    await token_refresh_service.close()
