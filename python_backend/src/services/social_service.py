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
import base64
import time
import urllib.parse
from typing import Optional, Dict, Any, List
from datetime import datetime

from ..config import settings
from .meta_ads.meta_sdk_client import create_meta_sdk_client, MetaSDKError
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

    def _oauth1_escape(self, value: str) -> str:
        return urllib.parse.quote(str(value), safe="")

    def _generate_oauth1_signature(
        self,
        method: str,
        url: str,
        params: Dict[str, str],
        consumer_secret: str,
        token_secret: str = ""
    ) -> str:
        sorted_params = sorted(params.items())
        param_string = "&".join(
            f"{self._oauth1_escape(k)}={self._oauth1_escape(v)}" for k, v in sorted_params
        )
        base_string = "&".join([
            method.upper(),
            self._oauth1_escape(url),
            self._oauth1_escape(param_string)
        ])
        signing_key = f"{self._oauth1_escape(consumer_secret)}&{self._oauth1_escape(token_secret)}"
        signature = base64.b64encode(
            hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
        ).decode()
        return signature

    def _build_oauth1_header(
        self,
        method: str,
        url: str,
        oauth_token: str,
        oauth_token_secret: str,
        extra_params: Optional[Dict[str, str]] = None
    ) -> str:
        api_key = settings.TWITTER_API_KEY
        api_secret = settings.TWITTER_API_SECRET

        oauth_params: Dict[str, str] = {
            "oauth_consumer_key": api_key,
            "oauth_nonce": self._oauth1_escape(hashlib.sha1(str(time.time()).encode()).hexdigest()),
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_version": "1.0",
        }

        if oauth_token:
            oauth_params["oauth_token"] = oauth_token

        signature_params = {**oauth_params}
        if extra_params:
            signature_params.update(extra_params)

        signature = self._generate_oauth1_signature(
            method,
            url,
            signature_params,
            api_secret or "",
            oauth_token_secret
        )
        oauth_params["oauth_signature"] = signature

        header_parts = [
            f'{k}="{self._oauth1_escape(v)}"' for k, v in sorted(oauth_params.items())
        ]
        return f"OAuth {', '.join(header_parts)}"

    async def twitter_oauth1_request_token(self, callback_url: str) -> Dict[str, Any]:
        try:
            api_key = settings.TWITTER_API_KEY
            api_secret = settings.TWITTER_API_SECRET
            if not api_key or not api_secret:
                return {'success': False, 'error': 'Twitter OAuth1 credentials not configured'}

            url = "https://api.twitter.com/oauth/request_token"
            header = self._build_oauth1_header(
                "POST",
                url,
                oauth_token="",
                oauth_token_secret="",
                extra_params={"oauth_callback": callback_url}
            )

            response = await self.http_client.post(
                url,
                headers={"Authorization": header},
                data={"oauth_callback": callback_url}
            )

            if response.status_code != 200:
                return {'success': False, 'error': response.text}

            data = urllib.parse.parse_qs(response.text)
            oauth_token = data.get("oauth_token", [None])[0]
            oauth_token_secret = data.get("oauth_token_secret", [None])[0]

            if not oauth_token or not oauth_token_secret:
                return {'success': False, 'error': 'Missing OAuth1 request token response'}

            return {
                'success': True,
                'oauth_token': oauth_token,
                'oauth_token_secret': oauth_token_secret
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def twitter_oauth1_exchange_access_token(
        self,
        oauth_token: str,
        oauth_verifier: str,
        oauth_token_secret: str
    ) -> Dict[str, Any]:
        try:
            url = "https://api.twitter.com/oauth/access_token"
            header = self._build_oauth1_header(
                "POST",
                url,
                oauth_token=oauth_token,
                oauth_token_secret=oauth_token_secret,
                extra_params={"oauth_verifier": oauth_verifier}
            )

            response = await self.http_client.post(
                url,
                headers={"Authorization": header},
                data={"oauth_verifier": oauth_verifier}
            )

            if response.status_code != 200:
                return {'success': False, 'error': response.text}

            data = urllib.parse.parse_qs(response.text)
            access_token = data.get("oauth_token", [None])[0]
            access_token_secret = data.get("oauth_token_secret", [None])[0]
            user_id = data.get("user_id", [None])[0]
            screen_name = data.get("screen_name", [None])[0]

            if not access_token or not access_token_secret:
                return {'success': False, 'error': 'Missing OAuth1 access token response'}

            return {
                'success': True,
                'access_token': access_token,
                'access_token_secret': access_token_secret,
                'user_id': user_id,
                'screen_name': screen_name
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def twitter_oauth1_get_user(self, access_token: str, access_token_secret: str) -> Dict[str, Any]:
        try:
            url = "https://api.twitter.com/1.1/account/verify_credentials.json"
            params = {
                "include_email": "true",
                "skip_status": "true"
            }
            header = self._build_oauth1_header(
                "GET",
                url,
                oauth_token=access_token,
                oauth_token_secret=access_token_secret,
                extra_params=params
            )
            response = await self.http_client.get(
                url,
                headers={"Authorization": header},
                params=params
            )
            response.raise_for_status()
            return {'success': True, 'user': response.json()}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
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
        """Get Facebook Pages managed by the user"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(access_token)
            return await pages_svc.get_user_pages()
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_post_to_page(
        self,
        page_id: str,
        page_access_token: str,
        message: str,
        link: Optional[str] = None
    ) -> Dict[str, Any]:
        """Post to Facebook Page"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.post_to_page(page_id, message, link)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_post_photo(
        self,
        page_id: str,
        page_access_token: str,
        image_url: str,
        caption: str
    ) -> Dict[str, Any]:
        """Post photo to Facebook Page"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.post_photo_to_page(page_id, image_url, caption)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_video(
        self,
        page_id: str,
        page_access_token: str,
        video_url: str,
        description: str
    ) -> Dict[str, Any]:
        """Upload video to Facebook Page"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.post_video_to_page(page_id, video_url, description)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_reel(
        self,
        page_id: str,
        page_access_token: str,
        video_url: str,
        description: str
    ) -> Dict[str, Any]:
        """Upload Facebook Reel (short-form vertical video)"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.upload_reel(page_id, video_url, description)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_story(
        self,
        page_id: str,
        page_access_token: str,
        media_url: str,
        is_video: bool = False
    ) -> Dict[str, Any]:
        """Upload Facebook Story (24-hour temporary post)"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.upload_story(page_id, media_url, is_video)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_upload_photo_unpublished(
        self,
        page_id: str,
        page_access_token: str,
        image_url: str
    ) -> Dict[str, Any]:
        """Upload photo as unpublished (for carousel)"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.post_photo_to_page(page_id, image_url, published=False)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def facebook_create_carousel(
        self,
        page_id: str,
        page_access_token: str,
        photo_ids: List[str],
        message: str
    ) -> Dict[str, Any]:
        """Create carousel post with multiple photos"""
        try:
            from .platforms.pages_service import PagesService
            pages_svc = PagesService(page_access_token)
            return await pages_svc.create_carousel(page_id, photo_ids, message)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # INSTAGRAM API - Using InstagramService from platforms
    # ============================================================================
    
    async def instagram_get_accounts(self, access_token: str) -> Dict[str, Any]:
        """Get Instagram Business Accounts linked to the user's Facebook Pages."""
        try:
            pages_result = await self.facebook_get_pages(access_token)
            if not pages_result.get("success"):
                return {
                    "success": False,
                    "error": pages_result.get("error", "Failed to fetch Facebook pages")
                }

            pages = pages_result.get("pages", [])
            if not pages:
                return {"success": False, "error": "No Facebook pages found"}

            accounts = []
            for page in pages:
                page_id = page.get("id")
                page_token = page.get("access_token") or access_token
                if not page_id or not page_token:
                    continue

                ig_result = await self.instagram_get_business_account(page_id, page_token)
                if not ig_result.get("success"):
                    continue

                ig_account_id = ig_result.get("instagram_account_id")
                if ig_account_id:
                    accounts.append({
                        "id": ig_account_id,
                        "username": ig_result.get("username"),
                        "name": ig_result.get("name"),
                        "page_id": page_id,
                        "page_name": page.get("name")
                    })

            if not accounts:
                return {"success": False, "error": "No Instagram accounts found"}

            return {"success": True, "accounts": accounts}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def instagram_get_business_account(
        self,
        page_id: str,
        page_access_token: str
    ) -> Dict[str, Any]:
        """
        Get Instagram Business Account connected to Facebook Page using InstagramService
        """
        try:
            from .platforms.ig_service import InstagramService
            ig_service = InstagramService(page_access_token)
            result = await ig_service.get_instagram_account(page_id)
            
            if not result or not result.get("success"):
                return {'success': False, 'error': result.get('error', 'Failed to get Instagram account')}
            
            ig_account = result.get("instagram_account")
            if not ig_account:
                return {'success': False, 'error': result.get('message', 'No Instagram Business Account connected')}
            
            return {
                'success': True,
                'instagram_account_id': ig_account.get('id'),
                'username': ig_account.get('username'),
                'name': ig_account.get('name')
            }
            
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
        Create Instagram media container for image using InstagramService
        """
        try:
            from .platforms.ig_service import InstagramService
            ig_service = InstagramService(access_token)
            result = await ig_service.create_instagram_media_container(
                ig_user_id=ig_user_id,
                image_url=image_url,
                caption=caption
            )
            
            if result.get('success'):
                return {
                    'success': True,
                    'container_id': result.get('container_id') or result.get('id')
                }
            else:
                return {'success': False, 'error': result.get('error')}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_publish_media(
        self,
        ig_account_id: str,
        access_token: str,
        container_id: str
    ) -> Dict[str, Any]:
        """
        Publish Instagram media container using InstagramService
        """
        try:
            from .platforms.ig_service import InstagramService
            ig_service = InstagramService(access_token)
            result = await ig_service.publish_instagram_media(
                ig_user_id=ig_account_id,
                creation_id=container_id
            )
            
            if result.get('success'):
                return {
                    'success': True,
                    'post_id': result.get('media_id') or result.get('id')
                }
            else:
                return {'success': False, 'error': result.get('error')}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def instagram_create_reels_container(
        self,
        ig_user_id: str,
        access_token: str,
        video_url: str,
        caption: str,
        share_to_feed: bool = True
    ) -> Dict[str, Any]:
        """
        Create Instagram Reels container using InstagramService
        """
        try:
            from .platforms.ig_service import InstagramService
            ig_service = InstagramService(access_token)
            result = await ig_service.create_instagram_media_container(
                ig_user_id=ig_user_id,
                video_url=video_url,
                caption=caption,
                media_type='REELS',
                share_to_feed=share_to_feed
            )
            
            if result.get('success'):
                return {
                    'success': True,
                    'container_id': result.get('container_id') or result.get('id')
                }
            else:
                return {'success': False, 'error': result.get('error')}
            
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
        Create Instagram Story container using InstagramService
        """
        try:
            from .platforms.ig_service import InstagramService
            ig_service = InstagramService(access_token)
            
            if is_video:
                result = await ig_service.create_instagram_media_container(
                    ig_user_id=ig_user_id,
                    video_url=media_url,
                    media_type='STORIES'
                )
            else:
                result = await ig_service.create_instagram_media_container(
                    ig_user_id=ig_user_id,
                    image_url=media_url,
                    media_type='STORIES'
                )
            
            if result.get('success'):
                return {
                    'success': True,
                    'container_id': result.get('container_id') or result.get('id')
                }
            else:
                return {'success': False, 'error': result.get('error')}
            
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
        Create Instagram carousel container (2-10 mixed images/videos) using InstagramService
        """
        try:
            from .platforms.ig_service import InstagramService
            ig_service = InstagramService(access_token)
            
            # Step 1: Create individual item containers
            child_container_ids = []
            
            for media_url in media_urls:
                is_video = any(ext in media_url.lower() for ext in ['.mp4', '.mov', '.m4v', '/video/', '/videos/'])
                
                if is_video:
                    result = await ig_service.create_instagram_media_container(
                        ig_user_id=ig_user_id,
                        video_url=media_url,
                        media_type='VIDEO',
                        is_carousel_item=True
                    )
                else:
                    result = await ig_service.create_instagram_media_container(
                        ig_user_id=ig_user_id,
                        image_url=media_url,
                        is_carousel_item=True
                    )
                
                if not result.get('success'):
                    return {'success': False, 'error': f"Failed to create carousel item: {result.get('error')}"}
                
                container_id = result.get('container_id') or result.get('id')
                
                # Wait for video containers to finish processing
                if is_video:
                    await self._wait_for_container_ready(container_id, access_token, max_wait_seconds=180)
                
                child_container_ids.append(container_id)
            
            # Step 2: Create parent carousel container
            result = await ig_service.create_instagram_carousel_container(
                ig_user_id=ig_user_id,
                children=child_container_ids,
                caption=caption
            )
            
            if result.get('success'):
                return {
                    'success': True,
                    'container_id': result.get('container_id') or result.get('id')
                }
            else:
                return {'success': False, 'error': result.get('error')}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def _wait_for_container_ready(
        self,
        container_id: str,
        access_token: str,
        max_wait_seconds: int = 120
    ) -> bool:
        """Wait for container to reach FINISHED status using InstagramService"""
        from .platforms.ig_service import InstagramService
        ig_service = InstagramService(access_token)
        poll_interval = 3
        start_time = datetime.utcnow()
        
        while True:
            elapsed = (datetime.utcnow() - start_time).total_seconds()
            
            if elapsed > max_wait_seconds:
                return False
            
            try:
                status = await ig_service.get_instagram_container_status(container_id)
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
# Instagram is handled via InstagramService in platforms/ig_service.py
# ============================================================================


async def _twitter_exchange_code_for_token(self, code: str, redirect_uri: str, code_verifier: str):
    """Exchange X authorization code for access token (OAuth 2.0 PKCE)"""
    try:
        client_id = settings.TWITTER_CLIENT_ID
        client_secret = settings.TWITTER_CLIENT_SECRET
        
        if not client_id:
            return {'success': False, 'error': 'Twitter credentials not configured'}

        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'code_verifier': code_verifier
        }

        if client_secret:
            import base64
            auth_string = f"{client_id}:{client_secret}"
            auth_header = base64.b64encode(auth_string.encode()).decode()
            headers['Authorization'] = f'Basic {auth_header}'
        else:
            data['client_id'] = client_id

        response = await self.http_client.post(
            'https://api.x.com/2/oauth2/token',
            headers=headers,
            data=data
        )
        response.raise_for_status()
        data = response.json()
        return {'success': True, 'access_token': data['access_token'], 'refresh_token': data.get('refresh_token'), 'expires_in': data.get('expires_in', 7200)}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def _twitter_get_user(self, access_token: str):
    """Get authenticated X user info"""
    try:
        response = await self.http_client.get(
            'https://api.x.com/2/users/me',
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
        return {
            'success': True,
            'access_token': data['access_token'],
            'refresh_token': data.get('refresh_token'),
            'expires_in': data.get('expires_in', 5184000),
            'refresh_token_expires_in': data.get('refresh_token_expires_in'),
            'scope': data.get('scope')
        }
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
        client_key = settings.tiktok_client_key
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


# Bind methods to the singleton instance (non-Meta platforms only)
import types
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
