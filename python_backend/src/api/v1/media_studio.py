"""
Media Studio API Router
Image, Video, and Audio processing endpoints

Uses Cloudinary for media storage and CDN delivery.
"""

from typing import Optional, Literal
from datetime import datetime
import logging

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

from src.services.media_studio import ImageService, VideoService, AudioService
from src.services.supabase_service import get_supabase_admin_client, verify_jwt  # For database operations only
from src.services.cloudinary_service import CloudinaryService  # Media storage

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/media-studio", tags=["Media Studio"])


# ================== SCHEMAS ==================

class ImageResizeRequest(BaseModel):
    """Request to resize an image for a platform"""
    workspace_id: str = Field(..., alias="workspaceId")
    image_url: str = Field(..., alias="imageUrl")
    platform: Optional[str] = None
    custom_width: Optional[int] = Field(None, alias="customWidth")
    custom_height: Optional[int] = Field(None, alias="customHeight")
    
    class Config:
        populate_by_name = True


class ImageResizeResponse(BaseModel):
    """Response from image resize operation"""
    success: bool
    url: str
    platform: str
    dimensions: dict
    format: str
    file_size: int
    media_item: Optional[dict] = Field(None, alias="mediaItem")


class VideoResizeRequest(BaseModel):
    """Request to resize a video for a platform"""
    workspace_id: str = Field(..., alias="workspaceId")
    video_url: str = Field(..., alias="videoUrl")
    platform: Optional[str] = None
    custom_width: Optional[int] = Field(None, alias="customWidth")
    custom_height: Optional[int] = Field(None, alias="customHeight")
    
    class Config:
        populate_by_name = True


class VideoResizeResponse(BaseModel):
    """Response from video resize operation"""
    success: bool
    url: str
    platform: str
    dimensions: dict
    duration: float
    media_item: Optional[dict] = Field(None, alias="mediaItem")


class MergeConfig(BaseModel):
    """Configuration for video merge"""
    resolution: Literal["original", "720p", "1080p"] = "720p"
    quality: Literal["draft", "high"] = "draft"


class VideoMergeRequest(BaseModel):
    """Request to merge multiple videos"""
    workspace_id: str = Field(..., alias="workspaceId")
    video_urls: list[str] = Field(..., alias="videoUrls", min_length=2)
    title: Optional[str] = None
    config: Optional[MergeConfig] = None
    
    class Config:
        populate_by_name = True


class VideoMergeResponse(BaseModel):
    """Response from video merge operation"""
    success: bool
    url: str
    clip_count: int = Field(..., alias="clipCount")
    total_duration: float = Field(..., alias="totalDuration")
    is_vertical: bool = Field(..., alias="isVertical")
    media_item: Optional[dict] = Field(None, alias="mediaItem")


class AudioProcessRequest(BaseModel):
    """Request to process video audio"""
    workspace_id: str = Field(..., alias="workspaceId")
    video_url: str = Field(..., alias="videoUrl")
    mute_original: bool = Field(False, alias="muteOriginal")
    background_music_url: Optional[str] = Field(None, alias="backgroundMusicUrl")
    background_music_name: Optional[str] = Field(None, alias="backgroundMusicName")
    original_volume: int = Field(100, alias="originalVolume", ge=0, le=200)
    music_volume: int = Field(80, alias="musicVolume", ge=0, le=200)
    
    class Config:
        populate_by_name = True


class AudioProcessResponse(BaseModel):
    """Response from audio process operation"""
    success: bool
    url: str
    media_item: Optional[dict] = Field(None, alias="mediaItem")


class MediaLibraryFilters(BaseModel):
    """Filters for media library queries"""
    type: Optional[str] = None
    source: Optional[str] = None
    is_favorite: bool = False
    folder: Optional[str] = None
    search: Optional[str] = None
    tags: Optional[list[str]] = None
    limit: int = 50
    offset: int = 0


class CreateMediaItemRequest(BaseModel):
    """Request to create a media item"""
    workspace_id: str = Field(..., alias="workspaceId")
    media_item: dict = Field(..., alias="mediaItem")
    
    class Config:
        populate_by_name = True


class UpdateMediaItemRequest(BaseModel):
    """Request to update a media item"""
    workspace_id: str = Field(..., alias="workspaceId")
    media_id: str = Field(..., alias="mediaId")
    updates: dict
    
    class Config:
        populate_by_name = True


# ================== IMAGE ENDPOINTS ==================

@router.get("/resize-image")
async def get_image_presets():
    """Get available image resize platform presets"""
    return {"presets": ImageService.get_presets()}


