"""
Video Agent Schemas - Veo 3.1
Pydantic models for Google Veo video generation per latest docs
"""
from typing import Optional, Literal, List
from pydantic import BaseModel, Field


# ============================================================================
# Veo Type Definitions per docs
# ============================================================================

VeoModel = Literal[
    "veo-3.1-generate-preview",
    "veo-3.1-fast-preview", 
]

VeoAspectRatio = Literal["16:9", "9:16"]
VeoResolution = Literal["720p", "1080p", "4k"]
VeoDuration = Literal[4, 6, 8]  # Veo 3.1 supports 4, 6, 8 seconds
VeoPersonGeneration = Literal["allow_all", "allow_adult", "dont_allow"]
VeoReferenceType = Literal["asset", "style"]  # For reference images


# ============================================================================
# Text-to-Video Request
# ============================================================================

class VideoGenerationRequest(BaseModel):
    """Request for text-to-video generation"""
    prompt: str = Field(..., min_length=1, max_length=4000, description="Video prompt (max ~1024 tokens)")
    model: Optional[VeoModel] = Field("veo-3.1-generate-preview", description="Veo model")
    aspectRatio: Optional[VeoAspectRatio] = Field("16:9", description="16:9 or 9:16")
    resolution: Optional[VeoResolution] = Field("720p", description="720p, 1080p, or 4k (1080p and 4k only for 8s)")
    durationSeconds: Optional[VeoDuration] = Field(8, description="4, 6, or 8 seconds")
    personGeneration: Optional[VeoPersonGeneration] = Field(None, description="Person generation control")
    negativePrompt: Optional[str] = Field(None, description="What to avoid")
    seed: Optional[int] = Field(None, description="Seed for reproducibility (Veo 3.1 only)")


# ============================================================================
# Image-to-Video Request (first frame)
# ============================================================================

class ImageToVideoRequest(BaseModel):
    """Generate video with image as first frame"""
    prompt: str = Field(..., min_length=1, max_length=4000, description="Video prompt")
    imageUrl: str = Field(..., description="Image URL or base64 data URL")
    model: Optional[VeoModel] = Field("veo-3.1-generate-preview", description="Veo model")
    aspectRatio: Optional[VeoAspectRatio] = Field("16:9", description="Aspect ratio")
    resolution: Optional[VeoResolution] = Field("720p", description="720p, 1080p, or 4k (1080p and 4k only for 8s)")
    durationSeconds: Optional[VeoDuration] = Field(8, description="Duration in seconds")
    personGeneration: Optional[VeoPersonGeneration] = Field("allow_adult", description="Required for image-to-video")


# ============================================================================
# Frame-Specific (Interpolation) Request - Veo 3.1 only
# ============================================================================

class FrameSpecificRequest(BaseModel):
    """Generate video by specifying first and last frames (interpolation)"""
    prompt: Optional[str] = Field(None, description="Optional prompt for guidance")
    firstImageUrl: str = Field(..., description="First frame image URL or base64")
    lastImageUrl: str = Field(..., description="Last frame image URL or base64")
    model: Optional[VeoModel] = Field("veo-3.1-generate-preview", description="Veo 3.1 required")
    aspectRatio: Optional[VeoAspectRatio] = Field("16:9", description="Aspect ratio")
    durationSeconds: Optional[VeoDuration] = Field(8, description="Must be 8 for interpolation")
    personGeneration: Optional[VeoPersonGeneration] = Field("allow_adult", description="Required")


# ============================================================================
# Reference Images Request - Veo 3.1 only
# ============================================================================

class ReferenceImage(BaseModel):
    """Single reference image with type"""
    imageUrl: str = Field(..., description="Image URL or base64")
    referenceType: VeoReferenceType = Field("asset", description="asset=preserve subject, style=style guidance")


