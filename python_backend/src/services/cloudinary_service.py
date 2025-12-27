"""
Cloudinary Media Service
Production-ready unified media storage for images, videos, and audio.
Features: CDN delivery, chunked uploads, platform-specific transformations.
"""

import os
import uuid
import asyncio
import tempfile
import mimetypes
from typing import Optional, Dict, Any, Literal, Union
from dataclasses import dataclass
from enum import Enum

import httpx
import cloudinary
import cloudinary.uploader
import cloudinary.api
from cloudinary.utils import cloudinary_url

from ..config import settings


# =============================================================================
# TYPES & ENUMS
# =============================================================================

class MediaType(str, Enum):
    """Supported media types"""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    RAW = "raw"


@dataclass
class MediaResult:
    """Result of media upload operation"""
    success: bool
    public_id: str
    url: str
    secure_url: str
    resource_type: str
    format: str
    bytes: int
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    error: Optional[str] = None


@dataclass
class MediaInfo:
    """Media metadata"""
    public_id: str
    resource_type: str
    format: str
    bytes: int
    url: str
    secure_url: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    created_at: Optional[str] = None


# =============================================================================
# PLATFORM PRESETS
# =============================================================================

# Video presets for social platforms (2025 standards)
VIDEO_PRESETS = {
    # Vertical (9:16)
    "tiktok": {"width": 1080, "height": 1920, "aspect_ratio": "9:16", "max_duration": 600},
    "youtube-short": {"width": 1080, "height": 1920, "aspect_ratio": "9:16", "max_duration": 60},
    "instagram-reel": {"width": 1080, "height": 1920, "aspect_ratio": "9:16", "max_duration": 90},
    "facebook-reel": {"width": 1080, "height": 1920, "aspect_ratio": "9:16", "max_duration": 90},
    # Landscape (16:9)
    "youtube": {"width": 1920, "height": 1080, "aspect_ratio": "16:9", "max_duration": None},
    "twitter": {"width": 1920, "height": 1080, "aspect_ratio": "16:9", "max_duration": 140},
    "linkedin": {"width": 1920, "height": 1080, "aspect_ratio": "16:9", "max_duration": 600},
    # Portrait (4:5)
    "instagram-feed": {"width": 1080, "height": 1350, "aspect_ratio": "4:5", "max_duration": 60},
    "facebook-feed": {"width": 1080, "height": 1350, "aspect_ratio": "4:5", "max_duration": 240},
}

# Image presets for social platforms
IMAGE_PRESETS = {
    # Square (1:1)
    "instagram-post": {"width": 1080, "height": 1080},
    "facebook-post": {"width": 1080, "height": 1080},
    "linkedin-post": {"width": 1080, "height": 1080},
    # Portrait (4:5)
    "instagram-feed": {"width": 1080, "height": 1350},
    "facebook-feed": {"width": 1080, "height": 1350},
    # Landscape (16:9)
    "youtube-thumbnail": {"width": 1280, "height": 720},
    "twitter-image": {"width": 1200, "height": 675},
    # Headers/Covers
    "facebook-cover": {"width": 1640, "height": 924},
    "twitter-header": {"width": 1500, "height": 500},
    "linkedin-cover": {"width": 1584, "height": 396},
}


# =============================================================================
# SERVICE CLASS
# =============================================================================

