"""
SDK Facebook Pages Service
Meta Business SDK - Page operations

Uses:
- facebook_business.adobjects.page
- Manage Facebook Pages: posts, photos, videos, feed
"""
import asyncio
import logging
import hmac
import hashlib
from typing import Optional, Dict, Any, List

from facebook_business.adobjects.page import Page
from facebook_business.exceptions import FacebookRequestError

from ...config import settings

logger = logging.getLogger(__name__)

# API Version
META_API_VERSION = "v24.0"


class PagesService:
    """Service for Facebook Page operations using Meta SDK."""
    
    def __init__(self, access_token: str, app_secret: Optional[str] = None):
        """
        Initialize Pages Service.
        
        Args:
            access_token: User or Page access token
            app_secret: App secret for appsecret_proof (optional, defaults to settings)
        """
        self.access_token = access_token
        self.app_secret = app_secret or settings.FACEBOOK_CLIENT_SECRET
    
    def _init_api(self):
        """Initialize the SDK API"""
        from facebook_business.api import FacebookAdsApi
        FacebookAdsApi.init(
            app_id=settings.FACEBOOK_APP_ID,
            app_secret=settings.FACEBOOK_APP_SECRET,
            access_token=self.access_token,
            api_version=META_API_VERSION
        )
    
    def _get_appsecret_proof(self) -> str:
        """Calculate appsecret_proof = HMAC-SHA256(access_token, app_secret)"""
        if not self.app_secret:
            return ""
        return hmac.new(
            self.app_secret.encode('utf-8'),
            self.access_token.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
    
    def _get_user_pages_sync(self) -> Dict[str, Any]:
        """
        Get user's pages using direct HTTP call with v24 API.
        Uses v24 for credential operations (v25 for ads only).
        Includes appsecret_proof for server-side security.
        """
        try:
            import httpx
            
            appsecret_proof = self._get_appsecret_proof()
            
            # Use v24 for credential/pages operations
            url = f"https://graph.facebook.com/v24.0/me/accounts"
            params = {
                'access_token': self.access_token,
                'fields': 'id,name,access_token,category,instagram_business_account,picture'
            }
            if appsecret_proof:
                params['appsecret_proof'] = appsecret_proof
            
            with httpx.Client(timeout=30.0) as client:
                response = client.get(url, params=params)
                
                if not response.is_success:
                    error_data = response.json() if response.content else {}
                    error_msg = error_data.get('error', {}).get('message', f'HTTP {response.status_code}')
                    return {"success": False, "error": error_msg}
                
                data = response.json()
                pages = data.get('data', [])
                
                result = [
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
                
                return {"success": True, "pages": result}
                
        except Exception as e:
            logger.error(f"Get user pages error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_user_pages(self) -> Dict[str, Any]:
        """
        Get Facebook Pages managed by the user.
        Uses v24 API for credential operations.
        
        Returns:
            Dict with success status and list of Page objects with id, name, access_token, category
        """
        return await asyncio.to_thread(self._get_user_pages_sync)
    
    def _get_page_info_sync(self, page_id: str) -> Dict[str, Any]:
        """Get info about a specific Page"""
        try:
            self._init_api()
            
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
                "success": True,
                "page": {
                    'id': page['id'],
                    'name': page.get('name'),
                    'about': page.get('about'),
                    'category': page.get('category'),
                    'fan_count': page.get('fan_count'),
                    'picture': page.get('picture', {}).get('data', {}).get('url'),
                    'instagram_business_account': page.get('instagram_business_account')
                }
            }
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get page info error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_page_info(self, page_id: str) -> Dict[str, Any]:
        """
        Get information about a specific Facebook Page.
        
        Args:
            page_id: Facebook Page ID
            
        Returns:
            Dict with page info including id, name, about, category, fan_count
        """
        return await asyncio.to_thread(self._get_page_info_sync, page_id)
    
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
        try:
            self._init_api()
            
            page = Page(fbid=page_id)
            params = {'message': message}
            
            if link:
                params['link'] = link
            if not published:
                params['published'] = False
                if scheduled_publish_time:
                    params['scheduled_publish_time'] = scheduled_publish_time
            
            result = page.create_feed(**params)
            return {
                "success": True,
                'id': result.get('id'),
                'post_id': result.get('id')
            }
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Post to page error: {e}")
            return {"success": False, "error": str(e)}
    
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
        return await asyncio.to_thread(
            self._post_to_page_sync,
            page_id,
            message,
            link,
            published,
            scheduled_publish_time
        )
    
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
        try:
            self._init_api()
            
            page = Page(fbid=page_id)
            params = {'url': photo_url}
            if caption:
                params['caption'] = caption
            if not published:
                params['published'] = False
                
            result = page.create_photo(**params)
            return {
                "success": True,
                'id': result.get('id'),
                'photo_id': result.get('id'),
                'post_id': result.get('post_id')
            }
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Post photo to page error: {e}")
            return {"success": False, "error": str(e)}
    
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
        return await asyncio.to_thread(
            self._post_photo_to_page_sync,
            page_id,
            photo_url,
            caption,
            published
        )
    
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
        try:
            self._init_api()
            
            page = Page(fbid=page_id)
            params = {'file_url': video_url}
            if description:
                params['description'] = description
            if title:
                params['title'] = title
                
            result = page.create_video(**params)
            return {
                "success": True,
                'id': result.get('id'),
                'video_id': result.get('id')
            }
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Post video to page error: {e}")
            return {"success": False, "error": str(e)}
    
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
        return await asyncio.to_thread(
            self._post_video_to_page_sync,
            page_id,
            video_url,
            description,
            title
        )
    
    def _get_page_feed_sync(
        self, 
        page_id: str, 
        limit: int = 10
    ) -> Dict[str, Any]:
        """Get Facebook Page feed posts"""
        try:
            self._init_api()
            
            page = Page(fbid=page_id)
            posts = page.get_feed(
                fields=[
                    'id', 'message', 'created_time', 'permalink_url',
                    'comments.summary(true)', 'shares'
                ],
                params={'limit': limit}
            )
            
            return {
                "success": True,
                "posts": [dict(p) for p in posts]
            }
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get page feed error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_page_feed(
        self, 
        page_id: str, 
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Get Facebook Page feed posts.
        
        Args:
            page_id: Facebook Page ID
            limit: Max posts to fetch
            
        Returns:
            Dict with list of post objects with id, message, comments summary, etc.
        """
        return await asyncio.to_thread(
            self._get_page_feed_sync,
            page_id,
            limit
        )
    
    # =========================================================================
    # REELS, STORIES, CAROUSEL (2026 Features)
    # =========================================================================
    
    def _upload_reel_sync(
        self,
        page_id: str,
        video_url: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload Facebook Reel (short-form vertical video).
        Uses 3-step resumable upload flow per Graph API v24 docs.
        """
        try:
            import httpx
            
            appsecret_proof = self._get_appsecret_proof()
            
            # Step 1: Initialize upload session
            init_url = f"https://graph.facebook.com/v24.0/{page_id}/video_reels"
            init_params = {
                'upload_phase': 'start',
                'access_token': self.access_token
            }
            if appsecret_proof:
                init_params['appsecret_proof'] = appsecret_proof
            
            with httpx.Client(timeout=60.0) as client:
                init_response = client.post(init_url, data=init_params)
                if not init_response.is_success:
                    return {"success": False, "error": f"Init failed: {init_response.text}"}
                
                video_id = init_response.json().get('video_id')
                
                # Step 2: Download video and upload binary
                video_response = client.get(video_url)
                if not video_response.is_success:
                    return {"success": False, "error": "Failed to download video"}
                
                video_data = video_response.content
                
                upload_url = f"https://rupload.facebook.com/video-upload/v24.0/{video_id}"
                upload_response = client.post(
                    upload_url,
                    headers={
                        'Authorization': f'OAuth {self.access_token}',
                        'offset': '0',
                        'file_size': str(len(video_data))
                    },
                    content=video_data
                )
                
                if not upload_response.is_success:
                    return {"success": False, "error": f"Upload failed: {upload_response.text}"}
                
                # Step 3: Finish and publish
                finish_params = {
                    'video_id': video_id,
                    'upload_phase': 'finish',
                    'video_state': 'PUBLISHED',
                    'access_token': self.access_token
                }
                if description:
                    finish_params['description'] = description
                if appsecret_proof:
                    finish_params['appsecret_proof'] = appsecret_proof
                
                finish_response = client.post(init_url, data=finish_params)
                if not finish_response.is_success:
                    return {"success": False, "error": f"Finish failed: {finish_response.text}"}
                
                result = finish_response.json()
                return {
                    "success": True,
                    "id": result.get('id', video_id),
                    "video_id": video_id
                }
                
        except Exception as e:
            logger.error(f"Upload reel error: {e}")
            return {"success": False, "error": str(e)}
    
    async def upload_reel(
        self,
        page_id: str,
        video_url: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload Facebook Reel (short-form vertical video).
        
        Args:
            page_id: Facebook Page ID
            video_url: Public URL of the video
            description: Optional reel description
            
        Returns:
            Dict with video_id
        """
        return await asyncio.to_thread(
            self._upload_reel_sync,
            page_id,
            video_url,
            description
        )
    
    def _upload_story_sync(
        self,
        page_id: str,
        media_url: str,
        is_video: bool = False
    ) -> Dict[str, Any]:
        """
        Upload Facebook Story (24-hour temporary post).
        """
        try:
            import httpx
            
            appsecret_proof = self._get_appsecret_proof()
            
            with httpx.Client(timeout=60.0) as client:
                if is_video:
                    # Video story - upload binary
                    video_response = client.get(media_url)
                    if not video_response.is_success:
                        return {"success": False, "error": "Failed to download video"}
                    
                    files = {'source': ('story.mp4', video_response.content, 'video/mp4')}
                    data = {'access_token': self.access_token}
                    if appsecret_proof:
                        data['appsecret_proof'] = appsecret_proof
                    
                    response = client.post(
                        f"https://graph-video.facebook.com/v24.0/{page_id}/video_stories",
                        files=files,
                        data=data
                    )
                else:
                    # Photo story - use URL
                    params = {
                        'url': media_url,
                        'access_token': self.access_token
                    }
                    if appsecret_proof:
                        params['appsecret_proof'] = appsecret_proof
                    
                    response = client.post(
                        f"https://graph.facebook.com/v24.0/{page_id}/photo_stories",
                        data=params
                    )
                
                if not response.is_success:
                    return {"success": False, "error": response.text}
                
                result = response.json()
                return {
                    "success": True,
                    "id": result.get('id')
                }
                
        except Exception as e:
            logger.error(f"Upload story error: {e}")
            return {"success": False, "error": str(e)}
    
    async def upload_story(
        self,
        page_id: str,
        media_url: str,
        is_video: bool = False
    ) -> Dict[str, Any]:
        """
        Upload Facebook Story (24-hour temporary post).
        
        Args:
            page_id: Facebook Page ID
            media_url: Public URL of the media
            is_video: True for video story, False for photo story
            
        Returns:
            Dict with story id
        """
        return await asyncio.to_thread(
            self._upload_story_sync,
            page_id,
            media_url,
            is_video
        )
    
    def _create_carousel_sync(
        self,
        page_id: str,
        photo_ids: List[str],
        message: str
    ) -> Dict[str, Any]:
        """
        Create carousel post with multiple photos.
        Photos must be uploaded first as unpublished (published=False).
        """
        try:
            import httpx
            
            appsecret_proof = self._get_appsecret_proof()
            
            attached_media = [{'media_fbid': photo_id} for photo_id in photo_ids]
            
            params = {
                'message': message,
                'attached_media': attached_media,
                'access_token': self.access_token
            }
            if appsecret_proof:
                params['appsecret_proof'] = appsecret_proof
            
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"https://graph.facebook.com/v24.0/{page_id}/feed",
                    json=params
                )
                
                if not response.is_success:
                    return {"success": False, "error": response.text}
                
                result = response.json()
                return {
                    "success": True,
                    "id": result.get('id'),
                    "post_id": result.get('id')
                }
                
        except Exception as e:
            logger.error(f"Create carousel error: {e}")
            return {"success": False, "error": str(e)}
    
    async def create_carousel(
        self,
        page_id: str,
        photo_ids: List[str],
        message: str
    ) -> Dict[str, Any]:
        """
        Create carousel post with multiple photos.
        
        Args:
            page_id: Facebook Page ID
            photo_ids: List of photo IDs (from unpublished photo uploads)
            message: Carousel caption
            
        Returns:
            Dict with post_id
        """
        return await asyncio.to_thread(
            self._create_carousel_sync,
            page_id,
            photo_ids,
            message
        )
