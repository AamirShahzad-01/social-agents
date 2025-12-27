"""
Cloudinary API Router
RESTful endpoints for unified media storage operations.
Handles uploads, transformations, and CDN delivery for images, videos, and audio.
"""

import os
import uuid
import tempfile
from typing import Optional, Literal
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field

from src.services.cloudinary_service import (
    CloudinaryService,
    MediaType,
    MediaResult,
    cloudinary_service,
)


router = APIRouter(prefix="/api/v1/cloudinary", tags=["Cloudinary Media"])


# =============================================================================
# SCHEMAS
# =============================================================================

class UploadResponse(BaseModel):
    """Response from media upload"""
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


class UploadFromUrlRequest(BaseModel):
    """Request to upload from external URL"""
    source_url: str = Field(..., description="URL of media to upload")
    media_type: Literal["image", "video", "audio"] = Field(..., description="Type of media")
    folder: str = Field(default="uploads", description="Destination folder")
    tags: Optional[list[str]] = Field(default=None, description="Optional tags")


class TransformRequest(BaseModel):
    """Request to get transformed URL"""
    public_id: str = Field(..., description="Cloudinary public ID")
    media_type: Literal["image", "video", "audio"] = Field(..., description="Type of media")
    width: Optional[int] = Field(default=None, description="Target width")
    height: Optional[int] = Field(default=None, description="Target height")
    platform: Optional[str] = Field(default=None, description="Platform preset (e.g., tiktok, instagram)")
    quality: str = Field(default="auto", description="Quality setting")
    format: str = Field(default="auto", description="Output format")


class TransformResponse(BaseModel):
    """Response with transformed URL"""
    url: str
    public_id: str
    platform: Optional[str] = None


class MediaInfoResponse(BaseModel):
    """Media information response"""
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


class DeleteResponse(BaseModel):
    """Response from delete operation"""
    success: bool
    public_id: str
    message: str


class PresetsResponse(BaseModel):
    """Platform presets response"""
    video_presets: dict
    image_presets: dict


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _result_to_response(result: MediaResult) -> UploadResponse:
    """Convert MediaResult to API response"""
    return UploadResponse(
        success=result.success,
        public_id=result.public_id,
        url=result.url,
        secure_url=result.secure_url,
        resource_type=result.resource_type,
        format=result.format,
        bytes=result.bytes,
        width=result.width,
        height=result.height,
        duration=result.duration,
        error=result.error,
    )


def _check_configured():
    """Check if Cloudinary is configured"""
    if not CloudinaryService.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Cloudinary not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
        )


# =============================================================================
# UPLOAD ENDPOINTS
# =============================================================================

