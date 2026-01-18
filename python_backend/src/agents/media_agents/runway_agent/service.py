"""
Runway Agent Service
Runway Gen4 Alpha Video Generation API - Production Implementation
Per Runway API documentation: https://docs.dev.runwayml.com/api
"""
import logging
import base64
import httpx
from typing import Optional

from .schemas import (
    RunwayTextToVideoRequest,
    RunwayImageToVideoRequest,
    RunwayVideoToVideoRequest,
    RunwayUpscaleRequest,
    RunwayTaskStatusRequest,
    RunwayGenerationResponse,
    RunwayTaskStatusResponse,
    RunwayTaskData,
)
from ....config import settings

logger = logging.getLogger(__name__)

# Runway API configuration
RUNWAY_BASE_URL = "https://api.dev.runwayml.com"
RUNWAY_API_VERSION = "2024-11-06"

# Lazy client initialization
_http_client: Optional[httpx.AsyncClient] = None


def get_runway_headers() -> dict:
    """Get Runway API request headers"""
    api_key = getattr(settings, 'RUNWAY_API_KEY', None)
    if not api_key:
        raise ValueError("RUNWAY_API_KEY is not configured")
    
    return {
        "Authorization": f"Bearer {api_key}",
        "X-Runway-Version": RUNWAY_API_VERSION,
        "Content-Type": "application/json",
    }


async def get_http_client() -> httpx.AsyncClient:
    """Get or create async HTTP client"""
    global _http_client
    
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            base_url=RUNWAY_BASE_URL,
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
    
    return _http_client


async def close_client():
    """Close the HTTP client (call on shutdown)"""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# ============================================================================
# Text-to-Video
# ============================================================================

