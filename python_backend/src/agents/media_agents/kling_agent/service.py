"""
Kling Agent Service
Kling AI v2.6 Video Generation API - Production Implementation
Per official Kling AI API documentation: https://klingai.com

Supports:
- Text-to-Video with native audio generation
- Image-to-Video with frame interpolation
- Motion Control for motion transfer from reference videos
"""
import logging
import time
import jwt
import httpx
from typing import Optional

from .schemas import (
    KlingTextToVideoRequest,
    KlingImageToVideoRequest,
    KlingMotionControlRequest,
    KlingVideoExtendRequest,
    KlingLipSyncRequest,
    KlingMultiImageRequest,
    KlingAvatarRequest,
    KlingTaskStatusRequest,
    KlingGenerationResponse,
    KlingTaskStatusResponse,
    KlingTaskData,
    KlingVideoData,
    KlingModelsResponse,
    KLING_MODELS,
    KLING_ASPECT_RATIOS,
    KLING_DURATIONS,
    KLING_RESOLUTIONS,
    KLING_ORIENTATIONS,
)

from src.config.settings import settings

logger = logging.getLogger(__name__)

# Kling API configuration
KLING_BASE_URL = "https://api-singapore.klingai.com"
KLING_API_VERSION = "v1"
JWT_EXPIRY_SECONDS = 2800  # 30 minutes

# Lazy client initialization
_http_client: Optional[httpx.AsyncClient] = None
_jwt_token: Optional[str] = None
_jwt_expires_at: int = 0


# ============================================================================
# Authentication
# ============================================================================

def _get_credentials() -> tuple[str, str]:
    """Get Kling API credentials from settings"""
    ak = getattr(settings, 'KLING_ACCESS_KEY', None)
    sk = getattr(settings, 'KLING_SECRET_KEY', None)
    
    if not ak or not sk:
        raise ValueError(
            "Kling AI credentials not configured. "
            "Set KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables."
        )
    
    return ak, sk


def _generate_jwt_token() -> str:
    """
    Generate JWT token for Kling API authentication.
    Token expires in 30 minutes per API specification.
    """
    global _jwt_token, _jwt_expires_at
    
    current_time = int(time.time())
    
    # Return cached token if still valid (with 60s buffer)
    if _jwt_token and current_time < (_jwt_expires_at - 60):
        return _jwt_token
    
    ak, sk = _get_credentials()
    
    # JWT payload per Kling API specification
    payload = {
        "iss": ak,                              # Issuer: Access Key
        "exp": current_time + JWT_EXPIRY_SECONDS,  # Expiration
        "nbf": current_time - 5,                # Not before (5s buffer)
    }
    
    _jwt_token = jwt.encode(payload, sk, algorithm="HS256")
    _jwt_expires_at = current_time + JWT_EXPIRY_SECONDS
    
    logger.debug("Generated new Kling JWT token")
    return _jwt_token


def _get_headers() -> dict:
    """Get Kling API request headers with fresh JWT token"""
    token = _generate_jwt_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def get_http_client() -> httpx.AsyncClient:
    """Get or create async HTTP client with connection pooling"""
    global _http_client
    
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            base_url=KLING_BASE_URL,
            timeout=httpx.Timeout(60.0, connect=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    
    return _http_client


async def close_client():
    """Close the HTTP client (call on shutdown)"""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


# ============================================================================
# Text-to-Video
# ============================================================================

async def text_to_video(request: KlingTextToVideoRequest) -> KlingGenerationResponse:
    """
    Generate video from text prompt using Kling v2.6
    
    POST /v1/videos/text2video
    Returns task ID - poll get_task_status() for completion
    
    Args:
        request: Text-to-video generation parameters
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "model_name": request.model,
            "prompt": request.prompt,
            "duration": request.duration,
            "aspect_ratio": request.aspect_ratio,
            "cfg_scale": request.cfg_scale,
        }
        
        # Optional parameters
        if request.negative_prompt:
            payload["negative_prompt"] = request.negative_prompt
        
        if request.enable_audio:
            payload["enable_audio"] = True
        
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling text-to-video: model={request.model}, duration={request.duration}s")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/text2video",
            json=payload,
            headers=_get_headers(),
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            
            return KlingGenerationResponse(
                success=True,
                task_id=task_data.get("task_id"),
                status=task_data.get("task_status", "submitted"),
                message="Video generation started successfully",
            )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling text-to-video failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        # Credentials not configured
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling text-to-video error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))


# ============================================================================
# Image-to-Video
# ============================================================================

async def image_to_video(request: KlingImageToVideoRequest) -> KlingGenerationResponse:
    """
    Generate video with image as first frame using Kling v2.6
    
    POST /v1/videos/image2video
    Supports first/last frame specification and voice ID references
    
    Args:
        request: Image-to-video generation parameters
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "model_name": request.model,
            "prompt": request.prompt,
            "input_image": request.start_image_url,
            "duration": request.duration,
            "aspect_ratio": request.aspect_ratio,
        }
        
        # Optional end frame for interpolation
        if request.end_image_url:
            payload["tail_image"] = request.end_image_url
        
        # Optional parameters
        if request.negative_prompt:
            payload["negative_prompt"] = request.negative_prompt
        
        if request.enable_audio:
            payload["enable_audio"] = True
        
        # Voice IDs for character audio
        if request.voice_ids and len(request.voice_ids) > 0:
            payload["voice_ids"] = request.voice_ids
        
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling image-to-video: model={request.model}, duration={request.duration}s")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/image2video",
            json=payload,
            headers=_get_headers(),
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            
            return KlingGenerationResponse(
                success=True,
                task_id=task_data.get("task_id"),
                status=task_data.get("task_status", "submitted"),
                message="Image-to-video generation started",
            )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling image-to-video failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling image-to-video error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))


