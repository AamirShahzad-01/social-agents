"""
Twitter/X Service
Production-ready X API v2 client
Handles posting tweets, media uploads, and authentication

Updated January 2026:
- Media upload uses X API v2 /2/media/upload (INIT/APPEND/FINALIZE/STATUS)
- Supports chunked uploads for large files (videos up to 512MB)
- OAuth 2.0 PKCE user tokens; OAuth 1.0a supported as fallback

X API v2 Media Upload Documentation:
- Upload: POST https://api.x.com/2/media/upload (command=INIT|APPEND|FINALIZE)
- Status: GET https://api.x.com/2/media/upload (command=STATUS)
"""
import tweepy
import httpx
import asyncio
import base64
import hashlib
import hmac
import time
import urllib.parse
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging

from ...config import settings

logger = logging.getLogger(__name__)

# Chunk size for video uploads (5MB recommended by X)
CHUNK_SIZE = 5 * 1024 * 1024  # 5MB

# Media type mappings
MEDIA_CATEGORIES = {
    "image": "tweet_image",
    "gif": "tweet_gif",
    "video": "tweet_video"
}

# File size limits (bytes)
FILE_SIZE_LIMITS = {
    "image": 5 * 1024 * 1024,     # 5MB
    "gif": 15 * 1024 * 1024,      # 15MB
    "video": 512 * 1024 * 1024    # 512MB
}


