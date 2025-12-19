"""
YouTube Service
Production-ready YouTube API v3 client using OAuth 2.0
Handles video uploads and channel management
Uses google-api-python-client library (latest 2025 version)
"""
import httpx
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime
import io

from ...config import settings


class YouTubeService:
    """YouTube API service for video uploads and management"""
    
    # API Constants
    YOUTUBE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token"
    YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
    YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3"
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=300.0)  # 5 min timeout for uploads
    
    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()
    
    # ============================================================================
    # TOKEN MANAGEMENT
    # ============================================================================
    
    async def refresh_access_token(
        self,
        refresh_token: str,
        client_id: str,
        client_secret: str
    ) -> Dict[str, Any]:
        """
        Refresh YouTube access token
        YouTube tokens expire in 1 hour
        
        Args:
            refresh_token: Refresh token
            client_id: YouTube client ID
            client_secret: YouTube client secret
            
        Returns:
            Dict with access_token, expires_in
        """
        try:
            response = await self.http_client.post(
                self.YOUTUBE_TOKEN_URL,
                data={
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'refresh_token': refresh_token,
                    'grant_type': 'refresh_token'
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            response.raise_for_status()
            data = response.json()
            
            return {
                'success': True,
                'access_token': data['access_token'],
                'expires_in': data['expires_in'],
                'refresh_token': data.get('refresh_token', refresh_token)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # CHANNEL INFO
    # ============================================================================
    
    async def get_channel_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get user's primary YouTube channel information
        
        Args:
            access_token: Access token
            
        Returns:
            Dict with channel info
        """
        try:
            response = await self.http_client.get(
                f"{self.YOUTUBE_API_BASE}/channels",
                params={
                    'part': 'id,snippet',
                    'mine': 'true'
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json'
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            if not data.get('items'):
                return {'success': False, 'error': 'No channel found'}
            
            channel = data['items'][0]
            
            return {
                'success': True,
                'channel_id': channel['id'],
                'title': channel['snippet']['title'],
                'thumbnails': channel['snippet'].get('thumbnails', {})
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # VIDEO UPLOAD
    # ============================================================================
    
    async def upload_video(
        self,
        access_token: str,
        title: str,
        description: str,
        video_buffer: bytes,
        tags: Optional[List[str]] = None,
        privacy_status: str = "private",
        category_id: str = "22"
    ) -> Dict[str, Any]:
        """
        Upload video to YouTube using resumable upload protocol
        
        Args:
            access_token: Access token
            title: Video title (max 100 chars)
            description: Video description (max 5000 chars)
            video_buffer: Video binary data
            tags: Optional list of tags
            privacy_status: public, private, or unlisted
            category_id: YouTube category ID (default: 22 = People & Blogs)
            
        Returns:
            Dict with video_id
        """
        try:
            # Step 1: Initialize resumable upload
            metadata = {
                'snippet': {
                    'title': title,
                    'description': description,
                    'tags': tags or [],
                    'categoryId': category_id
                },
                'status': {
                    'privacyStatus': privacy_status
                }
            }
            
            init_response = await self.http_client.post(
                f"{self.YOUTUBE_UPLOAD_BASE}/videos",
                params={
                    'uploadType': 'resumable',
                    'part': 'snippet,status'
                },
                json=metadata,
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'X-Upload-Content-Type': 'video/mp4',
                    'X-Upload-Content-Length': str(len(video_buffer))
                }
            )
            
            init_response.raise_for_status()
            
            # Get upload URL from Location header
            upload_url = init_response.headers.get('location')
            if not upload_url:
                return {'success': False, 'error': 'No upload URL provided by YouTube'}
            
            # Step 2: Upload video content
            upload_response = await self.http_client.put(
                upload_url,
                content=video_buffer,
                headers={'Content-Type': 'video/mp4'}
            )
            
            upload_response.raise_for_status()
            result = upload_response.json()
            
            video_id = result.get('id')
            if not video_id:
                return {'success': False, 'error': 'No video ID returned'}
            
            return {
                'success': True,
                'video_id': video_id,
                'title': result.get('snippet', {}).get('title'),
                'description': result.get('snippet', {}).get('description')
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def upload_video_from_url(
        self,
        access_token: str,
        title: str,
        description: str,
        video_url: str,
        tags: Optional[List[str]] = None,
        privacy_status: str = "private",
        category_id: str = "22"
    ) -> Dict[str, Any]:
        """
        Download video from URL and upload to YouTube
        
        Args:
            access_token: Access token
            title: Video title
            description: Video description
            video_url: URL of video to upload
            tags: Optional tags
            privacy_status: Privacy status
            category_id: Category ID
            
        Returns:
            Dict with video_id
        """
        try:
            # Download video
            response = await self.http_client.get(video_url)
            response.raise_for_status()
            video_buffer = response.content
            
            # Upload to YouTube
            return await self.upload_video(
                access_token,
                title,
                description,
                video_buffer,
                tags,
                privacy_status,
                category_id
            )
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # VIDEO MANAGEMENT
    # ============================================================================
    
    async def update_video_metadata(
        self,
        access_token: str,
        video_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        privacy_status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update video metadata
        
        Args:
            access_token: Access token
            video_id: Video ID
            title: New title
            description: New description
            tags: New tags
            privacy_status: New privacy status
            
        Returns:
            Dict with success status
        """
        try:
            body = {
                'id': video_id,
                'snippet': {
                    'title': title,
                    'description': description,
                    'tags': tags or [],
                    'categoryId': '22'
                },
                'status': {
                    'privacyStatus': privacy_status or 'private'
                }
            }
            
            response = await self.http_client.put(
                f"{self.YOUTUBE_API_BASE}/videos",
                params={'part': 'snippet,status'},
                json=body,
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json'
                }
            )
            
            response.raise_for_status()
            
            return {'success': True}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def get_video_details(
        self,
        access_token: str,
        video_id: str
    ) -> Dict[str, Any]:
        """
        Get video details
        
        Args:
            access_token: Access token
            video_id: Video ID
            
        Returns:
            Dict with video details
        """
        try:
            response = await self.http_client.get(
                f"{self.YOUTUBE_API_BASE}/videos",
                params={
                    'part': 'snippet,status',
                    'id': video_id
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json'
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            if not data.get('items'):
                return {'success': False, 'error': 'Video not found'}
            
            video = data['items'][0]
            
            return {
                'success': True,
                'video_id': video['id'],
                'title': video['snippet']['title'],
                'description': video['snippet']['description'],
                'privacy_status': video['status']['privacyStatus']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}


# Singleton instance
youtube_service = YouTubeService()


# Helper function
async def close_youtube_service():
    """Close YouTube service HTTP client"""
    await youtube_service.close()
