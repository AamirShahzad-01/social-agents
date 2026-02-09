"""
Kling Agent
Kling AI v2.6 Video Generation API

Production implementation for:
- Text-to-Video with native audio
- Image-to-Video with frame interpolation
- Motion Control for reference video transfer
- Video Extension for longer content
- Lip-Sync for audio synchronization
- Multi-Image to Video for keyframe animation

Per official Kling AI API documentation.
"""

from .schemas import (
    # Constants
    KLING_MODELS,
    KLING_ASPECT_RATIOS,
    KLING_DURATIONS,
    KLING_RESOLUTIONS,
    KLING_ORIENTATIONS,
    KLING_TASK_STATUSES,
    # Request schemas
    KlingTextToVideoRequest,
    KlingImageToVideoRequest,
    KlingMotionControlRequest,
    KlingVideoExtendRequest,
    KlingLipSyncRequest,
    KlingMultiImageRequest,
    KlingAvatarRequest,
    KlingTaskStatusRequest,
    # Response schemas
    KlingGenerationResponse,
    KlingTaskStatusResponse,
    KlingTaskData,
    KlingVideoData,
    KlingModelsResponse,
)

from .service import (
    text_to_video,
    image_to_video,
    motion_control,
    extend_video,
    lip_sync,
    multi_image_to_video,
    avatar_generation,
    get_task_status,
    get_models,
    close_client,
)

__all__ = [
    # Constants
    "KLING_MODELS",
    "KLING_ASPECT_RATIOS",
    "KLING_DURATIONS",
    "KLING_RESOLUTIONS",
    "KLING_ORIENTATIONS",
    "KLING_TASK_STATUSES",
    # Request schemas
    "KlingTextToVideoRequest",
    "KlingImageToVideoRequest",
    "KlingMotionControlRequest",
    "KlingVideoExtendRequest",
    "KlingLipSyncRequest",
    "KlingMultiImageRequest",
    "KlingAvatarRequest",
    "KlingTaskStatusRequest",
    # Response schemas
    "KlingGenerationResponse",
    "KlingTaskStatusResponse",
    "KlingTaskData",
    "KlingVideoData",
    "KlingModelsResponse",
    # Service functions
    "text_to_video",
    "image_to_video",
    "motion_control",
    "extend_video",
    "lip_sync",
    "multi_image_to_video",
    "avatar_generation",
    "get_task_status",
    "get_models",
    "close_client",
]
