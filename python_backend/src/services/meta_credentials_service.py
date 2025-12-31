"""
Meta Credentials Service
Production-ready credential management for Meta APIs using Business SDK

Handles:
- Credential retrieval from social_accounts (priority: meta_ads > facebook > instagram)
- Token validation using SDK (debug_token API)
- Token refresh (long-lived token exchange)
- Credential encryption/decryption
- Ad account capability verification
- Business portfolio management
"""
import logging
import json
import base64
import hmac
import hashlib
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet

from ..services.supabase_service import get_supabase_admin_client
from ..services.meta_sdk_client import create_meta_sdk_client, MetaSDKError
from ..config import settings

logger = logging.getLogger(__name__)

# Token is considered expiring soon if less than 7 days remain
TOKEN_EXPIRY_WARNING_DAYS = 7

# Token refresh threshold (days before expiration to trigger refresh)
TOKEN_REFRESH_THRESHOLD_DAYS = 14


class MetaCredentialsService:
    """
    Unified credential management for Facebook, Instagram, and Meta Ads
    
    Uses Meta Business SDK for token validation and operations.
    Priority: meta_ads > facebook > instagram
    """
    
    # =========================================================================
    # CREDENTIAL RETRIEVAL
    # =========================================================================
    
    @staticmethod
    async def get_meta_credentials(
        workspace_id: str,
        user_id: Optional[str] = None,
        validate_token: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Get Meta credentials from any connected Meta platform
        Priority: meta_ads > facebook > instagram
        
        Args:
            workspace_id: Workspace ID
            user_id: Optional user ID
            validate_token: If True, validate token with Meta API
        
        Returns credentials dict with:
        - access_token: OAuth access token
        - user_access_token: User token for ads API (if available)
        - page_id, page_name: Facebook page info
        - account_id, account_name: Ad account info
        - expires_at: Token expiration
        - is_expired, expires_soon: Token status flags
        - token_info: Detailed token info (if validated)
        """
        try:
            client = get_supabase_admin_client()
            platforms = ["meta_ads", "facebook", "instagram"]
            
            for platform in platforms:
                result = client.table("social_accounts").select(
                    "id, platform, credentials_encrypted, page_id, page_name, "
                    "account_id, account_name, username, expires_at, access_token_expires_at, "
                    "ig_user_id, business_id"
                ).eq("workspace_id", workspace_id).eq("platform", platform).maybe_single().execute()
                
                if not result.data or not result.data.get("credentials_encrypted"):
                    continue
                
                # Decrypt credentials
                try:
                    credentials = MetaCredentialsService._decrypt_credentials(
                        result.data["credentials_encrypted"],
                        workspace_id
                    )
                    
                    if not credentials or not credentials.get("accessToken"):
                        continue
                    
                    access_token = credentials.get("accessToken")
                    
                    # Check token expiration
                    expires_at = result.data.get("expires_at") or result.data.get("access_token_expires_at")
                    is_expired, expires_soon = MetaCredentialsService._check_token_expiration(expires_at)
                    
                    if is_expired:
                        logger.warning(f"Token expired for platform {platform}, trying next")
                        continue
                    
                    # Optional: Validate token with Meta API
                    token_info = None
                    if validate_token:
                        token_info = await MetaCredentialsService.validate_access_token(access_token)
                        if not token_info.get("is_valid"):
                            logger.warning(f"Token invalid for platform {platform}: {token_info.get('error')}")
                            continue
                    
                    return {
                        "access_token": access_token,
                        "user_access_token": credentials.get("userAccessToken"),
                        "page_id": result.data.get("page_id") or credentials.get("pageId"),
                        "page_name": result.data.get("page_name") or credentials.get("pageName"),
                        "page_access_token": credentials.get("pageAccessToken"),
                        "account_id": result.data.get("account_id") or credentials.get("adAccountId"),
                        "account_name": result.data.get("account_name") or credentials.get("adAccountName"),
                        "ig_user_id": result.data.get("ig_user_id") or credentials.get("igUserId"),
                        "username": result.data.get("username") or credentials.get("username"),
                        "expires_at": str(expires_at) if expires_at else None,
                        "is_expired": is_expired,
                        "expires_soon": expires_soon,
                        "currency": credentials.get("currency"),
                        "timezone": credentials.get("timezone"),
                        "business_id": result.data.get("business_id") or credentials.get("businessId"),
                        "business_name": credentials.get("businessName"),
                        "platform": platform,
                        "social_account_id": result.data.get("id"),
                        "token_info": token_info,
                    }
                except Exception as decrypt_error:
                    logger.error(f"Failed to decrypt credentials for {platform}: {decrypt_error}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting Meta credentials: {e}")
            return None
    
    # =========================================================================
    # TOKEN VALIDATION (Using SDK)
    # =========================================================================
    
    @staticmethod
    async def validate_access_token(access_token: str) -> Dict[str, Any]:
        """
        Validate access token using Meta's debug_token API via SDK
        
        Returns:
            Dict with token info:
            - is_valid: Whether token is valid
            - app_id: App the token belongs to
            - user_id: User ID
            - expires_at: Expiration timestamp
            - scopes: List of granted permissions
            - error: Error message (if invalid)
        """
        try:
            import httpx
            
            app_id = settings.FACEBOOK_APP_ID
            app_secret = settings.FACEBOOK_APP_SECRET
            
            if not app_id or not app_secret:
                return {"is_valid": False, "error": "App credentials not configured"}
            
            # Generate app access token
            app_access_token = f"{app_id}|{app_secret}"
            
            async with httpx.AsyncClient() as client:
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
                        return {
                            "is_valid": True,
                            "app_id": data.get("app_id"),
                            "user_id": data.get("user_id"),
                            "expires_at": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat() if expires_at else None,
                            "scopes": data.get("scopes", []),
                            "type": data.get("type"),
                            "issued_at": data.get("issued_at"),
                        }
                    else:
                        error = data.get("error", {})
                        return {
                            "is_valid": False,
                            "error": error.get("message", "Token is invalid"),
                            "error_code": error.get("code"),
                        }
                else:
                    return {"is_valid": False, "error": "Failed to validate token"}
                    
        except Exception as e:
            logger.error(f"Error validating token: {e}")
            return {"is_valid": False, "error": str(e)}
    
    @staticmethod
    async def get_token_permissions(access_token: str) -> List[str]:
        """Get list of permissions granted to access token"""
        token_info = await MetaCredentialsService.validate_access_token(access_token)
        return token_info.get("scopes", [])
    
    # =========================================================================
    # TOKEN REFRESH (Long-lived token exchange)
    # =========================================================================
    
    @staticmethod
    async def refresh_access_token(
        access_token: str,
        workspace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Exchange short-lived token for long-lived token (60 days)
        
        Args:
            access_token: Current access token
            workspace_id: If provided, updates credentials in database
            
        Returns:
            Dict with new token info or error
        """
        try:
            import httpx
            
            app_id = settings.FACEBOOK_APP_ID
            app_secret = settings.FACEBOOK_APP_SECRET
            
            if not app_id or not app_secret:
                return {"success": False, "error": "App credentials not configured"}
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://graph.facebook.com/v24.0/oauth/access_token",
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
                    
                    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                    
                    result = {
                        "success": True,
                        "access_token": new_token,
                        "expires_in": expires_in,
                        "expires_at": expires_at.isoformat(),
                        "token_type": data.get("token_type", "bearer")
                    }
                    
                    # Update in database if workspace_id provided
                    if workspace_id and new_token:
                        await MetaCredentialsService._update_token_in_db(
                            workspace_id, new_token, expires_at
                        )
                    
                    return result
                else:
                    error_data = response.json() if response.content else {}
                    return {
                        "success": False,
                        "error": error_data.get("error", {}).get("message", "Token refresh failed")
                    }
                    
        except Exception as e:
            logger.error(f"Error refreshing token: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def _update_token_in_db(
        workspace_id: str,
        new_token: str,
        expires_at: datetime
    ) -> bool:
        """Update access token in database"""
        try:
            client = get_supabase_admin_client()
            
            # Find social account
            result = client.table("social_accounts").select(
                "id, credentials_encrypted"
            ).eq("workspace_id", workspace_id).in_(
                "platform", ["facebook", "instagram", "meta_ads"]
            ).limit(1).execute()
            
            if not result.data:
                return False
            
            record = result.data[0]
            
            # Update credentials
            credentials = MetaCredentialsService._decrypt_credentials(
                record["credentials_encrypted"], workspace_id
            )
            
            if credentials:
                credentials["accessToken"] = new_token
                encrypted = MetaCredentialsService._encrypt_credentials(
                    credentials, workspace_id
                )
                
                client.table("social_accounts").update({
                    "credentials_encrypted": encrypted,
                    "expires_at": expires_at.isoformat(),
                    "access_token_expires_at": expires_at.isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", record["id"]).execute()
                
                logger.info(f"Updated token in database for workspace {workspace_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error updating token in database: {e}")
            return False
    
    @staticmethod
    async def auto_refresh_if_needed(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Check if token needs refresh and refresh if needed
        
        Refreshes if token expires within TOKEN_REFRESH_THRESHOLD_DAYS
        """
        credentials = await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
        
        if not credentials:
            return None
        
        expires_at = credentials.get("expires_at")
        if not expires_at:
            return credentials
        
        try:
            if isinstance(expires_at, str):
                expiry_date = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expiry_date = expires_at
            
            days_until_expiry = (expiry_date - datetime.now(timezone.utc)).days
            
            if days_until_expiry <= TOKEN_REFRESH_THRESHOLD_DAYS:
                logger.info(f"Token expires in {days_until_expiry} days, refreshing...")
                refresh_result = await MetaCredentialsService.refresh_access_token(
                    credentials["access_token"],
                    workspace_id
                )
                
                if refresh_result.get("success"):
                    # Return updated credentials
                    return await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
                else:
                    logger.warning(f"Token refresh failed: {refresh_result.get('error')}")
            
            return credentials
            
        except Exception as e:
            logger.error(f"Error in auto refresh: {e}")
            return credentials
    
    # =========================================================================
    # ENCRYPTION/DECRYPTION
    # =========================================================================
    
    @staticmethod
    def _get_encryption_key(workspace_id: str) -> bytes:
        """
        Get encryption key for workspace
        Uses app secret + workspace ID to derive key
        """
        app_secret = settings.FACEBOOK_APP_SECRET or "default_secret"
        key_material = f"{app_secret}:{workspace_id}"
        
        # Derive a Fernet-compatible key (32 bytes, base64 encoded)
        key_hash = hashlib.sha256(key_material.encode()).digest()
        return base64.urlsafe_b64encode(key_hash)
    
    @staticmethod
    def _encrypt_credentials(credentials: Dict[str, Any], workspace_id: str) -> str:
        """Encrypt credentials for storage"""
        try:
            key = MetaCredentialsService._get_encryption_key(workspace_id)
            fernet = Fernet(key)
            
            json_data = json.dumps(credentials)
            encrypted = fernet.encrypt(json_data.encode())
            
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Encryption error: {e}")
            # Fallback to plain JSON (for backwards compatibility)
            return json.dumps(credentials)
    
    @staticmethod
    def _decrypt_credentials(
        encrypted: str, 
        workspace_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Decrypt credentials
        Handles both encrypted and plain JSON (backwards compatibility)
        """
        try:
            # Try parsing as plain JSON first (backwards compatibility)
            if encrypted.startswith("{"):
                return json.loads(encrypted)
            
            # Try Fernet decryption
            try:
                key = MetaCredentialsService._get_encryption_key(workspace_id)
                fernet = Fernet(key)
                decrypted = fernet.decrypt(encrypted.encode())
                return json.loads(decrypted.decode())
            except Exception:
                # If Fernet fails, try base64 decode
                try:
                    decoded = base64.b64decode(encrypted)
                    return json.loads(decoded)
                except Exception:
                    logger.error("Failed to decrypt credentials")
                    return None
            
        except json.JSONDecodeError:
            logger.error("Failed to parse credentials as JSON")
            return None
    
    @staticmethod
    def _check_token_expiration(expires_at: Any) -> Tuple[bool, bool]:
        """Check if token is expired or expiring soon"""
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
    # ADS CREDENTIALS
    # =========================================================================
    
    @staticmethod
    async def get_ads_credentials(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get credentials specifically for Meta Ads operations
        Uses userAccessToken for ads API calls (not Page token)
        """
        credentials = await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
        
        if not credentials:
            return None
        
        # Use userAccessToken for ads API calls if available
        ads_token = credentials.get("user_access_token") or credentials.get("access_token")
        
        # If no ad account ID, try to fetch it using SDK
        account_id = credentials.get("account_id")
        account_name = credentials.get("account_name")
        
        if not account_id and ads_token:
            try:
                ad_account_info = await MetaCredentialsService._fetch_ad_account_from_sdk(ads_token)
                
                if ad_account_info:
                    account_id = ad_account_info.get("account_id")
                    account_name = ad_account_info.get("account_name")
                    
                    # Update stored credentials
                    await MetaCredentialsService.update_ad_account_info(
                        workspace_id, account_id, account_name
                    )
            except Exception as e:
                logger.error(f"Error fetching ad account: {e}")
        
        return {
            "access_token": ads_token,
            "account_id": account_id,
            "account_name": account_name,
            "page_id": credentials.get("page_id"),
            "page_name": credentials.get("page_name"),
            "page_access_token": credentials.get("page_access_token"),
            "business_id": credentials.get("business_id"),
            "expires_at": credentials.get("expires_at"),
            "is_expired": credentials.get("is_expired", False),
            "expires_soon": credentials.get("expires_soon", False),
        }
    
    @staticmethod
    async def _fetch_ad_account_from_sdk(access_token: str) -> Optional[Dict[str, Any]]:
        """Fetch ad account from Meta API using SDK"""
        try:
            sdk_client = create_meta_sdk_client(access_token)
            
            # Get user's businesses
            businesses = await sdk_client.get_businesses()
            
            if not businesses:
                # Try getting ad accounts directly
                ad_accounts = await sdk_client.get_ad_accounts()
                if ad_accounts:
                    first_account = ad_accounts[0]
                    return {
                        "account_id": first_account.get("account_id") or first_account.get("id", "").replace("act_", ""),
                        "account_name": first_account.get("name"),
                        "currency": first_account.get("currency"),
                        "timezone": first_account.get("timezone_name"),
                    }
                return None
            
            # Get ad accounts from first business
            for business in businesses:
                ad_accounts = await sdk_client.get_business_ad_accounts(business["id"])
                
                if ad_accounts:
                    first_account = ad_accounts[0]
                    return {
                        "account_id": first_account.get("account_id") or first_account.get("id", "").replace("act_", ""),
                        "account_name": first_account.get("name"),
                        "currency": first_account.get("currency"),
                        "timezone": first_account.get("timezone_name"),
                        "business_id": business["id"],
                        "business_name": business.get("name"),
                    }
            
            return None
            
        except MetaSDKError as e:
            logger.error(f"SDK error fetching ad account: {e.message}")
            return None
        except Exception as e:
            logger.error(f"Error fetching ad account from SDK: {e}")
            return None
    
    @staticmethod
    async def update_ad_account_info(
        workspace_id: str,
        account_id: str,
        account_name: Optional[str] = None
    ) -> bool:
        """Update stored credentials with ad account info"""
        try:
            client = get_supabase_admin_client()
            
            # Find existing Meta platform credentials
            result = client.table("social_accounts").select("id").eq(
                "workspace_id", workspace_id
            ).in_("platform", ["facebook", "instagram", "meta_ads"]).limit(1).execute()
            
            if not result.data:
                return False
            
            # Update account info
            client.table("social_accounts").update({
                "account_id": account_id,
                "account_name": account_name,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", result.data[0]["id"]).execute()
            
            logger.info(f"Updated ad account info for workspace {workspace_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating ad account info: {e}")
            return False
    
    # =========================================================================
    # INSTAGRAM CREDENTIALS
    # =========================================================================
    
    @staticmethod
    async def get_instagram_credentials(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get credentials specifically for Instagram operations"""
        credentials = await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
        
        if not credentials:
            return None
        
        # Get Instagram Business Account ID
        ig_user_id = credentials.get("ig_user_id")
        
        if not ig_user_id and credentials.get("page_id"):
            # Fetch IG account from Page using SDK
            try:
                sdk_client = create_meta_sdk_client(
                    credentials.get("page_access_token") or credentials.get("access_token")
                )
                ig_account = await sdk_client.get_instagram_account(credentials["page_id"])
                
                if ig_account:
                    ig_user_id = ig_account.get("id")
                    
                    # Update in database
                    await MetaCredentialsService._update_ig_user_id(workspace_id, ig_user_id)
                    
            except Exception as e:
                logger.error(f"Error fetching Instagram account: {e}")
        
        return {
            "access_token": credentials.get("page_access_token") or credentials.get("access_token"),
            "ig_user_id": ig_user_id,
            "page_id": credentials.get("page_id"),
            "page_name": credentials.get("page_name"),
            "username": credentials.get("username"),
            "expires_at": credentials.get("expires_at"),
            "is_expired": credentials.get("is_expired", False),
        }
    
    @staticmethod
    async def _update_ig_user_id(workspace_id: str, ig_user_id: str) -> bool:
        """Update Instagram User ID in database"""
        try:
            client = get_supabase_admin_client()
            
            result = client.table("social_accounts").select("id").eq(
                "workspace_id", workspace_id
            ).in_("platform", ["instagram", "facebook"]).limit(1).execute()
            
            if result.data:
                client.table("social_accounts").update({
                    "ig_user_id": ig_user_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", result.data[0]["id"]).execute()
                return True
            
            return False
        except Exception as e:
            logger.error(f"Error updating IG user ID: {e}")
            return False
    
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
        
        Returns:
        - has_ads_access: Whether workspace can run ads
        - ad_account_id, ad_account_name: Ad account info (if available)
        - page_id, page_name: Facebook page info
        - missing_permissions: List of what's missing
        """
        credentials = await MetaCredentialsService.get_ads_credentials(workspace_id, user_id)
        
        if not credentials:
            return {
                "has_ads_access": False,
                "missing_permissions": ["No Meta platform connected"]
            }
        
        if credentials.get("account_id"):
            # Verify permissions with SDK
            token = credentials.get("access_token")
            permissions = await MetaCredentialsService.get_token_permissions(token) if token else []
            
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
        """Check if workspace can post to Instagram"""
        credentials = await MetaCredentialsService.get_instagram_credentials(workspace_id, user_id)
        
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
    # CONNECTION STATUS
    # =========================================================================
    
    @staticmethod
    async def get_connection_status(workspace_id: str) -> Dict[str, Any]:
        """Get detailed connection status for all Meta platforms"""
        try:
            client = get_supabase_admin_client()
            
            result = client.table("social_accounts").select(
                "platform, is_connected, username, page_id, page_name, "
                "account_id, account_name, ig_user_id, credentials_encrypted, expires_at"
            ).eq("workspace_id", workspace_id).in_(
                "platform", ["facebook", "instagram", "meta_ads"]
            ).execute()
            
            status = {
                "facebook": {"isConnected": False},
                "instagram": {"isConnected": False},
                "metaAds": {"isConnected": False},
                "canRunAds": False,
                "canPostInstagram": False,
                "missingForAds": [],
                "tokenStatus": {}
            }
            
            for account in result.data or []:
                has_credentials = bool(account.get("credentials_encrypted"))
                expires_at = account.get("expires_at")
                is_expired, expires_soon = MetaCredentialsService._check_token_expiration(expires_at)
                
                token_status = {
                    "expires_at": expires_at,
                    "is_expired": is_expired,
                    "expires_soon": expires_soon,
                }
                
                if account["platform"] == "facebook":
                    status["facebook"] = {
                        "isConnected": has_credentials and not is_expired,
                        "username": account.get("username"),
                        "pageId": account.get("page_id"),
                        "pageName": account.get("page_name"),
                        **token_status
                    }
                elif account["platform"] == "instagram":
                    status["instagram"] = {
                        "isConnected": has_credentials and not is_expired,
                        "username": account.get("username"),
                        "igUserId": account.get("ig_user_id"),
                        **token_status
                    }
                elif account["platform"] == "meta_ads":
                    status["metaAds"] = {
                        "isConnected": has_credentials and not is_expired,
                        "adAccountId": account.get("account_id"),
                        "adAccountName": account.get("account_name"),
                        **token_status
                    }
            
            # Check ads capability
            if status["facebook"]["isConnected"] or status["metaAds"]["isConnected"]:
                capability = await MetaCredentialsService.check_ads_capability(workspace_id)
                status["canRunAds"] = capability.get("has_ads_access", False)
                
                if not status["canRunAds"]:
                    status["missingForAds"] = capability.get("missing_permissions", [])
                else:
                    status["metaAds"]["adAccountId"] = capability.get("ad_account_id")
                    status["metaAds"]["adAccountName"] = capability.get("ad_account_name")
            else:
                status["missingForAds"] = ["Connect Facebook to run ads"]
            
            # Check Instagram capability
            ig_cap = await MetaCredentialsService.check_instagram_capability(workspace_id)
            status["canPostInstagram"] = ig_cap.get("has_instagram_access", False)
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting connection status: {e}")
            return {
                "facebook": {"isConnected": False},
                "instagram": {"isConnected": False},
                "metaAds": {"isConnected": False},
                "canRunAds": False,
                "missingForAds": ["Error checking connection status"],
                "error": str(e)
            }
    
    # =========================================================================
    # BUSINESS MANAGEMENT
    # =========================================================================
    
    @staticmethod
    async def get_available_businesses(
        workspace_id: str,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all available business portfolios with their ad accounts using SDK"""
        credentials = await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
        
        if not credentials:
            return []
        
        access_token = credentials.get("user_access_token") or credentials.get("access_token")
        if not access_token:
            return []
        
        try:
            sdk_client = create_meta_sdk_client(access_token)
            
            businesses = await sdk_client.get_businesses()
            
            result = []
            for business in businesses:
                ad_accounts = await sdk_client.get_business_ad_accounts(business["id"])
                
                result.append({
                    "id": business["id"],
                    "name": business.get("name"),
                    "adAccounts": ad_accounts
                })
            
            return result
            
        except MetaSDKError as e:
            logger.error(f"SDK error fetching businesses: {e.message}")
            return []
        except Exception as e:
            logger.error(f"Error fetching businesses: {e}")
            return []
    
    @staticmethod
    async def switch_business(
        workspace_id: str,
        business_id: str,
        ad_account_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Switch to a different business portfolio and ad account"""
        try:
            credentials = await MetaCredentialsService.get_meta_credentials(workspace_id, user_id)
            
            if not credentials:
                return {"success": False, "error": "No Meta credentials found"}
            
            access_token = credentials.get("user_access_token") or credentials.get("access_token")
            sdk_client = create_meta_sdk_client(access_token)
            
            # Get ad accounts for the business
            ad_accounts = await sdk_client.get_business_ad_accounts(business_id)
            
            if not ad_accounts:
                return {"success": False, "error": "No ad accounts found for this business"}
            
            # Use specified ad account or first available
            selected_account = None
            if ad_account_id:
                selected_account = next(
                    (acc for acc in ad_accounts if acc.get("account_id") == ad_account_id or acc.get("id") == f"act_{ad_account_id}"),
                    None
                )
            
            if not selected_account:
                selected_account = ad_accounts[0]
            
            # Update credentials in database
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
            
            return {
                "success": True,
                "businessId": business_id,
                "adAccount": selected_account
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error switching business: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error switching business: {e}")
            return {"success": False, "error": str(e)}
    
    # =========================================================================
    # CREDENTIAL STORAGE
    # =========================================================================
    
    @staticmethod
    async def save_credentials(
        workspace_id: str,
        platform: str,
        credentials_data: Dict[str, Any],
        page_info: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Save Meta credentials to database
        
        Args:
            workspace_id: Workspace ID
            platform: facebook, instagram, or meta_ads
            credentials_data: OAuth credentials dict
            page_info: Optional page/account info
            user_id: Optional user ID
        """
        try:
            client = get_supabase_admin_client()
            
            # Calculate expiration
            expires_in = credentials_data.get("expires_in", 5184000)
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            
            # Encrypt credentials
            encrypted = MetaCredentialsService._encrypt_credentials(
                credentials_data, workspace_id
            )
            
            # Build record
            record = {
                "workspace_id": workspace_id,
                "platform": platform,
                "credentials_encrypted": encrypted,
                "is_connected": True,
                "expires_at": expires_at.isoformat(),
                "access_token_expires_at": expires_at.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            
            if user_id:
                record["user_id"] = user_id
            
            if page_info:
                record["page_id"] = page_info.get("page_id")
                record["page_name"] = page_info.get("page_name")
                record["username"] = page_info.get("username")
                record["ig_user_id"] = page_info.get("ig_user_id")
                record["account_id"] = page_info.get("account_id")
                record["account_name"] = page_info.get("account_name")
                record["business_id"] = page_info.get("business_id")
            
            # Upsert (update if exists, insert if not)
            existing = client.table("social_accounts").select("id").eq(
                "workspace_id", workspace_id
            ).eq("platform", platform).maybe_single().execute()
            
            if existing.data:
                client.table("social_accounts").update(record).eq(
                    "id", existing.data["id"]
                ).execute()
            else:
                record["created_at"] = datetime.now(timezone.utc).isoformat()
                client.table("social_accounts").insert(record).execute()
            
            logger.info(f"Saved {platform} credentials for workspace {workspace_id}")
            
            return {"success": True}
            
        except Exception as e:
            logger.error(f"Error saving credentials: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def disconnect_platform(
        workspace_id: str,
        platform: str
    ) -> Dict[str, Any]:
        """Disconnect a Meta platform"""
        try:
            client = get_supabase_admin_client()
            
            client.table("social_accounts").update({
                "credentials_encrypted": None,
                "is_connected": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("workspace_id", workspace_id).eq("platform", platform).execute()
            
            logger.info(f"Disconnected {platform} for workspace {workspace_id}")
            
            return {"success": True}
            
        except Exception as e:
            logger.error(f"Error disconnecting platform: {e}")
            return {"success": False, "error": str(e)}


# Singleton instance
_credentials_service: Optional[MetaCredentialsService] = None


def get_meta_credentials_service() -> MetaCredentialsService:
    """Get MetaCredentialsService singleton"""
    global _credentials_service
    if _credentials_service is None:
        _credentials_service = MetaCredentialsService()
    return _credentials_service
