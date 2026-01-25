"""
Meta Business SDK Client
Centralized SDK client wrapper for Meta Business APIs (Facebook, Instagram, Marketing API)

Based on official Meta Business SDK documentation:
https://developers.facebook.com/docs/business-sdk/getting-started

Install: pip install facebook_business

This module provides:
- Core SDK initialization and session management
- Async wrappers for SDK sync calls
- Token switching support
- Unified error handling

NOTE: Domain-specific functionality has been extracted to separate service modules:

Facebook/Instagram (in src.services.platforms):
- pages_service.py - Facebook Pages (PagesService)
- ig_service.py - Instagram Publishing (IGService)
- comments_service.py - Comments/Engagement (CommentsService)

Ads/Marketing (in src.services.meta_ads):
- sdk_insights.py - Analytics/Reporting  
- sdk_catalogs.py - Product Catalogs
- sdk_automation_rules.py - Ad Automation
- sdk_ab_tests.py - A/B Testing
- sdk_settings.py - Account Settings

For ads/campaigns/adsets, use meta_ads_service.py
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List
from functools import wraps

# Meta Business SDK imports
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.user import User
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.business import Business
from facebook_business.exceptions import FacebookRequestError

from ...config import settings
from ..platforms.pages_service import PagesService
from ..platforms.ig_service import InstagramService
from ..platforms.comments_service import CommentsService

logger = logging.getLogger(__name__)

# API Version (matches Graph API version in docs)
META_API_VERSION = "v24.0"


class MetaSDKError(Exception):
    """Custom exception for Meta SDK errors with structured error info"""
    
    def __init__(
        self, 
        message: str, 
        code: Optional[int] = None, 
        subcode: Optional[int] = None,
        error_type: Optional[str] = None,
        fbtrace_id: Optional[str] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.subcode = subcode
        self.error_type = error_type
        self.fbtrace_id = fbtrace_id
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "message": self.message,
            "code": self.code,
            "subcode": self.subcode,
            "error_type": self.error_type,
            "fbtrace_id": self.fbtrace_id
        }
    
    @classmethod
    def from_facebook_error(cls, error: FacebookRequestError) -> "MetaSDKError":
        """Create MetaSDKError from FacebookRequestError"""
        return cls(
            message=error.api_error_message() or str(error),
            code=error.api_error_code(),
            subcode=error.api_error_subcode(),
            error_type=error.api_error_type(),
            fbtrace_id=error.api_transient_error()
        )


def async_sdk_call(func):
    """
    Decorator to run SDK sync calls in thread pool for async compatibility.
    Also handles error conversion to MetaSDKError.
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            # Run sync SDK call in thread pool
            return await asyncio.to_thread(func, *args, **kwargs)
        except FacebookRequestError as e:
            error_details = {
                'message': e.api_error_message(),
                'code': e.api_error_code(),
                'type': e.api_error_type(),
                'subcode': e.api_error_subcode() if hasattr(e, 'api_error_subcode') else None,
                'user_title': e.get_message() if hasattr(e, 'get_message') else None,
                'body': str(e.body()) if hasattr(e, 'body') else None
            }
            logger.error(f"Meta SDK error details: {error_details}")
            raise MetaSDKError.from_facebook_error(e)
        except Exception as e:
            logger.error(f"Unexpected error in SDK call: {str(e)}", exc_info=True)
            raise MetaSDKError(message=str(e))
    return wrapper