# ============================================================================
# Motion Control
# ============================================================================

async def motion_control(request: KlingMotionControlRequest) -> KlingGenerationResponse:
    """
    Transfer motion from reference video to character image using Kling v2.6
    
    POST /v1/videos/motion-brush
    Supports full-body motion transfer with up to 30 seconds duration
    
    Args:
        request: Motion control generation parameters
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "model_name": request.model,
            "input_image": request.reference_image_url,
            "input_video": request.motion_reference_video_url,
            "mode": request.character_orientation,  # 'video' or 'image'
        }
        
        # Optional prompt for scene control
        if request.prompt:
            payload["prompt"] = request.prompt
        
        if request.negative_prompt:
            payload["negative_prompt"] = request.negative_prompt
        
        # Preserve original audio from reference video
        if request.keep_original_sound:
            payload["keep_original_sound"] = True
        
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling motion control: model={request.model}, orientation={request.character_orientation}")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/motion-brush",
            json=payload,
            headers=_get_headers(),
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            
            return KlingGenerationResponse(
                success=True,
                task_id=task_data.get("task_id"),
                status=task_data.get("task_status", "submitted"),
                message="Motion control generation started",
            )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling motion control failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling motion control error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))


# ============================================================================
# Task Status Polling
# ============================================================================

async def get_task_status(request: KlingTaskStatusRequest) -> KlingTaskStatusResponse:
    """
    Get status of video generation task
    
    GET /v1/videos/tasks/{task_id}
    Poll every 8-10 seconds until status is 'succeed' or 'failed'
    
    Args:
        request: Task status request with task_id
        
    Returns:
        KlingTaskStatusResponse with current status and video URL when complete
    """
    try:
        client = await get_http_client()
        
        response = await client.get(
            f"/{KLING_API_VERSION}/videos/tasks/{request.task_id}",
            headers=_get_headers(),
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            
            # Parse task status
            status = task_data.get("task_status", "processing")
            videos = task_data.get("videos", [])
            
            # Extract video URL if available
            video_url = None
            cover_url = None
            if videos and len(videos) > 0:
                video_url = videos[0].get("url")
                cover_url = videos[0].get("cover_url")
            
            # Estimate progress based on status
            progress = 0
            if status == "submitted":
                progress = 10
            elif status == "processing":
                progress = 50
            elif status == "succeed":
                progress = 100
            elif status == "failed":
                progress = 0
            
            return KlingTaskStatusResponse(
                success=True,
                data=KlingTaskData(
                    task_id=request.task_id,
                    task_status=status,
                    task_status_msg=task_data.get("task_status_msg"),
                    created_at=task_data.get("created_at"),
                    updated_at=task_data.get("updated_at"),
                    videos=[
                        KlingVideoData(
                            id=v.get("id", ""),
                            url=v.get("url", ""),
                            duration=v.get("duration"),
                            cover_url=v.get("cover_url"),
                        )
                        for v in videos
                    ] if videos else None,
                ),
                video_url=video_url,
                cover_url=cover_url,
                progress=progress,
            )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling status check failed: {error_msg}")
            
            return KlingTaskStatusResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingTaskStatusResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingTaskStatusResponse(success=False, error="Request timeout")
    except Exception as e:
        logger.error(f"Kling status check error: {e}", exc_info=True)
        return KlingTaskStatusResponse(success=False, error=str(e))


# ============================================================================
# Models Information
# ============================================================================

def get_models() -> KlingModelsResponse:
    """Get available Kling models and configuration options"""
    return KlingModelsResponse(
        success=True,
        models=KLING_MODELS,
        aspect_ratios=KLING_ASPECT_RATIOS,
        durations=KLING_DURATIONS,
        resolutions=KLING_RESOLUTIONS,
        orientations=KLING_ORIENTATIONS,
    )


# ============================================================================
# Video Extension
# ============================================================================

async def extend_video(request: KlingVideoExtendRequest) -> KlingGenerationResponse:
    """
    Extend existing video by 4-5 seconds
    
    POST /v1/videos/video-extend
    Each extension adds ~4-5 seconds. Max cumulative duration: 3 minutes.
    Source video must be from text2video, image2video, or previous extension.
    
    Args:
        request: Video extension parameters with video_id
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "video_id": request.video_id,
        }
        
        # Optional continuation prompt
        if request.prompt:
            payload["prompt"] = request.prompt
        
        # Optional callback
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling video extend: video_id={request.video_id}")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/video-extend",
            headers=_get_headers(),
            json=payload,
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            task_id = task_data.get("task_id")
            
            if task_id:
                logger.info(f"Kling video extend started: task_id={task_id}")
                return KlingGenerationResponse(
                    success=True,
                    task_id=task_id,
                    status="submitted",
                    message="Video extension started - poll for completion",
                )
            else:
                return KlingGenerationResponse(
                    success=False,
                    error="No task_id returned from API",
                )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling video extend failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling video extend error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))


