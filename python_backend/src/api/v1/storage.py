"""
Storage API Router
File upload and media management endpoints using Cloudinary.

All media is stored in Cloudinary CDN for optimal delivery.
"""

import base64
import uuid
import mimetypes
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from src.services.cloudinary_service import CloudinaryService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/storage", tags=["Storage"])


# ================== SCHEMAS ==================

class Base64UploadRequest(BaseModel):
    """Request for base64 file upload"""
    base64_data: str = Field(..., alias="base64Data")
    file_name: str = Field(..., alias="fileName")
    folder: str = "uploads"
    type: str = "image"  # image, video, audio
    
    class Config:
        populate_by_name = True


class UploadResponse(BaseModel):
    """Response from file upload"""
    url: str
    public_id: str = Field(..., alias="publicId")
    format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    message: str = "File uploaded successfully"
    
    class Config:
        populate_by_name = True


class DeleteRequest(BaseModel):
    """Request to delete a file"""
    public_id: str = Field(..., alias="publicId")
    resource_type: str = Field("image", alias="resourceType")  # image, video, raw
    
    class Config:
        populate_by_name = True


# ================== HELPER FUNCTIONS ==================

def generate_public_id(original_filename: str, folder: str) -> str:
    """Generate unique public_id for Cloudinary"""
    file_ext = original_filename.rsplit('.', 1)[-1] if '.' in original_filename else ''
    random_suffix = uuid.uuid4().hex[:8]
    timestamp = int(datetime.now().timestamp() * 1000)
    base_name = original_filename.rsplit('.', 1)[0] if '.' in original_filename else original_filename
    # Sanitize the base name
    base_name = ''.join(c if c.isalnum() or c in '-_' else '_' for c in base_name)[:20]
    return f"{folder}/{base_name}_{timestamp}_{random_suffix}"


def decode_base64_data(base64_data: str) -> tuple[bytes, str]:
    """
    Decode base64 data, handling data URLs and raw base64 strings.
    Returns tuple of (bytes, content_type)
    """
    content_type = "application/octet-stream"
    
    # Handle data URL format: data:image/png;base64,iVBOR...
    if base64_data.startswith("data:"):
        # Extract content type and base64 data
        header, encoded = base64_data.split(",", 1)
        content_type = header.split(":")[1].split(";")[0]
    else:
        encoded = base64_data
    
    # Decode base64
    file_bytes = base64.b64decode(encoded)
    return file_bytes, content_type


def get_resource_type(content_type: str) -> str:
    """Determine Cloudinary resource type from content type"""
    if content_type.startswith("video/"):
        return "video"
    elif content_type.startswith("audio/"):
        return "video"  # Cloudinary treats audio as video
    elif content_type.startswith("image/"):
        return "image"
    else:
        return "raw"


# ================== ENDPOINTS ==================

@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: Optional[UploadFile] = File(None),
    folder: Optional[str] = Form("uploads"),
    base64_data: Optional[str] = Form(None, alias="base64Data"),
    file_name: Optional[str] = Form(None, alias="fileName"),
    media_type: Optional[str] = Form(None, alias="mediaType"),  # image, video, audio
):
    """
    Upload a file to Cloudinary CDN.
    
    Supports two upload methods:
    1. FormData file upload (multipart/form-data) - preferred for large files
    2. Base64 JSON upload (for smaller files or from canvas/generated content)
    """
    try:
        cloudinary = CloudinaryService()
        
        # Handle FormData file upload
        if file and file.filename:
            file_data = await file.read()
            if not file_data:
                raise HTTPException(status_code=400, detail="Empty file provided")
            
            content_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
            public_id = generate_public_id(file.filename, folder or "uploads")
            resource_type = get_resource_type(content_type)
            
            # Upload based on type
            if resource_type == "video":
                result = cloudinary.upload_video_bytes(
                    video_bytes=file_data,
                    public_id=public_id,
                    folder="",  # Already included in public_id
                    tags=["uploaded", f"folder:{folder}"]
                )
            else:
                file_ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'jpg'
                result = cloudinary.upload_image_bytes(
                    image_bytes=file_data,
                    public_id=public_id,
                    folder="",  # Already included in public_id
                    format=file_ext if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp'] else 'jpg',
                    tags=["uploaded", f"folder:{folder}"]
                )
            
            return UploadResponse(
                url=result["secure_url"],
                public_id=result["public_id"],
                format=result.get("format"),
                width=result.get("width"),
                height=result.get("height"),
                duration=result.get("duration"),
                message="File uploaded successfully to Cloudinary"
            )
        
        # Handle Base64 upload
        if base64_data and file_name:
            file_bytes, content_type = decode_base64_data(base64_data)
            public_id = generate_public_id(file_name, folder or "uploads")
            resource_type = media_type or get_resource_type(content_type)
            
            # Upload based on type
            if resource_type in ["video", "audio"]:
                result = cloudinary.upload_video_bytes(
                    video_bytes=file_bytes,
                    public_id=public_id,
                    folder="",
                    tags=["uploaded", "base64", f"folder:{folder}"]
                )
            else:
                file_ext = file_name.rsplit('.', 1)[-1] if '.' in file_name else 'jpg'
                result = cloudinary.upload_image_bytes(
                    image_bytes=file_bytes,
                    public_id=public_id,
                    folder="",
                    format=file_ext if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp'] else 'jpg',
                    tags=["uploaded", "base64", f"folder:{folder}"]
                )
            
            return UploadResponse(
                url=result["secure_url"],
                public_id=result["public_id"],
                format=result.get("format"),
                width=result.get("width"),
                height=result.get("height"),
                duration=result.get("duration"),
                message="File uploaded successfully to Cloudinary"
            )
        
        raise HTTPException(
            status_code=400,
            detail="Either a file or base64Data with fileName is required"
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file: {str(e)}"
        )