class CloudinaryService:
    """
    Unified Cloudinary media service.
    Handles uploads, transformations, and CDN delivery for all media types.
    """
    
    _initialized: bool = False
    
    @classmethod
    def _ensure_initialized(cls) -> bool:
        """Initialize Cloudinary SDK with credentials"""
        if cls._initialized:
            return True
        
        cloud_name = settings.CLOUDINARY_CLOUD_NAME
        api_key = settings.CLOUDINARY_API_KEY
        api_secret = settings.CLOUDINARY_API_SECRET
        
        if not all([cloud_name, api_key, api_secret]):
            return False
        
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        cls._initialized = True
        return True
    
    @classmethod
    def is_configured(cls) -> bool:
        """Check if Cloudinary is properly configured"""
        return cls._ensure_initialized()
    
    # =========================================================================
    # SYNCHRONOUS UPLOAD METHODS (for use in sync endpoints)
    # =========================================================================
    
    @classmethod
    def upload_image_bytes(
        cls,
        image_bytes: bytes,
        public_id: str,
        folder: str = "images",
        format: str = "jpg",
        tags: Optional[list] = None,
    ) -> Dict:
        """
        Synchronous upload of image bytes to Cloudinary.
        
        Args:
            image_bytes: Raw image bytes
            public_id: Cloudinary public ID (without folder)
            folder: Destination folder
            format: Output format (jpg, png, webp)
            tags: Optional tags
        
        Returns:
            Dict with secure_url, public_id, format, width, height, bytes
        """
        if not cls._ensure_initialized():
            raise ValueError("Cloudinary not configured")
        
        try:
            full_public_id = f"{folder}/{public_id}" if folder else public_id
            
            result = cloudinary.uploader.upload(
                image_bytes,
                public_id=full_public_id,
                resource_type="image",
                format=format,
                tags=tags or [],
                overwrite=True,
                invalidate=True,
            )
            
            return {
                "success": True,
                "secure_url": result.get("secure_url"),
                "url": result.get("url"),
                "public_id": result.get("public_id"),
                "format": result.get("format"),
                "width": result.get("width"),
                "height": result.get("height"),
                "bytes": result.get("bytes", 0),
            }
        except Exception as e:
            raise ValueError(f"Cloudinary upload failed: {str(e)}")
    
    @classmethod
    def upload_video_bytes(
        cls,
        video_bytes: bytes,
        public_id: str,
        folder: str = "videos",
        tags: Optional[list] = None,
    ) -> Dict:
        """
        Synchronous upload of video bytes to Cloudinary.
        
        Args:
            video_bytes: Raw video bytes
            public_id: Cloudinary public ID (without folder)
            folder: Destination folder
            tags: Optional tags
        
        Returns:
            Dict with secure_url, public_id, format, width, height, duration, bytes
        """
        if not cls._ensure_initialized():
            raise ValueError("Cloudinary not configured")
        
        try:
            full_public_id = f"{folder}/{public_id}" if folder else public_id
            
            result = cloudinary.uploader.upload(
                video_bytes,
                public_id=full_public_id,
                resource_type="video",
                tags=tags or [],
                overwrite=True,
                invalidate=True,
            )
            
            return {
                "success": True,
                "secure_url": result.get("secure_url"),
                "url": result.get("url"),
                "public_id": result.get("public_id"),
                "format": result.get("format"),
                "width": result.get("width"),
                "height": result.get("height"),
                "duration": result.get("duration"),
                "bytes": result.get("bytes", 0),
            }
        except Exception as e:
            raise ValueError(f"Cloudinary upload failed: {str(e)}")
    
    @classmethod
    def delete_media(
        cls,
        public_id: str,
        resource_type: str = "image",
    ) -> bool:
        """
        Delete media from Cloudinary.
        
        Args:
            public_id: Cloudinary public ID
            resource_type: Resource type (image, video, raw)
        
        Returns:
            True if deleted successfully
        """
        if not cls._ensure_initialized():
            raise ValueError("Cloudinary not configured")
        
        try:
            result = cloudinary.uploader.destroy(
                public_id,
                resource_type=resource_type,
                invalidate=True,
            )
            return result.get("result") == "ok"
        except Exception as e:
            raise ValueError(f"Cloudinary delete failed: {str(e)}")
    # =========================================================================
    # UPLOAD METHODS
    # =========================================================================
    
    @classmethod
    async def upload_image(
        cls,
        file_data: bytes,
        filename: str,
        folder: str = "images",
        transformation: Optional[Dict] = None,
        tags: Optional[list] = None,
    ) -> MediaResult:
        """
        Upload image to Cloudinary.
        
        Args:
            file_data: Image file bytes
            filename: Original filename
            folder: Destination folder
            transformation: Optional transformation to apply
            tags: Optional tags for organization
        
        Returns:
            MediaResult with URL and metadata
        """
        if not cls._ensure_initialized():
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="image",
                format="",
                bytes=0,
                error="Cloudinary not configured"
            )
        
        try:
            # Generate unique public_id
            file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'jpg'
            public_id = f"{folder}/{uuid.uuid4().hex[:12]}"
            
            # Run upload in thread pool (cloudinary SDK is sync)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.uploader.upload(
                    file_data,
                    public_id=public_id,
                    resource_type="image",
                    folder=None,  # Already in public_id
                    transformation=transformation,
                    tags=tags or [],
                    overwrite=True,
                    invalidate=True,
                )
            )
            
            return MediaResult(
                success=True,
                public_id=result["public_id"],
                url=result["url"],
                secure_url=result["secure_url"],
                resource_type="image",
                format=result.get("format", file_ext),
                bytes=result.get("bytes", 0),
                width=result.get("width"),
                height=result.get("height"),
            )
            
        except Exception as e:
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="image",
                format="",
                bytes=0,
                error=str(e)
            )
    
    @classmethod
    async def upload_video(
        cls,
        file_data: bytes,
        filename: str,
        folder: str = "videos",
        eager_transformations: Optional[list] = None,
        tags: Optional[list] = None,
    ) -> MediaResult:
        """
        Upload video to Cloudinary.
        
        Args:
            file_data: Video file bytes
            filename: Original filename
            folder: Destination folder
            eager_transformations: Pre-generate transformed versions
            tags: Optional tags
        
        Returns:
            MediaResult with URL and metadata
        """
        if not cls._ensure_initialized():
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="video",
                format="",
                bytes=0,
                error="Cloudinary not configured"
            )
        
        try:
            file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'mp4'
            public_id = f"{folder}/{uuid.uuid4().hex[:12]}"
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.uploader.upload(
                    file_data,
                    public_id=public_id,
                    resource_type="video",
                    eager=eager_transformations,
                    eager_async=True,  # Process transformations async
                    tags=tags or [],
                    overwrite=True,
                    invalidate=True,
                )
            )
            
            return MediaResult(
                success=True,
                public_id=result["public_id"],
                url=result["url"],
                secure_url=result["secure_url"],
                resource_type="video",
                format=result.get("format", file_ext),
                bytes=result.get("bytes", 0),
                width=result.get("width"),
                height=result.get("height"),
                duration=result.get("duration"),
            )
            
        except Exception as e:
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="video",
                format="",
                bytes=0,
                error=str(e)
            )
    
    @classmethod
    async def upload_video_chunked(
        cls,
        file_path: str,
        folder: str = "videos",
        chunk_size: int = 20_000_000,  # 20MB chunks
        tags: Optional[list] = None,
    ) -> MediaResult:
        """
        Upload large video using chunked upload.
        Supports files up to 2GB.
        
        Args:
            file_path: Path to video file
            folder: Destination folder
            chunk_size: Size of each chunk (default 20MB)
            tags: Optional tags
        
        Returns:
            MediaResult with URL and metadata
        """
        if not cls._ensure_initialized():
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="video",
                format="",
                bytes=0,
                error="Cloudinary not configured"
            )
        
        try:
            filename = os.path.basename(file_path)
            file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'mp4'
            public_id = f"{folder}/{uuid.uuid4().hex[:12]}"
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.uploader.upload_large(
                    file_path,
                    public_id=public_id,
                    resource_type="video",
                    chunk_size=chunk_size,
                    tags=tags or [],
                    overwrite=True,
                    invalidate=True,
                )
            )
            
            return MediaResult(
                success=True,
                public_id=result["public_id"],
                url=result["url"],
                secure_url=result["secure_url"],
                resource_type="video",
                format=result.get("format", file_ext),
                bytes=result.get("bytes", 0),
                width=result.get("width"),
                height=result.get("height"),
                duration=result.get("duration"),
            )
            
        except Exception as e:
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="video",
                format="",
                bytes=0,
                error=str(e)
            )
    
    @classmethod
    async def upload_audio(
        cls,
        file_data: bytes,
        filename: str,
        folder: str = "audio",
        tags: Optional[list] = None,
    ) -> MediaResult:
        """
        Upload audio to Cloudinary.
        
        Args:
            file_data: Audio file bytes
            filename: Original filename
            folder: Destination folder
            tags: Optional tags
        
        Returns:
            MediaResult with URL and metadata
        """
        if not cls._ensure_initialized():
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="video",  # Cloudinary uses video type for audio
                format="",
                bytes=0,
                error="Cloudinary not configured"
            )
        
        try:
            file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'mp3'
            public_id = f"{folder}/{uuid.uuid4().hex[:12]}"
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.uploader.upload(
                    file_data,
                    public_id=public_id,
                    resource_type="video",  # Cloudinary uses video for audio
                    tags=tags or [],
                    overwrite=True,
                    invalidate=True,
                )
            )
            
            return MediaResult(
                success=True,
                public_id=result["public_id"],
                url=result["url"],
                secure_url=result["secure_url"],
                resource_type="audio",
                format=result.get("format", file_ext),
                bytes=result.get("bytes", 0),
                duration=result.get("duration"),
            )
            
        except Exception as e:
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type="audio",
                format="",
                bytes=0,
                error=str(e)
            )
    
    @classmethod
    async def upload_from_url(
        cls,
        source_url: str,
        media_type: MediaType,
        folder: str = "uploads",
        tags: Optional[list] = None,
    ) -> MediaResult:
        """
        Upload media from external URL.
        
        Args:
            source_url: URL of media to upload
            media_type: Type of media (image, video, audio)
            folder: Destination folder
            tags: Optional tags
        
        Returns:
            MediaResult with URL and metadata
        """
        if not cls._ensure_initialized():
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type=media_type.value,
                format="",
                bytes=0,
                error="Cloudinary not configured"
            )
        
        try:
            public_id = f"{folder}/{uuid.uuid4().hex[:12]}"
            resource_type = "video" if media_type in [MediaType.VIDEO, MediaType.AUDIO] else "image"
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.uploader.upload(
                    source_url,
                    public_id=public_id,
                    resource_type=resource_type,
                    tags=tags or [],
                    overwrite=True,
                    invalidate=True,
                )
            )
            
            return MediaResult(
                success=True,
                public_id=result["public_id"],
                url=result["url"],
                secure_url=result["secure_url"],
                resource_type=media_type.value,
                format=result.get("format", ""),
                bytes=result.get("bytes", 0),
                width=result.get("width"),
                height=result.get("height"),
                duration=result.get("duration"),
            )
            
        except Exception as e:
            return MediaResult(
                success=False,
                public_id="",
                url="",
                secure_url="",
                resource_type=media_type.value,
                format="",
                bytes=0,
                error=str(e)
            )
    
    # =========================================================================
    # URL GENERATION
    # =========================================================================
    
    @classmethod
    def get_image_url(
        cls,
        public_id: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        crop: str = "fill",
        format: str = "auto",
        quality: str = "auto",
    ) -> str:
        """
        Generate optimized image URL with transformations.
        
        Args:
            public_id: Cloudinary public ID
            width: Target width
            height: Target height
            crop: Crop mode (fill, fit, scale, etc.)
            format: Output format (auto for best)
            quality: Quality setting (auto for optimal)
        
        Returns:
            Optimized CDN URL
        """
        if not cls._ensure_initialized():
            return ""
        
        transformation = {
            "fetch_format": format,
            "quality": quality,
        }
        
        if width:
            transformation["width"] = width
        if height:
            transformation["height"] = height
        if width or height:
            transformation["crop"] = crop
        
        url, _ = cloudinary_url(
            public_id,
            resource_type="image",
            transformation=transformation,
            secure=True,
        )
        return url
    
    @classmethod
    def get_video_url(
        cls,
        public_id: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        format: str = "auto",
        quality: str = "auto",
        streaming: bool = False,
    ) -> str:
        """
        Generate optimized video URL.
        
        Args:
            public_id: Cloudinary public ID
            width: Target width
            height: Target height
            format: Output format
            quality: Quality setting
            streaming: Enable streaming profile
        
        Returns:
            Optimized CDN URL
        """
        if not cls._ensure_initialized():
            return ""
        
        transformation = {
            "fetch_format": format,
            "quality": quality,
        }
        
        if width:
            transformation["width"] = width
        if height:
            transformation["height"] = height
        if width or height:
            transformation["crop"] = "fill"
        if streaming:
            transformation["streaming_profile"] = "auto"
        
        url, _ = cloudinary_url(
            public_id,
            resource_type="video",
            transformation=transformation,
            secure=True,
        )
        return url
    
    @classmethod
    def get_audio_url(
        cls,
        public_id: str,
        format: str = "mp3",
    ) -> str:
        """
        Generate audio URL.
        
        Args:
            public_id: Cloudinary public ID
            format: Output format (mp3, wav, etc.)
        
        Returns:
            CDN URL
        """
        if not cls._ensure_initialized():
            return ""
        
        url, _ = cloudinary_url(
            public_id,
            resource_type="video",  # Audio uses video resource type
            format=format,
            secure=True,
        )
        return url
    
    @classmethod
    def get_platform_url(
        cls,
        public_id: str,
        platform: str,
        media_type: MediaType,
    ) -> str:
        """
        Get platform-optimized URL.
        
        Args:
            public_id: Cloudinary public ID
            platform: Platform name (tiktok, instagram, youtube, etc.)
            media_type: Type of media
        
        Returns:
            Platform-optimized CDN URL
        """
        if media_type == MediaType.VIDEO:
            preset = VIDEO_PRESETS.get(platform)
            if preset:
                return cls.get_video_url(
                    public_id,
                    width=preset["width"],
                    height=preset["height"],
                    quality="auto:best",
                )
        elif media_type == MediaType.IMAGE:
            preset = IMAGE_PRESETS.get(platform)
            if preset:
                return cls.get_image_url(
                    public_id,
                    width=preset["width"],
                    height=preset["height"],
                    quality="auto:best",
                )
        
        # Return default URL if no preset found
        if media_type == MediaType.VIDEO:
            return cls.get_video_url(public_id)
        elif media_type == MediaType.AUDIO:
            return cls.get_audio_url(public_id)
        else:
            return cls.get_image_url(public_id)
    
    # =========================================================================
    # MANAGEMENT
    # =========================================================================
    
    @classmethod
    async def delete_media(
        cls,
        public_id: str,
        resource_type: str = "image",
    ) -> bool:
        """
        Delete media from Cloudinary.
        
        Args:
            public_id: Cloudinary public ID
            resource_type: Type (image, video, raw)
        
        Returns:
            True if deleted successfully
        """
        if not cls._ensure_initialized():
            return False
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.uploader.destroy(
                    public_id,
                    resource_type=resource_type,
                    invalidate=True,
                )
            )
            return result.get("result") == "ok"
        except Exception:
            return False
    
    @classmethod
    async def get_media_info(
        cls,
        public_id: str,
        resource_type: str = "image",
    ) -> Optional[MediaInfo]:
        """
        Get media metadata.
        
        Args:
            public_id: Cloudinary public ID
            resource_type: Type (image, video)
        
        Returns:
            MediaInfo or None
        """
        if not cls._ensure_initialized():
            return None
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: cloudinary.api.resource(
                    public_id,
                    resource_type=resource_type,
                )
            )
            
            return MediaInfo(
                public_id=result["public_id"],
                resource_type=result["resource_type"],
                format=result.get("format", ""),
                bytes=result.get("bytes", 0),
                url=result.get("url", ""),
                secure_url=result.get("secure_url", ""),
                width=result.get("width"),
                height=result.get("height"),
                duration=result.get("duration"),
                created_at=result.get("created_at"),
            )
        except Exception:
            return None
    
    # =========================================================================
    # PRESETS
    # =========================================================================
    
    @classmethod
    def get_video_presets(cls) -> Dict[str, Dict]:
        """Get all video platform presets"""
        return VIDEO_PRESETS.copy()
    
    @classmethod
    def get_image_presets(cls) -> Dict[str, Dict]:
        """Get all image platform presets"""
        return IMAGE_PRESETS.copy()
    
    @classmethod
    def get_preset(cls, platform: str, media_type: MediaType) -> Optional[Dict]:
        """Get preset for specific platform and media type"""
        if media_type == MediaType.VIDEO:
            return VIDEO_PRESETS.get(platform)
        elif media_type == MediaType.IMAGE:
            return IMAGE_PRESETS.get(platform)
        return None


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

cloudinary_service = CloudinaryService()
