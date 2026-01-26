"""
LinkedIn Service
Production-ready LinkedIn API client using REST API v2
Handles OAuth, posting, image/video uploads, and carousel posts
Uses LinkedIn API Version 202411 (latest as of 2025)
"""
import httpx
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime

from ...config import settings


class LinkedInService:
    """LinkedIn API service for posting and media management"""
    
    # API Constants
    LINKEDIN_API_BASE = "https://api.linkedin.com/v2"
    LINKEDIN_REST_API = "https://api.linkedin.com/rest"
    LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
    LINKEDIN_API_VERSION = "202601"  # YYYYMM format
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=60.0)
    
    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()
    
    # ============================================================================
    # TOKEN MANAGEMENT
    # ============================================================================
    
    async def refresh_token(
        self,
        refresh_token: str,
        client_id: str,
        client_secret: str
    ) -> Dict[str, Any]:
        """
        Refresh LinkedIn access token
        
        Args:
            refresh_token: Refresh token
            client_id: LinkedIn client ID
            client_secret: LinkedIn client secret
            
        Returns:
            Dict with access_token, expires_in, refresh_token
        """
        try:
            response = await self.http_client.post(
                self.LINKEDIN_TOKEN_URL,
                data={
                    'grant_type': 'refresh_token',
                    'refresh_token': refresh_token,
                    'client_id': client_id,
                    'client_secret': client_secret
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
    # PROFILE & ORGANIZATIONS
    # ============================================================================
    
    async def get_user_profile(self, access_token: str) -> Dict[str, Any]:
        """
        Get LinkedIn user profile via OpenID Connect userinfo endpoint
        
        Args:
            access_token: Access token
            
        Returns:
            Dict with sub, name, email, picture
        """
        try:
            response = await self.http_client.get(
                f"{self.LINKEDIN_API_BASE}/userinfo",
                headers={'Authorization': f'Bearer {access_token}'}
            )
            
            response.raise_for_status()
            data = response.json()
            
            return {
                'success': True,
                'sub': data['sub'],
                'name': data.get('name'),
                'email': data.get('email'),
                'picture': data.get('picture')
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def get_user_urn(self, access_token: str) -> Dict[str, Any]:
        """
        Get LinkedIn user's URN (Uniform Resource Name)
        
        Args:
            access_token: Access token
            
        Returns:
            Dict with urn
        """
        try:
            response = await self.http_client.get(
                f"{self.LINKEDIN_API_BASE}/me",
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            return {
                'success': True,
                'urn': data['id']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def get_organizations(self, access_token: str) -> Dict[str, Any]:
        """
        Get LinkedIn organization pages that the user administers
        
        Args:
            access_token: Access token
            
        Returns:
            Dict with organizations list
        """
        try:
            response = await self.http_client.get(
                f"{self.LINKEDIN_REST_API}/organizationAcls",
                params={
                    'q': 'roleAssignee',
                    'role': 'ADMINISTRATOR',
                    'projection': '(elements*(organization~(localizedName,vanityName)))'
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            if not response.is_success:
                return {'success': True, 'organizations': []}
            
            data = response.json()
            organizations = []
            
            if data.get('elements'):
                for element in data['elements']:
                    org_urn = element.get('organization')
                    if org_urn:
                        org_id = org_urn.replace('urn:li:organization:', '')
                        org_details = element.get('organization~', {})
                        
                        organizations.append({
                            'id': org_id,
                            'name': org_details.get('localizedName', f'Organization {org_id}'),
                            'vanityName': org_details.get('vanityName')
                        })
            
            return {
                'success': True,
                'organizations': organizations
            }
            
        except Exception as e:
            return {'success': True, 'organizations': []}
    
    # ============================================================================
    # POSTING
    # ============================================================================
    
    def _format_author_urn(self, author_urn: str, is_organization: bool = False) -> str:
        """Format author URN correctly"""
        if is_organization:
            return (author_urn if author_urn.startswith('urn:li:organization:')
                   else f'urn:li:organization:{author_urn}')
        else:
            return (author_urn if author_urn.startswith('urn:li:person:')
                   else f'urn:li:person:{author_urn}')
    
    async def post_to_linkedin(
        self,
        access_token: str,
        author_urn: str,
        text: str,
        visibility: str = 'PUBLIC',
        media_urn: Optional[str] = None,
        is_organization: bool = False
    ) -> Dict[str, Any]:
        """
        Post to LinkedIn using the new Posts API
        
        Args:
            access_token: Access token
            author_urn: Author URN (person or organization ID)
            text: Post text content
            visibility: Post visibility (PUBLIC or CONNECTIONS)
            media_urn: Optional media URN (image or video)
            is_organization: If true, treat author_urn as organization ID
            
        Returns:
            Dict with post_id
        """
        try:
            formatted_author_urn = self._format_author_urn(author_urn, is_organization)
            
            # Build post body
            post_body = {
                'author': formatted_author_urn,
                'commentary': text,
                'visibility': visibility,
                'distribution': {
                    'feedDistribution': 'MAIN_FEED',
                    'targetEntities': [],
                    'thirdPartyDistributionChannels': []
                },
                'lifecycleState': 'PUBLISHED',
                'isReshareDisabledByAuthor': False
            }
            
            # Add media if provided
            if media_urn:
                is_video = media_urn.startswith('urn:li:video:')
                post_body['content'] = {
                    'media': {
                        'id': media_urn
                    }
                }
                # LinkedIn requires title for videos
                if is_video:
                    post_body['content']['media']['title'] = text[:100] or 'Video Post'
            
            response = await self.http_client.post(
                f"{self.LINKEDIN_REST_API}/posts",
                json=post_body,
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            response.raise_for_status()
            
            # Post ID is in x-restli-id header
            post_id = response.headers.get('x-restli-id', '')
            
            return {
                'success': True,
                'post_id': post_id
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # IMAGE UPLOAD
    # ============================================================================
    
    async def initialize_image_upload(
        self,
        access_token: str,
        author_urn: str,
        is_organization: bool = False
    ) -> Dict[str, Any]:
        """
        Initialize image upload to LinkedIn
        
        Args:
            access_token: Access token
            author_urn: Author URN
            is_organization: If true, treat as organization
            
        Returns:
            Dict with upload_url and asset (urn:li:image:{id})
        """
        try:
            owner_urn = self._format_author_urn(author_urn, is_organization)
            
            response = await self.http_client.post(
                f"{self.LINKEDIN_REST_API}/images?action=initializeUpload",
                json={
                    'initializeUploadRequest': {
                        'owner': owner_urn
                    }
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            return {
                'success': True,
                'upload_url': data['value']['uploadUrl'],
                'asset': data['value']['image']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def upload_image_binary(
        self,
        upload_url: str,
        image_data: bytes,
        access_token: str
    ) -> Dict[str, Any]:
        """
        Upload image binary to LinkedIn
        
        Args:
            upload_url: Upload URL from initialize_image_upload
            image_data: Image binary data
            access_token: Access token
            
        Returns:
            Dict with success status
        """
        try:
            response = await self.http_client.put(
                upload_url,
                content=image_data,
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/octet-stream'
                }
            )
            
            response.raise_for_status()
            
            return {'success': True}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def upload_image(
        self,
        access_token: str,
        author_urn: str,
        image_data: bytes,
        is_organization: bool = False
    ) -> Dict[str, Any]:
        """
        Upload image to LinkedIn (complete flow)
        
        Args:
            access_token: Access token
            author_urn: Author URN
            image_data: Image binary data
            is_organization: If true, treat as organization
            
        Returns:
            Dict with asset URN
        """
        # Initialize upload
        init_result = await self.initialize_image_upload(access_token, author_urn, is_organization)
        if not init_result.get('success'):
            return init_result
        
        # Upload binary
        upload_result = await self.upload_image_binary(
            init_result['upload_url'],
            image_data,
            access_token
        )
        if not upload_result.get('success'):
            return upload_result
        
        return {
            'success': True,
            'asset': init_result['asset']
        }
    
    # ============================================================================
    # VIDEO UPLOAD
    # ============================================================================
    
    async def initialize_video_upload(
        self,
        access_token: str,
        author_urn: str,
        file_size_bytes: int,
        is_organization: bool = False
    ) -> Dict[str, Any]:
        """
        Initialize video upload to LinkedIn
        
        Args:
            access_token: Access token
            author_urn: Author URN
            file_size_bytes: Video file size in bytes
            is_organization: If true, treat as organization
            
        Returns:
            Dict with upload_url and asset (urn:li:video:{id})
        """
        try:
            owner_urn = self._format_author_urn(author_urn, is_organization)
            
            response = await self.http_client.post(
                f"{self.LINKEDIN_REST_API}/videos?action=initializeUpload",
                json={
                    'initializeUploadRequest': {
                        'owner': owner_urn,
                        'fileSizeBytes': file_size_bytes,
                        'uploadCaptions': False,
                        'uploadThumbnail': False
                    }
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            upload_instructions = data['value'].get('uploadInstructions', [])
            upload_token = data['value'].get('uploadToken', '')

            if not upload_instructions:
                upload_url = data['value'].get('uploadUrl')
                if upload_url:
                    upload_instructions = [
                        {
                            'uploadUrl': upload_url,
                            'firstByte': 0,
                            'lastByte': max(file_size_bytes - 1, 0)
                        }
                    ]
            
            return {
                'success': True,
                'upload_instructions': upload_instructions,
                'upload_token': upload_token,
                'asset': data['value']['video']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def upload_video_binary(
        self,
        upload_instructions: List[Dict[str, Any]],
        video_data: bytes,
        access_token: str
    ) -> Dict[str, Any]:
        """
        Upload video binary to LinkedIn
        
        Args:
            upload_url: Upload URL from initialize_video_upload
            video_data: Video binary data
            access_token: Access token
            
        Returns:
            Dict with success and etag
        """
        try:
            uploaded_part_ids = []
            for instruction in upload_instructions:
                upload_url = instruction.get('uploadUrl')
                if not upload_url:
                    return {'success': False, 'error': 'Missing uploadUrl in upload instructions'}

                first_byte = instruction.get('firstByte', 0)
                last_byte = instruction.get('lastByte', len(video_data) - 1)
                chunk = video_data[first_byte:last_byte + 1]

                response = await self.http_client.put(
                    upload_url,
                    content=chunk,
                    headers={
                        'Authorization': f'Bearer {access_token}',
                        'Content-Type': 'application/octet-stream'
                    }
                )

                response.raise_for_status()
                etag = response.headers.get('etag', '')
                if etag:
                    uploaded_part_ids.append(etag)

            return {
                'success': True,
                'uploaded_part_ids': uploaded_part_ids
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def finalize_video_upload(
        self,
        access_token: str,
        video_urn: str,
        uploaded_part_ids: List[str],
        upload_token: str = ""
    ) -> Dict[str, Any]:
        """
        Finalize video upload after binary upload
        
        Args:
            access_token: Access token
            video_urn: Video URN from initialize
            uploaded_part_ids: List of ETags from upload
            
        Returns:
            Dict with success status
        """
        try:
            response = await self.http_client.post(
                f"{self.LINKEDIN_REST_API}/videos?action=finalizeUpload",
                json={
                    'finalizeUploadRequest': {
                        'video': video_urn,
                        'uploadToken': upload_token,
                        'uploadedPartIds': uploaded_part_ids
                    }
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            response.raise_for_status()
            
            return {'success': True}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ============================================================================
    # CAROUSEL
    # ============================================================================
    
    async def post_carousel(
        self,
        access_token: str,
        author_urn: str,
        text: str,
        image_urns: List[str],
        visibility: str = 'PUBLIC',
        is_organization: bool = False
    ) -> Dict[str, Any]:
        """
        Post carousel (MultiImage) to LinkedIn
        
        Args:
            access_token: Access token
            author_urn: Author URN
            text: Post text
            image_urns: List of urn:li:image:{id} (2-20 images)
            visibility: Post visibility
            is_organization: If true, treat as organization
            
        Returns:
            Dict with post_id
        """
        try:
            if len(image_urns) < 2:
                return {'success': False, 'error': 'LinkedIn carousel requires at least 2 images'}
            if len(image_urns) > 20:
                return {'success': False, 'error': 'LinkedIn carousel supports maximum 20 images'}
            
            formatted_author_urn = self._format_author_urn(author_urn, is_organization)
            
            # Build multiImage content
            images = [{'id': urn, 'altText': f'Slide {i + 1}'} for i, urn in enumerate(image_urns)]
            
            post_body = {
                'author': formatted_author_urn,
                'commentary': text,
                'visibility': visibility,
                'distribution': {
                    'feedDistribution': 'MAIN_FEED',
                    'targetEntities': [],
                    'thirdPartyDistributionChannels': []
                },
                'lifecycleState': 'PUBLISHED',
                'isReshareDisabledByAuthor': False,
                'content': {
                    'multiImage': {
                        'images': images
                    }
                }
            }
            
            response = await self.http_client.post(
                f"{self.LINKEDIN_REST_API}/posts",
                json=post_body,
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': self.LINKEDIN_API_VERSION
                }
            )
            
            response.raise_for_status()
            
            post_id = response.headers.get('x-restli-id', '')
            
            return {
                'success': True,
                'post_id': post_id
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def upload_and_post_carousel(
        self,
        access_token: str,
        author_urn: str,
        text: str,
        image_buffers: List[bytes],
        visibility: str = 'PUBLIC',
        is_organization: bool = False,
        concurrency: int = 5
    ) -> Dict[str, Any]:
        """
        Upload multiple images and create carousel post
        Uses concurrent uploads with rate limiting
        
        Args:
            access_token: Access token
            author_urn: Author URN
            text: Post text
            image_buffers: List of image binary data
            visibility: Post visibility
            is_organization: If true, treat as organization
            concurrency: Max concurrent uploads (default: 5)
            
        Returns:
            Dict with post_id and image_urns
        """
        if len(image_buffers) < 2:
            return {'success': False, 'error': 'LinkedIn carousel requires at least 2 images'}
        if len(image_buffers) > 20:
            return {'success': False, 'error': 'LinkedIn carousel supports maximum 20 images'}
        
        # Upload images concurrently with semaphore
        semaphore = asyncio.Semaphore(min(concurrency, 10))
        
        async def upload_single(index: int, buffer: bytes):
            async with semaphore:
                result = await self.upload_image(access_token, author_urn, buffer, is_organization)
                return {'index': index, 'result': result}
        
        # Upload all images
        tasks = [upload_single(i, buf) for i, buf in enumerate(image_buffers)]
        results = await asyncio.gather(*tasks)
        
        # Check for errors
        for item in results:
            if not item['result'].get('success'):
                return {'success': False, 'error': f"Failed to upload image {item['index'] + 1}"}
        
        # Sort by index and extract URNs
        results.sort(key=lambda x: x['index'])
        image_urns = [item['result']['asset'] for item in results]
        
        # Create carousel post
        post_result = await self.post_carousel(
            access_token,
            author_urn,
            text,
            image_urns,
            visibility,
            is_organization
        )
        
        if not post_result.get('success'):
            return post_result
        
        return {
            'success': True,
            'post_id': post_result['post_id'],
            'image_urns': image_urns
        }


# Singleton instance
linkedin_service = LinkedInService()


# Helper function
async def close_linkedin_service():
    """Close LinkedIn service HTTP client"""
    await linkedin_service.close()