# ============================================================================
# Lip-Sync
# ============================================================================

async def lip_sync(request: KlingLipSyncRequest) -> KlingGenerationResponse:
    """
    Synchronize lip movements with audio
    
    POST /v1/videos/lipsync
    Video should have clear frontal face visible in most frames.
    
    Args:
        request: Lip-sync parameters with video_url and audio_url
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "video_url": request.video_url,
            "audio_url": request.audio_url,
        }
        
        # Optional callback
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling lip-sync: video={request.video_url[:50]}...")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/lipsync",
            headers=_get_headers(),
            json=payload,
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            task_id = task_data.get("task_id")
            
            if task_id:
                logger.info(f"Kling lip-sync started: task_id={task_id}")
                return KlingGenerationResponse(
                    success=True,
                    task_id=task_id,
                    status="submitted",
                    message="Lip-sync processing started - poll for completion",
                )
            else:
                return KlingGenerationResponse(
                    success=False,
                    error="No task_id returned from API",
                )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling lip-sync failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling lip-sync error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))


# ============================================================================
# Multi-Image to Video
# ============================================================================

async def multi_image_to_video(request: KlingMultiImageRequest) -> KlingGenerationResponse:
    """
    Generate video from multiple images
    
    POST /v1/videos/multi-image2video
    Create video with AI interpolation between keyframe images.
    
    Args:
        request: Multi-image parameters with list of image URLs
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "model_name": request.model,
            "images": request.images,
            "prompt": request.prompt,
            "duration": request.duration,
            "aspect_ratio": request.aspect_ratio,
        }
        
        # Optional negative prompt
        if request.negative_prompt:
            payload["negative_prompt"] = request.negative_prompt
        
        # Optional callback
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling multi-image: {len(request.images)} images, duration={request.duration}s")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/multi-image2video",
            headers=_get_headers(),
            json=payload,
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            task_id = task_data.get("task_id")
            
            if task_id:
                logger.info(f"Kling multi-image started: task_id={task_id}")
                return KlingGenerationResponse(
                    success=True,
                    task_id=task_id,
                    status="submitted",
                    message="Multi-image video generation started - poll for completion",
                )
            else:
                return KlingGenerationResponse(
                    success=False,
                    error="No task_id returned from API",
                )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling multi-image failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling multi-image error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))


async def avatar_generation(request: KlingAvatarRequest) -> KlingGenerationResponse:
    """
    Generate AI avatar video from image + audio
    
    Creates realistic talking head video with lip-sync and facial expressions.
    POST /v1/videos/avatar
    
    Pricing:
    - Standard (std): 0.4 credits per second
    - Professional (pro): 0.8 credits per second
    
    Args:
        request: KlingAvatarRequest with image_url, audio_url, prompt, mode, etc.
        
    Returns:
        KlingGenerationResponse with task_id for polling
    """
    try:
        client = await get_http_client()
        
        # Build request payload
        payload = {
            "image_url": request.image_url,
            "audio_url": request.audio_url,
            "mode": request.mode,
        }
        
        # Optional fields
        if request.prompt:
            payload["prompt"] = request.prompt
        
        if request.aspect_ratio:
            payload["aspect_ratio"] = request.aspect_ratio
        
        if request.callback_url:
            payload["callback_url"] = request.callback_url
        
        logger.info(f"Kling avatar: mode={request.mode}")
        
        response = await client.post(
            f"/{KLING_API_VERSION}/videos/avatar",
            headers=_get_headers(),
            json=payload,
        )
        
        if response.status_code == 200:
            data = response.json()
            task_data = data.get("data", {})
            task_id = task_data.get("task_id")
            
            if task_id:
                logger.info(f"Kling avatar started: task_id={task_id}")
                return KlingGenerationResponse(
                    success=True,
                    task_id=task_id,
                    status="submitted",
                    message="Avatar generation started - poll for completion",
                )
            else:
                return KlingGenerationResponse(
                    success=False,
                    error="No task_id returned from API",
                )
        else:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("message", f"API error: {response.status_code}")
            logger.error(f"Kling avatar failed: {error_msg}")
            
            return KlingGenerationResponse(
                success=False,
                error=error_msg,
            )
            
    except ValueError as e:
        return KlingGenerationResponse(success=False, error=str(e))
    except httpx.TimeoutException:
        return KlingGenerationResponse(success=False, error="Request timeout - please try again")
    except Exception as e:
        logger.error(f"Kling avatar error: {e}", exc_info=True)
        return KlingGenerationResponse(success=False, error=str(e))

