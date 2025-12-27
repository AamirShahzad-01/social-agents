"""
Video Generation Service
Production implementation using Google Veo API via google-genai SDK
Supports: Text-to-video, Image-to-video, Video extension
"""
import logging
import time
import base64
from typing import Optional

from google import genai
from google.genai import types

from .schemas import (
    VideoGenerationRequest,
    VideoGenerationResponse,
    VideoStatusResponse,
    ImageToVideoRequest,
    VEO_MAX_PROMPT_TOKENS,
    validate_resolution_duration,
)
from ....config import settings

logger = logging.getLogger(__name__)

# Lazy client initialization
_genai_client: Optional[genai.Client] = None


def get_genai_client() -> genai.Client:
    """Get or create Google GenAI client"""
    global _genai_client
    
    if _genai_client is None:
        api_key = settings.gemini_key
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is not configured")
        _genai_client = genai.Client(api_key=api_key)
    
    return _genai_client


async def generate_video(request: VideoGenerationRequest) -> VideoGenerationResponse:
    """
    Generate video from text prompt using Google Veo API
    
    Returns an operation ID immediately - video generation is asynchronous.
    Use get_video_status() to poll for completion.
    
    Supports:
    - veo-3.1-generate-preview: Latest, best quality with native audio
    - veo-3.1-fast-preview: Faster generation
    - veo-3-generate-preview: High quality
    - veo-2-generate-preview: Previous generation
    
    Args:
        request: Video generation request
        
    Returns:
        VideoGenerationResponse with operation ID for polling
    """
    start_time = time.time()
    
    try:
        # Validate resolution/duration combination
        if request.resolution and request.duration:
            if not validate_resolution_duration(request.resolution, request.duration):
                return VideoGenerationResponse(
                    success=False,
                    error="1080p resolution is only available for 8 second videos"
                )
        
        # Validate prompt length
        estimated_tokens = len(request.prompt) // 4
        if estimated_tokens > VEO_MAX_PROMPT_TOKENS:
            return VideoGenerationResponse(
                success=False,
                error=f"Prompt exceeds maximum token limit of {VEO_MAX_PROMPT_TOKENS}"
            )
        
        client = get_genai_client()
        
        model = request.model or "veo-3.1-generate-preview"
        aspect_ratio = request.aspectRatio or "16:9"
        
        logger.info(f"Generating video with model={model}, aspect={aspect_ratio}")
        
        # Build config
        config = {
            "aspectRatio": aspect_ratio,
            "numberOfVideos": 1,
        }
        
        # Add optional parameters
        if request.personGeneration:
            config["personGeneration"] = request.personGeneration
        
        if request.negativePrompt:
            config["negativePrompt"] = request.negativePrompt
        
        if request.seed is not None:
            config["seed"] = request.seed
        
        # Start video generation - returns operation immediately
        operation = client.models.generate_videos(
            model=model,
            prompt=request.prompt,
            config=config,
        )
        
        # Extract operation ID
        operation_name = getattr(operation, "name", "") or ""
        operation_id = operation_name.split("/")[-1] if "/" in operation_name else operation_name
        
        generation_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Video generation started: operation={operation_id}")
        
        return VideoGenerationResponse(
            success=True,
            operationId=operation_id,
            operationName=operation_name,
            status="pending",
            generatedAt=int(time.time() * 1000),
            generationTime=generation_time
        )
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return VideoGenerationResponse(success=False, error=str(e))
    
    except Exception as e:
        logger.error(f"Video generation error: {e}", exc_info=True)
        return VideoGenerationResponse(success=False, error=str(e))