class TwitterService:
    """
    Twitter/X API v2 service for posting and media management.
    
    Uses X API v2 for all operations including media upload (Jan 2026).
    Supports both OAuth 1.0a and OAuth 2.0 PKCE authentication.
    """
    
    # API endpoints
    API_BASE = "https://api.x.com/2"
    # Media uploads use the upload.twitter.com v1.1 endpoint per X docs
    MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json"
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=120.0)
    
    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()
    
    # ============================================================================
    # OAUTH 1.0a SIGNATURE GENERATION
    # ============================================================================
    
    def _generate_oauth_signature(
        self,
        method: str,
        url: str,
        params: Dict[str, str],
        oauth_token: str,
        oauth_token_secret: str
    ) -> str:
        """
        Generate OAuth 1.0a signature for X API requests.
        
        Required for media upload which uses OAuth 1.0a.
        """
        api_key = settings.TWITTER_API_KEY
        api_secret = settings.TWITTER_API_SECRET
        
        # Create signature base string
        sorted_params = sorted(params.items())
        param_string = urllib.parse.urlencode(sorted_params, quote_via=urllib.parse.quote)
        
        base_string = "&".join([
            method.upper(),
            urllib.parse.quote(url, safe=""),
            urllib.parse.quote(param_string, safe="")
        ])
        
        # Create signing key
        signing_key = f"{urllib.parse.quote(api_secret, safe='')}&{urllib.parse.quote(oauth_token_secret, safe='')}"
        
        # Generate signature
        signature = base64.b64encode(
            hmac.new(
                signing_key.encode(),
                base_string.encode(),
                hashlib.sha1
            ).digest()
        ).decode()
        
        return signature
    
    def _generate_oauth_header(
        self,
        method: str,
        url: str,
        oauth_token: str,
        oauth_token_secret: str,
        additional_params: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Generate OAuth 1.0a Authorization header.
        """
        import uuid
        
        api_key = settings.TWITTER_API_KEY
        
        # OAuth parameters
        oauth_params = {
            "oauth_consumer_key": api_key,
            "oauth_nonce": str(uuid.uuid4()).replace("-", ""),
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_token": oauth_token,
            "oauth_version": "1.0"
        }
        
        # Combine with additional params for signature
        all_params = {**oauth_params}
        if additional_params:
            all_params.update(additional_params)
        
        # Generate signature
        signature = self._generate_oauth_signature(
            method, url, all_params, oauth_token, oauth_token_secret
        )
        oauth_params["oauth_signature"] = signature
        
        # Build header
        header_parts = [f'{k}="{urllib.parse.quote(v, safe="")}"' for k, v in sorted(oauth_params.items())]
        return f'OAuth {", ".join(header_parts)}'

    def _build_auth_headers(
        self,
        method: str,
        url: str,
        access_token: str,
        access_token_secret: str,
        params: Optional[Dict[str, str]] = None
    ) -> Dict[str, str]:
        """
        Build Authorization headers for OAuth 2.0 or OAuth 1.0a.
        """
        if access_token_secret:
            oauth_header = self._generate_oauth_header(
                method, url, access_token, access_token_secret, params
            )
            return {"Authorization": oauth_header}

        return {"Authorization": f"Bearer {access_token}"}
    
    # ============================================================================
    # CLIENT CREATION (supports OAuth 2.0 and OAuth 1.0a)
    # ============================================================================
    
    def create_client(
        self,
        access_token: str,
        access_token_secret: str = ""
    ) -> tweepy.Client:
        """
        Create X API client.
        
        Supports two authentication modes:
        - OAuth 2.0 Bearer: When access_token_secret is empty (modern flow)
        - OAuth 1.0a: When both tokens are provided (legacy flow)
        """
        api_key = settings.TWITTER_API_KEY
        api_secret = settings.TWITTER_API_SECRET
        
        if not api_key or not api_secret:
            raise ValueError("X API credentials not configured")
        
        # If no access_token_secret, use OAuth 2.0 bearer token
        if not access_token_secret:
            client = tweepy.Client(
                bearer_token=None,  # Not using app-only auth
                consumer_key=api_key,
                consumer_secret=api_secret,
                access_token=access_token,
                access_token_secret=None  # OAuth 2.0 mode
            )
        else:
            # Full OAuth 1.0a with user access token secret
            client = tweepy.Client(
                consumer_key=api_key,
                consumer_secret=api_secret,
                access_token=access_token,
                access_token_secret=access_token_secret
            )
        
        return client
    
    # ============================================================================
    # POSTING (API v2)
    # ============================================================================
    
    async def post_tweet(
        self,
        access_token: str,
        access_token_secret: str,
        text: str,
        media_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Post a tweet using X API v2.
        
        Args:
            access_token: User access token
            access_token_secret: User access token secret
            text: Tweet text (max 280 characters)
            media_ids: Optional list of media IDs from upload
            
        Returns:
            Dict with tweet_id and text
        """
        try:
            # Create client
            client = self.create_client(access_token, access_token_secret)
            
            # Build tweet payload
            tweet_params = {}
            
            if media_ids and len(media_ids) > 0:
                tweet_params['media_ids'] = media_ids
            
            # Post tweet
            response = await asyncio.to_thread(
                client.create_tweet,
                text=text,
                **tweet_params
            )
            
            logger.info(f"Posted tweet: {response.data['id']}")
            
            return {
                'success': True,
                'tweet_id': response.data['id'],
                'text': response.data['text']
            }
            
        except Exception as e:
            logger.error(f"Tweet posting error: {e}")
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # MEDIA UPLOAD (API v2 - December 2025)
    # ============================================================================
    
    async def upload_media(
        self,
        access_token: str,
        access_token_secret: str,
        media_data: bytes,
        media_type: str = "image"
    ) -> Dict[str, Any]:
        """
        Upload media to X using the v2 media upload API.
        
        This is a unified method that handles:
        - Images (simple upload for files < 5MB)
        - Videos (chunked upload for files up to 512MB)
        - GIFs (chunked upload for files up to 15MB)
        
        Args:
            access_token: User OAuth access token
            access_token_secret: User OAuth access token secret
            media_data: Binary media data
            media_type: "image", "video", or "gif"
            
        Returns:
            Dict with success, media_id, or error
        """
        try:
            file_size = len(media_data)
            media_category = MEDIA_CATEGORIES.get(media_type, "tweet_image")
            
            # Validate file size
            max_size = FILE_SIZE_LIMITS.get(media_type, FILE_SIZE_LIMITS["image"])
            if file_size > max_size:
                return {
                    'success': False,
                    'error': f"File size ({file_size / (1024*1024):.1f}MB) exceeds {media_type} limit ({max_size / (1024*1024):.0f}MB)"
                }
            
            # Determine content type
            if media_type == "video":
                content_type = "video/mp4"
            elif media_type == "gif":
                content_type = "image/gif"
            else:
                content_type = "image/jpeg"  # Default for images
            
            # Use chunked upload for videos/gifs or large images
            if media_type in ["video", "gif"] or file_size > 1 * 1024 * 1024:
                return await self._chunked_upload(
                    access_token,
                    access_token_secret,
                    media_data,
                    content_type,
                    media_category
                )

            # Simple upload for small images
            return await self._simple_upload(
                access_token,
                access_token_secret,
                media_data,
                content_type,
                media_category
            )
                
        except Exception as e:
            logger.error(f"Media upload error: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    async def _simple_upload(
        self,
        access_token: str,
        access_token_secret: str,
        media_data: bytes,
        content_type: str,
        media_category: str
    ) -> Dict[str, Any]:
        """
        Simple media upload for small images (< 1MB).
        Uses v2 INIT/APPEND/FINALIZE with a single segment.
        """
        try:
            url = self.MEDIA_UPLOAD_URL
            file_size = len(media_data)

            init_params = {
                "command": "INIT",
                "total_bytes": str(file_size),
                "media_type": content_type,
                "media_category": media_category
            }

            init_headers = {
                **self._build_auth_headers("POST", url, access_token, access_token_secret, init_params),
                "Content-Type": "application/x-www-form-urlencoded"
            }

            init_response = await self.http_client.post(
                url,
                headers=init_headers,
                data=init_params
            )

            if init_response.status_code not in [200, 201, 202]:
                error = init_response.json() if init_response.content else {}
                return {
                    'success': False,
                    'error': f"INIT failed: {error.get('errors', [{}])[0].get('message', init_response.text)}"
                }

            media_id = init_response.json()["media_id"]

            append_params = {
                "command": "APPEND",
                "media_id": str(media_id),
                "segment_index": "0"
            }
            append_headers = self._build_auth_headers(
                "POST", url, access_token, access_token_secret, append_params
            )

            append_response = await self.http_client.post(
                url,
                headers=append_headers,
                data=append_params,
                files={
                    "media": ("media", media_data, content_type)
                }
            )

            if append_response.status_code not in [200, 201, 202, 204]:
                error = append_response.json() if append_response.content else {}
                return {
                    'success': False,
                    'error': f"APPEND failed: {error}"
                }

            finalize_params = {
                "command": "FINALIZE",
                "media_id": str(media_id)
            }
            finalize_headers = {
                **self._build_auth_headers("POST", url, access_token, access_token_secret, finalize_params),
                "Content-Type": "application/x-www-form-urlencoded"
            }

            finalize_response = await self.http_client.post(
                url,
                headers=finalize_headers,
                data=finalize_params
            )

            if finalize_response.status_code not in [200, 201, 202]:
                error = finalize_response.json() if finalize_response.content else {}
                return {
                    'success': False,
                    'error': f"FINALIZE failed: {error}"
                }

            finalize_data = finalize_response.json()
            if 'processing_info' in finalize_data:
                return await self._wait_for_processing(
                    access_token,
                    access_token_secret,
                    str(media_id),
                    finalize_data['processing_info']
                )

            return {
                'success': True,
                'media_id': str(media_id)
            }
                
        except Exception as e:
            logger.error(f"Simple upload error: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _chunked_upload(
        self,
        access_token: str,
        access_token_secret: str,
        media_data: bytes,
        content_type: str,
        media_category: str
    ) -> Dict[str, Any]:
        """
        Chunked media upload for videos, GIFs, and large images.
        
        Uses the INIT → APPEND → FINALIZE flow.
        For videos, also handles async processing status checks.
        """
        url = self.MEDIA_UPLOAD_URL
        file_size = len(media_data)
        
        # ================================================================
        # STEP 1: INIT
        # ================================================================
        try:
            init_params = {
                "command": "INIT",
                "total_bytes": str(file_size),
                "media_type": content_type,
                "media_category": media_category
            }
            
            init_headers = {
                **self._build_auth_headers("POST", url, access_token, access_token_secret, init_params),
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            init_response = await self.http_client.post(
                url,
                headers=init_headers,
                data=init_params
            )
            
            if init_response.status_code != 202 and init_response.status_code != 200:
                error = init_response.json() if init_response.content else {}
                return {
                    'success': False,
                    'error': f"INIT failed: {error.get('errors', [{}])[0].get('message', init_response.text)}"
                }
            
            init_data = init_response.json()
            media_id = str(init_data['media_id'])
            
            logger.info(f"Initialized upload: media_id={media_id}")
            
        except Exception as e:
            return {'success': False, 'error': f"INIT error: {str(e)}"}
        
        # ================================================================
        # STEP 2: APPEND (chunked)
        # ================================================================
        try:
            segment_index = 0
            offset = 0
            
            while offset < file_size:
                chunk = media_data[offset:offset + CHUNK_SIZE]
                
                append_params = {
                    "command": "APPEND",
                    "media_id": media_id,
                    "segment_index": str(segment_index)
                }
                
                append_headers = self._build_auth_headers(
                    "POST", url, access_token, access_token_secret, append_params
                )

                # Send chunk as multipart
                append_response = await self.http_client.post(
                    url,
                    headers=append_headers,
                    data=append_params,
                    files={
                        "media": ("chunk", chunk, content_type)
                    }
                )
                
                if append_response.status_code not in [200, 204]:
                    error = append_response.json() if append_response.content else {}
                    return {
                        'success': False,
                        'error': f"APPEND failed at segment {segment_index}: {error}"
                    }
                
                offset += CHUNK_SIZE
                segment_index += 1
                
                logger.debug(f"Uploaded segment {segment_index}, {offset}/{file_size} bytes")
            
            logger.info(f"Uploaded {segment_index} segments")
            
        except Exception as e:
            return {'success': False, 'error': f"APPEND error: {str(e)}"}
        
        # ================================================================
        # STEP 3: FINALIZE
        # ================================================================
        try:
            finalize_params = {
                "command": "FINALIZE",
                "media_id": media_id
            }
            
            finalize_headers = {
                **self._build_auth_headers("POST", url, access_token, access_token_secret, finalize_params),
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            finalize_response = await self.http_client.post(
                url,
                headers=finalize_headers,
                data=finalize_params
            )
            
            if finalize_response.status_code not in [200, 201]:
                error = finalize_response.json() if finalize_response.content else {}
                return {
                    'success': False,
                    'error': f"FINALIZE failed: {error}"
                }
            
            finalize_data = finalize_response.json()
            
            # Check if async processing is needed (for videos)
            if 'processing_info' in finalize_data:
                return await self._wait_for_processing(
                    access_token,
                    access_token_secret,
                    media_id,
                    finalize_data['processing_info']
                )
            
            logger.info(f"Upload finalized: media_id={media_id}")
            
            return {
                'success': True,
                'media_id': media_id
            }
            
        except Exception as e:
            return {'success': False, 'error': f"FINALIZE error: {str(e)}"}
    
    async def _wait_for_processing(
        self,
        access_token: str,
        access_token_secret: str,
        media_id: str,
        processing_info: Dict
    ) -> Dict[str, Any]:
        """
        Wait for async video processing to complete.
        
        X processes videos asynchronously after upload.
        We poll the STATUS endpoint until processing completes.
        """
        url = self.MEDIA_UPLOAD_URL
        max_wait_seconds = 300  # 5 minutes max
        waited = 0
        
        while waited < max_wait_seconds:
            check_after_secs = processing_info.get('check_after_secs', 5)
            await asyncio.sleep(check_after_secs)
            waited += check_after_secs
            
            # Check status
            status_params = {
                "command": "STATUS",
                "media_id": media_id
            }
            
            status_headers = self._build_auth_headers(
                "GET", url, access_token, access_token_secret, status_params
            )
            
            status_response = await self.http_client.get(
                url,
                headers=status_headers,
                params=status_params
            )
            
            if status_response.status_code != 200:
                continue
            
            status_data = status_response.json()
            processing_info = status_data.get('processing_info', {})
            state = processing_info.get('state', 'succeeded')
            
            logger.debug(f"Processing state: {state}, progress: {processing_info.get('progress_percent', 0)}%")
            
            if state == 'succeeded':
                logger.info(f"Video processing complete: media_id={media_id}")
                return {
                    'success': True,
                    'media_id': media_id
                }
            elif state == 'failed':
                error_info = processing_info.get('error', {})
                return {
                    'success': False,
                    'error': f"Video processing failed: {error_info.get('message', 'Unknown error')}"
                }
        
        return {
            'success': False,
            'error': 'Video processing timeout'
        }
    
    async def upload_media_from_url(
        self,
        access_token: str,
        access_token_secret: str,
        media_url: str
    ) -> Dict[str, Any]:
        """
        Download media from URL and upload to X.
        
        Args:
            access_token: User access token
            access_token_secret: User access token secret
            media_url: URL of media to upload
            
        Returns:
            Dict with media_id
        """
        try:
            # Download media
            response = await self.http_client.get(media_url)
            response.raise_for_status()
            media_data = response.content
            
            # Detect media type from content-type or URL
            content_type = response.headers.get('content-type', '').lower()
            
            if 'video' in content_type or any(ext in media_url.lower() for ext in ['.mp4', '.mov', '.avi', '.webm']):
                media_type = "video"
            elif 'gif' in content_type or '.gif' in media_url.lower():
                media_type = "gif"
            else:
                media_type = "image"
            
            logger.info(f"Downloaded {media_type} from URL: {len(media_data)} bytes")
            
            # Upload media
            return await self.upload_media(
                access_token,
                access_token_secret,
                media_data,
                media_type
            )
            
        except Exception as e:
            logger.error(f"Upload from URL error: {e}")
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # USER INFO (API v2)
    # ============================================================================
    
    async def get_user_info(
        self,
        access_token: str,
        access_token_secret: str
    ) -> Dict[str, Any]:
        """
        Get authenticated user's information.
        
        Args:
            access_token: User access token
            access_token_secret: User access token secret
            
        Returns:
            Dict with user info
        """
        try:
            # Create client
            client = self.create_client(access_token, access_token_secret)
            
            # Get user info
            response = await asyncio.to_thread(
                client.get_me,
                user_fields=['id', 'name', 'username', 'profile_image_url']
            )
            
            user = response.data
            
            return {
                'success': True,
                'id': user.id,
                'name': user.name,
                'username': user.username,
                'profile_image_url': user.profile_image_url if hasattr(user, 'profile_image_url') else None
            }
            
        except Exception as e:
            logger.error(f"Get user info error: {e}")
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # ACCOUNT VERIFICATION
    # ============================================================================
    
    async def verify_credentials(
        self,
        access_token: str,
        access_token_secret: str
    ) -> Dict[str, Any]:
        """
        Verify that credentials are valid by making a test API call.
        
        Returns:
            Dict with success status and user info
        """
        return await self.get_user_info(access_token, access_token_secret)


# Singleton instance
twitter_service = TwitterService()


# Helper function
async def close_twitter_service():
    """Close Twitter service HTTP client"""
    await twitter_service.close()