@router.post("/upload/json", response_model=UploadResponse)
async def upload_file_json(request: Base64UploadRequest):
    """
    Upload a file using JSON body with base64 data.
    Alternative to the FormData endpoint for cases where JSON is preferred.
    """
    try:
        cloudinary = CloudinaryService()
        
        file_bytes, content_type = decode_base64_data(request.base64_data)
        public_id = generate_public_id(request.file_name, request.folder)
        resource_type = request.type or get_resource_type(content_type)
        
        # Upload based on type
        if resource_type in ["video", "audio"]:
            result = cloudinary.upload_video_bytes(
                video_bytes=file_bytes,
                public_id=public_id,
                folder="",
                tags=["uploaded", "json", f"folder:{request.folder}"]
            )
        else:
            file_ext = request.file_name.rsplit('.', 1)[-1] if '.' in request.file_name else 'jpg'
            result = cloudinary.upload_image_bytes(
                image_bytes=file_bytes,
                public_id=public_id,
                folder="",
                format=file_ext if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp'] else 'jpg',
                tags=["uploaded", "json", f"folder:{request.folder}"]
            )
        
        return UploadResponse(
            url=result["secure_url"],
            public_id=result["public_id"],
            format=result.get("format"),
            width=result.get("width"),
            height=result.get("height"),
            duration=result.get("duration"),
            message="File uploaded successfully to Cloudinary"
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"JSON upload failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file: {str(e)}"
        )


@router.delete("/file")
async def delete_file(request: DeleteRequest):
    """
    Delete a file from Cloudinary.
    
    Args:
        request: Delete request with public_id and resource_type
    """
    try:
        cloudinary = CloudinaryService()
        success = cloudinary.delete_media(
            public_id=request.public_id,
            resource_type=request.resource_type
        )
        
        if success:
            return {"success": True, "message": "File deleted successfully"}
        else:
            return {"success": False, "message": "File not found or already deleted"}
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )


@router.get("/url/{public_id:path}")
async def get_url(
    public_id: str,
    width: Optional[int] = None,
    height: Optional[int] = None,
    format: str = "auto",
    quality: str = "auto",
    resource_type: str = "image"
):
    """
    Get optimized URL for a Cloudinary resource.
    
    Supports on-the-fly transformations for images and videos.
    """
    try:
        cloudinary = CloudinaryService()
        
        if resource_type == "video":
            url = cloudinary.get_video_url(
                public_id=public_id,
                width=width,
                height=height,
                format=format,
                quality=quality
            )
        else:
            url = cloudinary.get_image_url(
                public_id=public_id,
                width=width,
                height=height,
                format=format,
                quality=quality
            )
        
        return {"url": url, "public_id": public_id}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate URL: {str(e)}"
        )


# ================== INFO ENDPOINT ==================

@router.get("/")
async def get_storage_info():
    """Get Storage service information"""
    cloudinary = CloudinaryService()
    is_configured = cloudinary.is_configured()
    
    return {
        "service": "Storage (Cloudinary)",
        "version": "2.0.0",
        "provider": "Cloudinary",
        "configured": is_configured,
        "endpoints": {
            "upload": {
                "POST": "Upload a file (FormData or base64)",
                "methods": ["multipart/form-data", "base64"]
            },
            "upload/json": {
                "POST": "Upload using JSON body with base64 data"
            },
            "file": {
                "DELETE": "Delete a file by public_id"
            },
            "url/{public_id}": {
                "GET": "Get optimized URL with optional transformations"
            }
        },
        "features": [
            "CDN delivery",
            "On-the-fly transformations",
            "Automatic format optimization",
            "Image and video support"
        ]
    }