async def get_video_status(operation_name: str, upload_to_cloudinary: bool = True) -> VideoStatusResponse:
    """
    Get status of video generation operation
    
    Poll this endpoint to check if video is ready for download.
    When completed, optionally uploads to Cloudinary for permanent storage.
    
    Args:
        operation_name: Full operation name from generate_video response
        upload_to_cloudinary: Whether to upload completed video to Cloudinary
        
    Returns:
        VideoStatusResponse with current status and video URL if completed
    """
    try:
        client = get_genai_client()
        
        logger.info(f"Checking video status: {operation_name}")
        
        # Get operation status
        operation = client.operations.get(name=operation_name)
        
        if not operation.done:
            # Still processing
            return VideoStatusResponse(
                success=True,
                status="processing",
                progress=50.0  # Veo doesn't provide progress, estimate 50%
            )
        
        # Check for errors
        if hasattr(operation, "error") and operation.error:
            return VideoStatusResponse(
                success=False,
                status="failed",
                error=str(operation.error)
            )
        
        # Get video URL from response
        if hasattr(operation, "response") and operation.response:
            generated_videos = getattr(operation.response, "generated_videos", [])
            if generated_videos and len(generated_videos) > 0:
                video = generated_videos[0]
                video_file = getattr(video, "video", None)
                
                if video_file:
                    # Download and get URL
                    video_url = getattr(video_file, "uri", None) or str(video_file)
                    
                    logger.info(f"Video completed: {video_url}")
                    
                    # Optionally upload to Cloudinary for permanent storage
                    cloudinary_url = None
                    if upload_to_cloudinary:
                        try:
                            from src.services.cloudinary_service import CloudinaryService
                            import httpx
                            
                            # Download video from Google
                            async with httpx.AsyncClient(timeout=120.0) as http_client:
                                video_response = await http_client.get(video_url)
                                if video_response.status_code == 200:
                                    video_data = video_response.content
                                    
                                    # Upload to Cloudinary
                                    result = await CloudinaryService.upload_video(
                                        file_data=video_data,
                                        filename=f"veo_video_{operation_name.split('/')[-1]}.mp4",
                                        folder="veo-videos",
                                        tags=["veo", "generated", "video"],
                                    )
                                    
                                    if result.success:
                                        cloudinary_url = result.secure_url
                                        logger.info(f"Video uploaded to Cloudinary: {result.public_id}")
                                    else:
                                        logger.warning(f"Cloudinary upload failed: {result.error}")
                        except Exception as e:
                            logger.warning(f"Could not upload to Cloudinary: {e}")
                    
                    # Use Cloudinary URL if available, otherwise fallback to Google URL
                    final_url = cloudinary_url or video_url
                    
                    return VideoStatusResponse(
                        success=True,
                        status="completed",
                        progress=100.0,
                        videoUrl=final_url
                    )
        
        return VideoStatusResponse(
            success=True,
            status="completed",
            progress=100.0,
            error="Video generated but URL not available"
        )
        
    except Exception as e:
        logger.error(f"Video status error: {e}", exc_info=True)
        return VideoStatusResponse(
            success=False,
            status="failed",
            error=str(e)
        )


async def generate_image_to_video(request: ImageToVideoRequest) -> VideoGenerationResponse:
    """
    Generate video from image using Google Veo API
    
    Args:
        request: Image-to-video request with image and prompt
        
    Returns:
        VideoGenerationResponse with operation ID for polling
    """
    start_time = time.time()
    
    try:
        client = get_genai_client()
        
        model = request.model or "veo-3.1-generate-preview"
        aspect_ratio = request.aspectRatio or "16:9"
        
        logger.info(f"Generating video from image with model={model}")
        
        # Prepare image
        image_data = None
        if request.imageUrl.startswith("data:"):
            # Parse data URL
            header, b64_data = request.imageUrl.split(",", 1)
            mime_type = header.split(";")[0].split(":")[1] if ":" in header else "image/png"
            image_bytes = base64.b64decode(b64_data)
            image_data = types.Image(
                image_bytes=image_bytes,
                mime_type=mime_type
            )
        else:
            # Use URL directly
            image_data = types.Image(image_uri=request.imageUrl)
        
        # Build config
        config = {
            "aspectRatio": aspect_ratio,
            "numberOfVideos": 1,
        }
        
        # Start video generation with image
        operation = client.models.generate_videos(
            model=model,
            prompt=request.prompt,
            image=image_data,
            config=config,
        )
        
        # Extract operation ID
        operation_name = getattr(operation, "name", "") or ""
        operation_id = operation_name.split("/")[-1] if "/" in operation_name else operation_name
        
        generation_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Image-to-video started: operation={operation_id}")
        
        return VideoGenerationResponse(
            success=True,
            operationId=operation_id,
            operationName=operation_name,
            status="pending",
            generatedAt=int(time.time() * 1000),
            generationTime=generation_time
        )
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return VideoGenerationResponse(success=False, error=str(e))
    
    except Exception as e:
        logger.error(f"Image-to-video error: {e}", exc_info=True)
        return VideoGenerationResponse(success=False, error=str(e))
