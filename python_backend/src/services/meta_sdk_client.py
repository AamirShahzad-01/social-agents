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
        """Sync method to get user's pages - wrapped by async decorator"""
        self._ensure_initialized()
        
        user = User(fbid='me')
        pages = user.get_accounts(fields=[
            'id',
            'name', 
            'access_token',
            'category',
            'instagram_business_account',
            'picture'
        ])
        
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
            'updated_time'
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
                'updated_time': camp.get('updated_time')
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
    def _create_campaign_sync(
        self,
        ad_account_id: str,
        name: str,
        objective: str,
        status: str = 'PAUSED',
        special_ad_categories: Optional[List[str]] = None,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new campaign"""
        self._ensure_initialized()
        
        if not ad_account_id.startswith('act_'):
            ad_account_id = f'act_{ad_account_id}'
        
        account = AdAccount(fbid=ad_account_id)
        params = {
            'name': name,
            'objective': objective,
            'status': status,
            'special_ad_categories': special_ad_categories or []
        }
        
        if daily_budget:
            params['daily_budget'] = daily_budget
        if lifetime_budget:
            params['lifetime_budget'] = lifetime_budget
        if bid_strategy:
            params['bid_strategy'] = bid_strategy
        
        campaign = account.create_campaign(params=params)
        return {'id': campaign.get('id'), 'campaign_id': campaign.get('id')}
    
    async def create_campaign(
        self,
        ad_account_id: str,
        name: str,
        objective: str,
        status: str = 'PAUSED',
        special_ad_categories: Optional[List[str]] = None,
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new Campaign.
        
        Args:
            ad_account_id: Ad Account ID
            name: Campaign name
            objective: Campaign objective (OUTCOME_TRAFFIC, OUTCOME_AWARENESS, etc.)
            status: ACTIVE or PAUSED
            special_ad_categories: List of special ad categories
            daily_budget: Daily budget in cents
            lifetime_budget: Lifetime budget in cents
            bid_strategy: Bid strategy
            
        Returns:
            Dict with campaign_id
        """
        return await self._create_campaign_sync(
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
        call_to_action_type: Optional[str] = None
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
        call_to_action_type: Optional[str] = None
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
            
        Returns:
            Dict with creative_id
        """
        return await self._create_ad_creative_sync(
            ad_account_id, name, page_id, image_hash, image_url, video_id,
            message, link, call_to_action_type
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