class MetaSDKClient:
    """
    Meta Business SDK Client - Core Initialization
    
    Provides unified access to Meta APIs through domain-specific service modules.
    
    Usage:
        client = MetaSDKClient(access_token=token)
        
        # For Facebook/Instagram operations, use platforms services:
        from src.services.platforms import PagesService, IGService, CommentsService
        pages_svc = PagesService(token)
        ig_svc = IGService(token)
    """
    
    def __init__(
        self,
        app_id: Optional[str] = None,
        app_secret: Optional[str] = None,
        access_token: Optional[str] = None
    ):
        """
        Initialize Meta Business SDK client.
        
        Args:
            app_id: Facebook App ID (defaults to settings.FACEBOOK_APP_ID)
            app_secret: Facebook App Secret (defaults to settings.FACEBOOK_APP_SECRET)
            access_token: User or Page access token
        """
        self.app_id = app_id or settings.FACEBOOK_APP_ID
        self.app_secret = app_secret or settings.FACEBOOK_APP_SECRET
        self._access_token = access_token
        self._api: Optional[FacebookAdsApi] = None
        self._initialized = False
        
        if access_token:
            self._initialize_api(access_token)
    
    def _initialize_api(self, access_token: str) -> None:
        """Initialize or reinitialize the SDK API with a new token"""
        if not self.app_id or not self.app_secret:
            logger.warning("Facebook App credentials not configured")
            return
        
        try:
            FacebookAdsApi.init(
                app_id=self.app_id,
                app_secret=self.app_secret,
                access_token=access_token,
                api_version=META_API_VERSION
            )
            self._api = FacebookAdsApi.get_default_api()
            self._access_token = access_token
            self._initialized = True
            logger.info("Meta Business SDK initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Meta SDK: {e}")
            self._initialized = False
    
    def _get_appsecret_proof(self) -> str:
        """
        Calculate appsecret_proof = HMAC-SHA256(access_token, app_secret).
        
        Required for server-side API calls to Meta's Graph API.
        """
        import hmac
        import hashlib
        
        if not self.app_secret or not self._access_token:
            return ""
        return hmac.new(
            self.app_secret.encode('utf-8'),
            self._access_token.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
    
    def switch_access_token(self, access_token: str) -> None:
        """
        Switch to a different access token.
        
        Per Meta docs: https://developers.facebook.com/docs/business-sdk/common-scenarios/token-switch
        This is useful when managing multiple Pages or Ad Accounts.
        
        Args:
            access_token: New access token to use
        """
        self._initialize_api(access_token)
    
    @property
    def access_token(self) -> Optional[str]:
        """Get the current access token"""
        return self._access_token
    
    @property
    def is_initialized(self) -> bool:
        """Check if SDK is properly initialized"""
        return self._initialized and self._api is not None
    
    def _ensure_initialized(self) -> None:
        """Ensure SDK is initialized before making calls"""
        if not self.is_initialized:
            raise MetaSDKError(
                message="Meta SDK not initialized. Provide access token first.",
                code=0
            )

    def _ensure_access_token(self) -> None:
        """Ensure access token exists for non-SDK service calls"""
        if not self._access_token:
            raise MetaSDKError(
                message="Access token is required for this operation.",
                code=0
            )

    async def get_page_feed(self, page_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get Facebook Page feed posts via PagesService."""
        self._ensure_access_token()
        service = PagesService(self._access_token)
        result = await service.get_page_feed(page_id, limit)
        if not result.get("success"):
            raise MetaSDKError(message=result.get("error", "Failed to fetch page feed"))
        return result.get("posts", [])

    async def get_instagram_media(self, ig_user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get Instagram media via InstagramService."""
        self._ensure_access_token()
        service = InstagramService(self._access_token)
        result = await service.get_instagram_media(ig_user_id, limit)
        if not result.get("success"):
            raise MetaSDKError(message=result.get("error", "Failed to fetch Instagram media"))
        return result.get("media", [])

    async def get_object_comments(
        self,
        object_id: str,
        limit: int = 50,
        fields: str = "id,text,from,timestamp,like_count"
    ) -> List[Dict[str, Any]]:
        """Get comments for an object via CommentsService."""
        self._ensure_access_token()
        service = CommentsService(self._access_token)
        result = await service.get_object_comments(object_id, limit=limit, fields=fields)
        if not result.get("success"):
            raise MetaSDKError(message=result.get("error", "Failed to fetch comments"))
        return result.get("comments", [])

    async def reply_to_comment(self, comment_id: str, message: str) -> Dict[str, Any]:
        """Reply to a comment via CommentsService."""
        self._ensure_access_token()
        service = CommentsService(self._access_token)
        result = await service.reply_to_comment(comment_id, message)
        if not result.get("success"):
            raise MetaSDKError(message=result.get("error", "Failed to reply to comment"))
        return result

    async def like_object(self, object_id: str) -> Dict[str, Any]:
        """Like a comment or post via CommentsService."""
        self._ensure_access_token()
        service = CommentsService(self._access_token)
        result = await service.like_object(object_id)
        if not result.get("success"):
            raise MetaSDKError(message=result.get("error", "Failed to like object"))
        return result
    
    # =========================================================================
    # BASIC ACCOUNT OPERATIONS (kept for backward compatibility)
    # =========================================================================
    
    @async_sdk_call
    def _get_ad_accounts_sync(self) -> List[Dict[str, Any]]:
        """Get ad accounts accessible to the user"""
        self._ensure_initialized()
        
        me = User(fbid='me')
        accounts = me.get_ad_accounts(fields=[
            'id', 'name', 'account_status', 'currency', 'timezone_name',
            'amount_spent', 'spend_cap', 'business'
        ])
        
        return [
            {
                'id': acc['id'],
                'name': acc.get('name'),
                'account_status': acc.get('account_status'),
                'currency': acc.get('currency'),
                'timezone_name': acc.get('timezone_name'),
                'amount_spent': acc.get('amount_spent'),
                'spend_cap': acc.get('spend_cap'),
                'business': acc.get('business')
            }
            for acc in accounts
        ]
    
    async def get_ad_accounts(self) -> List[Dict[str, Any]]:
        """Get all Ad Accounts accessible by the user"""
        return await self._get_ad_accounts_sync()
    
    @async_sdk_call
    def _get_businesses_sync(self) -> List[Dict[str, Any]]:
        """Get businesses accessible to the user"""
        self._ensure_initialized()
        
        me = User(fbid='me')
        businesses = me.get_businesses(fields=[
            'id', 'name', 'created_time', 'timezone_id', 'primary_page'
        ])
        
        return [
            {
                'id': biz['id'],
                'name': biz.get('name'),
                'created_time': biz.get('created_time'),
                'timezone_id': biz.get('timezone_id'),
                'primary_page': biz.get('primary_page')
            }
            for biz in businesses
        ]
    
    async def get_businesses(self) -> List[Dict[str, Any]]:
        """Get all Businesses accessible by the user"""
        return await self._get_businesses_sync()
    
    @async_sdk_call
    def _get_business_ad_accounts_sync(self, business_id: str) -> List[Dict[str, Any]]:
        """Get ad accounts for a specific business"""
        self._ensure_initialized()
        
        business = Business(fbid=business_id)
        accounts = business.get_owned_ad_accounts(fields=[
            'id', 'name', 'account_status', 'currency', 'timezone_name'
        ])
        
        return [
            {
                'id': acc['id'],
                'name': acc.get('name'),
                'account_status': acc.get('account_status'),
                'currency': acc.get('currency'),
                'timezone_name': acc.get('timezone_name')
            }
            for acc in accounts
        ]
    
    async def get_business_ad_accounts(self, business_id: str) -> List[Dict[str, Any]]:
        """Get Ad Accounts owned by a Business"""
        return await self._get_business_ad_accounts_sync(business_id)
    
    def create_batch(self):
        """Create a batch request object for multiple API calls."""
        self._ensure_initialized()
        return self._api.new_batch()
    
    # =========================================================================
    # CAMPAIGN OPERATIONS
    # =========================================================================
    
    async def get_campaigns(self, account_id: str) -> List[Dict[str, Any]]:
        """Fetch all campaigns for an ad account"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_campaigns_sync, account_id)
    
    def _serialize_sdk_object(self, obj) -> Any:
        """Recursively serialize SDK objects to JSON-safe types"""
        import json
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, dict):
            return {k: self._serialize_sdk_object(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [self._serialize_sdk_object(item) for item in obj]
        # Handle SDK objects that have export_all_data or similar
        if hasattr(obj, 'export_all_data'):
            return self._serialize_sdk_object(obj.export_all_data())
        if hasattr(obj, '__dict__'):
            return self._serialize_sdk_object(obj.__dict__)
        # Fallback to string representation
        try:
            return str(obj)
        except:
            return None
    
    def _get_campaigns_sync(self, account_id: str) -> List[Dict[str, Any]]:
        account = AdAccount(f'act_{account_id}')
        campaigns = account.get_campaigns(fields=[
            'id', 'name', 'objective', 'status', 'effective_status',
            'daily_budget', 'lifetime_budget', 'special_ad_categories',
            'created_time', 'updated_time', 'configured_status',
            'bid_strategy', 'adset_bid_amounts',
            'promoted_object'
        ])
        return [self._serialize_sdk_object(dict(c)) for c in campaigns]
    
    async def create_advantage_plus_campaign(
        self, ad_account_id: str, name: str, objective: str, status: str,
        special_ad_categories: List[str] = None, daily_budget: int = None,
        lifetime_budget: int = None, bid_strategy: str = None
    ) -> Dict[str, Any]:
        """Create an Advantage+ campaign"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._create_advantage_plus_campaign_sync,
            ad_account_id, name, objective, status, special_ad_categories,
            daily_budget, lifetime_budget, bid_strategy
        )
    
    def _create_advantage_plus_campaign_sync(
        self, ad_account_id: str, name: str, objective: str, status: str,
        special_ad_categories: List[str] = None, daily_budget: int = None,
        lifetime_budget: int = None, bid_strategy: str = None
    ) -> Dict[str, Any]:
        from facebook_business.adobjects.campaign import Campaign
        account = AdAccount(f'act_{ad_account_id}')
        params = {
            'name': name,
            'objective': objective,
            'status': status,
            'special_ad_categories': special_ad_categories or [],
        }
        if daily_budget:
            params['daily_budget'] = daily_budget
        if lifetime_budget:
            params['lifetime_budget'] = lifetime_budget
        if bid_strategy:
            params['bid_strategy'] = bid_strategy
        result = account.create_campaign(params=params)
        return {'id': result.get('id'), 'campaign_id': result.get('id')}
    
    async def update_campaign(self, campaign_id: str, **updates) -> Dict[str, Any]:
        """Update a campaign"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._update_campaign_sync, campaign_id, **updates)
    
    def _update_campaign_sync(self, campaign_id: str, **updates) -> Dict[str, Any]:
        from facebook_business.adobjects.campaign import Campaign
        campaign = Campaign(fbid=campaign_id)
        params = {k: v for k, v in updates.items() if v is not None}
        campaign.api_update(params=params)
        return {'success': True, 'id': campaign_id}
    
    async def delete_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """Delete a campaign"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._delete_campaign_sync, campaign_id)
    
    def _delete_campaign_sync(self, campaign_id: str) -> Dict[str, Any]:
        from facebook_business.adobjects.campaign import Campaign
        campaign = Campaign(fbid=campaign_id)
        campaign.api_delete()
        return {'success': True}
    
    async def duplicate_campaign(self, campaign_id: str, new_name: str = None) -> Dict[str, Any]:
        """Duplicate a campaign"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._duplicate_campaign_sync, campaign_id, new_name)
    
    def _duplicate_campaign_sync(self, campaign_id: str, new_name: str = None) -> Dict[str, Any]:
        from facebook_business.adobjects.campaign import Campaign
        campaign = Campaign(fbid=campaign_id)
        params = {}
        if new_name:
            params['rename_options'] = {'rename_suffix': ' - Copy'}
        result = campaign.create_copy(params=params)
        return {'success': True, 'copied_campaign_id': result.get('copied_campaign_id')}
    
    # =========================================================================
    # AD SET OPERATIONS
    # =========================================================================
    
    async def get_adsets(self, account_id: str) -> List[Dict[str, Any]]:
        """Fetch all ad sets for an ad account"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_adsets_sync, account_id)
    
    def _get_adsets_sync(self, account_id: str) -> List[Dict[str, Any]]:
        account = AdAccount(f'act_{account_id}')
        adsets = account.get_ad_sets(fields=[
            'id', 'name', 'campaign_id', 'status', 'effective_status',
            'daily_budget', 'lifetime_budget', 'targeting', 'optimization_goal',
            'billing_event', 'start_time', 'end_time', 'created_time'
        ])
        return [self._serialize_sdk_object(dict(a)) for a in adsets]
    
    async def create_adset(
        self, ad_account_id: str, name: str, campaign_id: str,
        optimization_goal: str, billing_event: str = 'IMPRESSIONS',
        targeting: Dict = None, status: str = 'PAUSED',
        daily_budget: int = None, lifetime_budget: int = None,
        start_time: str = None, end_time: str = None, bid_amount: int = None,
        is_adset_budget_sharing_enabled: Optional[bool] = None,
        placement_soft_opt_out: Optional[bool] = None,
        promoted_object: Optional[Dict] = None,
        destination_type: Optional[str] = None,
        attribution_spec: Optional[List[Dict]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Create an ad set (v24.0 2026 standards)"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._create_adset_sync, ad_account_id, name, campaign_id,
            optimization_goal, billing_event, targeting, status,
            daily_budget, lifetime_budget, start_time, end_time, bid_amount,
            is_adset_budget_sharing_enabled, placement_soft_opt_out,
            promoted_object, destination_type, attribution_spec
        )
    
    def _create_adset_sync(
        self, ad_account_id: str, name: str, campaign_id: str,
        optimization_goal: str, billing_event: str = 'IMPRESSIONS',
        targeting: Dict = None, status: str = 'PAUSED',
        daily_budget: int = None, lifetime_budget: int = None,
        start_time: str = None, end_time: str = None, bid_amount: int = None,
        is_adset_budget_sharing_enabled: Optional[bool] = None,
        placement_soft_opt_out: Optional[bool] = None,
        promoted_object: Optional[Dict] = None,
        destination_type: Optional[str] = None,
        attribution_spec: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Create an ad set (v24.0 2026 standards).
        
        v24.0 2026 Updates:
        - attribution_spec: Updated windows per Jan 12, 2026 - view-through limited to 1 day only
        - is_adset_budget_sharing_enabled: Share up to 20% budget between ad sets
        - placement_soft_opt_out: Allow 5% spend on excluded placements
        
        Note: targeting should include targeting_automation for Advantage+ Audience.
        If targeting is None, it will use default geo_locations (US), but this is not recommended for production.
        """
        account = AdAccount(f'act_{ad_account_id}')
        
        # Require targeting to be provided (no hardcoded defaults)
        if not targeting:
            raise ValueError("targeting parameter is required for ad set creation (v24.0 2026)")
        
        params = {
            'name': name,
            'campaign_id': campaign_id,
            'optimization_goal': optimization_goal,
            'billing_event': billing_event,
            'targeting': targeting,
            'status': status,
        }
        
        if daily_budget:
            params['daily_budget'] = daily_budget
        if lifetime_budget:
            params['lifetime_budget'] = lifetime_budget
        if start_time:
            params['start_time'] = start_time
        if end_time:
            params['end_time'] = end_time
        if bid_amount:
            params['bid_amount'] = bid_amount
        if promoted_object:
            params['promoted_object'] = promoted_object
        if destination_type:
            params['destination_type'] = destination_type
        
        # v24.0 2026 Required Parameters
        if is_adset_budget_sharing_enabled is not None:
            params['is_adset_budget_sharing_enabled'] = is_adset_budget_sharing_enabled
        if placement_soft_opt_out is not None:
            params['placement_soft_opt_out'] = placement_soft_opt_out
        
        # Attribution Spec (v24.0 2026): Updated windows per Jan 12, 2026 changes
        # View-through deprecated: 7-day and 28-day view windows removed
        # Only 1-day view-through remains allowed
        if attribution_spec:
            # Validate attribution_spec for 2026 standards
            for spec in attribution_spec:
                if spec.get('event_type') == 'VIEW_THROUGH' and spec.get('window_days', 0) > 1:
                    raise ValueError(
                        'View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). '
                        '7-day and 28-day view windows are deprecated.'
                    )
            params['attribution_spec'] = attribution_spec
        
        result = account.create_ad_set(params=params)
        return {'id': result.get('id'), 'adset_id': result.get('id')}
    
    async def update_adset(
        self, adset_id: str,
        name: str = None,
        status: str = None,
        daily_budget: int = None,
        lifetime_budget: int = None,
        targeting: Dict = None,
        start_time: str = None,
        end_time: str = None,
        bid_amount: int = None,
        is_adset_budget_sharing_enabled: Optional[bool] = None,
        placement_soft_opt_out: Optional[bool] = None,
        attribution_spec: Optional[List[Dict]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Update an ad set (v24.0 2026 standards)"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._update_adset_sync, adset_id, name, status, daily_budget, lifetime_budget,
            targeting, start_time, end_time, bid_amount, is_adset_budget_sharing_enabled,
            placement_soft_opt_out, attribution_spec
        )

    def _update_adset_sync(
        self, adset_id: str,
        name: str = None,
        status: str = None,
        daily_budget: int = None,
        lifetime_budget: int = None,
        targeting: Dict = None,
        start_time: str = None,
        end_time: str = None,
        bid_amount: int = None,
        is_adset_budget_sharing_enabled: Optional[bool] = None,
        placement_soft_opt_out: Optional[bool] = None,
        attribution_spec: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Update an ad set (v24.0 2026 standards).
        
        v24.0 2026 Updates:
        - attribution_spec: Updated windows per Jan 12, 2026 - view-through limited to 1 day only
        - is_adset_budget_sharing_enabled: Share up to 20% budget between ad sets
        - placement_soft_opt_out: Allow 5% spend on excluded placements
        """
        from facebook_business.adobjects.adset import AdSet
        adset = AdSet(fbid=adset_id)
        
        params = {}
        if name is not None:
            params['name'] = name
        if status is not None:
            params['status'] = status
        if daily_budget is not None:
            params['daily_budget'] = daily_budget
        if lifetime_budget is not None:
            params['lifetime_budget'] = lifetime_budget
        if targeting is not None:
            params['targeting'] = targeting
        if start_time is not None:
            params['start_time'] = start_time
        if end_time is not None:
            params['end_time'] = end_time
        if bid_amount is not None:
            params['bid_amount'] = bid_amount
        
        # v24.0 2026 Required Parameters
        if is_adset_budget_sharing_enabled is not None:
            params['is_adset_budget_sharing_enabled'] = is_adset_budget_sharing_enabled
        if placement_soft_opt_out is not None:
            params['placement_soft_opt_out'] = placement_soft_opt_out
        
        # Attribution Spec (v24.0 2026): Updated windows per Jan 12, 2026 changes
        if attribution_spec:
            # Validate attribution_spec for 2026 standards
            for spec in attribution_spec:
                if isinstance(spec, dict) and spec.get('event_type') == 'VIEW_THROUGH' and spec.get('window_days', 0) > 1:
                    raise ValueError(
                        'View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). '
                        '7-day and 28-day view windows are deprecated.'
                    )
            params['attribution_spec'] = attribution_spec
        
        if params:
            adset.api_update(params=params)
        return {'success': True, 'id': adset_id}
    
    async def delete_adset(self, adset_id: str) -> Dict[str, Any]:
        """Delete an ad set"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._delete_adset_sync, adset_id)
    
    def _delete_adset_sync(self, adset_id: str) -> Dict[str, Any]:
        from facebook_business.adobjects.adset import AdSet
        adset = AdSet(fbid=adset_id)
        adset.api_delete()
        return {'success': True}
    
    async def duplicate_adset(self, adset_id: str, new_name: str = None, campaign_id: str = None) -> Dict[str, Any]:
        """Duplicate an ad set"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._duplicate_adset_sync, adset_id, new_name, campaign_id)
    
    def _duplicate_adset_sync(self, adset_id: str, new_name: str = None, campaign_id: str = None) -> Dict[str, Any]:
        from facebook_business.adobjects.adset import AdSet
        adset = AdSet(fbid=adset_id)
        params = {}
        if campaign_id:
            params['campaign_id'] = campaign_id
        result = adset.create_copy(params=params)
        return {'success': True, 'copied_adset_id': result.get('copied_adset_id')}
    
    # =========================================================================
    # AD OPERATIONS
    # =========================================================================
    
    async def get_ads(self, account_id: str) -> List[Dict[str, Any]]:
        """Fetch all ads for an ad account"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_ads_sync, account_id)
    
    def _get_ads_sync(self, account_id: str) -> List[Dict[str, Any]]:
        account = AdAccount(f'act_{account_id}')
        ads = account.get_ads(fields=[
            'id', 'name', 'adset_id', 'campaign_id', 'status', 'effective_status',
            'creative', 'created_time', 'updated_time'
        ])
        return [self._serialize_sdk_object(dict(a)) for a in ads]
    
    async def create_ad_creative(
        self, ad_account_id: str, name: str, page_id: str,
        image_hash: str = None, video_id: str = None,
        message: str = None, link: str = None,
        call_to_action_type: str = 'LEARN_MORE', **kwargs
    ) -> Dict[str, Any]:
        """Create an ad creative"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._create_ad_creative_sync, ad_account_id, name, page_id,
            image_hash, video_id, message, link, call_to_action_type
        )
    
    def _create_ad_creative_sync(
        self, ad_account_id: str, name: str, page_id: str,
        image_hash: str = None, video_id: str = None,
        message: str = None, link: str = None,
        call_to_action_type: str = 'LEARN_MORE'
    ) -> Dict[str, Any]:
        """
        Create ad creative. Link is required for link-based creatives.
        """
        if not link and not video_id:
            raise ValueError("Either link or video_id must be provided for ad creative")
        
        account = AdAccount(f'act_{ad_account_id}')
        object_story_spec = {
            'page_id': page_id,
        }
        
        if video_id:
            # Video creative
            object_story_spec['video_data'] = {
                'video_id': video_id,
                'message': message or '',
                'call_to_action': {'type': call_to_action_type}
            }
            if link:
                object_story_spec['video_data']['call_to_action']['value'] = {'link': link}
        else:
            # Link creative (requires link)
            object_story_spec['link_data'] = {
                'message': message or '',
                'link': link,
                'call_to_action': {'type': call_to_action_type}
            }
            if image_hash:
                object_story_spec['link_data']['image_hash'] = image_hash
        
        params = {'name': name, 'object_story_spec': object_story_spec}
        result = account.create_ad_creative(params=params)
        return {'id': result.get('id'), 'creative_id': result.get('id')}
    
    async def create_ad(
        self, ad_account_id: str, name: str, adset_id: str,
        creative_id: str, status: str = 'PAUSED'
    ) -> Dict[str, Any]:
        """Create an ad"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._create_ad_sync, ad_account_id, name, adset_id, creative_id, status
        )
    
    def _create_ad_sync(
        self, ad_account_id: str, name: str, adset_id: str,
        creative_id: str, status: str = 'PAUSED'
    ) -> Dict[str, Any]:
        account = AdAccount(f'act_{ad_account_id}')
        params = {
            'name': name,
            'adset_id': adset_id,
            'creative': {'creative_id': creative_id},
            'status': status
        }
        result = account.create_ad(params=params)
        return {'id': result.get('id'), 'ad_id': result.get('id')}
    
    async def update_ad(self, ad_id: str, **updates) -> Dict[str, Any]:
        """Update an ad"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._update_ad_sync, ad_id, **updates)
    
    def _update_ad_sync(self, ad_id: str, **updates) -> Dict[str, Any]:
        from facebook_business.adobjects.ad import Ad
        ad = Ad(fbid=ad_id)
        params = {k: v for k, v in updates.items() if v is not None}
        ad.api_update(params=params)
        return {'success': True, 'id': ad_id}
    
    async def delete_ad(self, ad_id: str) -> Dict[str, Any]:
        """Delete an ad"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._delete_ad_sync, ad_id)
    
    def _delete_ad_sync(self, ad_id: str) -> Dict[str, Any]:
        from facebook_business.adobjects.ad import Ad
        ad = Ad(fbid=ad_id)
        ad.api_delete()
        return {'success': True}
    
    async def duplicate_ad(self, ad_id: str, new_name: str = None, adset_id: str = None) -> Dict[str, Any]:
        """Duplicate an ad"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._duplicate_ad_sync, ad_id, new_name, adset_id)
    
    def _duplicate_ad_sync(self, ad_id: str, new_name: str = None, adset_id: str = None) -> Dict[str, Any]:
        from facebook_business.adobjects.ad import Ad
        ad = Ad(fbid=ad_id)
        params = {}
        if adset_id:
            params['adset_id'] = adset_id
        result = ad.create_copy(params=params)
        return {'success': True, 'copied_ad_id': result.get('copied_ad_id')}
    
    # =========================================================================
    # AD PREVIEW
    # =========================================================================
    
    async def get_ad_preview(self, ad_id: str, ad_format: str = 'DESKTOP_FEED_STANDARD') -> Dict[str, Any]:
        """Get ad preview"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_ad_preview_sync, ad_id, ad_format)
    
    def _get_ad_preview_sync(self, ad_id: str, ad_format: str) -> Dict[str, Any]:
        from facebook_business.adobjects.ad import Ad
        ad = Ad(fbid=ad_id)
        previews = ad.get_previews(params={'ad_format': ad_format})
        return {'previews': [dict(p) for p in previews]}
    
    async def generate_ad_preview(self, account_id: str, creative: Dict, ad_format: str = 'DESKTOP_FEED_STANDARD') -> Dict[str, Any]:
        """Generate ad preview from creative spec"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._generate_ad_preview_sync, account_id, creative, ad_format)
    
    def _generate_ad_preview_sync(self, account_id: str, creative: Dict, ad_format: str) -> Dict[str, Any]:
        account = AdAccount(f'act_{account_id}')
        params = {'creative': creative, 'ad_format': ad_format}
        previews = account.get_generate_previews(params=params)
        return {'previews': [dict(p) for p in previews]}
    
    # =========================================================================
    # AUDIENCES (kept for MetaAdsService compatibility)
    # =========================================================================
    
    async def get_custom_audiences(self, account_id: str) -> List[Dict[str, Any]]:
        """Fetch custom audiences"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_custom_audiences_sync, account_id)
    
    def _get_custom_audiences_sync(self, account_id: str) -> List[Dict[str, Any]]:
        account = AdAccount(f'act_{account_id}')
        audiences = account.get_custom_audiences(fields=[
            'id', 'name', 'subtype', 'description',
            'approximate_count_lower_bound', 'approximate_count_upper_bound',
            'data_source', 'delivery_status', 'time_created', 'time_updated',
            'operation_status', 'retention_days', 'rule', 'lookalike_spec',
            'is_value_based', 'sharing_status', 'permission_for_actions'
        ])
        return [self._serialize_sdk_object(dict(a)) for a in audiences]
    
    async def create_lookalike_audience(
        self,
        account_id: str,
        name: str,
        source_audience_id: str,
        target_countries: List[str],
        ratio: float = 0.01
    ) -> Dict[str, Any]:
        """Create a lookalike audience"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._create_lookalike_audience_sync,
            account_id,
            name,
            source_audience_id,
            target_countries,
            ratio
        )
    
    def _create_lookalike_audience_sync(
        self,
        account_id: str,
        name: str,
        source_audience_id: str,
        target_countries: List[str],
        ratio: float
    ) -> Dict[str, Any]:
        try:
            account = AdAccount(f'act_{account_id}')
            
            # Construct spec per v24.0 2026 standards
            lookalike_spec = {
                'type': 'similarity',
                'ratio': ratio,
                'allow_international_seeds': True
            }
            
            # Handle country targeting - require at least one country
            if not target_countries:
                raise ValueError("At least one target country is required for lookalike audience")
            
            if len(target_countries) == 1:
                lookalike_spec['country'] = target_countries[0]
            else:
                lookalike_spec['location_spec'] = {
                    'geo_locations': {
                        'countries': target_countries
                    }
                }
            
            params = {
                'name': name,
                'subtype': 'LOOKALIKE',
                'origin_audience_id': source_audience_id,
                'lookalike_spec': lookalike_spec
            }
            
            audience = account.create_custom_audience(params=params)
            
            return {
                'success': True,
                'audience_id': audience['id'],
                'audience': self._serialize_sdk_object(dict(audience))
            }
            
        except FacebookRequestError as e:
            logger.error(f"Meta API error creating lookalike audience: {e}")
            return {'success': False, 'error': e.api_error_message()}
        except Exception as e:
            logger.error(f"Error creating lookalike audience: {e}")
            return {'success': False, 'error': str(e)}
    
    # =========================================================================
    # AD ACCOUNT INFO
    # =========================================================================
    
    async def get_ad_account_info(self, account_id: str) -> Dict[str, Any]:
        """Get ad account details"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_ad_account_info_sync, account_id)
    
    def _get_ad_account_info_sync(self, account_id: str) -> Dict[str, Any]:
        account = AdAccount(f'act_{account_id}')
        account.api_get(fields=[
            'id', 'account_id', 'name', 'currency', 'timezone_name',
            'account_status', 'amount_spent', 'balance', 'business', 'spend_cap'
        ])
        return {'adAccount': dict(account)}
    
    async def get_campaign_advantage_state(self, campaign_id: str) -> Dict[str, Any]:
        """Get Advantage+ state for a campaign"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_campaign_advantage_state_sync, campaign_id)
    
    def _get_campaign_advantage_state_sync(self, campaign_id: str) -> Dict[str, Any]:
        """
        Get Advantage+ state for a campaign using v24.0 API.
        Uses advantage_state_info instead of deprecated smart_promotion_type.
        """
        from facebook_business.adobjects.campaign import Campaign
        campaign = Campaign(fbid=campaign_id)
        campaign.api_get(fields=['id', 'name', 'objective', 'status', 'advantage_state_info'])
        
        advantage_state_info = campaign.get('advantage_state_info', {})
        if not advantage_state_info:
            return {
                'campaign_id': campaign_id,
                'name': campaign.get('name'),
                'objective': campaign.get('objective'),
                'advantage_state': 'DISABLED',
                'advantage_state_info': {
                    'advantage_state': 'DISABLED',
                    'advantage_budget_state': 'DISABLED',
                    'advantage_audience_state': 'DISABLED',
                    'advantage_placement_state': 'DISABLED'
                }
            }
        
        return {
            'campaign_id': campaign_id,
            'name': campaign.get('name'),
            'objective': campaign.get('objective'),
            'advantage_state': advantage_state_info.get('advantage_state', 'DISABLED'),
            'advantage_state_info': {
                'advantage_state': advantage_state_info.get('advantage_state', 'DISABLED'),
                'advantage_budget_state': advantage_state_info.get('advantage_budget_state', 'DISABLED'),
                'advantage_audience_state': advantage_state_info.get('advantage_audience_state', 'DISABLED'),
                'advantage_placement_state': advantage_state_info.get('advantage_placement_state', 'DISABLED')
            }
        }
    
    # =========================================================================
    # PIXEL OPERATIONS
    # =========================================================================
    
    async def get_pixels(self, account_id: str) -> Dict[str, Any]:
        """Fetch pixels for an ad account"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_pixels_sync, account_id)
    
    def _get_pixels_sync(self, account_id: str) -> Dict[str, Any]:
        account = AdAccount(f'act_{account_id}')
        pixels = account.get_ads_pixels(fields=[
            'id', 'name', 'code', 'creation_time', 'is_created_by_business',
            'last_fired_time', 'owner_business'
        ])
        return {'success': True, 'pixels': [self._serialize_sdk_object(dict(p)) for p in pixels]}
    
    # =========================================================================
    # USER PAGES
    # =========================================================================
    
    async def get_user_pages(self) -> List[Dict[str, Any]]:
        """Fetch pages accessible to the user"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_user_pages_sync)
    
    def _get_user_pages_sync(self) -> List[Dict[str, Any]]:
        from facebook_business.adobjects.user import User
        me = User(fbid='me')
        pages = me.get_accounts(fields=[
            'id', 'name', 'access_token', 'category'
        ])
        return [self._serialize_sdk_object(dict(p)) for p in pages]
    
    async def get_page_details(self, page_id: str) -> Dict[str, Any]:
        """Get details for a specific page"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_page_details_sync, page_id)
    
    def _get_page_details_sync(self, page_id: str) -> Dict[str, Any]:
        from facebook_business.adobjects.page import Page
        page = Page(fbid=page_id)
        page.api_get(fields=[
            'id', 'name', 'category', 'picture', 'fan_count', 
            'followers_count', 'about', 'website'
        ])
        return self._serialize_sdk_object(dict(page))
    
    # =========================================================================
    # USER APPS
    # =========================================================================
    
    async def get_user_apps(self) -> List[Dict[str, Any]]:
        """Fetch apps accessible to the user for app promotion campaigns"""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_user_apps_sync)
    
    def _get_user_apps_sync(self) -> List[Dict[str, Any]]:
        from facebook_business.adobjects.user import User
        try:
            me = User(fbid='me')
            apps = me.get_developer_applications(fields=[
                'id', 'name', 'app_type', 'created_time'
            ])
            return [self._serialize_sdk_object(dict(a)) for a in apps]
        except Exception as e:
            # User may not have developer access
            logger.warning(f"Could not fetch apps: {e}")
            return []
    
    # =========================================================================
    # INSIGHTS / ANALYTICS
    # =========================================================================
    
    async def get_account_insights(
        self, account_id: str, date_preset: str = 'last_7d',
        fields: List[str] = None, breakdowns: List[str] = None
    ) -> Dict[str, Any]:
        """Get account-level insights"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._get_account_insights_sync, account_id, date_preset, fields, breakdowns
        )
    
    def _get_account_insights_sync(
        self, account_id: str, date_preset: str = 'last_7d',
        fields: List[str] = None, breakdowns: List[str] = None
    ) -> Dict[str, Any]:
        account = AdAccount(f'act_{account_id}')
        default_fields = [
            'impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpm', 'cpc',
            'actions', 'conversions', 'cost_per_action_type'
        ]
        params = {
            'date_preset': date_preset,
            'level': 'account'
        }
        if breakdowns:
            params['breakdowns'] = breakdowns
        insights = account.get_insights(
            fields=fields or default_fields,
            params=params
        )
        return {'data': [self._serialize_sdk_object(dict(i)) for i in insights]}
    
    async def get_insights_breakdown(
        self, account_id: str, breakdown: str = 'age',
        date_preset: str = 'last_7d', level: str = 'account'
    ) -> Dict[str, Any]:
        """Get insights with breakdown"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._get_insights_breakdown_sync, account_id, breakdown, date_preset, level
        )
    
    def _get_insights_breakdown_sync(
        self, account_id: str, breakdown: str = 'age',
        date_preset: str = 'last_7d', level: str = 'account'
    ) -> Dict[str, Any]:
        account = AdAccount(f'act_{account_id}')
        fields = [
            'impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpm', 'cpc',
            'actions', 'conversions'
        ]
        params = {
            'date_preset': date_preset,
            'level': level,
            'breakdowns': [breakdown]
        }
        insights = account.get_insights(fields=fields, params=params)
        return {'data': [self._serialize_sdk_object(dict(i)) for i in insights]}
    
    async def get_campaign_insights(
        self, campaign_id: str, date_preset: str = 'last_7d'
    ) -> Dict[str, Any]:
        """Get campaign-level insights"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._get_campaign_insights_sync, campaign_id, date_preset
        )
    
    def _get_campaign_insights_sync(self, campaign_id: str, date_preset: str = 'last_7d') -> Dict[str, Any]:
        from facebook_business.adobjects.campaign import Campaign
        campaign = Campaign(fbid=campaign_id)
        fields = [
            'impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpm', 'cpc',
            'actions', 'conversions', 'cost_per_action_type'
        ]
        insights = campaign.get_insights(fields=fields, params={'date_preset': date_preset})
        return {'data': [self._serialize_sdk_object(dict(i)) for i in insights]}
    
    async def get_adset_insights(
        self, adset_id: str, date_preset: str = 'last_7d'
    ) -> Dict[str, Any]:
        """Get ad set-level insights"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._get_adset_insights_sync, adset_id, date_preset
        )
    
    def _get_adset_insights_sync(self, adset_id: str, date_preset: str = 'last_7d') -> Dict[str, Any]:
        from facebook_business.adobjects.adset import AdSet
        adset = AdSet(fbid=adset_id)
        fields = [
            'impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpm', 'cpc',
            'actions', 'conversions', 'cost_per_action_type'
        ]
        insights = adset.get_insights(fields=fields, params={'date_preset': date_preset})
        return {'data': [self._serialize_sdk_object(dict(i)) for i in insights]}
    
    async def get_ad_insights(
        self, ad_id: str, date_preset: str = 'last_7d'
    ) -> Dict[str, Any]:
        """Get ad-level insights"""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._get_ad_insights_sync, ad_id, date_preset
        )
    
    def _get_ad_insights_sync(self, ad_id: str, date_preset: str = 'last_7d') -> Dict[str, Any]:
        from facebook_business.adobjects.ad import Ad
        ad = Ad(fbid=ad_id)
        fields = [
            'impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpm', 'cpc',
            'actions', 'conversions', 'cost_per_action_type'
        ]
        insights = ad.get_insights(fields=fields, params={'date_preset': date_preset})
        return {'data': [self._serialize_sdk_object(dict(i)) for i in insights]}
    
    # =========================================================================
    # SETTINGS OPERATIONS (for API routes)
    # =========================================================================
    
    async def get_notification_settings(self, account_id: str) -> Dict[str, Any]:
        """Get notification settings for an ad account."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_notification_settings_sync, account_id)
    
    def _get_notification_settings_sync(self, account_id: str) -> Dict[str, Any]:
        """
        Get notification settings for an ad account.
        Note: Meta API doesn't have a direct notification settings endpoint.
        This returns the ad rules configured for notifications, or empty settings if unavailable.
        """
        try:
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{account_id}/adrules_library"
            params = {
                "access_token": self._access_token,
                "fields": "id,name,status,execution_spec",
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                data = response.json()
                # Extract notification rules
                notification_rules = []
                for rule in data.get("data", []):
                    exec_spec = rule.get("execution_spec", {})
                    if exec_spec.get("execution_type") == "NOTIFICATION":
                        notification_rules.append(rule)
                
                return {
                    "success": True,
                    "settings": {
                        "notification_rules": notification_rules,
                        "total_count": len(notification_rules)
                    }
                }
            else:
                # Return empty settings gracefully instead of error
                # Meta API may not support this endpoint for all account types
                logger.warning(f"Could not fetch notification settings: {response.text}")
                return {
                    "success": True,
                    "settings": {
                        "notification_rules": [],
                        "total_count": 0,
                        "note": "Notification settings not available for this account"
                    }
                }
                
        except Exception as e:
            logger.error(f"Get notification settings error: {e}")
            # Return empty settings gracefully
            return {
                "success": True,
                "settings": {
                    "notification_rules": [],
                    "total_count": 0,
                    "note": "Could not retrieve notification settings"
                }
            }
    
    async def get_ad_account_users(self, account_id: str) -> Dict[str, Any]:
        """Get users with access to an ad account (Team Access)."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_ad_account_users_sync, account_id)
    
    def _get_ad_account_users_sync(self, account_id: str) -> Dict[str, Any]:
        """Get users with access to an ad account."""
        try:
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{account_id}/users"
            params = {
                "access_token": self._access_token,
                "fields": "id,name,role,permissions"
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                data = response.json()
                return {"success": True, "users": data.get("data", [])}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get users")
                }
                
        except Exception as e:
            logger.error(f"Get ad account users error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_funding_sources(self, account_id: str) -> Dict[str, Any]:
        """Get funding sources (payment methods) for an ad account."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_funding_sources_sync, account_id)
    
    def _get_funding_sources_sync(self, account_id: str) -> Dict[str, Any]:
        """Get funding sources for an ad account."""
        try:
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{account_id}"
            params = {
                "access_token": self._access_token,
                "fields": "funding_source,funding_source_details"
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                return {"success": True, "funding_sources": [response.json()]}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get funding sources")
                }
                
        except Exception as e:
            logger.error(f"Get funding sources error: {e}")
            return {"success": False, "error": str(e)}

    async def get_ad_account_activities(
        self, account_id: str, since: str = None, until: str = None, limit: int = 50
    ) -> Dict[str, Any]:
        """Get activity log for an ad account."""
        self._ensure_initialized()
        return await asyncio.to_thread(
            self._get_ad_account_activities_sync, account_id, since, until, limit
        )
    
    def _get_ad_account_activities_sync(
        self, account_id: str, since: str = None, until: str = None, limit: int = 50
    ) -> Dict[str, Any]:
        """Get activity log for an ad account."""
        try:
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{account_id}/activities"
            params = {
                "access_token": self._access_token,
                "fields": "actor_id,actor_name,application_name,date_time_in_timezone,event_time,event_type,object_id,object_name,translated_event_type,extra_data",
                "limit": limit
            }
            if since:
                params["since"] = since
            if until:
                params["until"] = until
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                data = response.json()
                return {"success": True, "activities": data.get("data", []), "paging": data.get("paging")}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get activities")
                }
                
        except Exception as e:
            logger.error(f"Get ad account activities error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_ad_account_invoices(self, account_id: str, limit: int = 25) -> Dict[str, Any]:
        """Get invoices for an ad account."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_ad_account_invoices_sync, account_id, limit)
    
    def _get_ad_account_invoices_sync(self, account_id: str, limit: int = 25) -> Dict[str, Any]:
        """Get invoices for an ad account."""
        try:
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{account_id}"
            params = {
                "access_token": self._access_token,
                "fields": "id,name,account_id"
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                # Note: Invoices are typically at business level, not account level
                return {"success": True, "invoices": []}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get invoices")
                }
                
        except Exception as e:
            logger.error(f"Get ad account invoices error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_business_info(self, business_id: str) -> Dict[str, Any]:
        """Get business information."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_business_info_sync, business_id)
    
    def _get_business_info_sync(self, business_id: str) -> Dict[str, Any]:
        """Get business information."""
        try:
            if not business_id:
                return {"success": False, "error": "Business ID is required"}
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{business_id}"
            params = {
                "access_token": self._access_token,
                "fields": "id,name,created_time,timezone,primary_page,profile_picture_uri,verification_status,vertical"
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                return {"success": True, "business": response.json()}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get business info")
                }
                
        except Exception as e:
            logger.error(f"Get business info error: {e}")
            return {"success": False, "error": str(e)}

    async def get_pixel_details(self, pixel_id: str) -> Dict[str, Any]:
        """Get details for a specific pixel."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_pixel_details_sync, pixel_id)
    
    def _get_pixel_details_sync(self, pixel_id: str) -> Dict[str, Any]:
        """Get details for a specific pixel."""
        try:
            import httpx
            url = f"https://graph.facebook.com/v24.0/{pixel_id}"
            params = {
                "access_token": self._access_token,
                "fields": "id,name,code,creation_time,creator,is_created_by_business,owner_ad_account,owner_business,last_fired_time,data_use_setting,enable_automatic_matching,first_party_cookie_status"
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                return {"success": True, "pixel": response.json()}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get pixel details")
                }
                
        except Exception as e:
            logger.error(f"Get pixel details error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_pixel_users(self, pixel_id: str) -> Dict[str, Any]:
        """Get users assigned to a pixel."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._get_pixel_users_sync, pixel_id)
    
    def _get_pixel_users_sync(self, pixel_id: str) -> Dict[str, Any]:
        """Get users assigned to a pixel."""
        try:
            import httpx
            url = f"https://graph.facebook.com/v24.0/{pixel_id}/assigned_users"
            params = {
                "access_token": self._access_token,
                "fields": "id,name,tasks"
            }
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.get(url, params=params, timeout=30.0)
            
            if response.is_success:
                data = response.json()
                return {"success": True, "users": data.get("data", [])}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get pixel users")
                }
                
        except Exception as e:
            logger.error(f"Get pixel users error: {e}")
            return {"success": False, "error": str(e)}
    
    async def update_pixel(self, pixel_id: str, updates: Dict) -> Dict[str, Any]:
        """Update pixel settings."""
        self._ensure_initialized()
        return await asyncio.to_thread(self._update_pixel_sync, pixel_id, updates)
    
    def _update_pixel_sync(self, pixel_id: str, updates: Dict) -> Dict[str, Any]:
        """Update pixel settings."""
        try:
            if not updates:
                return {"success": False, "error": "No updates provided"}
            
            import httpx
            url = f"https://graph.facebook.com/v24.0/{pixel_id}"
            params = {"access_token": self._access_token}
            params.update(updates)
            
            # Add appsecret_proof for server-side calls
            appsecret_proof = self._get_appsecret_proof()
            if appsecret_proof:
                params["appsecret_proof"] = appsecret_proof
            
            response = httpx.post(url, params=params, timeout=30.0)
            
            if response.is_success:
                return {"success": True, "pixel_id": pixel_id}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to update pixel")
                }
                
        except Exception as e:
            logger.error(f"Update pixel error: {e}")
            return {"success": False, "error": str(e)}


# =============================================================================
# SINGLETON INSTANCE & FACTORY
# =============================================================================

_sdk_client: Optional[MetaSDKClient] = None


def get_meta_sdk_client(access_token: Optional[str] = None) -> MetaSDKClient:
    """
    Get or create MetaSDKClient singleton.
    
    If access_token is provided, switches to that token.
    
    Args:
        access_token: Optional access token to use
        
    Returns:
        MetaSDKClient instance
    """
    global _sdk_client
    
    if _sdk_client is None:
        _sdk_client = MetaSDKClient(access_token=access_token)
    elif access_token:
        _sdk_client.switch_access_token(access_token)
    
    return _sdk_client


def create_meta_sdk_client(access_token: str) -> MetaSDKClient:
    """
    Create a new MetaSDKClient instance with specific token.
    
    Use this when you need isolated clients (e.g., for different users).
    
    Args:
        access_token: Access token for this client
        
    Returns:
        New MetaSDKClient instance
    """
    return MetaSDKClient(access_token=access_token)
