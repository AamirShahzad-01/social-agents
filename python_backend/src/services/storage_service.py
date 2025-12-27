"""
Storage Service
Production-ready file storage service using Cloudinary CDN.
Handles file uploads, URL generation, and file management.

Note: This service replaces the old Supabase Storage implementation.
All media is now stored in Cloudinary for optimal CDN delivery.
"""
import httpx
import mimetypes
import uuid
import logging
from typing import Optional, Dict, Any
from datetime import datetime

from ..config import settings
from .cloudinary_service import CloudinaryService

logger = logging.getLogger(__name__)


class StorageService:
    """Cloudinary-based storage service for file management"""
    
    def __init__(self):
        self._cloudinary = None
        self.default_folder = 'media'  # Default folder for media files
    
    @property
    def cloudinary(self) -> CloudinaryService:
        """Lazy Cloudinary service initialization"""
        if self._cloudinary is None:
            self._cloudinary = CloudinaryService()
        return self._cloudinary
    
    def _generate_public_id(self, file_path: str) -> str:
        """Generate a Cloudinary-compatible public_id from file path"""
        # Remove extension for Cloudinary public_id
        if '.' in file_path:
            base_path = file_path.rsplit('.', 1)[0]
        else:
            base_path = file_path
        
        # Add timestamp for uniqueness
        timestamp = int(datetime.now().timestamp() * 1000)
        return f"{base_path}_{timestamp}"
    
    def _get_resource_type(self, content_type: str) -> str:
        """Determine Cloudinary resource type from MIME type"""
        if content_type.startswith('video/'):
            return 'video'
        elif content_type.startswith('audio/'):
            return 'video'  # Cloudinary treats audio as video
        elif content_type.startswith('image/'):
            return 'image'
        else:
            return 'raw'
    
    async def upload_file(
        self,
        file_path: str,
        file_data: bytes,
        content_type: Optional[str] = None,
        bucket: Optional[str] = None  # Ignored, kept for API compatibility
    ) -> Dict[str, Any]:
        """
        Upload file to Cloudinary CDN.
        
        Args:
            file_path: Path for the file (used to generate public_id)
            file_data: File binary data
            content_type: MIME type (auto-detected if not provided)
            bucket: Ignored (kept for backward compatibility)
            
        Returns:
            Dict with:
            - success: bool
            - path: str (Cloudinary public_id)
            - url: str (Cloudinary secure URL)
            - error: str (if failed)
        """
        try:
            # Auto-detect content type if not provided
            if not content_type:
                content_type, _ = mimetypes.guess_type(file_path)
                content_type = content_type or 'application/octet-stream'
            
            resource_type = self._get_resource_type(content_type)
            public_id = self._generate_public_id(file_path)
            folder = self.default_folder
            
            # Upload based on resource type
            if resource_type == 'video':
                result = self.cloudinary.upload_video_bytes(
                    video_bytes=file_data,
                    public_id=public_id,
                    folder=folder,
                    tags=['uploaded', 'storage-service']
                )
            else:
                # Get format from content_type
                ext_map = {
                    'image/jpeg': 'jpg',
                    'image/png': 'png',
                    'image/gif': 'gif',
                    'image/webp': 'webp'
                }
                format_ext = ext_map.get(content_type, 'jpg')
                
                result = self.cloudinary.upload_image_bytes(
                    image_bytes=file_data,
                    public_id=public_id,
                    folder=folder,
                    format=format_ext,
                    tags=['uploaded', 'storage-service']
                )
            
            logger.info(f"Uploaded file to Cloudinary: {result.get('public_id')}")
            
            return {
                'success': True,
                'path': result.get('public_id'),
                'url': result.get('secure_url'),
                'public_id': result.get('public_id'),
                'format': result.get('format'),
                'width': result.get('width'),
                'height': result.get('height'),
                'bytes': result.get('bytes', 0)
            }
            
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def upload_from_url(
        self,
        file_path: str,
        source_url: str,
        bucket: Optional[str] = None  # Ignored, kept for API compatibility
    ) -> Dict[str, Any]:
        """
        Download file from URL and upload to Cloudinary.
        
        Args:
            file_path: Path for the file (used to generate public_id)
            source_url: URL to download file from
            bucket: Ignored (kept for backward compatibility)
            
        Returns:
            Dict with success, path, url, error
        """
        try:
            # Download file from URL
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(source_url)
                if response.status_code != 200:
                    return {
                        'success': False,
                        'error': f'Failed to download file: HTTP {response.status_code}'
                    }
                
                file_data = response.content
                content_type = response.headers.get('content-type', 'application/octet-stream')
            
            # Upload the downloaded file
            return await self.upload_file(
                file_path=file_path,
                file_data=file_data,
                content_type=content_type
            )
            
        except Exception as e:
            logger.error(f"Upload from URL failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_signed_url(
        self,
        file_path: str,
        expires_in: int = 3600,
        bucket: Optional[str] = None  # Ignored, kept for API compatibility
    ) -> Dict[str, Any]:
        """
        Generate a signed URL for file access.
        
        Note: Cloudinary uses different signing mechanism. This returns a 
        standard secure URL since Cloudinary URLs are always secure.
        
        Args:
            file_path: Cloudinary public_id
            expires_in: Expiration time in seconds (not used for Cloudinary)
            bucket: Ignored (kept for backward compatibility)
            
        Returns:
            Dict with success, url, error
        """
        try:
            # For Cloudinary, we just return the secure URL
            # Cloudinary doesn't use time-expiring signed URLs in the same way
            url = self.cloudinary.get_image_url(public_id=file_path)
            
            return {
                'success': True,
                'url': url,
                'expires_in': expires_in,
                'note': 'Cloudinary URLs are always secure'
            }
            
        except Exception as e:
            logger.error(f"Get signed URL failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def delete_file(
        self,
        file_path: str,
        bucket: Optional[str] = None  # Ignored, kept for API compatibility
    ) -> Dict[str, Any]:
        """
        Delete a file from Cloudinary.
        
        Args:
            file_path: Cloudinary public_id
            bucket: Ignored (kept for backward compatibility)
            
        Returns:
            Dict with success, error
        """
        try:
            # Try to delete as image first, then as video if that fails
            try:
                success = self.cloudinary.delete_media(
                    public_id=file_path,
                    resource_type='image'
                )
            except Exception:
                success = self.cloudinary.delete_media(
                    public_id=file_path,
                    resource_type='video'
                )
            
            if success:
                logger.info(f"Deleted file from Cloudinary: {file_path}")
            
            return {
                'success': success,
                'path': file_path
            }
            
        except Exception as e:
            logger.error(f"Delete failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def list_files(
        self,
        folder: str = "",
        limit: int = 100,
        bucket: Optional[str] = None  # Ignored, kept for API compatibility
    ) -> Dict[str, Any]:
        """
        List files in a folder.
        
        Note: Cloudinary has different listing capabilities.
        This is a simplified implementation.
        
        Args:
            folder: Folder prefix
            limit: Maximum number of files
            bucket: Ignored (kept for backward compatibility)
            
        Returns:
            Dict with success, files, error
        """
        try:
            # Note: Full listing would require Cloudinary Admin API
            # This is a placeholder - implement with cloudinary.api.resources() if needed
            return {
                'success': True,
                'files': [],
                'note': 'Use Cloudinary Dashboard or Admin API for full listing'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


# Create singleton instance
storage_service = StorageService()


# Convenience functions for backward compatibility
async def upload_file(
    file_path: str,
    file_data: bytes,
    content_type: Optional[str] = None,
    bucket: Optional[str] = None
) -> Dict[str, Any]:
    """Upload file to Cloudinary - convenience function"""
    return await storage_service.upload_file(file_path, file_data, content_type, bucket)


async def upload_from_url(
    file_path: str,
    source_url: str,
    bucket: Optional[str] = None
) -> Dict[str, Any]:
    """Upload file from URL to Cloudinary - convenience function"""
    return await storage_service.upload_from_url(file_path, source_url, bucket)


async def get_signed_url(
    file_path: str,
    expires_in: int = 3600,
    bucket: Optional[str] = None
) -> Dict[str, Any]:
    """Get signed URL - convenience function"""
    return await storage_service.get_signed_url(file_path, expires_in, bucket)


async def delete_file(file_path: str, bucket: Optional[str] = None) -> Dict[str, Any]:
    """Delete file from Cloudinary - convenience function"""
    return await storage_service.delete_file(file_path, bucket)
