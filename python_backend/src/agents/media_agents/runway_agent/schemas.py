"""
Runway Agent Schemas
Runway Gen4 Alpha Video Generation API
Per Runway API documentation: https://docs.dev.runwayml.com/api
API Version: 2024-11-06
"""
from typing import Optional, Literal, List
from pydantic import BaseModel, Field


# ============================================================================
# TYPE DEFINITIONS
# ============================================================================

# Models available in Runway API
RunwayModel = Literal[
    "gen4_turbo",    # Image-to-video, fast generation
    "gen4_aleph",    # Video-to-video style transfer
    "veo3.1",        # Text-to-video
    "upscale_v1",    # Video upscaling (4x, max 4096px)
]


# ============================================================================
# COMMON SCHEMAS
# ============================================================================

class ContentModeration(BaseModel):
    """
    Content moderation settings per Runway API.
    When publicFigureThreshold is 'low', the system is less strict about
    preventing generations with recognizable public figures.
    """
    publicFigureThreshold: Optional[Literal["low"]] = None


class PromptImage(BaseModel):
    """
    Image input for image-to-video generation.
    Per API docs, promptImages is an array with position indicating frame placement.
    """
    uri: str = Field(..., description="HTTPS URL, Runway URI, or data URI of the image")
    position: Literal["first"] = Field("first", description="Position in video, 'first' uses image as first frame")

# Video ratio options per API docs
RunwayRatio = Literal[
    "1280:720",      # HD 16:9
    "1920:1080",     # Full HD 16:9
    "720:1280",      # HD 9:16 Portrait
    "1080:1920",     # Full HD 9:16 Portrait
]

# Video duration options (in seconds)
RunwayDuration = Literal[5, 10]

# Task status from Runway API
RunwayTaskStatus = Literal["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]


# ============================================================================
# REQUEST SCHEMAS
# ============================================================================

class RunwayTextToVideoRequest(BaseModel):
    """
    Text-to-video generation request
    POST /v1/text_to_video
    """
    prompt: str = Field(..., min_length=1, max_length=1000, description="Video description prompt")
    model: Optional[str] = Field("veo3.1", description="Model to use (veo3.1 for text-to-video)")
    ratio: Optional[str] = Field("1280:720", description="Output video resolution ratio")
    duration: Optional[int] = Field(8, description="Video duration in seconds (5-10)")
    audio: Optional[bool] = Field(False, description="Whether to generate audio")
    contentModeration: Optional[ContentModeration] = Field(None, description="Content moderation settings")


class RunwayImageToVideoRequest(BaseModel):
    """
    Image-to-video generation request
    POST /v1/image_to_video
    
    Supports both:
    - promptImage: Single image URL (legacy/convenience)
    - promptImages: Array of images with position (official API format)
    """
    prompt: str = Field(..., min_length=1, max_length=1000, description="Video description prompt")
    promptImage: Optional[str] = Field(None, description="Single image URL for first frame (legacy format)")
    promptImages: Optional[List[PromptImage]] = Field(None, description="Array of images with position (official API format)")
    model: Optional[str] = Field("gen4_turbo", description="Model to use")
    ratio: Optional[str] = Field("1280:720", description="Output video resolution ratio")
    duration: Optional[int] = Field(10, description="Video duration in seconds")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    contentModeration: Optional[ContentModeration] = Field(None, description="Content moderation settings")


class RunwayVideoToVideoRequest(BaseModel):
    """
    Video-to-video style transfer request
    POST /v1/video_to_video
    """
    prompt: str = Field(..., min_length=1, max_length=1000, description="Description of desired output")
    videoUri: str = Field(..., description="Source video URL or data URI")
    model: Optional[str] = Field("gen4_aleph", description="Model (must be gen4_aleph)")
    ratio: Optional[str] = Field("1280:720", description="Output video resolution ratio")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    referenceImageUri: Optional[str] = Field(None, description="Optional reference image for style")
    contentModeration: Optional[ContentModeration] = Field(None, description="Content moderation settings")


class RunwayUpscaleRequest(BaseModel):
    """
    Video upscale request
    POST /v1/video_upscale
    
    Upscales video by 4x, capped at 4096px per side.
    """
    model: str = Field("upscale_v1", description="Model (must be upscale_v1)")
    videoUri: str = Field(..., description="Video URL or data URI to upscale")


class RunwayTaskStatusRequest(BaseModel):
    """Request to check task status"""
    taskId: str = Field(..., description="Task ID from generation request")


# ============================================================================
# RESPONSE SCHEMAS
# ============================================================================

class RunwayTaskData(BaseModel):
    """Task data from Runway API"""
    id: str
    status: str
    createdAt: Optional[str] = None
    progress: Optional[float] = Field(None, ge=0, le=100)
    output: Optional[List[str]] = None
    failure: Optional[str] = None
    failureCode: Optional[str] = None


class RunwayGenerationResponse(BaseModel):
    """Response from video generation start"""
    success: bool
    taskId: Optional[str] = None
    status: Optional[str] = None
    data: Optional[RunwayTaskData] = None
    error: Optional[str] = None


class RunwayTaskStatusResponse(BaseModel):
    """Response from task status check"""
    success: bool
    data: Optional[RunwayTaskData] = None
    videoUrl: Optional[str] = None
    error: Optional[str] = None


# ============================================================================
# CONSTANTS FOR FRONTEND
# ============================================================================

RUNWAY_MODELS = [
    {
        "id": "gen4_turbo",
        "name": "Gen-4 Turbo",
        "description": "Fast image-to-video generation with high quality",
        "type": "image_to_video",
        "estimatedTime": "1-2 minutes"
    },
    {
        "id": "gen4_aleph",
        "name": "Gen-4 Aleph",
        "description": "Video-to-video style transfer and transformation",
        "type": "video_to_video",
        "estimatedTime": "2-3 minutes"
    },
    {
        "id": "veo3.1",
        "name": "Veo 3.1",
        "description": "Text-to-video generation with audio support",
        "type": "text_to_video",
        "estimatedTime": "2-4 minutes"
    },
    {
        "id": "upscale_v1",
        "name": "Upscale V1",
        "description": "4x video upscaling (max 4096px per side)",
        "type": "upscale",
        "estimatedTime": "1-2 minutes"
    },
]

RUNWAY_RATIOS = [
    {"value": "1280:720", "label": "HD 16:9 (1280×720)", "aspect": "16:9"},
    {"value": "1920:1080", "label": "Full HD 16:9 (1920×1080)", "aspect": "16:9"},
    {"value": "720:1280", "label": "HD 9:16 Portrait (720×1280)", "aspect": "9:16"},
    {"value": "1080:1920", "label": "Full HD 9:16 Portrait (1080×1920)", "aspect": "9:16"},
]

RUNWAY_DURATIONS = [
    {"value": 5, "label": "5 seconds", "description": "Quick clip"},
    {"value": 8, "label": "8 seconds", "description": "Standard length"},
    {"value": 10, "label": "10 seconds", "description": "Extended clip"},
]

RUNWAY_GENERATION_MODES = [
    {"id": "text", "name": "Text to Video", "description": "Generate video from text prompt"},
    {"id": "image", "name": "Image to Video", "description": "Animate an image into video"},
    {"id": "video", "name": "Video to Video", "description": "Transform video with style transfer"},
    {"id": "upscale", "name": "Upscale Video", "description": "Enhance video resolution"},
]