@router.post("/resize-image", response_model=ImageResizeResponse)
async def resize_image(request: ImageResizeRequest):
    """Resize image for a specific platform or custom dimensions"""
    # Validate input first (before try block)
    if not request.platform and not (request.custom_width and request.custom_height):
        raise HTTPException(
            status_code=400,
            detail="Either platform or custom dimensions required"
        )
    
    try:
        # Resize image
        result, platform_name = await ImageService.resize_for_platform(
            image_url=request.image_url,
            platform=request.platform,
            custom_width=request.custom_width,
            custom_height=request.custom_height
        )
        
        # Upload to Cloudinary
        cloudinary = CloudinaryService()
        
        timestamp = int(datetime.now().timestamp() * 1000)
        extension = "jpg" if result.format == "jpeg" else "png"
        platform_slug = request.platform or "custom"
        public_id = f"resized/resized-{platform_slug}-{timestamp}"
        
        upload_result = cloudinary.upload_image_bytes(
            image_bytes=result.buffer,
            public_id=public_id,
            folder="media-studio",
            format=extension,
            tags=[f"workspace:{request.workspace_id}", "resized", platform_slug]
        )
        
        # Get Cloudinary URL
        public_url = upload_result.get("secure_url")
        if not public_url:
            raise ValueError("Failed to get Cloudinary URL")
        
        # Create media library entry
        media_item = {
            "type": "image",
            "source": "edited",
            "url": public_url,
            "prompt": f"Resized for {platform_name}",
            "model": "image-resize",
            "config": {
                "sourceImage": request.image_url,
                "platform": platform_slug,
                "targetWidth": result.width,
                "targetHeight": result.height,
                "format": result.format,
                "originalWidth": result.original_width,
                "originalHeight": result.original_height,
                "resizedAt": datetime.now().isoformat(),
                "cloudinaryPublicId": upload_result.get("public_id"),
            },
            "metadata": {
                "source": "image-editor",
                "platform": platform_name,
                "dimensions": f"{result.width}x{result.height}",
                "width": result.width,
                "height": result.height,
                "format": result.format,
                "fileSize": result.file_size,
                "cloudinaryPublicId": upload_result.get("public_id"),
                "cloudinaryFormat": upload_result.get("format"),
            },
            "tags": ["resized", "image-editor", platform_slug],
        }
        
        return ImageResizeResponse(
            success=True,
            url=public_url,
            platform=platform_name,
            dimensions={"width": result.width, "height": result.height},
            format=result.format,
            file_size=result.file_size,
            media_item=media_item
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        error_message = str(e)
        user_message = "Failed to resize image"
        error_code = "RESIZE_ERROR"
        
        if "download" in error_message.lower():
            user_message = "Could not download the image. Please check the URL is accessible."
            error_code = "DOWNLOAD_FAILED"
        elif "format" in error_message.lower() or "corrupt" in error_message.lower():
            user_message = "Unsupported image format or corrupted file."
            error_code = "INVALID_IMAGE"
        
        raise HTTPException(
            status_code=500,
            detail={"error": user_message, "code": error_code}
        )


# ================== VIDEO ENDPOINTS ==================

@router.get("/resize-video")
async def get_video_presets():
    """Get available video resize platform presets"""
    return {"presets": VideoService.get_presets()}


@router.post("/resize-video", response_model=VideoResizeResponse)
async def resize_video(request: VideoResizeRequest):
    """Resize video for a specific platform or custom dimensions"""
    # Validate input first (before try block)
    if not request.platform and not (request.custom_width and request.custom_height):
        raise HTTPException(
            status_code=400,
            detail="Either platform or custom dimensions required"
        )
    
    try:
        result, platform_name = await VideoService.resize_for_platform(
            video_url=request.video_url,
            platform=request.platform,
            custom_width=request.custom_width,
            custom_height=request.custom_height
        )
        
        # Upload to Cloudinary
        cloudinary = CloudinaryService()
        
        timestamp = int(datetime.now().timestamp() * 1000)
        platform_slug = request.platform or "custom"
        public_id = f"resized/resized-video-{platform_slug}-{timestamp}"
        
        upload_result = cloudinary.upload_video_bytes(
            video_bytes=result.buffer,
            public_id=public_id,
            folder="media-studio",
            tags=[f"workspace:{request.workspace_id}", "resized", platform_slug]
        )
        
        # Get Cloudinary URL
        public_url = upload_result.get("secure_url")
        if not public_url:
            raise ValueError("Failed to get Cloudinary URL")
        
        media_item = {
            "type": "video",
            "source": "edited",
            "url": public_url,
            "prompt": f"Resized for {platform_name}",
            "model": "video-resize",
            "config": {
                "sourceVideo": request.video_url,
                "platform": platform_slug,
                "targetWidth": result.width,
                "targetHeight": result.height,
                "duration": result.duration,
                "resizedAt": datetime.now().isoformat(),
                "cloudinaryPublicId": upload_result.get("public_id"),
            },
            "metadata": {
                "source": "video-editor",
                "platform": platform_name,
                "dimensions": f"{result.width}x{result.height}",
                "width": result.width,
                "height": result.height,
                "duration": result.duration,
                "cloudinaryPublicId": upload_result.get("public_id"),
                "cloudinaryFormat": upload_result.get("format"),
            },
            "tags": ["resized", "video-editor", platform_slug],
        }
        
        return VideoResizeResponse(
            success=True,
            url=public_url,
            platform=platform_name,
            dimensions={"width": result.width, "height": result.height},
            duration=result.duration,
            media_item=media_item
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        error_message = str(e)
        user_message = "Failed to resize video"
        error_code = "RESIZE_ERROR"
        
        if "timed out" in error_message.lower():
            user_message = "Video processing timed out. Try with a shorter video."
            error_code = "TIMEOUT"
        elif "download" in error_message.lower():
            user_message = "Could not download the video. Please check the URL."
            error_code = "DOWNLOAD_FAILED"
        elif "ffmpeg" in error_message.lower():
            user_message = "Video processing failed. The file may be corrupted or unsupported."
            error_code = "PROCESSING_ERROR"
        
        raise HTTPException(
            status_code=500,
            detail={"error": user_message, "code": error_code}
        )


@router.post("/merge-videos", response_model=VideoMergeResponse)
async def merge_videos(request: VideoMergeRequest):
    """Merge multiple videos into one"""
    try:
        config = request.config or MergeConfig()
        
        result = await VideoService.merge_videos(
            video_urls=request.video_urls,
            resolution=config.resolution,
            quality=config.quality
        )
        
        # Upload to Cloudinary
        cloudinary = CloudinaryService()
        
        timestamp = int(datetime.now().timestamp() * 1000)
        public_id = f"merged/merged-video-{timestamp}"
        
        upload_result = cloudinary.upload_video_bytes(
            video_bytes=result.buffer,
            public_id=public_id,
            folder="media-studio",
            tags=[f"workspace:{request.workspace_id}", "merged", "video-editor"]
        )
        
        # Get Cloudinary URL
        public_url = upload_result.get("secure_url")
        if not public_url:
            raise ValueError("Failed to get Cloudinary URL")
        
        tags = ["merged", "video-editor", "edited"]
        if result.is_vertical:
            tags.extend(["shorts", "vertical"])
        
        media_item = {
            "type": "video",
            "source": "edited",
            "url": public_url,
            "prompt": request.title or f"Merged video ({len(request.video_urls)} clips)",
            "model": "video-merge",
            "config": {
                "sourceVideos": request.video_urls,
                "mergedAt": datetime.now().isoformat(),
                "videoCount": len(request.video_urls),
                "resolution": f"{result.output_width}x{result.output_height}",
                "quality": config.quality,
                "isVertical": result.is_vertical,
                "totalDuration": result.total_duration,
                "cloudinaryPublicId": upload_result.get("public_id"),
            },
            "metadata": {
                "source": "video-editor",
                "clipCount": len(request.video_urls),
                "width": result.output_width,
                "height": result.output_height,
                "duration": result.total_duration,
                "isVertical": result.is_vertical,
                "audioNormalized": True,
                "cloudinaryPublicId": upload_result.get("public_id"),
                "cloudinaryFormat": upload_result.get("format"),
            },
            "tags": tags,
        }
        
        return VideoMergeResponse(
            success=True,
            url=public_url,
            clip_count=len(request.video_urls),
            total_duration=result.total_duration,
            is_vertical=result.is_vertical,
            media_item=media_item
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        error_message = str(e)
        user_message = "Failed to merge videos"
        error_code = "MERGE_ERROR"
        
        if "timed out" in error_message.lower():
            user_message = "Video processing timed out. Try with fewer clips."
            error_code = "TIMEOUT"
        elif "duration" in error_message.lower() or "5-minute" in error_message.lower():
            user_message = error_message
            error_code = "DURATION_LIMIT"
        elif "download" in error_message.lower():
            user_message = "Could not download one of the videos."
            error_code = "DOWNLOAD_FAILED"
        elif "ffmpeg" in error_message.lower():
            user_message = "Video processing failed. One clip may be corrupted."
            error_code = "PROCESSING_ERROR"
        
        raise HTTPException(
            status_code=500,
            detail={"error": user_message, "code": error_code}
        )


# ================== AUDIO ENDPOINTS ==================

@router.post("/process-audio", response_model=AudioProcessResponse)
async def process_audio(request: AudioProcessRequest):
    """Process video audio - add music, mute, adjust volume"""
    try:
        result = await AudioService.process_audio(
            video_url=request.video_url,
            mute_original=request.mute_original,
            background_music_url=request.background_music_url,
            original_volume=request.original_volume,
            music_volume=request.music_volume
        )
        
        # Upload to Cloudinary
        cloudinary = CloudinaryService()
        
        timestamp = int(datetime.now().timestamp() * 1000)
        public_id = f"processed/audio-remix-{timestamp}"
        
        upload_result = cloudinary.upload_video_bytes(
            video_bytes=result.buffer,
            public_id=public_id,
            folder="media-studio",
            tags=[f"workspace:{request.workspace_id}", "audio-remix", "edited"]
        )
        
        # Get Cloudinary URL
        public_url = upload_result.get("secure_url")
        if not public_url:
            raise ValueError("Failed to get Cloudinary URL")
        
        media_item = {
            "type": "video",
            "source": "edited",
            "url": public_url,
            "prompt": f"Audio Remix: {request.background_music_name or 'Custom Audio'}",
            "model": "ffmpeg-audio-processor",
            "config": {
                "sourceVideo": request.video_url,
                "backgroundMusicUrl": request.background_music_url,
                "muteOriginal": request.mute_original,
                "originalVolume": request.original_volume,
                "musicVolume": request.music_volume,
                "duration": result.duration,
                "cloudinaryPublicId": upload_result.get("public_id"),
            },
            "metadata": {
                "duration": result.duration,
                "hasBackgroundMusic": request.background_music_url is not None,
                "originalMuted": request.mute_original,
                "cloudinaryPublicId": upload_result.get("public_id"),
                "cloudinaryFormat": upload_result.get("format"),
            },
            "tags": ["edited", "audio-remix"],
        }
        
        return AudioProcessResponse(
            success=True,
            url=public_url,
            media_item=media_item
        )
        
    except Exception as e:
        error_message = str(e)
        raise HTTPException(
            status_code=500,
            detail={"error": error_message, "code": "AUDIO_PROCESS_ERROR"}
        )


# ================== LIBRARY ENDPOINTS ==================

@router.get("/library")
async def get_media_library(
    workspace_id: str,
    type: Optional[str] = None,
    source: Optional[str] = None,
    is_favorite: bool = False,
    folder: Optional[str] = None,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Get media library items with filters"""
    try:
        supabase = get_supabase_admin_client()
        
        # Build query
        query = supabase.table("media_library").select("*").eq("workspace_id", workspace_id)
        
        if type:
            query = query.eq("type", type)
        if source:
            query = query.eq("source", source)
        if is_favorite:
            query = query.eq("is_favorite", True)
        if folder:
            query = query.eq("folder", folder)
        if search:
            query = query.ilike("prompt", f"%{search}%")
        if tags:
            tag_list = tags.split(",")
            query = query.contains("tags", tag_list)
        
        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        
        result = query.execute()
        
        return {
            "items": result.data or [],
            "total": len(result.data or []),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch media items: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch media items: {str(e)}")


@router.post("/library")
async def create_media_item(payload: CreateMediaItemRequest, request: Request):
    """Create a new media item in the library"""
    try:
        # Verify JWT to get user ID
        auth_header = request.headers.get("authorization")
        user_id = None
        
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            jwt_result = await verify_jwt(token)
            logger.info(f"JWT Verification result: {jwt_result.get('success')}")
            if jwt_result.get("success") and jwt_result.get("user"):
                user_id = jwt_result["user"]["id"]
        
        logger.info(f"Auth Header Present: {bool(auth_header)}")
        logger.info(f"User ID from Token: {user_id}")
        logger.info(f"Payload keys: {plugin_keys if (plugin_keys := payload.media_item.keys()) else 'Empty'}")

        # If user_id provided in payload, prioritize that (fallback), otherwise use token
        if not user_id and "user_id" in payload.media_item:
            user_id = payload.media_item["user_id"]
            
        supabase = get_supabase_admin_client()
        
        if not user_id:
            logger.warning("No user_id found in token or payload, attempting fallback lookup via workspace_id")
            try:
                # Find any user in this workspace to attribute the media to
                u_res = supabase.table("users").select("id").eq("workspace_id", payload.workspace_id).limit(1).execute()
                if u_res.data:
                    user_id = u_res.data[0]["id"]
                    logger.info(f"Fallback user_id found: {user_id}")
            except Exception as e:
                logger.error(f"Fallback lookup failed: {e}")

        if not user_id:
            logger.error("Create media item failed: user_id is required but missing.")
            # We must fail if we can't find a user_id, as DB requires it
            raise HTTPException(status_code=400, detail="Missing user_id. Please log in again.")
        
        media_item = payload.media_item
        media_item["workspace_id"] = payload.workspace_id
        if user_id:
            media_item["user_id"] = user_id
            
        media_item["created_at"] = datetime.now().isoformat()
        media_item["updated_at"] = datetime.now().isoformat()
        
        logger.info(f"Creating media item: {media_item}")
        
        result = supabase.table("media_library").insert(media_item).execute()
        
        return {"success": True, "data": result.data[0] if result.data else None}
        
    except Exception as e:
        logger.error(f"Failed to create media item: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create media item: {str(e)}")


@router.patch("/library")
async def update_media_item(request: UpdateMediaItemRequest):
    """Update a media item"""
    try:
        supabase = get_supabase_admin_client()
        
        updates = request.updates
        updates["updated_at"] = datetime.now().isoformat()
        
        result = supabase.table("media_library").update(updates).eq(
            "id", request.media_id
        ).eq("workspace_id", request.workspace_id).execute()
        
        return {"success": True, "data": result.data[0] if result.data else None}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update media item")


@router.delete("/library")
async def delete_media_item(workspace_id: str, media_id: str):
    """Delete a media item"""
    try:
        supabase = get_supabase_admin_client()
        
        # Get the item first to find the file URL and Cloudinary public_id
        get_result = supabase.table("media_library").select("url, config, metadata").eq(
            "id", media_id
        ).eq("workspace_id", workspace_id).execute()
        
        if get_result.data and get_result.data[0]:
            item = get_result.data[0]
            url = item.get("url", "")
            config = item.get("config") or {}
            metadata = item.get("metadata") or {}
            
            # Try to get Cloudinary public_id from config or metadata
            cloudinary_public_id = config.get("cloudinaryPublicId") or metadata.get("cloudinaryPublicId")
            
            if cloudinary_public_id:
                # Delete from Cloudinary
                try:
                    cloudinary = CloudinaryService()
                    # Determine resource type from URL
                    resource_type = "video" if "/video/" in url else "image"
                    cloudinary.delete_media(cloudinary_public_id, resource_type=resource_type)
                    logger.info(f"Deleted Cloudinary asset: {cloudinary_public_id}")
                except Exception as cloud_err:
                    logger.warning(f"Failed to delete from Cloudinary: {cloud_err}")
                    # Continue even if Cloudinary delete fails
            elif "cloudinary.com" in url:
                # Try to extract public_id from Cloudinary URL
                try:
                    cloudinary = CloudinaryService()
                    # Determine resource type from URL
                    resource_type = "video" if "/video/" in url else "image"
                    # Extract public_id from URL (format: .../upload/vXXXX/folder/public_id.ext)
                    import re
                    match = re.search(r'/upload/(?:v\d+/)?(.+?)(?:\.[^.]+)?$', url)
                    if match:
                        extracted_public_id = match.group(1)
                        cloudinary.delete_media(extracted_public_id, resource_type=resource_type)
                        logger.info(f"Deleted Cloudinary asset from URL: {extracted_public_id}")
                except Exception as cloud_err:
                    logger.warning(f"Failed to delete from Cloudinary URL: {cloud_err}")
            # Note: Legacy Supabase storage URLs are no longer supported
            # All new media is stored in Cloudinary
        
        # Delete the database record
        supabase.table("media_library").delete().eq(
            "id", media_id
        ).eq("workspace_id", workspace_id).execute()
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Failed to delete media item: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete media item")


# ================== INFO ENDPOINT ==================

@router.get("/")
async def get_media_studio_info():
    """Get Media Studio service information"""
    return {
        "service": "Media Studio",
        "version": "1.0.0",
        "endpoints": {
            "resize-image": {
                "GET": "Get available image platform presets",
                "POST": "Resize an image for a platform"
            },
            "resize-video": {
                "GET": "Get available video platform presets",
                "POST": "Resize a video for a platform"
            },
            "merge-videos": {
                "POST": "Merge multiple videos into one"
            },
            "process-audio": {
                "POST": "Process video audio (add music, adjust volume)"
            },
            "library": {
                "GET": "Get media library items",
                "POST": "Create a media item",
                "PATCH": "Update a media item",
                "DELETE": "Delete a media item"
            }
        },
        "platform_presets": {
            "image": len(ImageService.get_presets()),
            "video": len(VideoService.get_presets())
        }
    }
