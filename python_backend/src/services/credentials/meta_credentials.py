"""
Unified Meta Credentials Service
Single source of truth for Facebook, Instagram, and Meta Ads credentials

Features:
- On-demand token refresh (only when user publishes)
- In-memory token caching
- Facebook-Instagram relationship management
- Priority-based credential retrieval (meta_ads > facebook > instagram)
- Secure encryption/decryption
"""
import logging
import httpx
import hmac
import hashlib
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime, timezone, timedelta

from ...config import settings
from .credential_cache import get_credential_cache
from .credential_storage import CredentialStorage
from .credential_encryption import CredentialEncryption
from .credential_validator import CredentialValidator

logger = logging.getLogger(__name__)

# Token expiration thresholds
TOKEN_EXPIRY_WARNING_DAYS = 7  # Warn if expires within 7 days
TOKEN_REFRESH_THRESHOLD_DAYS = 7  # Refresh if expires within 7 days (on-demand only)

# Meta API version
META_API_VERSION = "v24.0"


class MetaCredentialsService:
    """
    Unified credential management for Facebook, Instagram, and Meta Ads
    
    All services should use this single source of truth for credentials.
    Token refresh happens ONLY on-demand when user clicks publish button.
    """
    
    # =========================================================================
    # CORE CREDENTIAL RETRIEVAL
    # =========================================================================
    
    @staticmethod
    async def get_meta_credentials(
        workspace_id: str,
        refresh_if_needed: bool = False,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get Meta credentials with priority fallback
        
        Priority: meta_ads > facebook > instagram
        
        Args:
            workspace_id: Workspace ID
            refresh_if_needed: If True, refresh token if expires within 7 days (only from publish button)
            user_id: Optional user ID (for logging)
            
        Returns:
            Credentials dict with:
            - access_token: OAuth access token
            - page_id, page_name: Facebook page info
            - ig_user_id: Instagram Business Account ID (if linked)
            - account_id, account_name: Ad account info
            - expires_at: Token expiration
            - is_expired, expires_soon: Token status flags
            - source: Where credentials came from (cache/db/platform)
        """
        cache = get_credential_cache()
        
        # Step 1: Check cache first (if not refreshing)
        cached = None
        if not refresh_if_needed:
            cached = cache.get(workspace_id)
            if cached:
                logger.info(f"Using cached credentials for workspace {workspace_id}")
                return cached
        
        # Step 2: Fetch from database
        db_result = CredentialStorage.get_credentials_from_db(workspace_id)
        
        if not db_result:
            logger.warning(f"No credentials found for workspace {workspace_id}")
            return None
        
        credentials_data = db_result["credentials"]
        platform = db_result["platform"]
        page_id = db_result.get("page_id")
        page_name = db_result.get("page_name")
        account_id = (
            credentials_data.get("adAccountId")
            or credentials_data.get("account_id")
            or db_result.get("account_id")
        )
        account_name = (
            credentials_data.get("adAccountName")
            or credentials_data.get("account_name")
            or db_result.get("account_name")
        )
        username = db_result.get("username")
        expires_at = db_result.get("expires_at")
        
        access_token = credentials_data.get("accessToken") or credentials_data.get("access_token")
        if not access_token:
            logger.warning(f"No access token in credentials for workspace {workspace_id}")
            return None
        
        # Step 3: Check token expiration
        is_expired, expires_soon = MetaCredentialsService._check_token_expiration(expires_at)
        
        if is_expired:
            logger.warning(f"Token expired for workspace {workspace_id}, platform {platform}")
            return None
        
        # Step 4: On-demand token refresh (only if requested and expires soon)
        if refresh_if_needed and expires_soon:
            logger.info(f"Token expires soon for workspace {workspace_id}, refreshing...")
            refresh_result = await MetaCredentialsService._refresh_token_if_needed(
                workspace_id, access_token, expires_at
            )
            
            if refresh_result.get("success"):
                # Update credentials with new token
                access_token = refresh_result["access_token"]
                expires_at = refresh_result["expires_at"]
                
                # Update in database
                CredentialStorage.update_token(
                    workspace_id,
                    access_token,
                    datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                )
                
                # Update credentials data
                credentials_data["accessToken"] = access_token
                credentials_data["expiresAt"] = expires_at
                
                # Re-check expiration
                is_expired, expires_soon = MetaCredentialsService._check_token_expiration(expires_at)
            else:
                logger.warning(f"Token refresh failed: {refresh_result.get('error')}")
        
        # Step 5: Get Instagram Business Account ID if Facebook page exists
        ig_user_id = credentials_data.get("igUserId") or credentials_data.get("ig_user_id")
        if not ig_user_id and page_id:
            ig_user_id = await MetaCredentialsService._get_instagram_from_facebook_page(
                page_id, access_token
            )
            if ig_user_id:
                credentials_data["igUserId"] = ig_user_id
        
        # Step 6: Build result
        result = {
            "access_token": access_token,
            "user_access_token": credentials_data.get("userAccessToken") or credentials_data.get("user_access_token"),
            "page_id": page_id,
            "page_name": page_name,
            "page_access_token": credentials_data.get("pageAccessToken") or credentials_data.get("page_access_token") or access_token,
            "ig_user_id": ig_user_id,
            "username": username,
            "expires_at": expires_at,
            "is_expired": is_expired,
            "expires_soon": expires_soon,
            "account_id": account_id,
            "account_name": account_name,
            "currency": credentials_data.get("currency"),
            "timezone": credentials_data.get("timezone"),
            "business_id": credentials_data.get("businessId") or credentials_data.get("business_id"),
            "business_name": credentials_data.get("businessName") or credentials_data.get("business_name"),
            "platform": platform,
            "source": "cache" if cached else f"db:{platform}",
        }
        
        # Step 7: Cache the result
        cache.set(workspace_id, result)
        
        return result
    
    # =========================================================================
    # TOKEN REFRESH (On-Demand Only)
    # =========================================================================
    
    @staticmethod
    async def _refresh_token_if_needed(
        workspace_id: str,
        access_token: str,
        expires_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Refresh token if expires within 7 days (on-demand only)
        
        Args:
            workspace_id: Workspace ID
            access_token: Current access token
            expires_at: Current expiration timestamp
            
        Returns:
            Dict with refresh result
        """
        try:
            # Check if refresh is needed
            if expires_at:
                expiry_date = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                days_until_expiry = (expiry_date - datetime.now(timezone.utc)).days
                
                if days_until_expiry > TOKEN_REFRESH_THRESHOLD_DAYS:
                    return {
                        "success": True,
                        "access_token": access_token,
                        "expires_at": expires_at,
                        "message": "Token still valid, no refresh needed"
                    }
            
            app_id = settings.FACEBOOK_APP_ID
            app_secret = settings.FACEBOOK_APP_SECRET
            
            if not app_id or not app_secret:
                return {"success": False, "error": "App credentials not configured"}
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"https://graph.facebook.com/{META_API_VERSION}/oauth/access_token",
                    params={
                        "grant_type": "fb_exchange_token",
                        "client_id": app_id,
                        "client_secret": app_secret,
                        "fb_exchange_token": access_token
                    }
                )
                
                if response.is_success:
                    data = response.json()
                    new_token = data.get("access_token")
                    expires_in = data.get("expires_in", 5184000)  # Default 60 days
                    
                    expires_at_new = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                    
                    logger.info(f"Token refreshed successfully for workspace {workspace_id}")
                    
                    return {
                        "success": True,
                        "access_token": new_token,
                        "expires_in": expires_in,
                        "expires_at": expires_at_new.isoformat(),
                        "token_type": data.get("token_type", "bearer")
                    }
                else:
                    error_data = response.json() if response.content else {}
                    error_msg = error_data.get("error", {}).get("message", "Token refresh failed")
                    logger.error(f"Token refresh failed: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg
                    }
                    
        except Exception as e:
            logger.error(f"Error refreshing token: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    # =========================================================================
    # FACEBOOK-INSTAGRAM RELATIONSHIP
    # =========================================================================
    
    @staticmethod
    async def _get_instagram_from_facebook_page(
        page_id: str,
        access_token: str
    ) -> Optional[str]:
        """
        Get Instagram Business Account ID linked to Facebook Page
        
        Args:
            page_id: Facebook Page ID
            access_token: Page access token
            
        Returns:
            Instagram Business Account ID or None
        """
        try:
            from ..platforms.ig_service import InstagramService
            
            ig_service = InstagramService(access_token)
            result = await ig_service.get_instagram_account(page_id)
            
            if result and result.get("success"):
                ig_account = result.get("instagram_account")
                if ig_account:
                    ig_user_id = ig_account.get("id")
                    logger.info(f"Found Instagram account {ig_user_id} for page {page_id}")
                    return ig_user_id
            
            return None
            
        except Exception as e:
            logger.warning(f"Error fetching Instagram account for page {page_id}: {e}")
            return None
    
    # =========================================================================
    # TOKEN EXPIRATION CHECKING
    # =========================================================================
    
    @staticmethod
    def _check_token_expiration(expires_at: Any) -> Tuple[bool, bool]:
        """
        Check if token is expired or expiring soon
        
        Args:
            expires_at: Expiration timestamp (string or datetime)
            
        Returns:
            Tuple of (is_expired, expires_soon)
        """
        if not expires_at:
            return False, False
        
        try:
            if isinstance(expires_at, str):
                expiry_date = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expiry_date = expires_at
            
            now = datetime.now(timezone.utc)
            days_remaining = (expiry_date - now).days
            
            is_expired = days_remaining <= 0
            expires_soon = 0 < days_remaining <= TOKEN_EXPIRY_WARNING_DAYS
            
            return is_expired, expires_soon
            
        except Exception as e:
            logger.error(f"Error checking token expiration: {e}")
            return False, False
    
    # =========================================================================
    # INSTAGRAM-SPECIFIC CREDENTIALS
    # =========================================================================
    
    @staticmethod
    async def get_instagram_credentials(
        workspace_id: str,
        refresh_if_needed: bool = False,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get credentials specifically for Instagram operations
        
        Args:
            workspace_id: Workspace ID
            refresh_if_needed: If True, refresh token if needed
            user_id: Optional user ID
            
        Returns:
            Instagram credentials dict
        """
        instagram_record = CredentialStorage.get_credentials_from_db(
            workspace_id,
            platforms=["instagram"]
        )

        if instagram_record:
            instagram_data = instagram_record.get("credentials") or {}
            access_token = instagram_data.get("accessToken") or instagram_data.get("access_token")
            ig_user_id = instagram_data.get("igUserId") or instagram_data.get("ig_user_id")
            page_id = instagram_record.get("page_id")
            page_name = instagram_record.get("page_name")
            username = instagram_record.get("username")

            if access_token:
                if not ig_user_id and page_id:
                    ig_user_id = await MetaCredentialsService._get_instagram_from_facebook_page(
                        page_id,
                        instagram_data.get("pageAccessToken")
                        or instagram_data.get("page_access_token")
                        or access_token
                    )

                if ig_user_id:
                    return {
                        "access_token": instagram_data.get("pageAccessToken")
                        or instagram_data.get("page_access_token")
                        or access_token,
                        "ig_user_id": ig_user_id,
                        "page_id": page_id,
                        "page_name": page_name,
                        "username": username,
                        "expires_at": instagram_record.get("expires_at"),
                        "is_expired": False,
                    }

        credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id, refresh_if_needed, user_id
        )
        
        if not credentials:
            return None
        
        ig_user_id = credentials.get("ig_user_id")
        
        # If no IG user ID but have page ID, try to fetch it
        if not ig_user_id and credentials.get("page_id"):
            ig_user_id = await MetaCredentialsService._get_instagram_from_facebook_page(
                credentials["page_id"],
                credentials.get("page_access_token") or credentials["access_token"]
            )
        
        return {
            "access_token": credentials.get("page_access_token") or credentials["access_token"],
            "ig_user_id": ig_user_id,
            "page_id": credentials.get("page_id"),
            "page_name": credentials.get("page_name"),
            "username": credentials.get("username"),
            "expires_at": credentials.get("expires_at"),
            "is_expired": credentials.get("is_expired", False),
        }
    
    # =========================================================================
    # ADS-SPECIFIC CREDENTIALS
    # =========================================================================
    
    @staticmethod
    async def get_ads_credentials(
        workspace_id: str,
        refresh_if_needed: bool = False,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get credentials specifically for Meta Ads operations
        
        Uses userAccessToken for ads API calls (not Page token)
        
        Args:
            workspace_id: Workspace ID
            refresh_if_needed: If True, refresh token if needed
            user_id: Optional user ID
            
        Returns:
            Ads credentials dict
        """
        credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id, refresh_if_needed, user_id
        )
        
        if not credentials:
            return None
        
        # Use userAccessToken for ads API calls if available
        ads_token = credentials.get("user_access_token") or credentials["access_token"]
        
        return {
            "access_token": ads_token,
            "account_id": credentials.get("account_id"),
            "account_name": credentials.get("account_name"),
            "page_id": credentials.get("page_id"),
            "page_name": credentials.get("page_name"),
            "page_access_token": credentials.get("page_access_token"),
            "business_id": credentials.get("business_id"),
            "expires_at": credentials.get("expires_at"),
            "is_expired": credentials.get("is_expired", False),
            "expires_soon": credentials.get("expires_soon", False),
        }
    
    # =========================================================================
    # CONNECTION STATUS
    # =========================================================================
    
    @staticmethod
    async def get_connection_status(workspace_id: str) -> Dict[str, Any]:
        """
        Get detailed connection status for all Meta platforms
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Status dict with platform connection info
        """
        try:
            credentials = await MetaCredentialsService.get_meta_credentials(
                workspace_id, refresh_if_needed=False
            )
            
            status = {
                "facebook": {"isConnected": False},
                "instagram": {"isConnected": False},
                "metaAds": {"isConnected": False},
                "canRunAds": False,
                "canPostInstagram": False,
                "missingForAds": [],
                "tokenStatus": {}
            }
            
            if credentials:
                # Facebook status
                if credentials.get("page_id"):
                    status["facebook"] = {
                        "isConnected": True,
                        "pageId": credentials["page_id"],
                        "pageName": credentials.get("page_name"),
                        "expires_at": credentials.get("expires_at"),
                        "is_expired": credentials.get("is_expired", False),
                        "expires_soon": credentials.get("expires_soon", False),
                    }
                
                # Instagram status
                if credentials.get("ig_user_id"):
                    status["instagram"] = {
                        "isConnected": True,
                        "igUserId": credentials["ig_user_id"],
                        "username": credentials.get("username"),
                        "expires_at": credentials.get("expires_at"),
                        "is_expired": credentials.get("is_expired", False),
                        "expires_soon": credentials.get("expires_soon", False),
                    }
                    status["canPostInstagram"] = True
                
                # Meta Ads status
                if credentials.get("account_id"):
                    status["metaAds"] = {
                        "isConnected": True,
                        "adAccountId": credentials["account_id"],
                        "adAccountName": credentials.get("account_name"),
                        "expires_at": credentials.get("expires_at"),
                        "is_expired": credentials.get("is_expired", False),
                        "expires_soon": credentials.get("expires_soon", False),
                    }
                    status["canRunAds"] = True
                elif credentials.get("page_id"):
                    status["missingForAds"] = ["No Ad Account found. Please ensure your Facebook account has access to an Ad Account."]
            else:
                status["missingForAds"] = ["Connect Facebook to run ads"]
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting connection status: {e}", exc_info=True)
            return {
                "facebook": {"isConnected": False},
                "instagram": {"isConnected": False},
                "metaAds": {"isConnected": False},
                "canRunAds": False,
                "missingForAds": ["Error checking connection status"],
                "error": str(e)
            }
    
    # =========================================================================
    # CAPABILITY CHECKS
    # =========================================================================
    
    @staticmethod
    async def check_ads_capability(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Check if workspace can run Meta Ads
        
        Args:
            workspace_id: Workspace ID
            user_id: Optional user ID (for logging)
            
        Returns:
            Dict with:
            - has_ads_access: Whether workspace can run ads
            - ad_account_id, ad_account_name: Ad account info (if available)
            - page_id, page_name: Facebook page info
            - missing_permissions: List of what's missing
        """
        credentials = await MetaCredentialsService.get_ads_credentials(
            workspace_id,
            refresh_if_needed=False
        )
        
        if not credentials:
            return {
                "has_ads_access": False,
                "missing_permissions": ["No Meta platform connected"]
            }
        
        if credentials.get("account_id"):
            # Verify permissions with token validation
            token = credentials.get("access_token")
            permissions = []
            if token:
                token_info = await CredentialValidator.validate_token(token)
                if token_info.get("is_valid"):
                    permissions = token_info.get("scopes", [])
            
            required_permissions = ["ads_management", "ads_read"]
            missing = [p for p in required_permissions if p not in permissions]
            
            if missing and permissions:  # Only check if we got permissions
                return {
                    "has_ads_access": False,
                    "ad_account_id": credentials["account_id"],
                    "ad_account_name": credentials.get("account_name"),
                    "page_id": credentials.get("page_id"),
                    "page_name": credentials.get("page_name"),
                    "missing_permissions": [f"Missing permission: {p}" for p in missing]
                }
            
            return {
                "has_ads_access": True,
                "ad_account_id": credentials["account_id"],
                "ad_account_name": credentials.get("account_name"),
                "page_id": credentials.get("page_id"),
                "page_name": credentials.get("page_name"),
                "permissions": permissions,
            }
        
        # Have credentials but no ad account
        if credentials.get("page_id"):
            return {
                "has_ads_access": False,
                "page_id": credentials["page_id"],
                "page_name": credentials.get("page_name"),
                "missing_permissions": ["No Ad Account found. Please ensure your Facebook account has access to an Ad Account."]
            }
        
        return {
            "has_ads_access": False,
            "missing_permissions": ["No Facebook Page or Ad Account connected"]
        }
    
    @staticmethod
    async def check_instagram_capability(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Check if workspace can post to Instagram
        
        Args:
            workspace_id: Workspace ID
            user_id: Optional user ID (for logging)
            
        Returns:
            Dict with Instagram capability info
        """
        credentials = await MetaCredentialsService.get_instagram_credentials(
            workspace_id,
            refresh_if_needed=False
        )
        
        if not credentials:
            return {
                "has_instagram_access": False,
                "missing": ["No Instagram Business Account connected"]
            }
        
        if credentials.get("ig_user_id"):
            return {
                "has_instagram_access": True,
                "ig_user_id": credentials["ig_user_id"],
                "username": credentials.get("username"),
                "page_id": credentials.get("page_id"),
            }
        
        return {
            "has_instagram_access": False,
            "page_id": credentials.get("page_id"),
            "missing": ["No Instagram Business Account linked to Facebook Page"]
        }
    
    # =========================================================================
    # BUSINESS MANAGEMENT
    # =========================================================================
    
    @staticmethod
    async def get_available_businesses(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all available business portfolios with their ad accounts
        
        Args:
            workspace_id: Workspace ID
            user_id: Optional user ID (for logging)
            
        Returns:
            List of business dicts with ad accounts
        """
        credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id,
            refresh_if_needed=False
        )
        
        if not credentials:
            logger.warning(f"No credentials found for workspace {workspace_id}")
            return []
        
        # Use user access token for /me/businesses - page tokens don't have business access
        access_token = credentials.get("user_access_token") or credentials.get("access_token")
        if not access_token:
            logger.warning(f"No access token found in credentials for workspace {workspace_id}")
            return []
        
        try:
            # Generate appsecret_proof - required for server-side API calls
            app_secret = settings.FACEBOOK_APP_SECRET
            appsecret_proof = hmac.new(
                app_secret.encode('utf-8'),
                access_token.encode('utf-8'),
                hashlib.sha256
            ).hexdigest() if app_secret else ""
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get user's businesses
                businesses_url = f"https://graph.facebook.com/{META_API_VERSION}/me/businesses"
                params = {
                    "access_token": access_token,
                    "fields": "id,name,primary_page,created_time",
                    "appsecret_proof": appsecret_proof
                }
                
                logger.info(f"Fetching businesses from Graph API for workspace {workspace_id}")
                resp = await client.get(businesses_url, params=params)
                
                if resp.status_code != 200:
                    error_data = resp.json() if resp.content else {}
                    error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    logger.error(f"Graph API error fetching businesses: {resp.status_code} - {error_msg}")
                    
                    # If no businesses, try getting ad accounts directly from the user
                    if "does not have permission" in error_msg or resp.status_code == 403:
                        logger.info("No business access, trying direct ad accounts")
                        return await MetaCredentialsService._get_ad_accounts_direct(access_token)
                    return []
                
                data = resp.json()
                businesses = data.get("data", [])
                
                if not businesses:
                    logger.info(f"No businesses found, trying direct ad accounts for workspace {workspace_id}")
                    return await MetaCredentialsService._get_ad_accounts_direct(access_token)
                
                result = []
                for business in businesses:
                    business_id = business["id"]
                    
                    # Get ad accounts for this business
                    ad_accounts_url = f"https://graph.facebook.com/{META_API_VERSION}/{business_id}/owned_ad_accounts"
                    ad_params = {
                        "access_token": access_token,
                        "fields": "id,account_id,name,account_status,currency,timezone_name",
                        "appsecret_proof": appsecret_proof
                    }
                    
                    ad_resp = await client.get(ad_accounts_url, params=ad_params)
                    
                    ad_accounts = []
                    if ad_resp.status_code == 200:
                        ad_data = ad_resp.json()
                        ad_accounts = [
                            {
                                "id": acc.get("id"),
                                "account_id": acc.get("account_id"),
                                "name": acc.get("name"),
                                "account_status": acc.get("account_status"),
                                "currency": acc.get("currency"),
                                "timezone_name": acc.get("timezone_name")
                            }
                            for acc in ad_data.get("data", [])
                        ]
                    
                    result.append({
                        "id": business_id,
                        "name": business.get("name"),
                        "primaryPage": business.get("primary_page"),
                        "adAccounts": ad_accounts
                    })
                
                logger.info(f"Found {len(result)} businesses with ad accounts for workspace {workspace_id}")
                return result
                
        except Exception as e:
            logger.error(f"Error fetching businesses via Graph API: {e}", exc_info=True)
            return []
    
    @staticmethod
    async def _get_ad_accounts_direct(access_token: str) -> List[Dict[str, Any]]:
        """Fallback: Get ad accounts directly from user when no business access"""
        try:
            import hmac
            import hashlib
            
            app_secret = settings.FACEBOOK_APP_SECRET
            appsecret_proof = hmac.new(
                app_secret.encode('utf-8'),
                access_token.encode('utf-8'),
                hashlib.sha256
            ).hexdigest() if app_secret else ""
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = f"https://graph.facebook.com/{META_API_VERSION}/me/adaccounts"
                params = {
                    "access_token": access_token,
                    "fields": "id,account_id,name,account_status,currency,timezone_name",
                    "appsecret_proof": appsecret_proof
                }
                
                resp = await client.get(url, params=params)
                
                if resp.status_code != 200:
                    logger.error(f"Failed to get direct ad accounts: {resp.status_code}")
                    return []
                
                data = resp.json()
                ad_accounts = [
                    {
                        "id": acc.get("id"),
                        "account_id": acc.get("account_id"),
                        "name": acc.get("name"),
                        "account_status": acc.get("account_status"),
                        "currency": acc.get("currency"),
                        "timezone_name": acc.get("timezone_name")
                    }
                    for acc in data.get("data", [])
                ]
                
                if ad_accounts:
                    # Return as a "personal" pseudo-business
                    return [{
                        "id": "personal",
                        "name": "Personal Ad Accounts",
                        "adAccounts": ad_accounts
                    }]
                
                return []
                
        except Exception as e:
            logger.error(f"Error fetching direct ad accounts: {e}")
            return []
    
    @staticmethod
    async def switch_business(
        workspace_id: str,
        business_id: str,
        ad_account_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Switch to a different business portfolio and ad account
        
        Args:
            workspace_id: Workspace ID
            business_id: Business portfolio ID
            ad_account_id: Optional ad account ID (uses first if not specified)
            user_id: Optional user ID (for logging)
            
        Returns:
            Dict with success status and ad account info
        """
        try:
            credentials = await MetaCredentialsService.get_meta_credentials(
                workspace_id,
                refresh_if_needed=False
            )
            
            if not credentials:
                return {"success": False, "error": "No Meta credentials found"}
            
            access_token = credentials.get("user_access_token") or credentials.get("access_token")
            
            # Get ad accounts for the business
            businesses = await MetaCredentialsService.get_available_businesses(workspace_id, user_id)
            business = next((b for b in businesses if b["id"] == business_id), None)
            
            if not business or not business.get("adAccounts"):
                return {"success": False, "error": "No ad accounts found for this business"}
            
            # Use specified ad account or first available
            selected_account = None
            if ad_account_id:
                selected_account = next(
                    (acc for acc in business["adAccounts"] if acc.get("account_id") == ad_account_id or acc.get("id") == f"act_{ad_account_id}"),
                    None
                )
            
            if not selected_account:
                selected_account = business["adAccounts"][0]
            
            # Update credentials in database
            from ..supabase_service import get_supabase_admin_client
            client = get_supabase_admin_client()
            
            # Find the social account record
            result = client.table("social_accounts").select("id").eq(
                "workspace_id", workspace_id
            ).in_("platform", ["facebook", "instagram", "meta_ads"]).limit(1).execute()
            
            if result.data:
                account_id = selected_account.get("account_id") or selected_account.get("id", "").replace("act_", "")
                client.table("social_accounts").update({
                    "account_id": account_id,
                    "account_name": selected_account.get("name"),
                    "business_id": business_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", result.data[0]["id"]).execute()
            
            # Invalidate cache
            cache = get_credential_cache()
            cache.invalidate(workspace_id)
            
            return {
                "success": True,
                "businessId": business_id,
                "adAccount": selected_account
            }
            
        except Exception as e:
            logger.error(f"Error switching business: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def get_token_permissions(access_token: str) -> List[str]:
        """
        Get list of permissions granted to access token
        
        Args:
            access_token: Access token to check
            
        Returns:
            List of permission strings
        """
        token_info = await CredentialValidator.validate_token(access_token)
        return token_info.get("scopes", [])
