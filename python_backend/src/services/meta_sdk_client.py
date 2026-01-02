"""
Meta Business SDK Client
Centralized SDK client wrapper for Meta Business APIs (Facebook, Instagram, Marketing API)

Based on official Meta Business SDK documentation:
https://developers.facebook.com/docs/business-sdk/getting-started

Install: pip install facebook_business

This module provides:
- Async wrappers for SDK sync calls
- Session management with token switching
- Request batching support
- Unified error handling
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List
from functools import wraps

# Meta Business SDK imports
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.user import User
from facebook_business.adobjects.page import Page
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.customaudience import CustomAudience
from facebook_business.adobjects.business import Business
from facebook_business.adobjects.iguser import IGUser
from facebook_business.exceptions import FacebookRequestError

from ..config import settings

logger = logging.getLogger(__name__)

# API Version (matches Graph API version in docs)
META_API_VERSION = "v25.0"


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
            logger.error(f"Meta SDK error: {e.api_error_message()}")
            raise MetaSDKError.from_facebook_error(e)
        except Exception as e:
            logger.error(f"Unexpected error in SDK call: {str(e)}")
            raise MetaSDKError(message=str(e))
    return wrapper


class MetaSDKClient:
    """
    Meta Business SDK Client
    
    Provides unified access to:
    - Facebook Pages API
    - Instagram Graph API  
    - Marketing API (Ads)
    - Business Manager API
    
    Usage:
        client = MetaSDKClient(app_id, app_secret, access_token)
        pages = await client.get_user_pages()
        campaigns = await client.get_campaigns(ad_account_id)
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
    
    # =========================================================================
    # USER & PAGE OPERATIONS
    # =========================================================================
    
    @async_sdk_call
    def _get_user_pages_sync(self) -> List[Dict[str, Any]]:
        """
        Get user's pages using direct HTTP call with v24 API.
        Uses v24 for credential operations (v25 for ads only).
        """
        self._ensure_initialized()
        
        import httpx
        
        # Use v24 for credential/pages operations
        url = f"https://graph.facebook.com/v24.0/me/accounts"
        params = {
            'access_token': self._access_token,
            'fields': 'id,name,access_token,category,instagram_business_account,picture'
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if not response.is_success:
                error_data = response.json() if response.content else {}
                error_msg = error_data.get('error', {}).get('message', f'HTTP {response.status_code}')
                raise MetaSDKError(f"Failed to get pages: {error_msg}")
            
            data = response.json()
            pages = data.get('data', [])
            
            return [
                {
                    'id': page['id'],
                    'name': page.get('name'),
                    'access_token': page.get('access_token'),
                    'category': page.get('category'),
                    'instagram_business_account': page.get('instagram_business_account'),
                    'picture': page.get('picture', {}).get('data', {}).get('url')
                }
                for page in pages
            ]
    
    async def get_user_pages(self) -> List[Dict[str, Any]]:
        """
        Get Facebook Pages managed by the user.
        Uses v24 API for credential operations.
        
        Returns:
            List of Page objects with id, name, access_token, category
        """
        return await self._get_user_pages_sync()
    
    @async_sdk_call
    def _get_page_info_sync(self, page_id: str) -> Dict[str, Any]:
        """Get info about a specific Page"""
        self._ensure_initialized()
        
        page = Page(fbid=page_id)
        page.api_get(fields=[
            'id',
            'name',
            'about',
            'category',
            'fan_count',
            'picture',
            'instagram_business_account'
        ])
        
        return {
            'id': page['id'],
            'name': page.get('name'),
            'about': page.get('about'),
            'category': page.get('category'),
            'fan_count': page.get('fan_count'),
            'picture': page.get('picture', {}).get('data', {}).get('url'),
            'instagram_business_account': page.get('instagram_business_account')
        }
    
    async def get_page_info(self, page_id: str) -> Dict[str, Any]:
        """Get information about a specific Facebook Page"""
        return await self._get_page_info_sync(page_id)
    
    # =========================================================================
    # FACEBOOK PAGE PUBLISHING (Per Meta docs: /page_id/feed, /page_id/photos)
    # =========================================================================
    
    @async_sdk_call
    def _post_to_page_sync(
        self, 
        page_id: str, 
        message: str,
        link: Optional[str] = None,
        published: bool = True,
        scheduled_publish_time: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Post to Facebook Page feed.
        Per docs: POST /page_id/feed with message, link, published params
        """
        self._ensure_initialized()
        
        page = Page(fbid=page_id)
        params = {'message': message}
        
        if link:
            params['link'] = link
        if not published:
            params['published'] = False
            if scheduled_publish_time:
                params['scheduled_publish_time'] = scheduled_publish_time
        
        result = page.create_feed(**params)
        return {'id': result.get('id'), 'post_id': result.get('id')}
    
    async def post_to_page(
        self, 
        page_id: str, 
        message: str,
        link: Optional[str] = None,
        published: bool = True,
        scheduled_publish_time: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Publish a text/link post to a Facebook Page.
        
        Args:
            page_id: Facebook Page ID
            message: Post message text
            link: Optional URL to include
            published: True for immediate publish, False for scheduled
            scheduled_publish_time: Unix timestamp for scheduled posts
            
        Returns:
            Dict with post_id
        """
        return await self._post_to_page_sync(page_id, message, link, published, scheduled_publish_time)
    
    @async_sdk_call
    def _post_photo_to_page_sync(
        self, 
        page_id: str, 
        photo_url: str,
        caption: Optional[str] = None,
        published: bool = True
    ) -> Dict[str, Any]:
        """
        Post photo to Facebook Page.
        Per docs: POST /page_id/photos with url param
        """
        self._ensure_initialized()
        
        page = Page(fbid=page_id)
        params = {'url': photo_url}
        if caption:
            params['caption'] = caption
        if not published:
            params['published'] = False
            
        result = page.create_photo(**params)
        return {
            'id': result.get('id'),
            'photo_id': result.get('id'),
            'post_id': result.get('post_id')
        }
    
    async def post_photo_to_page(
        self, 
        page_id: str, 
        photo_url: str,
        caption: Optional[str] = None,
        published: bool = True
    ) -> Dict[str, Any]:
        """
        Publish a photo to a Facebook Page.
        
        Args:
            page_id: Facebook Page ID
            photo_url: Public URL of the photo
            caption: Optional photo caption
            published: True for immediate publish
            
        Returns:
            Dict with photo_id and post_id
        """
        return await self._post_photo_to_page_sync(page_id, photo_url, caption, published)
    
    @async_sdk_call
    def _post_video_to_page_sync(
        self, 
        page_id: str, 
        video_url: str,
        description: Optional[str] = None,
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Post video to Facebook Page.
        Per docs: Video API for publishing videos
        """
        self._ensure_initialized()
        
        page = Page(fbid=page_id)
        params = {'file_url': video_url}
        if description:
            params['description'] = description
        if title:
            params['title'] = title
            
        result = page.create_video(**params)
        return {'id': result.get('id'), 'video_id': result.get('id')}
    
    async def post_video_to_page(
        self, 
        page_id: str, 
        video_url: str,
        description: Optional[str] = None,
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a video to a Facebook Page.
        
        Args:
            page_id: Facebook Page ID
            video_url: Public URL of the video
            description: Optional video description
            title: Optional video title
            
        Returns:
            Dict with video_id
        """
        return await self._post_video_to_page_sync(page_id, video_url, description, title)
    
    # =========================================================================
    # INSTAGRAM OPERATIONS (Per Meta docs: /IG_ID/media, /IG_ID/media_publish)
    # =========================================================================
    
    @async_sdk_call
    def _get_instagram_account_sync(self, page_id: str) -> Optional[Dict[str, Any]]:
        """Get Instagram Business Account linked to a Page"""
        self._ensure_initialized()
        
        page = Page(fbid=page_id)
        page.api_get(fields=['instagram_business_account'])
        
        ig_account = page.get('instagram_business_account')
        if not ig_account:
            return None
        
        # Get more details about the IG account
        ig_user = IGUser(fbid=ig_account['id'])
        ig_user.api_get(fields=[
            'id',
            'username',
            'name',
            'profile_picture_url',
            'followers_count',
            'media_count'
        ])
        
        return {
            'id': ig_user['id'],
            'username': ig_user.get('username'),
            'name': ig_user.get('name'),
            'profile_picture_url': ig_user.get('profile_picture_url'),
            'followers_count': ig_user.get('followers_count'),
            'media_count': ig_user.get('media_count')
        }
    
    async def get_instagram_account(self, page_id: str) -> Optional[Dict[str, Any]]:
        """Get Instagram Business Account linked to a Facebook Page"""
        return await self._get_instagram_account_sync(page_id)
    
    @async_sdk_call
    def _create_instagram_media_container_sync(
        self,
        ig_user_id: str,
        image_url: Optional[str] = None,
        video_url: Optional[str] = None,
        caption: Optional[str] = None,
        media_type: Optional[str] = None,
        is_carousel_item: bool = False,
        share_to_feed: bool = True
    ) -> Dict[str, Any]:
        """
        Create Instagram media container (Step 1 of publishing).
        Per docs: POST /IG_ID/media with image_url or video_url
        """
        self._ensure_initialized()
        
        ig_user = IGUser(fbid=ig_user_id)
        params = {}
        
        if image_url:
            params['image_url'] = image_url
        if video_url:
            params['video_url'] = video_url
        if caption:
            params['caption'] = caption
        if media_type:
            params['media_type'] = media_type  # VIDEO, REELS, STORIES, CAROUSEL
        if is_carousel_item:
            params['is_carousel_item'] = True
        if media_type == 'REELS':
            params['share_to_feed'] = share_to_feed
        
        result = ig_user.create_media(**params)
        return {'container_id': result.get('id'), 'id': result.get('id')}
    
    async def create_instagram_media_container(
        self,
        ig_user_id: str,
        image_url: Optional[str] = None,
        video_url: Optional[str] = None,
        caption: Optional[str] = None,
        media_type: Optional[str] = None,
        is_carousel_item: bool = False,
        share_to_feed: bool = True
    ) -> Dict[str, Any]:
        """
        Create Instagram media container (Step 1).
        
        Args:
            ig_user_id: Instagram Business Account ID
            image_url: URL of image (for image posts)
            video_url: URL of video (for video/reels/stories)
            caption: Post caption
            media_type: VIDEO, REELS, STORIES, or CAROUSEL
            is_carousel_item: True if part of carousel
            share_to_feed: For reels, whether to also share to feed
            
        Returns:
            Dict with container_id
        """
        return await self._create_instagram_media_container_sync(
            ig_user_id, image_url, video_url, caption, media_type, is_carousel_item, share_to_feed
        )
    
    @async_sdk_call
    def _create_instagram_carousel_container_sync(
        self,
        ig_user_id: str,
        children: List[str],
        caption: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create Instagram carousel container.
        Per docs: POST /IG_ID/media with media_type=CAROUSEL and children
        """
        self._ensure_initialized()
        
        ig_user = IGUser(fbid=ig_user_id)
        params = {
            'media_type': 'CAROUSEL',
            'children': children  # List of container IDs
        }
        if caption:
            params['caption'] = caption
        
        result = ig_user.create_media(**params)
        return {'container_id': result.get('id'), 'id': result.get('id')}
    
    async def create_instagram_carousel_container(
        self,
        ig_user_id: str,
        children: List[str],
        caption: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create Instagram carousel container.
        
        Args:
            ig_user_id: Instagram Business Account ID
            children: List of container IDs (2-10 items)
            caption: Carousel caption
            
        Returns:
            Dict with container_id
        """
        return await self._create_instagram_carousel_container_sync(ig_user_id, children, caption)
    
    @async_sdk_call
    def _publish_instagram_media_sync(
        self,
        ig_user_id: str,
        creation_id: str
    ) -> Dict[str, Any]:
        """
        Publish Instagram media container (Step 2).
        Per docs: POST /IG_ID/media_publish with creation_id
        """
        self._ensure_initialized()
        
        ig_user = IGUser(fbid=ig_user_id)
        result = ig_user.create_media_publish(creation_id=creation_id)
        return {'id': result.get('id'), 'media_id': result.get('id')}
    
    async def publish_instagram_media(
        self,
        ig_user_id: str,
        creation_id: str
    ) -> Dict[str, Any]:
        """
        Publish Instagram media container (Step 2).
        
        Args:
            ig_user_id: Instagram Business Account ID
            creation_id: Container ID from create step
            
        Returns:
            Dict with media_id (the published post ID)
        """
        return await self._publish_instagram_media_sync(ig_user_id, creation_id)
    
    @async_sdk_call
    def _get_instagram_container_status_sync(
        self,
        container_id: str
    ) -> Dict[str, Any]:
        """Check status of Instagram media container"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.igmedia import IGMedia
        container = IGMedia(fbid=container_id)
        container.api_get(fields=['id', 'status', 'status_code'])
        
        return {
            'id': container.get('id'),
            'status': container.get('status'),
            'status_code': container.get('status_code')
        }
    
    async def get_instagram_container_status(self, container_id: str) -> Dict[str, Any]:
        """
        Check the processing status of an Instagram container.
        
        Args:
            container_id: Container ID to check
            
        Returns:
            Dict with status (FINISHED, IN_PROGRESS, ERROR)
        """
        return await self._get_instagram_container_status_sync(container_id)

    
    # =========================================================================
    # ADS / MARKETING API OPERATIONS
    # =========================================================================
    
    @async_sdk_call
    def _get_ad_accounts_sync(self) -> List[Dict[str, Any]]:
        """Get user's ad accounts"""
        self._ensure_initialized()
        
        user = User(fbid='me')
        ad_accounts = user.get_ad_accounts(fields=[
            'id',
            'account_id',
            'name',
            'account_status',
            'currency',
            'timezone_name',
            'business'
        ])
        
        return [
            {
                'id': acc['id'],
                'account_id': acc.get('account_id'),
                'name': acc.get('name'),
                'account_status': acc.get('account_status'),
                'currency': acc.get('currency'),
                'timezone_name': acc.get('timezone_name'),
                'business_id': acc.get('business', {}).get('id') if acc.get('business') else None
            }
            for acc in ad_accounts
        ]
    
    async def get_ad_accounts(self) -> List[Dict[str, Any]]:
        """Get all Ad Accounts the user has access to"""
        return await self._get_ad_accounts_sync()
    
    @async_sdk_call  
    def _get_campaigns_sync(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get campaigns for an ad account"""
        self._ensure_initialized()
        
        # Ensure account_id has 'act_' prefix
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        campaigns = account.get_campaigns(fields=[
            'id',
            'name',
            'objective',
            'status',
            'effective_status',
            'daily_budget',
            'lifetime_budget',
            'bid_strategy',
            'special_ad_categories',
            'created_time',
            'updated_time',
            'advantage_state_info'  # v25.0+ Advantage+ state
        ])
        
        return [
            {
                'id': camp['id'],
                'name': camp.get('name'),
                'objective': camp.get('objective'),
                'status': camp.get('status'),
                'effective_status': camp.get('effective_status'),
                'daily_budget': camp.get('daily_budget'),
                'lifetime_budget': camp.get('lifetime_budget'),
                'bid_strategy': camp.get('bid_strategy'),
                'special_ad_categories': camp.get('special_ad_categories'),
                'created_time': camp.get('created_time'),
                'updated_time': camp.get('updated_time'),
                'advantage_state_info': camp.get('advantage_state_info')  # v25.0+
            }
            for camp in campaigns
        ]
    
    async def get_campaigns(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get all campaigns for an Ad Account"""
        return await self._get_campaigns_sync(ad_account_id)
    
    @async_sdk_call
    def _get_adsets_sync(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get ad sets for an ad account"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        adsets = account.get_ad_sets(fields=[
            'id',
            'name',
            'campaign_id',
            'status',
            'effective_status',
            'optimization_goal',
            'billing_event',
            'daily_budget',
            'lifetime_budget',
            'targeting',
            'created_time',
            'updated_time'
        ])
        
        return [
            {
                'id': adset['id'],
                'name': adset.get('name'),
                'campaign_id': adset.get('campaign_id'),
                'status': adset.get('status'),
                'effective_status': adset.get('effective_status'),
                'optimization_goal': adset.get('optimization_goal'),
                'billing_event': adset.get('billing_event'),
                'daily_budget': adset.get('daily_budget'),
                'lifetime_budget': adset.get('lifetime_budget'),
                'targeting': adset.get('targeting'),
                'created_time': adset.get('created_time'),
                'updated_time': adset.get('updated_time')
            }
            for adset in adsets
        ]
    
    async def get_adsets(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get all Ad Sets for an Ad Account"""
        return await self._get_adsets_sync(ad_account_id)
    
    @async_sdk_call
    def _get_ads_sync(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get ads for an ad account"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        ads = account.get_ads(fields=[
            'id',
            'name',
            'adset_id',
            'campaign_id',
            'status',
            'effective_status',
            'creative',
            'created_time',
            'updated_time'
        ])
        
        return [
            {
                'id': ad['id'],
                'name': ad.get('name'),
                'adset_id': ad.get('adset_id'),
                'campaign_id': ad.get('campaign_id'),
                'status': ad.get('status'),
                'effective_status': ad.get('effective_status'),
                'creative': ad.get('creative'),
                'created_time': ad.get('created_time'),
                'updated_time': ad.get('updated_time')
            }
            for ad in ads
        ]
    
    async def get_ads(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get all Ads for an Ad Account"""
        return await self._get_ads_sync(ad_account_id)
    
    # =========================================================================
    # CAMPAIGN CRUD OPERATIONS
    # =========================================================================
    

    
    @async_sdk_call
    def _create_advantage_plus_campaign_sync(
        self,
        ad_account_id: str,
        name: str,
        objective: str,
        status: str,
        special_ad_categories: List[str],
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create Advantage+ Campaign (v25.0+)"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
            
        account = AdAccount(fbid=ad_account_id)
        
        params = {
            'name': name,
            'objective': objective,
            'status': status,
            'special_ad_categories': special_ad_categories
        }
        
        if daily_budget:
            params['daily_budget'] = daily_budget
        if lifetime_budget:
            params['lifetime_budget'] = lifetime_budget
        if bid_strategy:
            params['bid_strategy'] = bid_strategy
            
        # No 'smart_promotion_type' or legacy flags for v25.0+
        
        campaign = account.create_campaign(params=params)
        
        # Fetch Advantage+ state info
        try:
            campaign.remote_read(fields=['id', 'name', 'status', 'advantage_state_info'])
        except:
             pass # Fallback if field not available
        
        return dict(campaign)

    async def create_advantage_plus_campaign(
        self,
        ad_account_id: str,
        name: str,
        objective: str,
        status: str,
        special_ad_categories: List[str] = [],
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create Advantage+ Campaign"""
        return await self._create_advantage_plus_campaign_sync(
            ad_account_id, name, objective, status, special_ad_categories,
            daily_budget, lifetime_budget, bid_strategy
        )

    @async_sdk_call
    def _update_campaign_sync(
        self,
        campaign_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None
    ) -> Dict[str, Any]:
        """Update a campaign"""
        self._ensure_initialized()
        
        campaign = Campaign(fbid=campaign_id)
        params = {}
        
        if name:
            params['name'] = name
        if status:
            params['status'] = status
        if daily_budget is not None:
            params['daily_budget'] = daily_budget
        if lifetime_budget is not None:
            params['lifetime_budget'] = lifetime_budget
        
        campaign.api_update(params=params)
        return {'success': True, 'id': campaign_id}
    
    async def update_campaign(
        self,
        campaign_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None
    ) -> Dict[str, Any]:
        """Update an existing Campaign"""
        return await self._update_campaign_sync(campaign_id, name, status, daily_budget, lifetime_budget)
    
    @async_sdk_call
    def _delete_campaign_sync(self, campaign_id: str) -> Dict[str, Any]:
        """Delete a campaign"""
        self._ensure_initialized()
        
        campaign = Campaign(fbid=campaign_id)
        campaign.api_delete()
        return {'success': True, 'id': campaign_id}
    
    async def delete_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """Delete a Campaign"""
        return await self._delete_campaign_sync(campaign_id)
    
    # =========================================================================
    # AD SET CRUD OPERATIONS
    # =========================================================================
    
    @async_sdk_call
    def _create_adset_sync(
        self,
        ad_account_id: str,
        name: str,
        campaign_id: str,
        optimization_goal: str,
        billing_event: str,
        targeting: Dict[str, Any],
        status: str = 'PAUSED',
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        bid_amount: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a new ad set"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        params = {
            'name': name,
            'campaign_id': campaign_id,
            'optimization_goal': optimization_goal,
            'billing_event': billing_event,
            'targeting': targeting,
            'status': status
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
        
        adset = account.create_ad_set(params=params)
        return {'id': adset.get('id'), 'adset_id': adset.get('id')}
    
    async def create_adset(
        self,
        ad_account_id: str,
        name: str,
        campaign_id: str,
        optimization_goal: str,
        billing_event: str,
        targeting: Dict[str, Any],
        status: str = 'PAUSED',
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        bid_amount: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a new Ad Set.
        
        Args:
            ad_account_id: Ad Account ID
            name: Ad Set name
            campaign_id: Parent Campaign ID
            optimization_goal: LINK_CLICKS, REACH, IMPRESSIONS, etc.
            billing_event: IMPRESSIONS, LINK_CLICKS, etc.
            targeting: Targeting spec dict
            status: ACTIVE or PAUSED
            daily_budget: Daily budget in cents
            lifetime_budget: Lifetime budget in cents
            start_time: Start time ISO string
            end_time: End time ISO string
            bid_amount: Bid amount in cents
            
        Returns:
            Dict with adset_id
        """
        return await self._create_adset_sync(
            ad_account_id, name, campaign_id, optimization_goal, billing_event,
            targeting, status, daily_budget, lifetime_budget, start_time, end_time, bid_amount
        )
    
    @async_sdk_call
    def _update_adset_sync(
        self,
        adset_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        targeting: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update an ad set"""
        self._ensure_initialized()
        
        adset = AdSet(fbid=adset_id)
        params = {}
        
        if name:
            params['name'] = name
        if status:
            params['status'] = status
        if daily_budget is not None:
            params['daily_budget'] = daily_budget
        if lifetime_budget is not None:
            params['lifetime_budget'] = lifetime_budget
        if targeting:
            params['targeting'] = targeting
        
        adset.api_update(params=params)
        return {'success': True, 'id': adset_id}
    
    async def update_adset(
        self,
        adset_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        targeting: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update an existing Ad Set"""
        return await self._update_adset_sync(adset_id, name, status, daily_budget, lifetime_budget, targeting)
    
    # =========================================================================
    # AD CRUD OPERATIONS
    # =========================================================================
    
    @async_sdk_call
    def _create_ad_sync(
        self,
        ad_account_id: str,
        name: str,
        adset_id: str,
        creative_id: str,
        status: str = 'PAUSED'
    ) -> Dict[str, Any]:
        """Create a new ad"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        params = {
            'name': name,
            'adset_id': adset_id,
            'creative': {'creative_id': creative_id},
            'status': status
        }
        
        ad = account.create_ad(params=params)
        return {'id': ad.get('id'), 'ad_id': ad.get('id')}
    
    async def create_ad(
        self,
        ad_account_id: str,
        name: str,
        adset_id: str,
        creative_id: str,
        status: str = 'PAUSED'
    ) -> Dict[str, Any]:
        """
        Create a new Ad.
        
        Args:
            ad_account_id: Ad Account ID
            name: Ad name
            adset_id: Parent Ad Set ID
            creative_id: Ad Creative ID
            status: ACTIVE or PAUSED
            
        Returns:
            Dict with ad_id
        """
        return await self._create_ad_sync(ad_account_id, name, adset_id, creative_id, status)
    
    @async_sdk_call
    def _create_ad_creative_sync(
        self,
        ad_account_id: str,
        name: str,
        page_id: str,
        image_hash: Optional[str] = None,
        image_url: Optional[str] = None,
        video_id: Optional[str] = None,
        message: Optional[str] = None,
        link: Optional[str] = None,
        call_to_action_type: Optional[str] = None,
        advantage_plus_creative: bool = True,  # v25.0+ default: Enable Standard Enhancements
        gen_ai_disclosure: bool = False,  # v25.0+ AI transparency flag
        format_automation: bool = False,  # v25.0+ Format Automation for catalog ads
        product_set_id: Optional[str] = None  # Product set for catalog ads
    ) -> Dict[str, Any]:
        """Create an ad creative"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        
        object_story_spec = {
            'page_id': page_id
        }
        
        # Build link_data or video_data based on content type
        if video_id:
            object_story_spec['video_data'] = {
                'video_id': video_id,
                'message': message or '',
            }
            if call_to_action_type and link:
                object_story_spec['video_data']['call_to_action'] = {
                    'type': call_to_action_type,
                    'value': {'link': link}
                }
        else:
            link_data = {
                'link': link or '',
                'message': message or ''
            }
            if image_hash:
                link_data['image_hash'] = image_hash
            elif image_url:
                link_data['picture'] = image_url
            if call_to_action_type:
                link_data['call_to_action'] = {'type': call_to_action_type}
            object_story_spec['link_data'] = link_data
        
        params = {
            'name': name,
            'object_story_spec': object_story_spec
        }

        # v25.0+: Advantage+ Creative Granular Features
        # "standard_enhancements" is legacy; using specific AI features verified in docs
        if advantage_plus_creative:
            params['degrees_of_freedom_spec'] = {
                'creative_features_spec': {
                    'image_touchups': {'enroll_status': 'OPT_IN'},
                    'image_templates': {'enroll_status': 'OPT_IN'},
                    'text_optimizations': {'enroll_status': 'OPT_IN'},
                    'text_generation': {'enroll_status': 'OPT_IN'},
                    'image_brightness_and_contrast': {'enroll_status': 'OPT_IN'},
                    'inline_comment': {'enroll_status': 'OPT_IN'},
                    'video_auto_crop': {'enroll_status': 'OPT_IN'},
                    'image_uncrop': {'enroll_status': 'OPT_IN'},
                    'image_background_gen': {'enroll_status': 'OPT_IN'}
                }
            }
        
        # v25.0+: Gen AI Disclosure (AI Transparency)
        # When true, indicates creative content was generated using AI
        if gen_ai_disclosure:
            params['is_ai_generated'] = True
        
        # v25.0+: Format Automation for Advantage+ Catalog Ads
        # Enables automatic format transformation (carousel to collection)
        if format_automation and product_set_id:
            params['product_set_id'] = product_set_id
            params['asset_feed_spec'] = {
                'ad_formats': ['CAROUSEL', 'COLLECTION'],
                'optimization_type': 'FORMAT_AUTOMATION'
            }
            params['format_transformation_spec'] = [{
                'format': 'da_collection',
                'data_source': ['catalog']
            }]
        
        creative = account.create_ad_creative(params=params)
        return {'id': creative.get('id'), 'creative_id': creative.get('id')}
    
    async def create_ad_creative(
        self,
        ad_account_id: str,
        name: str,
        page_id: str,
        image_hash: Optional[str] = None,
        image_url: Optional[str] = None,
        video_id: Optional[str] = None,
        message: Optional[str] = None,
        link: Optional[str] = None,
        call_to_action_type: Optional[str] = None,
        advantage_plus_creative: bool = True,
        gen_ai_disclosure: bool = False,  # v25.0+ AI transparency
        format_automation: bool = False,  # v25.0+ Format Automation
        product_set_id: Optional[str] = None  # Product set for catalog ads
    ) -> Dict[str, Any]:
        """
        Create an Ad Creative.
        
        Args:
            ad_account_id: Ad Account ID
            name: Creative name
            page_id: Facebook Page ID
            image_hash: Hash of uploaded image
            image_url: URL of image
            video_id: ID of uploaded video
            message: Ad message/text
            link: Destination link
            call_to_action_type: CTA type (LEARN_MORE, SHOP_NOW, etc.)
            advantage_plus_creative: Enable Standard Enhancements (v25.0+)
            
        Returns:
            Dict with creative_id
        """
        return await self._create_ad_creative_sync(
            ad_account_id, name, page_id, image_hash, image_url, video_id,
            message, link, call_to_action_type, advantage_plus_creative, 
            gen_ai_disclosure, format_automation, product_set_id
        )
    
    @async_sdk_call
    def _update_ad_sync(
        self,
        ad_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update an ad"""
        self._ensure_initialized()
        
        ad = Ad(fbid=ad_id)
        params = {}
        
        if name:
            params['name'] = name
        if status:
            params['status'] = status
        
        ad.api_update(params=params)
        return {'success': True, 'id': ad_id}
    
    async def update_ad(
        self,
        ad_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update an existing Ad"""
        return await self._update_ad_sync(ad_id, name, status)
    
    @async_sdk_call
    def _delete_ad_sync(self, ad_id: str) -> Dict[str, Any]:
        """Delete an ad"""
        self._ensure_initialized()
        
        ad = Ad(fbid=ad_id)
        ad.api_delete()
        return {'success': True, 'id': ad_id}
    
    async def delete_ad(self, ad_id: str) -> Dict[str, Any]:
        """Delete an Ad"""
        return await self._delete_ad_sync(ad_id)
    
    # =========================================================================
    # CUSTOM AUDIENCES
    # =========================================================================
    
    @async_sdk_call
    def _get_custom_audiences_sync(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get custom audiences for an ad account"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        audiences = account.get_custom_audiences(fields=[
            'id',
            'name',
            'description',
            'subtype',
            'approximate_count',
            'time_created',
            'time_updated'
        ])
        
        return [
            {
                'id': aud['id'],
                'name': aud.get('name'),
                'description': aud.get('description'),
                'subtype': aud.get('subtype'),
                'approximate_count': aud.get('approximate_count'),
                'time_created': aud.get('time_created'),
                'time_updated': aud.get('time_updated')
            }
            for aud in audiences
        ]
    
    async def get_custom_audiences(self, ad_account_id: str) -> List[Dict[str, Any]]:
        """Get all Custom Audiences for an Ad Account"""
        return await self._get_custom_audiences_sync(ad_account_id)

    # =========================================================================
    # BUSINESS MANAGER OPERATIONS
    # =========================================================================
    
    @async_sdk_call
    def _get_businesses_sync(self) -> List[Dict[str, Any]]:
        """Get user's business portfolios"""
        self._ensure_initialized()
        
        user = User(fbid='me')
        businesses = user.get_businesses(fields=[
            'id',
            'name',
            'primary_page',
            'created_time'
        ])
        
        return [
            {
                'id': biz['id'],
                'name': biz.get('name'),
                'primary_page': biz.get('primary_page'),
                'created_time': biz.get('created_time')
            }
            for biz in businesses
        ]
    
    async def get_businesses(self) -> List[Dict[str, Any]]:
        """Get all Business portfolios the user belongs to"""
        return await self._get_businesses_sync()
    
    @async_sdk_call
    def _get_business_ad_accounts_sync(self, business_id: str) -> List[Dict[str, Any]]:
        """Get ad accounts owned by a business"""
        self._ensure_initialized()
        
        business = Business(fbid=business_id)
        ad_accounts = business.get_owned_ad_accounts(fields=[
            'id',
            'account_id', 
            'name',
            'account_status',
            'currency',
            'timezone_name'
        ])
        
        return [
            {
                'id': acc['id'],
                'account_id': acc.get('account_id'),
                'name': acc.get('name'),
                'account_status': acc.get('account_status'),
                'currency': acc.get('currency'),
                'timezone_name': acc.get('timezone_name')
            }
            for acc in ad_accounts
        ]
    
    async def get_business_ad_accounts(self, business_id: str) -> List[Dict[str, Any]]:
        """Get Ad Accounts owned by a Business"""
        return await self._get_business_ad_accounts_sync(business_id)
    
    # =========================================================================
    # BATCH REQUEST SUPPORT
    # =========================================================================
    
    def create_batch(self) -> Any:
        """
        Create a batch request for executing multiple API calls in one request.
        
        Per Meta docs, batch requests can improve performance by reducing HTTP overhead.
        
        Usage:
            batch = client.create_batch()
            # Add requests to batch
            batch.execute()
        
        Returns:
            FacebookAdsApi batch object
        """
        self._ensure_initialized()
        return self._api.new_batch()
    
    # =========================================================================
    # INSIGHTS / ANALYTICS
    # =========================================================================
    
    @async_sdk_call
    def _get_account_insights_sync(
        self, 
        ad_account_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get insights for an ad account"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        default_fields = [
            'impressions',
            'reach', 
            'clicks',
            'spend',
            'cpc',
            'cpm',
            'ctr'
        ]
        
        account = AdAccount(fbid=ad_account_id)
        insights = account.get_insights(
            fields=fields or default_fields,
            params={'date_preset': date_preset}
        )
        
        if insights:
            return dict(insights[0])
        return {}
    
    async def get_account_insights(
        self,
        ad_account_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get performance insights for an Ad Account"""
        return await self._get_account_insights_sync(ad_account_id, date_preset, fields)
    
    @async_sdk_call
    def _get_account_insights_breakdown_sync(
        self, 
        ad_account_id: str,
        breakdown: str = 'age',
        date_preset: str = 'last_7d',
        level: str = 'account',
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get insights with breakdown for an ad account.
        
        Breakdowns available (v25.0+):
        - age: Age ranges (18-24, 25-34, etc.)
        - gender: Male, Female, Unknown
        - age,gender: Combined age and gender breakdown
        - country: By country
        - region: By region/state
        - publisher_platform: Facebook, Instagram, Audience Network
        - platform_position: Feed, Stories, Reels, etc.
        - device_platform: Mobile, Desktop
        - impression_device: Device type
        """
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        default_fields = [
            'impressions',
            'reach', 
            'clicks',
            'spend',
            'cpc',
            'cpm',
            'ctr',
            'actions',
            'conversions',
            'cost_per_action_type'
        ]
        
        account = AdAccount(fbid=ad_account_id)
        
        params = {
            'date_preset': date_preset,
            'level': level
        }
        
        # Handle combined breakdowns
        if ',' in breakdown:
            params['breakdowns'] = breakdown.split(',')
        else:
            params['breakdowns'] = [breakdown]
        
        insights = account.get_insights(
            fields=fields or default_fields,
            params=params
        )
        
        result = []
        for insight in insights if insights else []:
            insight_dict = dict(insight)
            result.append(insight_dict)
        
        return result
    
    async def get_account_insights_breakdown(
        self,
        ad_account_id: str,
        breakdown: str = 'age',
        date_preset: str = 'last_7d',
        level: str = 'account',
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get performance insights with demographic/placement breakdowns.
        
        Args:
            ad_account_id: Ad Account ID
            breakdown: 'age', 'gender', 'age,gender', 'country', 'publisher_platform', 
                       'platform_position', 'device_platform'
            date_preset: 'last_7d', 'last_30d', 'this_month', etc.
            level: 'account', 'campaign', 'adset', 'ad'
            fields: Specific metrics to fetch
            
        Returns:
            List of insight dicts, each with breakdown dimensions
        """
        return await self._get_account_insights_breakdown_sync(
            ad_account_id, breakdown, date_preset, level, fields
        )
    
    @async_sdk_call
    def _get_campaign_insights_breakdown_sync(
        self, 
        campaign_id: str,
        breakdown: str = 'age',
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get insights with breakdown for a specific campaign"""
        self._ensure_initialized()
        
        default_fields = [
            'impressions',
            'reach', 
            'clicks',
            'spend',
            'cpc',
            'cpm',
            'ctr'
        ]
        
        campaign = Campaign(fbid=campaign_id)
        
        params = {
            'date_preset': date_preset
        }
        
        if ',' in breakdown:
            params['breakdowns'] = breakdown.split(',')
        else:
            params['breakdowns'] = [breakdown]
        
        insights = campaign.get_insights(
            fields=fields or default_fields,
            params=params
        )
        
        result = []
        for insight in insights if insights else []:
            result.append(dict(insight))
        
        return result
    
    async def get_campaign_insights_breakdown(
        self,
        campaign_id: str,
        breakdown: str = 'age',
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get campaign insights with demographic/placement breakdowns"""
        return await self._get_campaign_insights_breakdown_sync(
            campaign_id, breakdown, date_preset, fields
        )

    # =========================================================================
    # PHASE 3: BATCH REQUESTS
    # Per Meta docs: Up to 50 requests per batch, 10 for ad creation
    # =========================================================================
    
    @async_sdk_call
    def _execute_batch_sync(
        self,
        requests: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Execute batch request with multiple operations.
        
        Each request dict should have:
        - method: GET, POST, DELETE
        - relative_url: API endpoint
        - body: (optional) request body for POST
        - name: (optional) name for referencing in subsequent requests
        """
        self._ensure_initialized()
        
        import httpx
        import json
        
        # Build batch request
        batch_data = []
        for req in requests[:50]:  # Max 50 per batch
            batch_item = {
                'method': req.get('method', 'GET'),
                'relative_url': req.get('relative_url', '')
            }
            if req.get('body'):
                batch_item['body'] = req['body']
            if req.get('name'):
                batch_item['name'] = req['name']
            batch_data.append(batch_item)
        
        # Execute batch request synchronously
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                'https://graph.facebook.com',
                data={
                    'access_token': self._access_token,
                    'batch': json.dumps(batch_data)
                }
            )
            
            if response.is_success:
                results = response.json()
                return [
                    {
                        'code': r.get('code', 500),
                        'body': json.loads(r.get('body', '{}')) if r.get('body') else {}
                    }
                    for r in results
                ]
            else:
                raise MetaSDKError(f"Batch request failed: {response.status_code}")
    
    async def execute_batch(
        self,
        requests: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Execute multiple API calls in a single batch request.
        
        Per Meta docs: Maximum 50 requests per batch, 10 for ad creation.
        
        Args:
            requests: List of request dicts with method, relative_url, body, name
            
        Returns:
            List of response dicts with code and body
            
        Example:
            results = await client.execute_batch([
                {'method': 'GET', 'relative_url': 'me/accounts'},
                {'method': 'POST', 'relative_url': 'act_123/campaigns', 'body': 'name=Test'}
            ])
        """
        return await self._execute_batch_sync(requests)
    
    async def batch_create_ads(
        self,
        ad_account_id: str,
        ads: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Create multiple ads in a single batch request.
        
        Args:
            ad_account_id: Ad Account ID
            ads: List of ad configurations (name, adset_id, creative_id, status)
            
        Returns:
            List of created ad results
        """
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        # Build batch requests (max 10 for ad creation)
        requests = []
        for ad in ads[:10]:
            body_parts = [
                f"name={ad.get('name', 'Ad')}",
                f"adset_id={ad['adset_id']}",
                f"status={ad.get('status', 'PAUSED')}",
            ]
            if ad.get('creative_id'):
                body_parts.append(f"creative={{\"creative_id\":\"{ad['creative_id']}\"}}")
            
            requests.append({
                'method': 'POST',
                'relative_url': f"{META_API_VERSION}/{ad_account_id}/ads",
                'body': '&'.join(body_parts)
            })
        
        return await self.execute_batch(requests)
    
    async def batch_update_status(
        self,
        object_ids: List[str],
        status: str
    ) -> List[Dict[str, Any]]:
        """
        Update status of multiple campaigns/adsets/ads in batch.
        
        Args:
            object_ids: List of campaign/adset/ad IDs
            status: ACTIVE, PAUSED, or DELETED
            
        Returns:
            List of update results
        """
        requests = [
            {
                'method': 'POST',
                'relative_url': f"{META_API_VERSION}/{obj_id}",
                'body': f"status={status}"
            }
            for obj_id in object_ids[:50]
        ]
        
        return await self.execute_batch(requests)
    
    # =========================================================================
    # PHASE 3: WEBHOOK VERIFICATION & HANDLING
    # Per Meta docs: Verify with hub.mode, hub.verify_token, hub.challenge
    # =========================================================================
    
    @staticmethod
    def verify_webhook_signature(
        payload: bytes,
        signature: str,
        app_secret: str
    ) -> bool:
        """
        Verify webhook signature from Meta.
        
        Args:
            payload: Raw request body bytes
            signature: X-Hub-Signature-256 header value
            app_secret: Your app secret
            
        Returns:
            True if signature is valid
        """
        import hmac
        import hashlib
        
        if not signature.startswith('sha256='):
            return False
        
        expected_signature = hmac.new(
            app_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature[7:], expected_signature)
    
    @staticmethod
    def handle_webhook_verification(
        mode: str,
        token: str,
        challenge: str,
        verify_token: str
    ) -> Optional[str]:
        """
        Handle webhook verification request from Meta.
        
        Per Meta docs:
        - Verify hub.verify_token matches your configured token
        - Respond with hub.challenge value
        
        Args:
            mode: hub.mode query param (should be 'subscribe')
            token: hub.verify_token query param
            challenge: hub.challenge query param
            verify_token: Your configured verify token
            
        Returns:
            Challenge string if valid, None if invalid
        """
        if mode == 'subscribe' and token == verify_token:
            return challenge
        return None
    
    @staticmethod
    def parse_webhook_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parse webhook notification payload.
        
        Args:
            payload: Webhook JSON payload
            
        Returns:
            List of individual change events
        """
        events = []
        
        object_type = payload.get('object')
        entries = payload.get('entry', [])
        
        for entry in entries:
            entry_id = entry.get('id')
            entry_time = entry.get('time')
            changes = entry.get('changes', [])
            
            for change in changes:
                events.append({
                    'object': object_type,
                    'entry_id': entry_id,
                    'time': entry_time,
                    'field': change.get('field'),
                    'value': change.get('value')
                })
        
        return events
    
    # =========================================================================
    # PHASE 3: CATALOG MANAGEMENT (Product Catalog for Advantage+ Ads)
    # =========================================================================
    
    @async_sdk_call
    def _get_catalogs_sync(self, business_id: str) -> List[Dict[str, Any]]:
        """Get product catalogs owned by a business"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.productcatalog import ProductCatalog
        
        business = Business(fbid=business_id)
        catalogs = business.get_owned_product_catalogs(fields=[
            'id',
            'name',
            'product_count',
            'vertical',
            'business'
        ])
        
        return [
            {
                'id': cat['id'],
                'name': cat.get('name'),
                'product_count': cat.get('product_count'),
                'vertical': cat.get('vertical'),
                'business_id': cat.get('business', {}).get('id') if cat.get('business') else None
            }
            for cat in catalogs
        ]
    
    async def get_catalogs(self, business_id: str) -> List[Dict[str, Any]]:
        """
        Get product catalogs owned by a business.
        
        Args:
            business_id: Business ID
            
        Returns:
            List of catalog dicts with id, name, product_count
        """
        return await self._get_catalogs_sync(business_id)
    
    @async_sdk_call
    def _create_catalog_sync(
        self,
        business_id: str,
        name: str,
        vertical: str = 'commerce'
    ) -> Dict[str, Any]:
        """Create a new product catalog"""
        self._ensure_initialized()
        
        business = Business(fbid=business_id)
        result = business.create_owned_product_catalog(params={
            'name': name,
            'vertical': vertical
        })
        
        return {'id': result.get('id'), 'catalog_id': result.get('id')}
    
    async def create_catalog(
        self,
        business_id: str,
        name: str,
        vertical: str = 'commerce'
    ) -> Dict[str, Any]:
        """
        Create a new product catalog.
        
        Args:
            business_id: Business ID
            name: Catalog name
            vertical: commerce, hotels, flights, destinations, etc.
            
        Returns:
            Dict with catalog_id
        """
        return await self._create_catalog_sync(business_id, name, vertical)
    
    @async_sdk_call
    def _get_catalog_products_sync(
        self,
        catalog_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get products from a catalog"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.productcatalog import ProductCatalog
        
        catalog = ProductCatalog(fbid=catalog_id)
        products = catalog.get_products(fields=[
            'id',
            'retailer_id',
            'name',
            'description',
            'price',
            'currency',
            'availability',
            'image_url',
            'url'
        ], params={'limit': limit})
        
        return [
            {
                'id': prod['id'],
                'retailer_id': prod.get('retailer_id'),
                'name': prod.get('name'),
                'description': prod.get('description'),
                'price': prod.get('price'),
                'currency': prod.get('currency'),
                'availability': prod.get('availability'),
                'image_url': prod.get('image_url'),
                'url': prod.get('url')
            }
            for prod in products
        ]
    
    async def get_catalog_products(
        self,
        catalog_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get products from a product catalog.
        
        Args:
            catalog_id: Catalog ID
            limit: Max products to return
            
        Returns:
            List of product dicts
        """
        return await self._get_catalog_products_sync(catalog_id, limit)
    
    @async_sdk_call
    def _add_products_to_catalog_sync(
        self,
        catalog_id: str,
        products: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Add products to catalog using batch API.
        
        Each product should have:
        - retailer_id: Unique product ID
        - name: Product name
        - description: Product description
        - price: Price as string (e.g., "19.99 USD")
        - availability: 'in stock', 'out of stock', etc.
        - url: Product URL
        - image_url: Product image URL
        """
        self._ensure_initialized()
        
        from facebook_business.adobjects.productcatalog import ProductCatalog
        
        catalog = ProductCatalog(fbid=catalog_id)
        
        # Format products for batch API
        requests = []
        for prod in products:
            item_data = {
                'retailer_id': prod['retailer_id'],
                'data': {
                    'name': prod.get('name', ''),
                    'description': prod.get('description', ''),
                    'price': prod.get('price', '0.00 USD'),
                    'availability': prod.get('availability', 'in stock'),
                    'url': prod.get('url', ''),
                    'image_url': prod.get('image_url', '')
                }
            }
            requests.append(item_data)
        
        # Use items_batch endpoint
        result = catalog.create_items_batch(params={
            'requests': requests
        })
        
        return {'handle': result.get('handles', []), 'success': True}
    
    async def add_products_to_catalog(
        self,
        catalog_id: str,
        products: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Add products to a catalog.
        
        Args:
            catalog_id: Catalog ID
            products: List of product dicts with retailer_id, name, price, etc.
            
        Returns:
            Dict with batch handle
        """
        return await self._add_products_to_catalog_sync(catalog_id, products)
    
    @async_sdk_call
    def _get_product_sets_sync(self, catalog_id: str) -> List[Dict[str, Any]]:
        """Get product sets from a catalog"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.productcatalog import ProductCatalog
        
        catalog = ProductCatalog(fbid=catalog_id)
        product_sets = catalog.get_product_sets(fields=[
            'id',
            'name',
            'product_count',
            'filter'
        ])
        
        return [
            {
                'id': ps['id'],
                'name': ps.get('name'),
                'product_count': ps.get('product_count'),
                'filter': ps.get('filter')
            }
            for ps in product_sets
        ]
    
    async def get_product_sets(self, catalog_id: str) -> List[Dict[str, Any]]:
        """
        Get product sets from a catalog.
        
        Args:
            catalog_id: Catalog ID
            
        Returns:
            List of product set dicts
        """
        return await self._get_product_sets_sync(catalog_id)
    
    @async_sdk_call
    def _create_product_set_sync(
        self,
        catalog_id: str,
        name: str,
        filter_rules: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a product set (subset of catalog products)"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.productcatalog import ProductCatalog
        
        catalog = ProductCatalog(fbid=catalog_id)
        
        params = {'name': name}
        if filter_rules:
            params['filter'] = filter_rules
        
        result = catalog.create_product_set(params=params)
        
        return {'id': result.get('id'), 'product_set_id': result.get('id')}
    
    async def create_product_set(
        self,
        catalog_id: str,
        name: str,
        filter_rules: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a product set from catalog products.
        
        Args:
            catalog_id: Catalog ID
            name: Product set name
            filter_rules: Optional filter rules (e.g., by category, price)
            
        Returns:
            Dict with product_set_id
        """
        return await self._create_product_set_sync(catalog_id, name, filter_rules)
    
    # =========================================================================
    # COMMENT AGENT METHODS (for fetch_tools.py and reply_tools.py)
    # =========================================================================
    
    @async_sdk_call
    def _get_instagram_media_sync(
        self, 
        ig_user_id: str, 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get Instagram media posts for a user"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.iguser import IGUser
        
        ig_user = IGUser(fbid=ig_user_id)
        media = ig_user.get_media(
            fields=[
                'id', 'caption', 'timestamp', 'comments_count', 
                'like_count', 'media_type', 'permalink'
            ],
            params={'limit': limit}
        )
        
        return [dict(m) for m in media]
    
    async def get_instagram_media(
        self, 
        ig_user_id: str, 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get Instagram media posts for a business account.
        
        Args:
            ig_user_id: Instagram Business User ID
            limit: Max posts to fetch
            
        Returns:
            List of media objects with id, caption, comments_count, etc.
        """
        return await self._get_instagram_media_sync(ig_user_id, limit)
    
    @async_sdk_call
    def _get_page_feed_sync(
        self, 
        page_id: str, 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get Facebook Page feed posts"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.page import Page
        
        page = Page(fbid=page_id)
        posts = page.get_feed(
            fields=[
                'id', 'message', 'created_time', 'permalink_url',
                'comments.summary(true)', 'shares'
            ],
            params={'limit': limit}
        )
        
        return [dict(p) for p in posts]
    
    async def get_page_feed(
        self, 
        page_id: str, 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get Facebook Page feed posts.
        
        Args:
            page_id: Facebook Page ID
            limit: Max posts to fetch
            
        Returns:
            List of post objects with id, message, comments summary, etc.
        """
        return await self._get_page_feed_sync(page_id, limit)
    
    @async_sdk_call
    def _get_object_comments_sync(
        self, 
        object_id: str, 
        limit: int = 50,
        fields: str = "id,text,from,timestamp,like_count"
    ) -> List[Dict[str, Any]]:
        """Get comments for any object (post, photo, video)"""
        self._ensure_initialized()
        
        from facebook_business.adobjects.abstractobject import AbstractObject
        
        # Generic object for getting comments edge
        obj = AbstractObject(fbid=object_id)
        obj['id'] = object_id
        
        # Make API call via low-level API
        response = obj.api_get(
            fields=[],
            params={},
        )
        
        # Get comments edge
        import httpx
        
        app_secret = self._app_secret
        proof = ""
        if app_secret and self._access_token:
            import hmac
            import hashlib
            proof = hmac.new(
                app_secret.encode(),
                self._access_token.encode(),
                hashlib.sha256
            ).hexdigest()
        
        fields_param = fields.replace(",", "%2C")
        url = f"https://graph.facebook.com/{META_API_VERSION}/{object_id}/comments"
        url += f"?fields={fields_param}&limit={limit}&access_token={self._access_token}"
        if proof:
            url += f"&appsecret_proof={proof}"
        
        with httpx.Client() as client:
            resp = client.get(url, timeout=30.0)
            if resp.is_success:
                return resp.json().get("data", [])
            else:
                error_data = resp.json()
                error_info = error_data.get("error", {})
                from facebook_business.exceptions import FacebookRequestError
                raise FacebookRequestError(
                    message=error_info.get("message", "Failed to get comments"),
                    request_context={},
                    http_status=resp.status_code,
                    http_headers={},
                    body=error_data
                )
    
    async def get_object_comments(
        self, 
        object_id: str, 
        limit: int = 50,
        fields: str = "id,text,from,timestamp,like_count"
    ) -> List[Dict[str, Any]]:
        """
        Get comments for any object (post, media, photo).
        
        Args:
            object_id: ID of the post/media
            limit: Max comments to fetch
            fields: Fields to retrieve
            
        Returns:
            List of comment objects
        """
        return await self._get_object_comments_sync(object_id, limit, fields)
    
    @async_sdk_call
    def _reply_to_comment_sync(
        self, 
        comment_id: str, 
        message: str
    ) -> Dict[str, Any]:
        """Reply to a comment"""
        self._ensure_initialized()
        
        import httpx
        
        app_secret = self._app_secret
        proof = ""
        if app_secret and self._access_token:
            import hmac
            import hashlib
            proof = hmac.new(
                app_secret.encode(),
                self._access_token.encode(),
                hashlib.sha256
            ).hexdigest()
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{comment_id}/replies"
        
        data = {
            "message": message,
            "access_token": self._access_token,
        }
        if proof:
            data["appsecret_proof"] = proof
        
        with httpx.Client() as client:
            resp = client.post(url, data=data, timeout=30.0)
            if resp.is_success:
                return resp.json()
            else:
                error_data = resp.json()
                error_info = error_data.get("error", {})
                from facebook_business.exceptions import FacebookRequestError
                raise FacebookRequestError(
                    message=error_info.get("message", "Failed to post reply"),
                    request_context={},
                    http_status=resp.status_code,
                    http_headers={},
                    body=error_data
                )
    
    async def reply_to_comment(
        self, 
        comment_id: str, 
        message: str
    ) -> Dict[str, Any]:
        """
        Reply to a comment on Instagram or Facebook.
        
        Args:
            comment_id: Comment ID to reply to
            message: Reply message
            
        Returns:
            Dict with reply id
        """
        return await self._reply_to_comment_sync(comment_id, message)
    
    @async_sdk_call
    def _like_object_sync(self, object_id: str) -> Dict[str, Any]:
        """Like a comment or post"""
        self._ensure_initialized()
        
        import httpx
        
        app_secret = self._app_secret
        proof = ""
        if app_secret and self._access_token:
            import hmac
            import hashlib
            proof = hmac.new(
                app_secret.encode(),
                self._access_token.encode(),
                hashlib.sha256
            ).hexdigest()
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{object_id}/likes"
        
        data = {"access_token": self._access_token}
        if proof:
            data["appsecret_proof"] = proof
        
        with httpx.Client() as client:
            resp = client.post(url, data=data, timeout=30.0)
            if resp.is_success:
                return {"success": True}
            else:
                error_data = resp.json()
                error_info = error_data.get("error", {})
                from facebook_business.exceptions import FacebookRequestError
                raise FacebookRequestError(
                    message=error_info.get("message", "Failed to like"),
                    request_context={},
                    http_status=resp.status_code,
                    http_headers={},
                    body=error_data
                )
    
    async def like_object(self, object_id: str) -> Dict[str, Any]:
        """
        Like a comment or post.
        
        Args:
            object_id: ID of comment/post to like
            
        Returns:
            Dict with success status
        """
        return await self._like_object_sync(object_id)

    # =========================================================================
    # ADVANTAGE+ CAMPAIGN METHODS (v25.0+/v25.0 Unified Approach)
    # =========================================================================

    def _create_advantage_plus_campaign_sync(
        self,
        account_id: str,
        name: str,
        objective: str,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: str = "LOWEST_COST_WITHOUT_CAP",
        bid_amount: Optional[int] = None,
        roas_average_floor: Optional[float] = None,
        geo_locations: Optional[Dict] = None,
        promoted_object: Optional[Dict] = None,
        status: str = "PAUSED",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        special_ad_categories: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Create an Advantage+ campaign using the unified approach.
        
        Campaigns achieve Advantage+ status via configuration:
        1. Campaign-level budget (not ad set level)
        2. Minimal targeting (geo_locations or Advantage+ audience)
        3. Automatic placements (no exclusions)
        
        Args:
            account_id: Ad account ID (without act_ prefix)
            name: Campaign name
            objective: OUTCOME_SALES, OUTCOME_APP_PROMOTION, or OUTCOME_LEADS
            daily_budget: Daily budget in cents
            lifetime_budget: Lifetime budget in cents
            bid_strategy: Bid strategy (LOWEST_COST_WITHOUT_CAP, COST_CAP, etc.)
            bid_amount: Bid cap in cents (required for COST_CAP)
            roas_average_floor: Minimum ROAS (for ROAS optimization)
            geo_locations: Geographic targeting dict
            promoted_object: Conversion tracking config (pixel_id, etc.)
            status: ACTIVE or PAUSED
            start_time: ISO datetime string
            end_time: ISO datetime string
            special_ad_categories: List of special ad categories
            
        Returns:
            Dict with campaign_id and advantage_state_info
        """
        account = AdAccount(f"act_{account_id}")
        
        # Build campaign params for Advantage+ (unified approach)
        params = {
            Campaign.Field.name: name,
            Campaign.Field.objective: objective,
            Campaign.Field.status: status,
            Campaign.Field.special_ad_categories: special_ad_categories or [],
            # Campaign Budget Optimization - Required for Advantage+
            Campaign.Field.is_campaign_budget_optimization: True,
        }
        
        # Budget (campaign level for Advantage+)
        if daily_budget:
            params[Campaign.Field.daily_budget] = daily_budget
        elif lifetime_budget:
            params[Campaign.Field.lifetime_budget] = lifetime_budget
        else:
            # Default daily budget
            params[Campaign.Field.daily_budget] = 5000  # $50
        
        # Bid Strategy
        params[Campaign.Field.bid_strategy] = bid_strategy
        if bid_amount and bid_strategy in ["COST_CAP", "LOWEST_COST_WITH_BID_CAP"]:
            params["bid_amount"] = bid_amount
        if roas_average_floor and bid_strategy == "LOWEST_COST_WITH_MIN_ROAS":
            params["roas_average_floor"] = roas_average_floor
        
        # Schedule
        if start_time:
            params[Campaign.Field.start_time] = start_time
        if end_time:
            params[Campaign.Field.stop_time] = end_time
        
        # Promoted object for conversion campaigns
        if promoted_object:
            params[Campaign.Field.promoted_object] = promoted_object
        
        # Create campaign
        campaign = account.create_campaign(params=params)
        campaign_id = campaign.get_id()
        
        # Fetch campaign with advantage_state field to verify status
        created_campaign = Campaign(campaign_id).api_get(
            fields=[
                Campaign.Field.id,
                Campaign.Field.name,
                Campaign.Field.objective,
                Campaign.Field.status,
                Campaign.Field.daily_budget,
                Campaign.Field.lifetime_budget,
                Campaign.Field.bid_strategy,
                "is_campaign_budget_optimization",
            ]
        )
        
        # Build advantage state info
        advantage_state_info = self._build_advantage_state_info(
            created_campaign,
            objective,
            geo_locations
        )
        
        return {
            "success": True,
            "campaign_id": campaign_id,
            "name": created_campaign.get(Campaign.Field.name),
            "objective": created_campaign.get(Campaign.Field.objective),
            "status": created_campaign.get(Campaign.Field.status),
            "advantage_state_info": advantage_state_info
        }
    
    def _build_advantage_state_info(
        self,
        campaign: Campaign,
        objective: str,
        geo_locations: Optional[Dict]
    ) -> Dict[str, Any]:
        """Build advantage_state_info based on campaign configuration."""
        # Check requirements
        has_campaign_budget = bool(
            campaign.get(Campaign.Field.daily_budget) or 
            campaign.get(Campaign.Field.lifetime_budget)
        )
        has_cbo = campaign.get("is_campaign_budget_optimization", False)
        
        # For geo_locations only targeting = Advantage+ audience
        has_advantage_audience = geo_locations is not None
        
        # We assume automatic placements (no exclusions)
        has_advantage_placements = True
        
        requirements = {
            "campaign_budget": has_campaign_budget and has_cbo,
            "advantage_audience": has_advantage_audience,
            "advantage_placements": has_advantage_placements
        }
        
        missing = [k for k, v in requirements.items() if not v]
        is_advantage_plus = len(missing) == 0
        
        # Determine state based on objective
        if is_advantage_plus:
            if objective == "OUTCOME_SALES":
                state = "advantage_plus_sales"
            elif objective == "OUTCOME_APP_PROMOTION":
                state = "advantage_plus_app"
            elif objective == "OUTCOME_LEADS":
                state = "advantage_plus_leads"
            else:
                state = "manual"
        elif len(missing) < 3:
            state = "partial"
        else:
            state = "manual"
        
        return {
            "advantage_state": state,
            "is_advantage_plus": is_advantage_plus,
            "requirements": requirements,
            "missing_requirements": missing
        }
    
    async def create_advantage_plus_campaign(
        self,
        account_id: str,
        name: str,
        objective: str = "OUTCOME_SALES",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Async wrapper for Advantage+ campaign creation.
        
        Creates a campaign configured for Advantage+ status using the
        unified approach (v25.0+/v25.0 compatible).
        """
        return await asyncio.to_thread(
            self._create_advantage_plus_campaign_sync,
            account_id,
            name,
            objective,
            **kwargs
        )
    
    def _get_campaign_advantage_state_sync(self, campaign_id: str) -> Dict[str, Any]:
        """Get the Advantage+ state of a campaign."""
        campaign = Campaign(campaign_id).api_get(
            fields=[
                Campaign.Field.id,
                Campaign.Field.name,
                Campaign.Field.objective,
                Campaign.Field.status,
                Campaign.Field.daily_budget,
                Campaign.Field.lifetime_budget,
                Campaign.Field.bid_strategy,
                "is_campaign_budget_optimization",
            ]
        )
        
        objective = campaign.get(Campaign.Field.objective, "")
        advantage_state_info = self._build_advantage_state_info(
            campaign,
            objective,
            None  # We don't have targeting info at campaign level
        )
        
        return {
            "campaign_id": campaign_id,
            "name": campaign.get(Campaign.Field.name),
            "objective": objective,
            "advantage_state_info": advantage_state_info
        }
    
    async def get_campaign_advantage_state(self, campaign_id: str) -> Dict[str, Any]:
        """Get the Advantage+ state of a campaign."""
        return await asyncio.to_thread(
            self._get_campaign_advantage_state_sync,
            campaign_id
        )
    
    def validate_advantage_plus_eligibility(
        self,
        objective: str,
        has_campaign_budget: bool = True,
        audience_type: str = "ADVANTAGE_PLUS",
        has_placement_exclusions: bool = False,
        special_ad_categories: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Validate if a configuration qualifies for Advantage+.
        This is a local check, no API call needed.
        
        Returns:
            Dict with eligibility status and recommendations
        """
        requirements_met = {
            "campaign_budget": has_campaign_budget,
            "advantage_audience": audience_type in ["ADVANTAGE_PLUS", "GEO_ONLY"],
            "advantage_placements": not has_placement_exclusions,
            "no_special_ad_categories": not special_ad_categories or len(special_ad_categories) == 0
        }
        
        is_eligible = all(requirements_met.values())
        
        recommendations = []
        if not requirements_met["campaign_budget"]:
            recommendations.append("Enable Campaign Budget Optimization (CBO) for Advantage+")
        if not requirements_met["advantage_audience"]:
            recommendations.append("Use Advantage+ Audience or geo-only targeting")
        if not requirements_met["advantage_placements"]:
            recommendations.append("Remove placement exclusions for full Advantage+ benefits")
        if not requirements_met["no_special_ad_categories"]:
            recommendations.append("Special Ad Categories may limit Advantage+ features")
        
        # Determine expected state
        if is_eligible:
            if objective == "OUTCOME_SALES":
                expected_state = "advantage_plus_sales"
            elif objective == "OUTCOME_APP_PROMOTION":
                expected_state = "advantage_plus_app"
            elif objective == "OUTCOME_LEADS":
                expected_state = "advantage_plus_leads"
            else:
                expected_state = "manual"
        else:
            expected_state = "partial" if any(requirements_met.values()) else "manual"
        
        return {
            "is_eligible": is_eligible,
            "expected_advantage_state": expected_state,
            "requirements_met": requirements_met,
            "recommendations": recommendations
        }

    # =========================================================================
    # A/B TESTING METHODS (ad_studies API)
    # =========================================================================
    
    def _create_ab_test_sync(
        self,
        account_id: str,
        name: str,
        test_type: str,
        cells: List[Dict],
        description: Optional[str] = None,
        objective: str = "OUTCOME_SALES",
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        confidence_level: float = 0.95,
        business_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create an A/B test (ad study) via the ad_studies endpoint (v25.0+).
        
        Based on Meta docs: https://developers.facebook.com/docs/marketing-api/guides/split-testing
        
        Args:
            account_id: Ad account ID
            name: Study name
            test_type: SPLIT_TEST or HOLDOUT
            cells: List of test cells with name, treatment_percentage, campaigns/adsets
            description: Study description
            start_time: Unix timestamp for start
            end_time: Unix timestamp for end
            confidence_level: Statistical confidence (0.8-0.99)
            business_id: Business ID for the ad_studies endpoint
        """
        import httpx
        import json
        
        # Use business_id if provided, otherwise fall back to account_id
        entity_id = business_id or f"act_{account_id}"
        if not entity_id.startswith('act_') and not business_id:
            entity_id = f"act_{entity_id}"
            
        url = f"https://graph.facebook.com/{META_API_VERSION}/{entity_id}/ad_studies"
        
        # Build cells configuration per Meta docs format
        # Format: {name: "Group A", treatment_percentage: 50, campaigns: [<ID>]} or {adsets: [<ID>]}
        study_cells = []
        for idx, cell in enumerate(cells):
            cell_config = {
                "name": cell.get("name", f"Cell {idx + 1}"),
                "treatment_percentage": cell.get("treatment_percentage", cell.get("budget_percent", 50)),
            }
            
            # Add campaigns or adsets (doc says use one or the other)
            if cell.get("campaigns"):
                cell_config["campaigns"] = cell.get("campaigns")
            elif cell.get("campaign_ids"):
                cell_config["campaigns"] = cell.get("campaign_ids")
            elif cell.get("adsets"):
                cell_config["adsets"] = cell.get("adsets")
            elif cell.get("adset_ids"):
                cell_config["adsets"] = cell.get("adset_ids")
                
            study_cells.append(cell_config)
        
        # Build request params per Meta docs
        params = {
            "access_token": self._access_token,
            "name": name,
            "type": test_type,
            "cells": json.dumps(study_cells),
        }
        
        if description:
            params["description"] = description
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, data=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "test_id": data.get("id"),
                    "name": name,
                    "status": "ACTIVE"
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to create A/B test")
                }
    
    async def create_ab_test(
        self,
        account_id: str,
        name: str,
        test_type: str = "SPLIT_TEST",
        cells: List[Dict] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Async wrapper for A/B test creation."""
        return await asyncio.to_thread(
            self._create_ab_test_sync,
            account_id,
            name,
            test_type,
            cells or [],
            **kwargs
        )
    
    def _get_ab_tests_sync(self, account_id: str) -> Dict[str, Any]:
        """Get all A/B tests for an ad account."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/ad_studies"
        params = {
            "access_token": self._access_token,
            "fields": "id,name,type,cells,status,start_time,end_time"
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "tests": data.get("data", [])
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to fetch A/B tests")
                }
    
    async def get_ab_tests(self, account_id: str) -> Dict[str, Any]:
        """Get all A/B tests for an account."""
        return await asyncio.to_thread(self._get_ab_tests_sync, account_id)

    # =========================================================================
    # AUTOMATION RULES METHODS (adrules_library API)
    # =========================================================================
    
    def _create_automation_rule_sync(
        self,
        account_id: str,
        name: str,
        evaluation_spec: Dict,
        execution_spec: Dict,
        schedule_spec: Optional[Dict] = None,
        status: str = "ENABLED"
    ) -> Dict[str, Any]:
        """
        Create an automation rule via the adrules_library endpoint.
        
        Args:
            account_id: Ad account ID
            name: Rule name
            evaluation_spec: Conditions and filters for the rule
            execution_spec: Actions to take when conditions are met
            schedule_spec: When to evaluate the rule
            status: ENABLED or DISABLED
        """
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/adrules_library"
        
        params = {
            "access_token": self._access_token,
            "name": name,
            "evaluation_spec": evaluation_spec,
            "execution_spec": execution_spec,
            "status": status,
        }
        
        if schedule_spec:
            params["schedule_spec"] = schedule_spec
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "rule_id": data.get("id"),
                    "name": name,
                    "status": status
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to create rule")
                }
    
    async def create_automation_rule(
        self,
        account_id: str,
        name: str,
        evaluation_spec: Dict,
        execution_spec: Dict,
        **kwargs
    ) -> Dict[str, Any]:
        """Async wrapper for automation rule creation."""
        return await asyncio.to_thread(
            self._create_automation_rule_sync,
            account_id,
            name,
            evaluation_spec,
            execution_spec,
            **kwargs
        )
    
    def _get_automation_rules_sync(self, account_id: str) -> Dict[str, Any]:
        """Get all automation rules for an ad account."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/adrules_library"
        params = {
            "access_token": self._access_token,
            "fields": "id,name,status,evaluation_spec,execution_spec,schedule_spec"
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "rules": data.get("data", [])
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to fetch rules")
                }
    
    async def get_automation_rules(self, account_id: str) -> Dict[str, Any]:
        """Get all automation rules for an account."""
        return await asyncio.to_thread(self._get_automation_rules_sync, account_id)
    
    def _update_automation_rule_sync(
        self,
        rule_id: str,
        updates: Dict
    ) -> Dict[str, Any]:
        """Update an existing automation rule."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{rule_id}"
        
        params = {"access_token": self._access_token, **updates}
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=params)
            
            if response.is_success:
                return {"success": True, "rule_id": rule_id}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to update rule")
                }
    
    async def update_automation_rule(self, rule_id: str, updates: Dict) -> Dict[str, Any]:
        """Update an automation rule."""
        return await asyncio.to_thread(self._update_automation_rule_sync, rule_id, updates)
    
    def _delete_automation_rule_sync(self, rule_id: str) -> Dict[str, Any]:
        """Delete an automation rule."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{rule_id}"
        params = {"access_token": self._access_token}
        
        with httpx.Client(timeout=30.0) as client:
            response = client.delete(url, params=params)
            
            if response.is_success:
                return {"success": True}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to delete rule")
                }
    
    async def delete_automation_rule(self, rule_id: str) -> Dict[str, Any]:
        """Delete an automation rule."""
        return await asyncio.to_thread(self._delete_automation_rule_sync, rule_id)

    # =========================================================================
    # CREATIVE HUB METHODS
    # =========================================================================
    
    def _get_creative_library_sync(
        self,
        account_id: str,
        creative_type: Optional[str] = None,
        limit: int = 25
    ) -> Dict[str, Any]:
        """Get creative assets from the ad account."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/adimages"
        params = {
            "access_token": self._access_token,
            "fields": "id,name,hash,url,width,height,created_time,status",
            "limit": limit
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "assets": data.get("data", []),
                    "total_count": len(data.get("data", []))
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to fetch creatives")
                }
    
    async def get_creative_library(
        self,
        account_id: str,
        creative_type: Optional[str] = None,
        limit: int = 25
    ) -> Dict[str, Any]:
        """Get creative assets from the ad account."""
        return await asyncio.to_thread(
            self._get_creative_library_sync,
            account_id,
            creative_type,
            limit
        )
    
    def _upload_creative_sync(
        self,
        account_id: str,
        image_url: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload a creative asset."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/adimages"
        
        params = {"access_token": self._access_token}
        
        if image_url:
            params["url"] = image_url
        if name:
            params["name"] = name
        
        with httpx.Client(timeout=60.0) as client:
            if image_bytes:
                files = {"file": ("image.jpg", image_bytes, "image/jpeg")}
                response = client.post(url, params=params, files=files)
            else:
                response = client.post(url, params=params)
            
            if response.is_success:
                data = response.json()
                # Response format: {"images": {"hash_key": {"hash": "...", "url": "..."}}}
                images = data.get("images", {})
                if images:
                    first_key = list(images.keys())[0]
                    image_data = images[first_key]
                    return {
                        "success": True,
                        "asset_hash": image_data.get("hash"),
                        "url": image_data.get("url")
                    }
                return {"success": True}
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Upload failed")
                }
    
    async def upload_creative(
        self,
        account_id: str,
        image_url: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload a creative asset."""
        return await asyncio.to_thread(
            self._upload_creative_sync,
            account_id,
            image_url,
            image_bytes,
            name
        )
    
    def _search_ad_library_sync(
        self,
        search_terms: Optional[str] = None,
        ad_reached_countries: List[str] = None,
        limit: int = 25
    ) -> Dict[str, Any]:
        """Search Meta Ad Library."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/ads_archive"
        params = {
            "access_token": self._access_token,
            "ad_reached_countries": ad_reached_countries or ["US"],
            "ad_active_status": "ACTIVE",
            "fields": "id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time",
            "limit": limit
        }
        
        if search_terms:
            params["search_terms"] = search_terms
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "results": data.get("data", []),
                    "total_count": len(data.get("data", []))
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Search failed")
                }
    
    async def search_ad_library(
        self,
        search_terms: Optional[str] = None,
        ad_reached_countries: List[str] = None,
        limit: int = 25
    ) -> Dict[str, Any]:
        """Search Meta Ad Library."""
        return await asyncio.to_thread(
            self._search_ad_library_sync,
            search_terms,
            ad_reached_countries,
            limit
        )

    # =========================================================================
    # CONVERSIONS API (CAPI) METHODS
    # =========================================================================
    
    def _send_capi_events_sync(
        self,
        pixel_id: str,
        events: List[Dict],
        test_event_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send events via Conversions API."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{pixel_id}/events"
        
        payload = {
            "access_token": self._access_token,
            "data": events
        }
        
        if test_event_code:
            payload["test_event_code"] = test_event_code
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=payload)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "events_received": data.get("events_received", len(events)),
                    "fbtrace_id": data.get("fbtrace_id")
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to send events")
                }
    
    async def send_capi_events(
        self,
        pixel_id: str,
        events: List[Dict],
        test_event_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send events via Conversions API."""
        return await asyncio.to_thread(
            self._send_capi_events_sync,
            pixel_id,
            events,
            test_event_code
        )
    
    def _get_capi_diagnostics_sync(self, pixel_id: str) -> Dict[str, Any]:
        """Get CAPI event diagnostics."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{pixel_id}"
        params = {
            "access_token": self._access_token,
            "fields": "id,name,last_fired_time,data_use_setting"
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "pixel_id": pixel_id,
                    "name": data.get("name"),
                    "last_fired_time": data.get("last_fired_time")
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get diagnostics")
                }
    
    async def get_capi_diagnostics(self, pixel_id: str) -> Dict[str, Any]:
        """Get CAPI event diagnostics."""
        return await asyncio.to_thread(self._get_capi_diagnostics_sync, pixel_id)

    # =========================================================================
    # COMPLIANCE METHODS
    # =========================================================================
    
    def check_campaign_compliance(
        self,
        campaign_data: Dict,
        special_ad_categories: List[str] = None
    ) -> Dict[str, Any]:
        """
        Check campaign compliance with special ad category restrictions.
        
        This is a local check - does not call Meta API.
        """
        issues = []
        warnings = []
        
        if not special_ad_categories:
            return {
                "status": "COMPLIANT",
                "is_compliant": True,
                "issues": [],
                "warnings": []
            }
        
        targeting = campaign_data.get("targeting", {})
        
        # Check for restricted targeting in special categories
        restricted_categories = {"HOUSING", "EMPLOYMENT", "FINANCIAL_PRODUCTS_SERVICES"}
        
        if any(cat in restricted_categories for cat in special_ad_categories):
            # Check age targeting
            if targeting.get("age_min") or targeting.get("age_max"):
                if targeting.get("age_min") and targeting.get("age_max"):
                    issues.append({
                        "category": "TARGETING",
                        "severity": "ERROR",
                        "message": "Age targeting not allowed for this special ad category"
                    })
            
            # Check gender targeting
            if targeting.get("genders") and targeting["genders"] != [0]:
                issues.append({
                    "category": "TARGETING",
                    "severity": "ERROR",
                    "message": "Gender targeting not allowed for this special ad category"
                })
            
            # Check ZIP code targeting
            if targeting.get("geo_locations", {}).get("zips"):
                issues.append({
                    "category": "TARGETING",
                    "severity": "ERROR",
                    "message": "ZIP code targeting not allowed for this special ad category"
                })
        
        # Check political ads
        if "ISSUES_ELECTIONS_POLITICS" in special_ad_categories:
            if not campaign_data.get("paid_for_by"):
                warnings.append("Political ads require 'Paid for by' disclosure")
        
        return {
            "status": "COMPLIANT" if not issues else "NON_COMPLIANT",
            "is_compliant": len(issues) == 0,
            "issues": issues,
            "warnings": warnings,
            "special_ad_categories": special_ad_categories
        }

    # =========================================================================
    # CUSTOM REPORTS METHODS
    # =========================================================================
    
    def _generate_report_sync(
        self,
        account_id: str,
        metrics: List[str],
        breakdowns: List[str] = None,
        date_preset: str = "last_7d",
        level: str = "campaign"
    ) -> Dict[str, Any]:
        """Generate a custom report."""
        import httpx
        
        # Map level to endpoint
        level_endpoints = {
            "account": f"act_{account_id}/insights",
            "campaign": f"act_{account_id}/insights",
            "adset": f"act_{account_id}/insights",
            "ad": f"act_{account_id}/insights"
        }
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{level_endpoints.get(level, 'insights')}"
        
        fields = ",".join(metrics)
        params = {
            "access_token": self._access_token,
            "fields": fields,
            "date_preset": date_preset,
            "level": level
        }
        
        if breakdowns:
            params["breakdowns"] = ",".join(breakdowns)
        
        with httpx.Client(timeout=60.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "rows": data.get("data", []),
                    "row_count": len(data.get("data", []))
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Report generation failed")
                }
    
    async def generate_report(
        self,
        account_id: str,
        metrics: List[str],
        breakdowns: List[str] = None,
        date_preset: str = "last_7d",
        level: str = "campaign"
    ) -> Dict[str, Any]:
        """Generate a custom report."""
        return await asyncio.to_thread(
            self._generate_report_sync,
            account_id,
            metrics,
            breakdowns,
            date_preset,
            level
        )

    # =========================================================================
    # AUDIENCE METHODS
    # =========================================================================
    
    def _get_audiences_sync(self, account_id: str) -> Dict[str, Any]:
        """Get all custom audiences."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/customaudiences"
        params = {
            "access_token": self._access_token,
            # Per Meta v25.0+ docs - include operation_status for flagged audience detection
            "fields": "id,name,subtype,approximate_count,description,time_created,lookalike_spec,operation_status"
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "audiences": data.get("data", [])
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to fetch audiences")
                }
    
    async def get_audiences(self, account_id: str) -> Dict[str, Any]:
        """Get all custom audiences."""
        return await asyncio.to_thread(self._get_audiences_sync, account_id)
    
    def _create_custom_audience_sync(
        self,
        account_id: str,
        name: str,
        subtype: str,
        rule: Dict = None,
        retention_days: int = 30
    ) -> Dict[str, Any]:
        """Create a custom audience."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/customaudiences"
        
        payload = {
            "access_token": self._access_token,
            "name": name,
            "subtype": subtype,
            "retention_days": retention_days
        }
        
        if rule:
            payload["rule"] = rule
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, data=payload)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "audience_id": data.get("id")
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to create audience")
                }
    
    async def create_custom_audience(
        self,
        account_id: str,
        name: str,
        subtype: str,
        rule: Dict = None,
        retention_days: int = 30
    ) -> Dict[str, Any]:
        """Create a custom audience."""
        return await asyncio.to_thread(
            self._create_custom_audience_sync,
            account_id,
            name,
            subtype,
            rule,
            retention_days
        )
    
    def _create_lookalike_audience_sync(
        self,
        account_id: str,
        name: str,
        source_audience_id: str,
        target_countries: List[str],
        ratio: float = 0.01
    ) -> Dict[str, Any]:
        """Create a lookalike audience."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/customaudiences"
        
        lookalike_spec = {
            "origin_audience_id": source_audience_id,
            "location_spec": {
                "geo_locations": {
                    "countries": target_countries
                }
            },
            "ratio": ratio
        }
        
        payload = {
            "access_token": self._access_token,
            "name": name,
            "subtype": "LOOKALIKE",
            "lookalike_spec": str(lookalike_spec).replace("'", '"')
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, data=payload)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "audience_id": data.get("id")
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to create lookalike")
                }
    
    async def create_lookalike_audience(
        self,
        account_id: str,
        name: str,
        source_audience_id: str,
        target_countries: List[str],
        ratio: float = 0.01
    ) -> Dict[str, Any]:
        """Create a lookalike audience."""
        return await asyncio.to_thread(
            self._create_lookalike_audience_sync,
            account_id,
            name,
            source_audience_id,
            target_countries,
            ratio
        )
    
    def _create_engagement_audience_sync(
        self,
        account_id: str,
        name: str,
        source_type: str,
        source_id: str,
        event_name: str,
        retention_seconds: int = 31536000,
        prefill: bool = True
    ) -> Dict[str, Any]:
        """
        Create an engagement custom audience - per Meta v25.0+ docs.
        
        Args:
            account_id: Ad account ID
            name: Audience name
            source_type: Event source type (page, lead, ig_business, etc.)
            source_id: ID of the source object (Page ID, Form ID, etc.)
            event_name: Engagement event (page_engaged, lead_generation_submitted, etc.)
            retention_seconds: How long to keep users in audience (default 1 year)
            prefill: Whether to prefill with existing matching users
        """
        import httpx
        import json
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/customaudiences"
        
        # Build rule structure per Meta docs
        rule = {
            "inclusions": {
                "operator": "or",
                "rules": [
                    {
                        "event_sources": [
                            {
                                "id": source_id,
                                "type": source_type
                            }
                        ],
                        "retention_seconds": retention_seconds,
                        "filter": {
                            "operator": "and",
                            "filters": [
                                {
                                    "field": "event",
                                    "operator": "eq",
                                    "value": event_name
                                }
                            ]
                        }
                    }
                ]
            }
        }
        
        payload = {
            "access_token": self._access_token,
            "name": name,
            "rule": json.dumps(rule),
            "prefill": "1" if prefill else "0"
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, data=payload)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "audience_id": data.get("id"),
                    "name": name
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to create engagement audience")
                }
    
    async def create_engagement_audience(
        self,
        account_id: str,
        name: str,
        source_type: str,
        source_id: str,
        event_name: str,
        retention_seconds: int = 31536000,
        prefill: bool = True
    ) -> Dict[str, Any]:
        """Create an engagement custom audience - per Meta v25.0+ docs."""
        return await asyncio.to_thread(
            self._create_engagement_audience_sync,
            account_id,
            name,
            source_type,
            source_id,
            event_name,
            retention_seconds,
            prefill
        )
    
    def _get_audience_size_sync(self, audience_id: str) -> Dict[str, Any]:
        """Get audience size estimation."""
        import httpx
        
        url = f"https://graph.facebook.com/{META_API_VERSION}/{audience_id}"
        params = {
            "access_token": self._access_token,
            "fields": "id,name,approximate_count,delivery_status"
        }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            
            if response.is_success:
                data = response.json()
                return {
                    "success": True,
                    "audience_id": audience_id,
                    "count": data.get("approximate_count", 0)
                }
            else:
                error_data = response.json()
                return {
                    "success": False,
                    "error": error_data.get("error", {}).get("message", "Failed to get size")
                }
    
    async def get_audience_size(self, audience_id: str) -> Dict[str, Any]:
        """Get audience size estimation."""
        return await asyncio.to_thread(self._get_audience_size_sync, audience_id)

    # Local analysis features (Budget, Placements, Funnel, Health, Competitors)
    # have been removed. Use SDK specialized services instead.

    # =========================================================================
    # INSIGHTS OPERATIONS
    # =========================================================================

    @async_sdk_call
    def _get_account_insights_sync(
        self,
        ad_account_id: str,
        date_preset: str = 'last_7d',
        fields: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Get account insights"""
        self._ensure_initialized()
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
            
        account = AdAccount(fbid=ad_account_id)
        params = {
            'date_preset': date_preset,
            'level': 'account'
        }
        
        insights = account.get_insights(
            fields=fields or ['impressions', 'spend', 'actions', 'cpc', 'cpm', 'ctr', 'reach'],
            params=params
        )
        
        return [dict(i) for i in insights]

    async def get_account_insights(
        self,
        ad_account_id: str,
        date_preset: str = 'last_7d',
        fields: List[str] = None,
        time_range: Optional[Dict[str, str]] = None,
        breakdowns: Optional[List[str]] = None,
        action_attribution_windows: Optional[List[str]] = None,
        level: str = 'account'
    ) -> List[Dict[str, Any]]:
        """
        Get comprehensive account insights (v25.0+).
        
        Args:
            ad_account_id: Ad Account ID
            date_preset: last_7d, last_14d, last_28d, last_30d, last_90d, etc.
            fields: List of fields to retrieve
            time_range: Custom date range {'since': 'YYYY-MM-DD', 'until': 'YYYY-MM-DD'}
            breakdowns: age, gender, country, publisher_platform, etc.
            action_attribution_windows: 1d_click, 7d_click, 1d_view, etc.
            level: account, campaign, adset, ad
        """
        return await asyncio.to_thread(
            self._get_insights_sync,
            ad_account_id, None, date_preset, fields, time_range, 
            breakdowns, action_attribution_windows, level
        )

    @async_sdk_call
    def _get_insights_sync(
        self,
        ad_account_id: str,
        object_id: Optional[str] = None,
        date_preset: str = 'last_7d',
        fields: List[str] = None,
        time_range: Optional[Dict[str, str]] = None,
        breakdowns: Optional[List[str]] = None,
        action_attribution_windows: Optional[List[str]] = None,
        level: str = 'account'
    ) -> List[Dict[str, Any]]:
        """Get insights for any ads object - v25.0+ compliant"""
        self._ensure_initialized()
        
        # Default v25.0+ compliant fields
        default_fields = [
            'impressions', 'reach', 'frequency', 'spend',
            'clicks', 'cpc', 'cpm', 'ctr',
            'actions', 'cost_per_action_type', 'conversions',
            'conversion_values', 'purchase_roas',
            'video_avg_time_watched_actions', 'video_p25_watched_actions',
            'video_p50_watched_actions', 'video_p75_watched_actions',
            'video_p100_watched_actions'
        ]
        
        params = {
            'level': level
        }
        
        if time_range:
            params['time_range'] = time_range
        else:
            params['date_preset'] = date_preset
        
        if breakdowns:
            params['breakdowns'] = breakdowns
            
        # v25.0+: Attribution windows
        if action_attribution_windows:
            params['action_attribution_windows'] = action_attribution_windows
        else:
            # Default to 7-day click attribution (v25.0+ default)
            params['action_attribution_windows'] = ['7d_click', '1d_view']
        
        # Get insights from the appropriate object
        if object_id:
            # Campaign, AdSet, or Ad insights
            from facebook_business.adobjects.campaign import Campaign
            from facebook_business.adobjects.adset import AdSet
            from facebook_business.adobjects.ad import Ad
            
            if level == 'campaign':
                obj = Campaign(fbid=object_id)
            elif level == 'adset':
                obj = AdSet(fbid=object_id)
            elif level == 'ad':
                obj = Ad(fbid=object_id)
            else:
                obj = Campaign(fbid=object_id)
            
            insights = obj.get_insights(
                fields=fields or default_fields,
                params=params
            )
        else:
            # Account-level insights
            if not ad_account_id.startswith('act_'):
                ad_account_id = f'act_{ad_account_id}'
            account = AdAccount(fbid=ad_account_id)
            insights = account.get_insights(
                fields=fields or default_fields,
                params=params
            )
        
        return [dict(i) for i in insights]

    async def get_campaign_insights(
        self,
        campaign_id: str,
        date_preset: str = 'last_7d',
        fields: List[str] = None,
        time_range: Optional[Dict[str, str]] = None,
        breakdowns: Optional[List[str]] = None,
        action_attribution_windows: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get campaign-level insights (v25.0+)"""
        return await asyncio.to_thread(
            self._get_insights_sync,
            None, campaign_id, date_preset, fields, time_range,
            breakdowns, action_attribution_windows, 'campaign'
        )

    async def get_adset_insights(
        self,
        adset_id: str,
        date_preset: str = 'last_7d',
        fields: List[str] = None,
        time_range: Optional[Dict[str, str]] = None,
        breakdowns: Optional[List[str]] = None,
        action_attribution_windows: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get ad set-level insights (v25.0+)"""
        return await asyncio.to_thread(
            self._get_insights_sync,
            None, adset_id, date_preset, fields, time_range,
            breakdowns, action_attribution_windows, 'adset'
        )

    async def get_ad_insights(
        self,
        ad_id: str,
        date_preset: str = 'last_7d',
        fields: List[str] = None,
        time_range: Optional[Dict[str, str]] = None,
        breakdowns: Optional[List[str]] = None,
        action_attribution_windows: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get ad-level insights (v25.0+)"""
        return await asyncio.to_thread(
            self._get_insights_sync,
            None, ad_id, date_preset, fields, time_range,
            breakdowns, action_attribution_windows, 'ad'
        )

    # =========================================================================
    # A/B TESTING (Split Testing) - ad_studies endpoint
    # https://developers.facebook.com/docs/marketing-api/guides/split-testing
    # =========================================================================

    def _create_ab_test_sync(
        self,
        account_id: str,
        name: str,
        test_type: str = "SPLIT_TEST",
        cells: List[Dict[str, Any]] = None,
        description: Optional[str] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        business_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create an A/B test (ad study) via Meta's ad_studies endpoint.
        
        Per Meta Split Testing docs:
        - POST /{BUSINESS_ID}/ad_studies or POST /act_{ACCOUNT_ID}/ad_studies
        - Cells should contain: name, treatment_percentage, and campaigns or adsets arrays
        """
        import json
        import httpx
        
        self._ensure_initialized()
        
        # Build endpoint URL - prefer business_id if provided
        if business_id:
            url = f"https://graph.facebook.com/{META_API_VERSION}/{business_id}/ad_studies"
        else:
            url = f"https://graph.facebook.com/{META_API_VERSION}/act_{account_id}/ad_studies"
        
        # Build cells in Meta's required format
        study_cells = []
        for cell in (cells or []):
            cell_data = {
                "name": cell.get("name", "Unnamed"),
                "treatment_percentage": cell.get("treatment_percentage", 50)
            }
            # Add campaigns or adsets (use one or the other per docs)
            if cell.get("campaigns"):
                cell_data["campaigns"] = cell["campaigns"]
            elif cell.get("adsets"):
                cell_data["adsets"] = cell["adsets"]
            study_cells.append(cell_data)
        
        params = {
            "access_token": self.access_token,
            "name": name,
            "type": test_type,
            "cells": json.dumps(study_cells)  # Must be JSON-encoded string
        }
        
        if description:
            params["description"] = description
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(url, data=params)  # Use data= for form-encoded
                response.raise_for_status()
                result = response.json()
                
                return {
                    "success": True,
                    "test_id": result.get("id"),
                    "name": name
                }
        except httpx.HTTPStatusError as e:
            error_detail = e.response.json() if e.response else {}
            logger.error(f"Failed to create A/B test: {error_detail}")
            return {
                "success": False,
                "error": error_detail.get("error", {}).get("message", str(e))
            }
        except Exception as e:
            logger.error(f"Error creating A/B test: {e}")
            return {"success": False, "error": str(e)}

    async def create_ab_test(
        self,
        account_id: str,
        name: str,
        test_type: str = "SPLIT_TEST",
        cells: List[Dict[str, Any]] = None,
        description: Optional[str] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        business_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create an A/B test (ad study) - async wrapper"""
        return await asyncio.to_thread(
            self._create_ab_test_sync,
            account_id, name, test_type, cells, description,
            start_time, end_time, business_id
        )


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
