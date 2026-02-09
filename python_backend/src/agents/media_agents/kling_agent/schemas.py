"""
Kling Agent Schemas
Kling AI v2.6 Video Generation API
Per official Kling AI API documentation: https://klingai.com
API Version: 2026-01
"""
from typing import Optional, Literal, List
from pydantic import BaseModel, Field


# ============================================================================
# CONSTANTS
# ============================================================================

# Kling v2.6 model variants (official API uses hyphen format)
KLING_MODELS = [
    "kling-v2-6-pro",       # 1080p, higher quality, longer processing
    "kling-v2-6-standard",  # 720p, faster generation
]

# Supported aspect ratios
KLING_ASPECT_RATIOS = ["16:9", "9:16", "1:1"]

# Video duration options (seconds)
KLING_DURATIONS = ["5", "10"]

# Resolution by mode
KLING_RESOLUTIONS = {
    "pro": "1080p",
    "standard": "720p",
}

# Motion control orientation options
KLING_ORIENTATIONS = ["video", "image"]

# Task status values
KLING_TASK_STATUSES = [
    "submitted",    # Task received
    "processing",   # Generation in progress
    "succeed",      # Completed successfully
    "failed",       # Generation failed
]


# ============================================================================
# REQUEST SCHEMAS
# ============================================================================

class KlingTextToVideoRequest(BaseModel):
    """
    Text-to-video generation request
    POST /v1/videos/text2video
    
    Kling v2.6 supports native audio generation with synchronized
    voices, ambient sounds, and emotional cues.
    """
    prompt: str = Field(
        ..., 
        min_length=1, 
        max_length=2500, 
        description="Video description prompt. For audio: include dialogue in quotes, describe sounds."
    )
    model: str = Field(
        default="kling-v2-6-pro",
        description="Model variant: kling-v2-6-pro (1080p) or kling-v2-6-standard (720p)"
    )
    duration: Literal["5", "10"] = Field(
        default="5",
        description="Video duration in seconds"
    )
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = Field(
        default="16:9",
        description="Video aspect ratio"
    )
    negative_prompt: Optional[str] = Field(
        default="blur, distort, low quality, watermark, text overlay",
        max_length=1000,
        description="Elements to avoid in generation"
    )
    cfg_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Classifier Free Guidance scale (0.0-1.0)"
    )
    enable_audio: bool = Field(
        default=True,
        description="Generate synchronized native audio (supports English and Chinese)"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for task completion notifications"
    )


class KlingImageToVideoRequest(BaseModel):
    """
    Image-to-video generation request
    POST /v1/videos/image2video
    
    Animate static images with optional first/last frame specification.
    Supports voice ID references for character-specific audio.
    """
    prompt: str = Field(
        ..., 
        min_length=1, 
        max_length=2500, 
        description="Animation description. Reference voices with <<<voice_1>>> and <<<voice_2>>>"
    )
    start_image_url: str = Field(
        ...,
        description="URL of image to use as first frame (HTTPS, max 10MB, min 300px)"
    )
    end_image_url: Optional[str] = Field(
        default=None,
        description="URL of image to use as last frame for interpolation"
    )
    model: str = Field(
        default="kling-v2-6-pro",
        description="Model variant"
    )
    duration: Literal["5", "10"] = Field(
        default="5",
        description="Video duration in seconds"
    )
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = Field(
        default="16:9",
        description="Video aspect ratio"
    )
    negative_prompt: Optional[str] = Field(
        default="blur, distort, low quality, watermark",
        max_length=1000,
        description="Elements to avoid"
    )
    enable_audio: bool = Field(
        default=True,
        description="Generate synchronized native audio"
    )
    voice_ids: Optional[List[str]] = Field(
        default=None,
        max_length=2,
        description="Voice IDs for character audio (max 2). Reference in prompt with <<<voice_1>>>"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notifications"
    )


class KlingMotionControlRequest(BaseModel):
    """
    Motion control video generation request
    POST /v1/videos/motion-brush
    
    Transfer motion from a reference video to a character image.
    Supports up to 30 seconds with video orientation, 10 seconds with image orientation.
    """
    prompt: Optional[str] = Field(
        default=None,
        max_length=2500,
        description="Optional prompt to control background and scene details"
    )
    reference_image_url: str = Field(
        ...,
        description="URL of character image (JPEG/PNG, max 10MB, min 300px, full body visible)"
    )
    motion_reference_video_url: str = Field(
        ...,
        description="URL of motion reference video (MP4/MOV, max 100MB, 3-30 seconds)"
    )
    model: str = Field(
        default="kling-v2-6-pro",
        description="Model variant"
    )
    character_orientation: Literal["video", "image"] = Field(
        default="video",
        description="'video': match reference video orientation (up to 30s), 'image': match image orientation (up to 10s)"
    )
    keep_original_sound: bool = Field(
        default=False,
        description="Retain original audio from reference video"
    )
    negative_prompt: Optional[str] = Field(
        default="blur, distort, low quality",
        description="Elements to avoid"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notifications"
    )