async def text_to_video(request: RunwayTextToVideoRequest) -> RunwayGenerationResponse:
    """
    Generate video from text prompt using Runway API
    
    POST /v1/text_to_video
    Returns task ID - poll get_task_status() for completion
    """
    try:
        client = await get_http_client()
        headers = get_runway_headers()
        
        logger.info(f"Starting Runway text-to-video: model={request.model}, ratio={request.ratio}")
        
        payload = {
            "model": request.model or "veo3.1",
            "promptText": request.prompt,
            "ratio": request.ratio or "1280:720",
            "duration": request.duration or 8,
        }
        
        # Add audio if enabled
        if request.audio:
            payload["audio"] = True
        
        # Add content moderation if provided
        if request.contentModeration:
            payload["contentModeration"] = request.contentModeration.model_dump(exclude_none=True)
        
        response = await client.post("/v1/text_to_video", json=payload, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        task_id = data.get("id")
        
        logger.info(f"Runway text-to-video task started: id={task_id}")
        
        return RunwayGenerationResponse(
            success=True,
            taskId=task_id,
            status="PENDING",
            data=RunwayTaskData(
                id=task_id,
                status="PENDING",
            )
        )
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Runway API HTTP error: {e.response.status_code} - {e.response.text}")
        error_msg = f"API error: {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_msg = error_data.get("error", error_msg)
        except:
            pass
        return RunwayGenerationResponse(success=False, error=error_msg)
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return RunwayGenerationResponse(success=False, error=str(e))
        
    except Exception as e:
        logger.error(f"Runway text-to-video error: {e}", exc_info=True)
        return RunwayGenerationResponse(success=False, error=str(e))


# ============================================================================
# Image-to-Video
# ============================================================================

async def image_to_video(request: RunwayImageToVideoRequest) -> RunwayGenerationResponse:
    """
    Generate video with image as first frame
    
    POST /v1/image_to_video
    Supports both promptImage (legacy) and promptImages (official API format)
    """
    try:
        client = await get_http_client()
        headers = get_runway_headers()
        
        logger.info(f"Starting Runway image-to-video: model={request.model}")
        
        payload = {
            "model": request.model or "gen4_turbo",
            "promptText": request.prompt,
            "ratio": request.ratio or "1280:720",
            "duration": request.duration or 10,
        }
        
        # Support both promptImages array (official) and promptImage (legacy)
        if request.promptImages:
            # Official API format: array of images with position
            payload["promptImages"] = [
                {"uri": img.uri, "position": img.position} 
                for img in request.promptImages
            ]
        elif request.promptImage:
            # Legacy format: single image URL
            payload["promptImage"] = request.promptImage
        else:
            return RunwayGenerationResponse(success=False, error="Either promptImage or promptImages is required")
        
        # Add seed if provided
        if request.seed is not None:
            payload["seed"] = request.seed
        
        # Add content moderation if provided
        if request.contentModeration:
            payload["contentModeration"] = request.contentModeration.model_dump(exclude_none=True)
        
        response = await client.post("/v1/image_to_video", json=payload, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        task_id = data.get("id")
        
        logger.info(f"Runway image-to-video task started: id={task_id}")
        
        return RunwayGenerationResponse(
            success=True,
            taskId=task_id,
            status="PENDING",
            data=RunwayTaskData(
                id=task_id,
                status="PENDING",
            )
        )
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Runway API HTTP error: {e.response.status_code} - {e.response.text}")
        error_msg = f"API error: {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_msg = error_data.get("error", error_msg)
        except:
            pass
        return RunwayGenerationResponse(success=False, error=error_msg)
        
    except Exception as e:
        logger.error(f"Runway image-to-video error: {e}", exc_info=True)
        return RunwayGenerationResponse(success=False, error=str(e))


# ============================================================================
# Video-to-Video (Style Transfer)
# ============================================================================

async def video_to_video(request: RunwayVideoToVideoRequest) -> RunwayGenerationResponse:
    """
    Transform video with style transfer
    
    POST /v1/video_to_video
    Uses gen4_aleph model
    """
    try:
        client = await get_http_client()
        headers = get_runway_headers()
        
        logger.info(f"Starting Runway video-to-video: model={request.model}")
        
        payload = {
            "model": request.model or "gen4_aleph",
            "videoUri": request.videoUri,
            "promptText": request.prompt,
            "ratio": request.ratio or "1280:720",
        }
        
        # Add seed if provided
        if request.seed is not None:
            payload["seed"] = request.seed
        
        # Add reference image if provided
        if request.referenceImageUri:
            payload["references"] = [{
                "type": "image",
                "uri": request.referenceImageUri
            }]
        
        # Add content moderation if provided
        if request.contentModeration:
            payload["contentModeration"] = request.contentModeration.model_dump(exclude_none=True)
        
        response = await client.post("/v1/video_to_video", json=payload, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        task_id = data.get("id")
        
        logger.info(f"Runway video-to-video task started: id={task_id}")
        
        return RunwayGenerationResponse(
            success=True,
            taskId=task_id,
            status="PENDING",
            data=RunwayTaskData(
                id=task_id,
                status="PENDING",
            )
        )
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Runway API HTTP error: {e.response.status_code} - {e.response.text}")
        error_msg = f"API error: {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_msg = error_data.get("error", error_msg)
        except:
            pass
        return RunwayGenerationResponse(success=False, error=error_msg)
        
    except Exception as e:
        logger.error(f"Runway video-to-video error: {e}", exc_info=True)
        return RunwayGenerationResponse(success=False, error=str(e))


# ============================================================================
# Video Upscale
# ============================================================================

async def upscale_video(request: RunwayUpscaleRequest) -> RunwayGenerationResponse:
    """
    Upscale video resolution
    
    POST /v1/video_upscale
    Upscales by 4x, max 4096px per side
    """
    try:
        client = await get_http_client()
        headers = get_runway_headers()
        
        logger.info(f"Starting Runway video upscale")
        
        payload = {
            "model": request.model or "upscale_v1",  # Required by API
            "videoUri": request.videoUri,
        }
        
        response = await client.post("/v1/video_upscale", json=payload, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        task_id = data.get("id")
        
        logger.info(f"Runway video upscale task started: id={task_id}")
        
        return RunwayGenerationResponse(
            success=True,
            taskId=task_id,
            status="PENDING",
            data=RunwayTaskData(
                id=task_id,
                status="PENDING",
            )
        )
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Runway API HTTP error: {e.response.status_code} - {e.response.text}")
        error_msg = f"API error: {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_msg = error_data.get("error", error_msg)
        except:
            pass
        return RunwayGenerationResponse(success=False, error=error_msg)
        
    except Exception as e:
        logger.error(f"Runway video upscale error: {e}", exc_info=True)
        return RunwayGenerationResponse(success=False, error=str(e))


# ============================================================================
# Task Status Polling
# ============================================================================

async def get_task_status(request: RunwayTaskStatusRequest) -> RunwayTaskStatusResponse:
    """
    Get status of video generation task
    
    GET /v1/tasks/{id}
    Poll every 5 seconds until status is SUCCEEDED or FAILED
    """
    try:
        client = await get_http_client()
        headers = get_runway_headers()
        
        logger.info(f"Checking Runway task status: {request.taskId}")
        
        response = await client.get(f"/v1/tasks/{request.taskId}", headers=headers)
        response.raise_for_status()
        
        data = response.json()
        
        status = data.get("status", "PENDING")
        output = data.get("output", [])
        failure = data.get("failure")
        failure_code = data.get("failureCode")
        progress = data.get("progress", 0)
        
        # Extract video URL if completed
        video_url = None
        if status == "SUCCEEDED" and output:
            video_url = output[0] if isinstance(output, list) else output
        
        logger.info(f"Runway task status: {status}, progress: {progress}%")
        
        task_data = RunwayTaskData(
            id=request.taskId,
            status=status,
            progress=progress,
            output=output if isinstance(output, list) else [output] if output else None,
            failure=failure,
            failureCode=failure_code,
            createdAt=data.get("createdAt"),
        )
        
        return RunwayTaskStatusResponse(
            success=True,
            data=task_data,
            videoUrl=video_url,
        )
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Runway API HTTP error: {e.response.status_code} - {e.response.text}")
        if e.response.status_code == 404:
            return RunwayTaskStatusResponse(success=False, error="Task not found or was deleted")
        error_msg = f"API error: {e.response.status_code}"
        return RunwayTaskStatusResponse(success=False, error=error_msg)
        
    except Exception as e:
        logger.error(f"Runway task status error: {e}", exc_info=True)
        return RunwayTaskStatusResponse(success=False, error=str(e))


# ============================================================================
# Delete Task
# ============================================================================

async def delete_task(task_id: str) -> dict:
    """
    Cancel or delete a task
    
    DELETE /v1/tasks/{id}
    """
    try:
        client = await get_http_client()
        headers = get_runway_headers()
        
        response = await client.delete(f"/v1/tasks/{task_id}", headers=headers)
        response.raise_for_status()
        
        logger.info(f"Runway task deleted: {task_id}")
        
        return {"success": True, "deleted": task_id}
        
    except Exception as e:
        logger.error(f"Runway delete task error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
