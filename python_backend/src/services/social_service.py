"""
Social Media Service
Production-ready service for interacting with social media platform APIs
Uses Meta Business SDK for Facebook/Instagram operations

This service provides a unified interface for:
- Facebook (via Meta Business SDK)
- Instagram (via Meta Business SDK)
- Twitter, LinkedIn, TikTok, YouTube (keep existing implementations for non-Meta platforms)
"""
import httpx
import hmac
import hashlib
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime

from ..config import settings
from .meta_sdk_client import create_meta_sdk_client, MetaSDKError
import logging

logger = logging.getLogger(__name__)


class SocialMediaService:
    """Service for social media platform API interactions"""
    
    def __init__(self):
        # HTTP client for non-Meta platforms
        self.http_client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()
    
    # ============================================================================
    # HELPER METHODS
    # ============================================================================
    
    def generate_app_secret_proof(self, access_token: str, app_secret: str) -> str:
        """
        Generate appsecret_proof for Facebook server-to-server calls
        Required for secure API calls from the backend
        
        Args:
            access_token: Facebook access token
            app_secret: Facebook app secret
            
        Returns:
            HMAC SHA256 hash as hex string
        """
        return hmac.new(
            app_secret.encode('utf-8'),
            access_token.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
    
    def _get_sdk_client(self, access_token: str):
        """Get SDK client initialized with access token"""
        return create_meta_sdk_client(access_token)
    
    # ============================================================================
    # FACEBOOK API - Using Meta Business SDK
    # ============================================================================
    
    async def facebook_exchange_code_for_token(
        self,
        code: str,
        redirect_uri: str
    ) -> Dict[str, Any]:
        """
        Exchange Facebook authorization code for access token
        Note: OAuth token exchange still uses direct API call as SDK requires existing token
        """
        try:
            app_id = settings.FACEBOOK_CLIENT_ID
            app_secret = settings.FACEBOOK_CLIENT_SECRET
            
            if not app_id or not app_secret:
                return {'success': False, 'error': 'Facebook credentials not configured'}
            
            response = await self.http_client.post(
                'https://graph.facebook.com/v24.0/oauth/access_token',
                data={
                    'client_id': app_id,
                    'client_secret': app_secret,
                    'redirect_uri': redirect_uri,
                    'code': code
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            return {
                'success': True,
                'access_token': data['access_token'],
                'token_type': data.get('token_type', 'bearer'),
                'expires_in': data.get('expires_in')
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_get_long_lived_token(
        self,
        short_lived_token: str
    ) -> Dict[str, Any]:
        """
        Exchange short-lived token for long-lived token (60 days)
        Note: Token exchange still uses direct API call
        """
        try:
            app_id = settings.FACEBOOK_CLIENT_ID
            app_secret = settings.FACEBOOK_CLIENT_SECRET
            
            response = await self.http_client.get(
                'https://graph.facebook.com/v24.0/oauth/access_token',
                params={
                    'grant_type': 'fb_exchange_token',
                    'client_id': app_id,
                    'client_secret': app_secret,
                    'fb_exchange_token': short_lived_token
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            return {
                'success': True,
                'access_token': data['access_token'],
                'expires_in': data.get('expires_in', 5184000)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_get_pages(
        self,
        access_token: str
    ) -> Dict[str, Any]:
        """
        Get Facebook Pages managed by the user using Meta Business SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            pages = await client.get_user_pages()
            
            return {
                'success': True,
                'pages': pages
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_post_to_page(
        self,
        page_id: str,
        page_access_token: str,
        message: str,
        link: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Post to Facebook Page using Meta Business SDK
        """
        try:
            client = self._get_sdk_client(page_access_token)
            result = await client.post_to_page(
                page_id=page_id,
                message=message,
                link=link
            )
            
            return {
                'success': True,
                'post_id': result.get('post_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_post_photo(
        self,
        page_id: str,
        page_access_token: str,
        image_url: str,
        caption: str
    ) -> Dict[str, Any]:
        """
        Post photo to Facebook Page using Meta Business SDK
        """
        try:
            client = self._get_sdk_client(page_access_token)
            result = await client.post_photo_to_page(
                page_id=page_id,
                photo_url=image_url,
                caption=caption
            )
            
            return {
                'success': True,
                'photo_id': result.get('photo_id') or result.get('id'),
                'post_id': result.get('post_id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_video(
        self,
        page_id: str,
        page_access_token: str,
        video_url: str,
        description: str
    ) -> Dict[str, Any]:
        """
        Upload video to Facebook Page using Meta Business SDK
        """
        try:
            client = self._get_sdk_client(page_access_token)
            result = await client.post_video_to_page(
                page_id=page_id,
                video_url=video_url,
                description=description
            )
            
            return {
                'success': True,
                'video_id': result.get('video_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_reel(
        self,
        page_id: str,
        page_access_token: str,
        video_url: str,
        description: str
    ) -> Dict[str, Any]:
        """
        Upload Facebook Reel (short-form vertical video)
        Note: Uses direct API as SDK doesn't have specific Reels support
        """
        try:
            # Fetch video from URL
            video_response = await self.http_client.get(video_url)
            video_response.raise_for_status()
            video_data = video_response.content
            
            app_secret = settings.FACEBOOK_CLIENT_SECRET
            app_secret_proof = self.generate_app_secret_proof(page_access_token, app_secret)
            
            # Step 1: Initialize upload session
            init_response = await self.http_client.post(
                f'https://graph.facebook.com/v24.0/{page_id}/video_reels',
                data={
                    'upload_phase': 'start',
                    'access_token': page_access_token,
                    'appsecret_proof': app_secret_proof
                }
            )
            init_response.raise_for_status()
            init_data = init_response.json()
            video_id = init_data['video_id']
            
            # Step 2: Upload video data
            upload_response = await self.http_client.post(
                f'https://rupload.facebook.com/video-upload/v24.0/{video_id}',
                headers={
                    'Authorization': f'OAuth {page_access_token}',
                    'offset': '0',
                    'file_size': str(len(video_data))
                },
                content=video_data
            )
            upload_response.raise_for_status()
            
            # Step 3: Finish and publish
            finish_response = await self.http_client.post(
                f'https://graph.facebook.com/v24.0/{page_id}/video_reels',
                data={
                    'video_id': video_id,
                    'upload_phase': 'finish',
                    'video_state': 'PUBLISHED',
                    'description': description,
                    'access_token': page_access_token,
                    'appsecret_proof': app_secret_proof
                }
            )
            finish_response.raise_for_status()
            result = finish_response.json()
            
            return {
                'success': True,
                'id': result.get('id', video_id)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_story(
        self,
        page_id: str,
        page_access_token: str,
        media_url: str,
        is_video: bool = False
    ) -> Dict[str, Any]:
        """
        Upload Facebook Story (24-hour temporary post)
        Note: Uses direct API as SDK doesn't have specific Stories support
        """
        try:
            app_secret = settings.FACEBOOK_CLIENT_SECRET
            app_secret_proof = self.generate_app_secret_proof(page_access_token, app_secret)
            
            if is_video:
                video_response = await self.http_client.get(media_url)
                video_response.raise_for_status()
                video_data = video_response.content
                
                files = {'source': ('story.mp4', video_data, 'video/mp4')}
                data = {
                    'access_token': page_access_token,
                    'appsecret_proof': app_secret_proof
                }
                
                response = await self.http_client.post(
                    f'https://graph-video.facebook.com/v24.0/{page_id}/video_stories',
                    files=files,
                    data=data
                )
            else:
                response = await self.http_client.post(
                    f'https://graph.facebook.com/v24.0/{page_id}/photo_stories',
                    data={
                        'url': media_url,
                        'access_token': page_access_token,
                        'appsecret_proof': app_secret_proof
                    }
                )
            
            response.raise_for_status()
            result = response.json()
            
            return {
                'success': True,
                'id': result['id']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_photo_unpublished(
        self,
        page_id: str,
        page_access_token: str,
        image_url: str
    ) -> Dict[str, Any]:
        """
        Upload photo as unpublished (for carousel)
        """
        try:
            client = self._get_sdk_client(page_access_token)
            result = await client.post_photo_to_page(
                page_id=page_id,
                photo_url=image_url,
                published=False
            )
            
            return {
                'success': True,
                'photo_id': result.get('photo_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_create_carousel(
        self,
        page_id: str,
        page_access_token: str,
        photo_ids: List[str],
        message: str
    ) -> Dict[str, Any]:
        """
        Create carousel post with multiple photos
        Note: Uses direct API for carousel attachment
        """
        try:
            app_secret = settings.FACEBOOK_CLIENT_SECRET
            app_secret_proof = self.generate_app_secret_proof(page_access_token, app_secret)
            
            attached_media = [{'media_fbid': photo_id} for photo_id in photo_ids]
            
            response = await self.http_client.post(
                f'https://graph.facebook.com/v24.0/{page_id}/feed',
                json={
                    'message': message,
                    'attached_media': attached_media,
                    'access_token': page_access_token,
                    'appsecret_proof': app_secret_proof
                }
            )
            
            response.raise_for_status()
            result = response.json()
            
            return {
                'success': True,
                'post_id': result['id']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # INSTAGRAM API - Using Meta Business SDK
    # ============================================================================
    
    async def instagram_get_business_account(
        self,
        page_id: str,
        page_access_token: str
    ) -> Dict[str, Any]:
        """
        Get Instagram Business Account connected to Facebook Page using SDK
        """
        try:
            client = self._get_sdk_client(page_access_token)
            result = await client.get_instagram_account(page_id)
            
            if not result:
                return {'success': False, 'error': 'No Instagram Business Account connected'}
            
            return {
                'success': True,
                'instagram_account_id': result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_create_media_container(
        self,
        ig_user_id: str,
        access_token: str,
        image_url: str,
        caption: str
    ) -> Dict[str, Any]:
        """
        Create Instagram media container for image using SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.create_instagram_media_container(
                ig_user_id=ig_user_id,
                image_url=image_url,
                caption=caption
            )
            
            return {
                'success': True,
                'container_id': result.get('container_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_publish_media(
        self,
        ig_account_id: str,
        access_token: str,
        container_id: str
    ) -> Dict[str, Any]:
        """
        Publish Instagram media container using SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.publish_instagram_media(
                ig_user_id=ig_account_id,
                creation_id=container_id
            )
            
            return {
                'success': True,
                'post_id': result.get('media_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_create_reels_container(
        self,
        ig_user_id: str,
        access_token: str,
        video_url: str,
        caption: str
    ) -> Dict[str, Any]:
        """
        Create Instagram Reels container using SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.create_instagram_media_container(
                ig_user_id=ig_user_id,
                video_url=video_url,
                caption=caption,
                media_type='REELS'
            )
            
            return {
                'success': True,
                'container_id': result.get('container_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_create_story_container(
        self,
        ig_user_id: str,
        access_token: str,
        media_url: str,
        is_video: bool = False
    ) -> Dict[str, Any]:
        """
        Create Instagram Story container using SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            
            params = {
                'ig_user_id': ig_user_id,
                'media_type': 'STORIES'
            }
            
            if is_video:
                params['video_url'] = media_url
            else:
                params['image_url'] = media_url
            
            result = await client.create_instagram_media_container(**params)
            
            return {
                'success': True,
                'container_id': result.get('container_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_create_carousel_container(
        self,
        ig_user_id: str,
        access_token: str,
        media_urls: List[str],
        caption: str
    ) -> Dict[str, Any]:
        """
        Create Instagram carousel container (2-10 mixed images/videos) using SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            
            # Step 1: Create individual item containers
            child_container_ids = []
            
            for media_url in media_urls:
                is_video = any(ext in media_url.lower() for ext in ['.mp4', '.mov', '.m4v', '/video/', '/videos/'])
                
                if is_video:
                    result = await client.create_instagram_media_container(
                        ig_user_id=ig_user_id,
                        video_url=media_url,
                        media_type='VIDEO',
                        is_carousel_item=True
                    )
                else:
                    result = await client.create_instagram_media_container(
                        ig_user_id=ig_user_id,
                        image_url=media_url,
                        is_carousel_item=True
                    )
                
                container_id = result.get('container_id') or result.get('id')
                
                # Wait for video containers to finish processing
                if is_video:
                    await self._wait_for_container_ready(container_id, access_token, max_wait_seconds=180)
                
                child_container_ids.append(container_id)
            
            # Step 2: Create parent carousel container
            result = await client.create_instagram_carousel_container(
                ig_user_id=ig_user_id,
                children=child_container_ids,
                caption=caption
            )
            
            return {
                'success': True,
                'container_id': result.get('container_id') or result.get('id')
            }
            
        except MetaSDKError as e:
            return {'success': False, 'error': e.message}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def _wait_for_container_ready(
        self,
        container_id: str,
        access_token: str,
        max_wait_seconds: int = 120
    ) -> bool:
        """Wait for container to reach FINISHED status"""
        client = self._get_sdk_client(access_token)
        poll_interval = 3
        start_time = datetime.utcnow()
        
        while True:
            elapsed = (datetime.utcnow() - start_time).total_seconds()
            
            if elapsed > max_wait_seconds:
                return False
            
            try:
                status = await client.get_instagram_container_status(container_id)
                status_code = status.get('status_code') or status.get('status', '')
                
                if status_code == 'FINISHED':
                    return True
                
                if status_code in ['ERROR', 'EXPIRED']:
                    return False
                
                await asyncio.sleep(poll_interval)
                
            except Exception:
                await asyncio.sleep(poll_interval)
        
        return False
    
    async def instagram_wait_for_container_ready(
        self,
        container_id: str,
        access_token: str,
        max_attempts: int = 30,
        delay_ms: int = 2000
    ) -> bool:
        """
        Wait for media container to finish processing
        """
        return await self._wait_for_container_ready(
            container_id,
            access_token,
            max_wait_seconds=max_attempts * (delay_ms / 1000)
        )
    
    async def instagram_publish_media_container(
        self,
        ig_user_id: str,
        access_token: str,
        creation_id: str
    ) -> Dict[str, Any]:
        """
        Publish Instagram media container (final step)
        """
        return await self.instagram_publish_media(ig_user_id, access_token, creation_id)


# Singleton instance
social_service = SocialMediaService()


# ============================================================================
# ADDITIONAL OAUTH METHODS (for Twitter, LinkedIn, TikTok, YouTube)
# These remain as direct API calls since they're not Meta platforms
# ============================================================================

async def _instagram_get_accounts(self, access_token: str):
    """Get Instagram Business Accounts connected to user's Facebook Pages"""
    try:
        client = self._get_sdk_client(access_token)
        pages = await client.get_user_pages()
        
        accounts = []
        for page in pages:
            ig_account = page.get('instagram_business_account')
            if ig_account:
                accounts.append({
                    'id': ig_account['id'],
                    'username': ig_account.get('username'),
                    'name': ig_account.get('name'),
                    'profile_picture_url': ig_account.get('profile_picture_url'),
                    'page_id': page['id'],
                    'page_name': page.get('name')
                })
        
        if not accounts:
            return {'success': False, 'error': 'No Instagram Business accounts found'}
        return {'success': True, 'accounts': accounts}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _twitter_exchange_code_for_token(self, code: str, redirect_uri: str, code_verifier: str):
    """Exchange Twitter authorization code for access token (OAuth 2.0 PKCE)"""
    try:
        import base64
        client_id = settings.TWITTER_CLIENT_ID
        client_secret = settings.TWITTER_CLIENT_SECRET
        
        if not client_id:
            return {'success': False, 'error': 'Twitter credentials not configured'}
        
        auth_string = f"{client_id}:{client_secret}"
        auth_header = base64.b64encode(auth_string.encode()).decode()
        
        response = await self.http_client.post(
            'https://api.twitter.com/2/oauth2/token',
            headers={'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': f'Basic {auth_header}'},
            data={'grant_type': 'authorization_code', 'code': code, 'redirect_uri': redirect_uri, 'code_verifier': code_verifier}
        )
        response.raise_for_status()
        data = response.json()
        return {'success': True, 'access_token': data['access_token'], 'refresh_token': data.get('refresh_token'), 'expires_in': data.get('expires_in', 7200)}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _twitter_get_user(self, access_token: str):
    """Get authenticated Twitter user info"""
    try:
        response = await self.http_client.get(
            'https://api.twitter.com/2/users/me',
            headers={'Authorization': f'Bearer {access_token}'},
            params={'user.fields': 'id,name,username,profile_image_url'}
        )
        response.raise_for_status()
        return {'success': True, 'user': response.json().get('data', {})}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _linkedin_exchange_code_for_token(self, code: str, redirect_uri: str):
    """Exchange LinkedIn authorization code for access token"""
    try:
        client_id = settings.LINKEDIN_CLIENT_ID
        client_secret = settings.LINKEDIN_CLIENT_SECRET
        
        if not client_id or not client_secret:
            return {'success': False, 'error': 'LinkedIn credentials not configured'}
        
        response = await self.http_client.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            data={'grant_type': 'authorization_code', 'code': code, 'redirect_uri': redirect_uri, 'client_id': client_id, 'client_secret': client_secret}
        )
        response.raise_for_status()
        data = response.json()
        return {'success': True, 'access_token': data['access_token'], 'refresh_token': data.get('refresh_token'), 'expires_in': data.get('expires_in', 5184000)}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _linkedin_get_user(self, access_token: str):
    """Get authenticated LinkedIn user info"""
    try:
        response = await self.http_client.get(
            'https://api.linkedin.com/v2/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        response.raise_for_status()
        return {'success': True, 'user': response.json()}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _tiktok_exchange_code_for_token(self, code: str, redirect_uri: str, code_verifier: str):
    """Exchange TikTok authorization code for access token"""
    try:
        client_key = settings.TIKTOK_CLIENT_ID
        client_secret = settings.TIKTOK_CLIENT_SECRET
        
        if not client_key or not client_secret:
            return {'success': False, 'error': 'TikTok credentials not configured'}
        
        response = await self.http_client.post(
            'https://open.tiktokapis.com/v2/oauth/token/',
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            data={'client_key': client_key, 'client_secret': client_secret, 'grant_type': 'authorization_code', 'code': code, 'redirect_uri': redirect_uri, 'code_verifier': code_verifier}
        )
        response.raise_for_status()
        data = response.json()
        return {'success': True, 'access_token': data['access_token'], 'refresh_token': data.get('refresh_token'), 'expires_in': data.get('expires_in', 86400), 'open_id': data.get('open_id')}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _tiktok_get_user(self, access_token: str):
    """Get authenticated TikTok user info"""
    try:
        response = await self.http_client.post(
            'https://open.tiktokapis.com/v2/user/info/',
            headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
            json={'fields': ['open_id', 'display_name', 'avatar_url', 'username']}
        )
        response.raise_for_status()
        return {'success': True, 'user': response.json().get('data', {}).get('user', {})}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _youtube_exchange_code_for_token(self, code: str, redirect_uri: str, code_verifier: str):
    """Exchange YouTube/Google authorization code for access token"""
    try:
        client_id = settings.YOUTUBE_CLIENT_ID
        client_secret = settings.YOUTUBE_CLIENT_SECRET
        
        if not client_id or not client_secret:
            return {'success': False, 'error': 'YouTube credentials not configured'}
        
        response = await self.http_client.post(
            'https://oauth2.googleapis.com/token',
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            data={'grant_type': 'authorization_code', 'code': code, 'redirect_uri': redirect_uri, 'client_id': client_id, 'client_secret': client_secret, 'code_verifier': code_verifier}
        )
        response.raise_for_status()
        data = response.json()
        return {'success': True, 'access_token': data['access_token'], 'refresh_token': data.get('refresh_token'), 'expires_in': data.get('expires_in', 3600)}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _youtube_get_channel(self, access_token: str):
    """Get authenticated YouTube channel info"""
    try:
        response = await self.http_client.get(
            'https://www.googleapis.com/youtube/v3/channels',
            headers={'Authorization': f'Bearer {access_token}'},
            params={'part': 'snippet,contentDetails', 'mine': 'true'}
        )
        response.raise_for_status()
        data = response.json()
        items = data.get('items', [])
        if not items:
            return {'success': False, 'error': 'No YouTube channel found'}
        channel = items[0]
        snippet = channel.get('snippet', {})
        return {'success': True, 'channel': {'id': channel['id'], 'title': snippet.get('title'), 'thumbnail': snippet.get('thumbnails', {}).get('default', {}).get('url')}}
    except Exception as e:
        return {'success': False, 'error': str(e)}


# Bind methods to the singleton instance
import types
social_service.instagram_get_accounts = types.MethodType(_instagram_get_accounts, social_service)
social_service.twitter_exchange_code_for_token = types.MethodType(_twitter_exchange_code_for_token, social_service)
social_service.twitter_get_user = types.MethodType(_twitter_get_user, social_service)
social_service.linkedin_exchange_code_for_token = types.MethodType(_linkedin_exchange_code_for_token, social_service)
social_service.linkedin_get_user = types.MethodType(_linkedin_get_user, social_service)
social_service.tiktok_exchange_code_for_token = types.MethodType(_tiktok_exchange_code_for_token, social_service)
social_service.tiktok_get_user = types.MethodType(_tiktok_get_user, social_service)
social_service.youtube_exchange_code_for_token = types.MethodType(_youtube_exchange_code_for_token, social_service)
social_service.youtube_get_channel = types.MethodType(_youtube_get_channel, social_service)


# Helper functions for easy access
async def close_social_service():
    """Close social media service HTTP client"""
    await social_service.close()