@router.post("/upload/image", response_model=UploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Form(default="images"),
    tags: Optional[str] = Form(default=None, description="Comma-separated tags"),
):
    """
    Upload an image to Cloudinary.
    
    Returns optimized CDN URL with automatic format and quality selection.
    """
    _check_configured()
    
    try:
        # Validate file type
        content_type = file.content_type or ""
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read file
        file_data = await file.read()
        if not file_data:
            raise HTTPException(status_code=400, detail="Empty file")
        
        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else None
        
        # Upload
        result = await cloudinary_service.upload_image(
            file_data=file_data,
            filename=file.filename or "image.jpg",
            folder=folder,
            tags=tag_list,
        )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error or "Upload failed")
        
        return _result_to_response(result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload/video", response_model=UploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    folder: str = Form(default="videos"),
    tags: Optional[str] = Form(default=None, description="Comma-separated tags"),
    chunked: bool = Form(default=False, description="Use chunked upload for large files"),
):
    """
    Upload a video to Cloudinary.
    
    For files larger than 100MB, use chunked=true for reliable upload.
    Returns CDN URL with streaming optimization.
    """
    _check_configured()
    
    try:
        # Validate file type
        content_type = file.content_type or ""
        if not content_type.startswith("video/"):
            raise HTTPException(status_code=400, detail="File must be a video")
        
        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else None
        
        if chunked:
            # For large files, save to temp file and use chunked upload
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name
            
            try:
                result = await cloudinary_service.upload_video_chunked(
                    file_path=tmp_path,
                    folder=folder,
                    tags=tag_list,
                )
            finally:
                # Clean up temp file
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
        else:
            # Direct upload for smaller files
            file_data = await file.read()
            if not file_data:
                raise HTTPException(status_code=400, detail="Empty file")
            
            result = await cloudinary_service.upload_video(
                file_data=file_data,
                filename=file.filename or "video.mp4",
                folder=folder,
                tags=tag_list,
            )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error or "Upload failed")
        
        return _result_to_response(result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload/audio", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    folder: str = Form(default="audio"),
    tags: Optional[str] = Form(default=None, description="Comma-separated tags"),
):
    """
    Upload audio to Cloudinary.
    
    Supports MP3, WAV, AAC, FLAC, and other audio formats.
    """
    _check_configured()
    
    try:
        # Validate file type
        content_type = file.content_type or ""
        if not content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="File must be audio")
        
        # Read file
        file_data = await file.read()
        if not file_data:
            raise HTTPException(status_code=400, detail="Empty file")
        
        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else None
        
        # Upload
        result = await cloudinary_service.upload_audio(
            file_data=file_data,
            filename=file.filename or "audio.mp3",
            folder=folder,
            tags=tag_list,
        )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error or "Upload failed")
        
        return _result_to_response(result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload/url", response_model=UploadResponse)
async def upload_from_url(request: UploadFromUrlRequest):
    """
    Upload media from an external URL.
    
    Cloudinary will fetch the media directly, which is faster for large files.
    """
    _check_configured()
    
    try:
        media_type = MediaType(request.media_type)
        
        result = await cloudinary_service.upload_from_url(
            source_url=request.source_url,
            media_type=media_type,
            folder=request.folder,
            tags=request.tags,
        )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=result.error or "Upload failed")
        
        return _result_to_response(result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# =============================================================================
# TRANSFORM ENDPOINTS
# =============================================================================

@router.post("/transform", response_model=TransformResponse)
async def get_transformed_url(request: TransformRequest):
    """
    Get a transformed/optimized URL for media.
    
    Supports platform presets (tiktok, instagram, youtube, etc.) or custom dimensions.
    """
    _check_configured()
    
    try:
        media_type = MediaType(request.media_type)
        
        if request.platform:
            # Use platform preset
            url = cloudinary_service.get_platform_url(
                public_id=request.public_id,
                platform=request.platform,
                media_type=media_type,
            )
        elif media_type == MediaType.VIDEO:
            url = cloudinary_service.get_video_url(
                public_id=request.public_id,
                width=request.width,
                height=request.height,
                quality=request.quality,
                format=request.format,
            )
        elif media_type == MediaType.AUDIO:
            url = cloudinary_service.get_audio_url(
                public_id=request.public_id,
                format=request.format if request.format != "auto" else "mp3",
            )
        else:
            url = cloudinary_service.get_image_url(
                public_id=request.public_id,
                width=request.width,
                height=request.height,
                quality=request.quality,
                format=request.format,
            )
        
        if not url:
            raise HTTPException(status_code=500, detail="Failed to generate URL")
        
        return TransformResponse(
            url=url,
            public_id=request.public_id,
            platform=request.platform,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transform failed: {str(e)}")


# =============================================================================
# MANAGEMENT ENDPOINTS
# =============================================================================

@router.get("/media/{public_id:path}", response_model=MediaInfoResponse)
async def get_media_info(
    public_id: str,
    resource_type: Literal["image", "video"] = Query(default="image"),
):
    """
    Get media metadata and information.
    """
    _check_configured()
    
    try:
        info = await cloudinary_service.get_media_info(
            public_id=public_id,
            resource_type=resource_type,
        )
        
        if not info:
            raise HTTPException(status_code=404, detail="Media not found")
        
        return MediaInfoResponse(
            public_id=info.public_id,
            resource_type=info.resource_type,
            format=info.format,
            bytes=info.bytes,
            url=info.url,
            secure_url=info.secure_url,
            width=info.width,
            height=info.height,
            duration=info.duration,
            created_at=info.created_at,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get info: {str(e)}")


@router.delete("/media/{public_id:path}", response_model=DeleteResponse)
async def delete_media(
    public_id: str,
    resource_type: Literal["image", "video"] = Query(default="image"),
):
    """
    Delete media from Cloudinary.
    """
    _check_configured()
    
    try:
        success = await cloudinary_service.delete_media(
            public_id=public_id,
            resource_type=resource_type,
        )
        
        return DeleteResponse(
            success=success,
            public_id=public_id,
            message="Deleted successfully" if success else "Delete failed",
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


# =============================================================================
# PRESETS ENDPOINTS
# =============================================================================

@router.get("/presets", response_model=PresetsResponse)
async def get_platform_presets():
    """
    Get all available platform presets for images and videos.
    
    Use these presets when uploading or transforming media for specific platforms.
    """
    return PresetsResponse(
        video_presets=cloudinary_service.get_video_presets(),
        image_presets=cloudinary_service.get_image_presets(),
    )


@router.get("/presets/{media_type}")
async def get_presets_by_type(
    media_type: Literal["image", "video"],
):
    """
    Get platform presets for a specific media type.
    """
    if media_type == "video":
        return cloudinary_service.get_video_presets()
    else:
        return cloudinary_service.get_image_presets()


# =============================================================================
# INFO ENDPOINT
# =============================================================================

@router.get("/")
async def get_cloudinary_info():
    """Get Cloudinary service information and status"""
    configured = CloudinaryService.is_configured()
    
    return {
        "service": "Cloudinary Media Storage",
        "version": "1.0.0",
        "configured": configured,
        "status": "ready" if configured else "not_configured",
        "features": {
            "image_upload": True,
            "video_upload": True,
            "audio_upload": True,
            "chunked_upload": True,
            "transformations": True,
            "cdn_delivery": True,
            "platform_presets": True,
        },
        "endpoints": {
            "upload": {
                "POST /upload/image": "Upload image",
                "POST /upload/video": "Upload video",
                "POST /upload/audio": "Upload audio",
                "POST /upload/url": "Upload from URL",
            },
            "transform": {
                "POST /transform": "Get transformed URL",
            },
            "management": {
                "GET /media/{public_id}": "Get media info",
                "DELETE /media/{public_id}": "Delete media",
            },
            "presets": {
                "GET /presets": "Get all platform presets",
                "GET /presets/{type}": "Get presets by media type",
            },
        },
    }