class ReferenceImagesRequest(BaseModel):
    """Generate video using 1-3 reference images for content guidance"""
    prompt: str = Field(..., min_length=1, max_length=4000, description="Video prompt")
    referenceImages: List[ReferenceImage] = Field(..., min_length=1, max_length=3, description="1-3 reference images")
    model: Optional[VeoModel] = Field("veo-3.1-generate-preview", description="Veo 3.1 required")
    aspectRatio: Optional[VeoAspectRatio] = Field("16:9", description="Must be 16:9 for reference images")
    durationSeconds: Optional[VeoDuration] = Field(8, description="Must be 8 for reference images")
    personGeneration: Optional[VeoPersonGeneration] = Field("allow_adult", description="Required")


# ============================================================================
# Video Extension Request - Veo 3.1 only
# ============================================================================

class VideoExtendRequest(BaseModel):
    """Extend a Veo-generated video by 7 seconds (up to 20 times)"""
    veoVideoId: str = Field(..., description="Video ID from previous generation (NOT URL)")
    prompt: Optional[str] = Field(None, description="Optional prompt for extension direction")
    model: Optional[VeoModel] = Field("veo-3.1-generate-preview", description="Veo 3.1 required")
    resolution: Optional[VeoResolution] = Field("720p", description="720p only for extension")


# ============================================================================
# Status & Download Requests
# ============================================================================

class VideoStatusRequest(BaseModel):
    """Request for video status check"""
    operationId: str = Field(..., description="Operation ID")
    operationName: str = Field(..., description="Full operation name")


class VideoDownloadRequest(BaseModel):
    """Request to download completed video"""
    veoVideoId: str = Field(..., description="Video ID from response")
    operationId: Optional[str] = Field(None, description="Operation ID for naming")
    uploadToSupabase: Optional[bool] = Field(True, description="Upload to Supabase storage")


# ============================================================================
# Response Schemas
# ============================================================================

class VideoGenerationResponse(BaseModel):
    """Response from video generation start"""
    success: bool
    operationId: Optional[str] = Field(None, description="Operation ID for polling")
    operationName: Optional[str] = Field(None, description="Full operation name")
    status: Optional[Literal["pending", "processing", "completed", "failed"]] = None
    error: Optional[str] = None


class VideoData(BaseModel):
    """Video data from completed generation"""
    veoVideoId: str = Field(..., description="Video ID for extensions")
    url: Optional[str] = Field(None, description="Video URL")


class VideoStatusResponse(BaseModel):
    """Response from video status check"""
    success: bool
    done: bool = Field(False, description="Whether operation is complete")
    status: Literal["pending", "processing", "completed", "failed"]
    progress: Optional[float] = Field(None, description="Progress 0-100")
    video: Optional[VideoData] = Field(None, description="Video data when completed")
    error: Optional[str] = None


class VideoDownloadResponse(BaseModel):
    """Response from video download"""
    success: bool
    url: Optional[str] = Field(None, description="Permanent video URL")
    error: Optional[str] = None


# ============================================================================
# Constants
# ============================================================================

VEO_MODELS = [
    {"id": "veo-3.1-generate-preview", "name": "Veo 3.1", "description": "Latest with native audio", "audio": True},
    {"id": "veo-3.1-fast-preview", "name": "Veo 3.1 Fast", "description": "Faster, good quality", "audio": True},
]

VEO_ASPECT_RATIOS = [
    {"id": "16:9", "name": "Landscape (16:9)"},
    {"id": "9:16", "name": "Portrait (9:16)"},
]

VEO_DURATIONS = [
    {"value": 4, "label": "4 seconds"},
    {"value": 6, "label": "6 seconds"},
    {"value": 8, "label": "8 seconds"},
]

VEO_RESOLUTIONS = [
    {"id": "720p", "name": "720p", "description": "All durations"},
    {"id": "1080p", "name": "1080p", "description": "8 seconds only"},
    {"id": "4k", "name": "4K", "description": "8 seconds only"},
]


def validate_veo_config(resolution: str, duration: int, model: str = None) -> tuple[bool, str]:
    """Validate Veo configuration combinations"""
    # 1080p and 4k only with 8 seconds
    if resolution == "1080p" and duration != 8:
        return False, "1080p resolution only available for 8 second videos"
    if resolution == "4k" and duration != 8:
        return False, "4K resolution only available for 8 second videos"
    
    return True, ""