class KlingVideoExtendRequest(BaseModel):
    """
    Video extension request
    POST /v1/videos/video-extend
    
    Extend existing videos by 4-5 seconds per call.
    Maximum cumulative duration: 3 minutes.
    Source video must be from text2video, image2video, or previous extension.
    """
    video_id: str = Field(
        ...,
        description="Video ID to extend (from previous Kling generation)"
    )
    prompt: Optional[str] = Field(
        default=None,
        max_length=2500,
        description="Optional continuation prompt for extended segment"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notifications"
    )


class KlingLipSyncRequest(BaseModel):
    """
    Lip-sync video generation request
    POST /v1/videos/lipsync
    
    Synchronize mouth movements with provided audio.
    Video should have clear frontal face visible.
    """
    video_url: str = Field(
        ...,
        description="Video URL (2-60s, 720p-1080p, max 100MB)"
    )
    audio_url: str = Field(
        ...,
        description="Audio URL (MP3/WAV/M4A/AAC, max 5MB)"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notifications"
    )


class KlingMultiImageRequest(BaseModel):
    """
    Multi-image to video generation request
    POST /v1/videos/multi-image2video
    
    Create video from multiple input images with AI interpolation.
    Useful for slideshows, keyframe animations, and story sequences.
    """
    images: List[str] = Field(
        ...,
        min_length=2,
        max_length=8,
        description="List of image URLs (2-8 images, JPEG/PNG, max 10MB each)"
    )
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2500,
        description="Prompt describing desired transitions and motion"
    )
    model: str = Field(
        default="kling-v2-6-pro",
        description="Model variant: kling-v2-6-pro (1080p) or kling-v2-6-standard (720p)"
    )
    duration: Literal["5", "10"] = Field(
        default="5",
        description="Video duration in seconds"
    )
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = Field(
        default="16:9",
        description="Video aspect ratio"
    )
    negative_prompt: Optional[str] = Field(
        default="blur, distort, low quality",
        description="Elements to avoid"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notifications"
    )


class KlingAvatarRequest(BaseModel):
    """
    Avatar video generation request
    POST /v1/videos/avatar
    
    Create AI-generated talking head video from image + audio.
    Produces realistic lip-sync and facial expressions.
    """
    image_url: str = Field(
        ...,
        description="Portrait image URL (front-facing, clear face, JPEG/PNG, max 10MB)"
    )
    audio_url: str = Field(
        ...,
        description="Audio URL for speech (MP3/WAV/M4A/AAC, max 20MB)"
    )
    prompt: Optional[str] = Field(
        default=None,
        max_length=2500,
        description="Optional scene/style guidance for avatar behavior"
    )
    mode: Literal["std", "pro"] = Field(
        default="std",
        description="Quality mode: std (0.4/sec) or pro (0.8/sec)"
    )
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = Field(
        default="16:9",
        description="Video aspect ratio"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for completion notifications"
    )


class KlingTaskStatusRequest(BaseModel):
    """Request to check task status"""
    task_id: str = Field(..., description="Task ID from generation request")


# ============================================================================
# RESPONSE SCHEMAS
# ============================================================================

class KlingVideoData(BaseModel):
    """Video data from completed task"""
    id: str = Field(..., description="Video ID")
    url: str = Field(..., description="Video download URL")
    duration: Optional[float] = Field(None, description="Actual video duration in seconds")
    cover_url: Optional[str] = Field(None, description="Thumbnail/cover image URL")


class KlingTaskData(BaseModel):
    """Task data from Kling API"""
    task_id: str = Field(..., description="Unique task identifier")
    task_status: str = Field(..., description="Current status: submitted, processing, succeed, failed")
    task_status_msg: Optional[str] = Field(None, description="Status message or error details")
    created_at: Optional[int] = Field(None, description="Task creation timestamp (Unix)")
    updated_at: Optional[int] = Field(None, description="Last update timestamp (Unix)")
    videos: Optional[List[KlingVideoData]] = Field(None, description="Generated video data (on success)")


class KlingGenerationResponse(BaseModel):
    """Response from video generation start"""
    success: bool
    task_id: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class KlingTaskStatusResponse(BaseModel):
    """Response from task status check"""
    success: bool
    data: Optional[KlingTaskData] = None
    video_url: Optional[str] = Field(None, description="Direct video URL when complete")
    cover_url: Optional[str] = Field(None, description="Thumbnail URL when complete")
    progress: Optional[int] = Field(None, ge=0, le=100, description="Estimated progress percentage")
    error: Optional[str] = None


class KlingModelsResponse(BaseModel):
    """Response for available models endpoint"""
    success: bool = True
    models: List[str] = KLING_MODELS
    aspect_ratios: List[str] = KLING_ASPECT_RATIOS
    durations: List[str] = KLING_DURATIONS
    resolutions: dict = KLING_RESOLUTIONS
    orientations: List[str] = KLING_ORIENTATIONS
