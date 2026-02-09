"""
Media API Routes
Endpoints for image, audio, and video generation
"""
import logging
from fastapi import APIRouter, HTTPException

from ...agents.media_agents.image_agent import (
    generate_image,
    generate_image_edit,
    generate_image_reference,
    FrontendImageRequest,
    ImageEditRequest,
    ImageReferenceRequest,
    ImageGenerationResponse,
)
from ...agents.media_agents.audio_agent import (
    generate_speech,
    generate_music,
    generate_sound_effects,
    get_voices,
    clone_voice,
    design_voice,
    save_designed_voice,
    generate_dialog,
    TTSRequest,
    TTSResponse,
    MusicRequest,
    MusicResponse,
    SoundEffectsRequest,
    SoundEffectsResponse,
    VoiceCloningRequest,
    VoiceCloningResponse,
    VoiceDesignRequest,
    VoiceDesignResponse,
    DialogRequest,
    DialogResponse,
    VoicesResponse,
    TTS_MODELS,
    OUTPUT_FORMATS,
)
from ...agents.media_agents.video_agent import (
    generate_video,
    get_video_status,
    generate_image_to_video,
    generate_frame_specific,
    generate_with_references,
    extend_video,
    download_video,
    VideoGenerationRequest,
    VideoGenerationResponse,
    VideoStatusRequest,
    VideoStatusResponse,
    VideoDownloadRequest,
    VideoDownloadResponse,
    ImageToVideoRequest,
    FrameSpecificRequest,
    ReferenceImagesRequest,
    VideoExtendRequest,
    VEO_MODELS,
)
from ...agents.media_agents.gemini_image_agent import (
    generate_image as gemini_generate_image,
    edit_image as gemini_edit_image,
    multi_turn_edit as gemini_multi_turn_edit,
    GeminiImageGenerateRequest,
    GeminiImageEditRequest,
    GeminiMultiTurnRequest,
    GeminiImageResponse,
)
from ...agents.media_agents.sora_agent import (
    generate_video as sora_generate_video,
    generate_image_to_video as sora_image_to_video,
    remix_video as sora_remix_video,
    get_video_status as sora_get_status,
    fetch_video_content as sora_fetch_content,
    list_videos as sora_list_videos,
    delete_video as sora_delete_video,
    SoraGenerateRequest,
    SoraImageToVideoRequest,
    SoraRemixRequest,
    SoraStatusRequest,
    SoraFetchRequest,
    SoraGenerateResponse,
    SoraStatusResponse,
    SoraFetchResponse,
    SORA_MODELS,
)
from ...agents.media_agents.runway_agent import (
    text_to_video as runway_text_to_video,
    image_to_video as runway_image_to_video,
    video_to_video as runway_video_to_video,
    upscale_video as runway_upscale_video,
    get_task_status as runway_get_task_status,
    delete_task as runway_delete_task,
    RunwayTextToVideoRequest,
    RunwayImageToVideoRequest,
    RunwayVideoToVideoRequest,
    RunwayUpscaleRequest,
    RunwayTaskStatusRequest,
    RunwayGenerationResponse,
    RunwayTaskStatusResponse,
    RUNWAY_MODELS,
    RUNWAY_RATIOS,
    RUNWAY_DURATIONS,
    RUNWAY_GENERATION_MODES,
)
from ...agents.media_agents.kling_agent import (
    text_to_video as kling_text_to_video,
    image_to_video as kling_image_to_video,
    motion_control as kling_motion_control,
    extend_video as kling_extend_video,
    lip_sync as kling_lip_sync,
    multi_image_to_video as kling_multi_image_to_video,
    avatar_generation as kling_avatar_generation,
    get_task_status as kling_get_task_status,
    get_models as kling_get_models,
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
    KLING_MODELS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/media", tags=["Media Generation"])


def parse_media_error(error: Exception) -> str:
    """
    Parse media generation errors into user-friendly messages.
    
    Args:
        error: The exception from media generation
        
    Returns:
        User-friendly error message string
    """
    error_msg = str(error).lower()
    error_str = str(error)
    
    # Rate limit / quota errors
    if "rate" in error_msg and "limit" in error_msg:
        return "Rate limit exceeded. Please wait a moment and try again."
    
    if "quota" in error_msg or "exceeded" in error_msg:
        return "API quota exceeded. Please check your API plan and billing details."
    
    if "insufficient" in error_msg:
        return "Insufficient quota. Please add credits to your account."
    
    # Authentication errors
    if "api_key" in error_msg or "apikey" in error_msg:
        return "Invalid API key. Please check your API configuration."
    
    if "unauthorized" in error_msg or "401" in error_str:
        return "API authentication failed. Please verify your API key."
    
    if "forbidden" in error_msg or "403" in error_str:
        return "Access forbidden. Your API key may lack permissions for this operation."
    
    # Content policy / safety errors
    if "safety" in error_msg or "blocked" in error_msg or "moderation" in error_msg:
        return "Content blocked by safety filters. Please modify your prompt."
    
    if "content_policy" in error_msg:
        return "Content blocked by policy. Please try a different prompt."
    
    # Model/service errors
    if "model" in error_msg and ("not found" in error_msg or "does not exist" in error_msg):
        return "The requested model is currently unavailable. Please try again later."
    
    if "overloaded" in error_msg or "capacity" in error_msg:
        return "Service is currently overloaded. Please try again in a few moments."
    
    # Network/connection errors
    if "connection" in error_msg or "timeout" in error_msg:
        return "Connection error. Please check your internet and try again."
    
    # File/format errors
    if "format" in error_msg and ("invalid" in error_msg or "unsupported" in error_msg):
        return "Unsupported file format. Please use a supported format."
    
    if "size" in error_msg and ("too large" in error_msg or "exceeds" in error_msg):
        return "File size too large. Please use a smaller file."
    
    # Default: truncate long messages
    if len(error_str) > 150:
        return f"Media generation error: {error_str[:150]}..."
    return f"Media generation error: {error_str}"


# ============================================================================
# IMAGE ENDPOINTS
# ============================================================================

@router.post("/image/generate", response_model=ImageGenerationResponse)
async def api_generate_image(request: FrontendImageRequest):
    """
    Generate image from text prompt using gpt-image-1.5
    
    Request format: { prompt, options: { model, size, quality, ... } }
    Response format: { success, data: { imageUrl, metadata } }
    """
    try:
        logger.info(f"Image generation request: {request.prompt[:50]}...")
        result = await generate_image(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))


@router.post("/image/edit", response_model=ImageGenerationResponse)
async def api_edit_image(request: ImageEditRequest):
    """
    Edit image with mask (inpainting)
    
    Provide original image, mask, and edit prompt
    """
    try:
        logger.info(f"Image edit request: {request.prompt[:50]}...")
        result = await generate_image_edit(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image edit error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))





@router.post("/image/inpaint", response_model=ImageGenerationResponse)
async def api_inpaint_image(request: ImageEditRequest):
    """
    Inpaint image with mask
    
    Alias for /image/edit for frontend compatibility
    """
    try:
        logger.info(f"Image inpaint request: {request.prompt[:50]}...")
        result = await generate_image_edit(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image inpaint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))


@router.post("/image/reference", response_model=ImageGenerationResponse)
async def api_reference_image(request: ImageReferenceRequest):
    """
    Reference-based image generation using gpt-image-1.5
    
    Request: { referenceImages, prompt, input_fidelity }
    Response: { success, data: { imageUrl, metadata } }
    """
    try:
        logger.info(f"Image reference request: {request.prompt[:50]}...")
        result = await generate_image_reference(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image reference error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))


# ============================================================================
# GEMINI IMAGE ENDPOINTS
# ============================================================================

@router.post("/imagen", response_model=GeminiImageResponse)
async def api_gemini_generate_image(request: GeminiImageGenerateRequest):
    """
    Generate image using Google Gemini 3 Pro Image Preview
    
    Model:
    - gemini-3-pro-image-preview: Advanced 4K, thinking mode, up to 14 reference images
    
    Features:
    - Text-to-image generation
    - Aspect ratios: 1:1, 16:9, 9:16, etc.
    - Image sizes: 1K, 2K, 4K
    - Google Search grounding (for real-time info)
    - Response modalities: ['TEXT', 'IMAGE'] or ['IMAGE']
    """
    try:
        logger.info(f"Gemini image generation: {request.prompt[:50]}...")
        result = await gemini_generate_image(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gemini image generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))


@router.post("/imagen/edit", response_model=GeminiImageResponse)
async def api_gemini_edit_image(request: GeminiImageEditRequest):
    """
    Edit image using Google Gemini
    
    Features:
    - Add/remove/modify elements
    - Style transfer
    - Up to 14 reference images (Gemini 3 Pro)
    - Semantic masking (describe what to edit)
    """
    try:
        logger.info(f"Gemini image edit: {request.prompt[:50]}...")
        result = await gemini_edit_image(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gemini image edit error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))


@router.post("/imagen/chat", response_model=GeminiImageResponse)
async def api_gemini_multi_turn(request: GeminiMultiTurnRequest):
    """
    Multi-turn conversational image editing
    
    Maintain conversation context for iterative refinement.
    Pass conversation_history from previous response.
    
    Example:
    1. Generate initial image
    2. "Make the sky more dramatic"
    3. "Change the language to Spanish"
    """
    try:
        logger.info(f"Gemini multi-turn edit: {request.prompt[:50]}...")
        result = await gemini_multi_turn_edit(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gemini multi-turn error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=parse_media_error(e))


@router.get("/imagen/models")
async def get_gemini_image_models():
    """Get available Gemini image models and their capabilities"""
    return {
        "success": True,
        "models": [
            {
                "id": "gemini-3-pro-image-preview",
                "name": "Gemini 3 Pro Image Preview",
                "description": "Advanced 4K generation with thinking mode, up to 14 reference images",
                "maxReferenceImages": 14,
                "supportedSizes": ["1K", "2K", "4K"],
                "features": ["text-to-image", "image-editing", "multi-turn", "google-search", "thinking"]
            }
        ],
        "aspectRatios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "imageSizes": ["1K", "2K", "4K"]
    }


# ============================================================================
# AUDIO ENDPOINTS
# ============================================================================

@router.post("/audio/speech", response_model=TTSResponse)
async def api_generate_speech(request: TTSRequest):
    """
    Generate speech from text using ElevenLabs TTS
    
    Requires voice_id from GET /media/audio/voices
    """
    try:
        logger.info(f"TTS request: {request.text[:50]}...")
        result = await generate_speech(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/music", response_model=MusicResponse)
async def api_generate_music(request: MusicRequest):
    """
    Generate music from text prompt
    
    Duration: 10 seconds to 5 minutes
    """
    try:
        logger.info(f"Music generation: {request.prompt[:50]}...")
        result = await generate_music(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Music generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/sound-effects", response_model=SoundEffectsResponse)
async def api_generate_sound_effects(request: SoundEffectsRequest):
    """
    Generate sound effects from text prompt
    
    Duration: 0.1 to 30 seconds
    """
    try:
        logger.info(f"Sound effects: {request.prompt[:50]}...")
        result = await generate_sound_effects(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sound effects error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/voices", response_model=VoicesResponse)
async def api_get_voices():
    """Get available ElevenLabs voices"""
    try:
        result = await get_voices()
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get voices error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/clone-voice", response_model=VoiceCloningResponse)
async def api_clone_voice(request: VoiceCloningRequest):
    """
    Clone voice from audio sample (instant voice cloning)
    
    Provide base64-encoded audio sample
    """
    try:
        logger.info(f"Voice cloning: {request.name}")
        result = await clone_voice(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice cloning error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/models")
async def get_audio_models():
    """Get available TTS models and output formats"""
    return {
        "success": True,
        "models": TTS_MODELS,
        "outputFormats": OUTPUT_FORMATS
    }


# Alias endpoints for frontend compatibility
@router.post("/audio/tts", response_model=TTSResponse)
async def api_tts_alias(request: TTSRequest):
    """Alias for /audio/speech for frontend compatibility"""
    return await api_generate_speech(request)


@router.post("/audio/voice-cloning", response_model=VoiceCloningResponse)
async def api_voice_cloning_alias(request: VoiceCloningRequest):
    """Alias for /audio/clone-voice for frontend compatibility"""
    return await api_clone_voice(request)


@router.post("/audio/voice-design", response_model=VoiceDesignResponse)
async def api_voice_design(request: VoiceDesignRequest):
    """
    Design a custom voice from text description or save a designed voice.
    
    Actions:
    - 'design': Generate voice previews from description
    - 'save': Save selected voice to library
    
    Models: eleven_multilingual_ttv_v2, eleven_ttv_v3
    """
    try:
        if request.action == "design":
            logger.info(f"Voice design request: {request.voiceDescription[:50] if request.voiceDescription else 'N/A'}...")
            result = await design_voice(request)
        else:
            logger.info(f"Voice save request: {request.name}")
            result = await save_designed_voice(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice design error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/dialog", response_model=DialogResponse)
async def api_generate_dialog(request: DialogRequest):
    """
    Generate multi-speaker dialog using ElevenLabs Text-to-Dialogue API.
    
    Requires at least 2 speakers with voice IDs.
    Supports audio tags: [laughs], [sighs], [whispers], etc.
    Model: eleven_v3 (recommended)
    """
    try:
        logger.info(f"Dialog generation: {len(request.inputs)} speakers")
        result = await generate_dialog(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dialog generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# VIDEO ENDPOINTS
# ============================================================================

@router.post("/video/generate", response_model=VideoGenerationResponse)
async def api_generate_video(request: VideoGenerationRequest):
    """
    Generate video from text prompt using Google Veo
    
    Returns operation ID for polling. Use GET /video/status/{operation_name}
    to check when video is ready.
    
    Supports:
    - veo-3.1-generate-preview: Latest, best quality with native audio
    - veo-3.1-fast-generate-preview: Faster generation
    """
    try:
        logger.info(f"Video generation: {request.prompt[:50]}...")
        result = await generate_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video/status", response_model=VideoStatusResponse)
async def api_get_video_status(request: VideoStatusRequest):
    """
    Get status of video generation operation
    
    Poll every 10 seconds until done=True
    """
    try:
        logger.info(f"Video status check: {request.operationId}")
        result = await get_video_status(request)
        return result
        
    except Exception as e:
        logger.error(f"Video status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video/image-to-video", response_model=VideoGenerationResponse)
async def api_image_to_video(request: ImageToVideoRequest):
    """
    Generate video with image as first frame (Veo 3.1)
    """
    try:
        logger.info(f"Image-to-video: {request.prompt[:50]}...")
        result = await generate_image_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video/frame-specific", response_model=VideoGenerationResponse)
async def api_frame_specific(request: FrameSpecificRequest):
    """
    Generate video by specifying first and last frames (interpolation)
    Veo 3.1 only
    """
    try:
        logger.info(f"Frame-specific generation")
        result = await generate_frame_specific(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Frame-specific error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video/reference-images", response_model=VideoGenerationResponse)
async def api_reference_images(request: ReferenceImagesRequest):
    """
    Generate video using 1-3 reference images for content guidance
    Veo 3.1 only
    """
    try:
        logger.info(f"Reference images: {request.prompt[:50]}...")
        result = await generate_with_references(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reference images error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video/extend", response_model=VideoGenerationResponse)
async def api_extend_video(request: VideoExtendRequest):
    """
    Extend a Veo-generated video by 7 seconds (up to 20 times)
    Veo 3.1 only
    """
    try:
        logger.info(f"Extend video: {request.veoVideoId[:50]}...")
        result = await extend_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extend video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video/download", response_model=VideoDownloadResponse)
async def api_download_video(request: VideoDownloadRequest):
    """
    Download completed video and optionally upload to Supabase
    """
    try:
        logger.info(f"Download video: {request.veoVideoId[:50]}...")
        result = await download_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/video/models")
async def get_video_models():
    """Get available Veo models"""
    return {
        "success": True,
        "models": VEO_MODELS
    }


# ============================================================================
# SORA ENDPOINTS - OpenAI Video Generation
# ============================================================================

@router.post("/sora/generate", response_model=SoraGenerateResponse)
async def api_sora_generate(request: SoraGenerateRequest):
    """
    Generate video from text prompt using OpenAI Sora
    
    Returns job ID for polling status
    """
    try:
        logger.info(f"Sora generate: {request.prompt[:50]}...")
        result = await sora_generate_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sora generate error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sora/image-to-video", response_model=SoraGenerateResponse)
async def api_sora_image_to_video(request: SoraImageToVideoRequest):
    """
    Generate video with image as first frame using OpenAI Sora
    
    Image must match target resolution
    """
    try:
        logger.info(f"Sora image-to-video: {request.prompt[:50]}...")
        result = await sora_image_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sora image-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sora/remix", response_model=SoraGenerateResponse)
async def api_sora_remix(request: SoraRemixRequest):
    """
    Remix a completed Sora video with targeted adjustments
    
    Best for single, focused changes
    """
    try:
        logger.info(f"Sora remix: video={request.previousVideoId}")
        result = await sora_remix_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sora remix error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sora/status", response_model=SoraStatusResponse)
async def api_sora_status(request: SoraStatusRequest):
    """
    Get Sora video generation status
    
    Poll this endpoint every 10-20 seconds until completed/failed
    """
    try:
        result = await sora_get_status(request)
        return result
        
    except Exception as e:
        logger.error(f"Sora status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sora/fetch", response_model=SoraFetchResponse)
async def api_sora_fetch(request: SoraFetchRequest):
    """
    Fetch completed Sora video content
    
    Supports variants: video (MP4), thumbnail (WebP), spritesheet (JPG)
    """
    try:
        logger.info(f"Sora fetch: video={request.videoId}, variant={request.variant}")
        result = await sora_fetch_content(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sora fetch error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sora/models")
async def get_sora_models():
    """Get available Sora models"""
    return {
        "success": True,
        "models": SORA_MODELS
    }


@router.get("/sora/list")
async def api_sora_list(limit: int = 20, after: str = None, order: str = "desc"):
    """List Sora videos with pagination"""
    try:
        result = await sora_list_videos(limit, after, order)
        return result
    except Exception as e:
        logger.error(f"Sora list error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sora/{video_id}")
async def api_sora_delete(video_id: str):
    """Delete a Sora video"""
    try:
        result = await sora_delete_video(video_id)
        return result
    except Exception as e:
        logger.error(f"Sora delete error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RUNWAY ENDPOINTS - Runway Gen4 Alpha Video Generation
# ============================================================================

@router.post("/runway/text-to-video", response_model=RunwayGenerationResponse)
async def api_runway_text_to_video(request: RunwayTextToVideoRequest):
    """
    Generate video from text prompt using Runway Gen4
    
    Returns task ID for polling status
    """
    try:
        logger.info(f"Runway text-to-video: {request.prompt[:50]}...")
        result = await runway_text_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Runway text-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runway/image-to-video", response_model=RunwayGenerationResponse)
async def api_runway_image_to_video(request: RunwayImageToVideoRequest):
    """
    Generate video with image as first frame using Runway Gen4
    
    Uses gen4_turbo model
    """
    try:
        logger.info(f"Runway image-to-video: {request.prompt[:50]}...")
        result = await runway_image_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Runway image-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runway/video-to-video", response_model=RunwayGenerationResponse)
async def api_runway_video_to_video(request: RunwayVideoToVideoRequest):
    """
    Transform video with style transfer using Runway Gen4
    
    Uses gen4_aleph model
    """
    try:
        logger.info(f"Runway video-to-video: {request.prompt[:50]}...")
        result = await runway_video_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Runway video-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runway/upscale", response_model=RunwayGenerationResponse)
async def api_runway_upscale(request: RunwayUpscaleRequest):
    """
    Upscale video resolution using Runway
    """
    try:
        logger.info(f"Runway upscale video")
        result = await runway_upscale_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Runway upscale error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runway/status", response_model=RunwayTaskStatusResponse)
async def api_runway_status(request: RunwayTaskStatusRequest):
    """
    Get Runway video generation task status
    
    Poll every 5 seconds until status is SUCCEEDED or FAILED
    """
    try:
        result = await runway_get_task_status(request)
        return result
        
    except Exception as e:
        logger.error(f"Runway status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/runway/{task_id}")
async def api_runway_delete(task_id: str):
    """Cancel or delete a Runway task"""
    try:
        result = await runway_delete_task(task_id)
        return result
    except Exception as e:
        logger.error(f"Runway delete error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runway/models")
async def get_runway_models():
    """Get available Runway models and options"""
    return {
        "success": True,
        "models": RUNWAY_MODELS,
        "ratios": RUNWAY_RATIOS,
        "durations": RUNWAY_DURATIONS,
        "modes": RUNWAY_GENERATION_MODES
    }


# ============================================================================
# KLING ENDPOINTS - Kling AI v2.6 Video Generation
# ============================================================================

@router.post("/kling/text-to-video", response_model=KlingGenerationResponse)
async def api_kling_text_to_video(request: KlingTextToVideoRequest):
    """
    Generate video from text prompt using Kling v2.6
    
    Returns task ID for polling. Use POST /kling/status to check completion.
    
    Features:
    - kling-v2.6-pro: 1080p, higher quality
    - kling-v2.6-standard: 720p, faster generation
    - Native audio generation (English/Chinese)
    """
    try:
        logger.info(f"Kling text-to-video: {request.prompt[:50]}...")
        result = await kling_text_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling text-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kling/image-to-video", response_model=KlingGenerationResponse)
async def api_kling_image_to_video(request: KlingImageToVideoRequest):
    """
    Animate image using Kling v2.6
    
    Supports first/last frame specification for interpolation.
    Use voice_ids for character-specific audio.
    """
    try:
        logger.info(f"Kling image-to-video: {request.prompt[:50]}...")
        result = await kling_image_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling image-to-video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kling/motion-control", response_model=KlingGenerationResponse)
async def api_kling_motion_control(request: KlingMotionControlRequest):
    """
    Transfer motion from reference video to character image using Kling v2.6
    
    Supports:
    - character_orientation='video': Full-body motion (up to 30s)
    - character_orientation='image': Portrait animation (up to 10s)
    """
    try:
        logger.info(f"Kling motion control: orientation={request.character_orientation}")
        result = await kling_motion_control(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling motion control error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kling/status", response_model=KlingTaskStatusResponse)
async def api_kling_status(request: KlingTaskStatusRequest):
    """
    Get Kling video generation task status
    
    Poll every 8-10 seconds until status is 'succeed' or 'failed'
    """
    try:
        result = await kling_get_task_status(request)
        return result
        
    except Exception as e:
        logger.error(f"Kling status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kling/models")
async def get_kling_models():
    """Get available Kling models and configuration options"""
    return kling_get_models().model_dump()


@router.post("/kling/video-extend", response_model=KlingGenerationResponse)
async def api_kling_video_extend(request: KlingVideoExtendRequest):
    """
    Extend an existing video by 4-5 seconds using Kling v2.6
    
    Source video must be from text2video, image2video, or previous extension.
    Maximum cumulative extension: 3 minutes total.
    """
    try:
        logger.info(f"Kling video-extend: video_id={request.video_id}")
        result = await kling_extend_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling video-extend error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kling/lip-sync", response_model=KlingGenerationResponse)
async def api_kling_lip_sync(request: KlingLipSyncRequest):
    """
    Synchronize lip movements with audio using Kling v2.6
    
    Video should have clear frontal face visibility.
    """
    try:
        logger.info(f"Kling lip-sync: video={request.video_url[:50]}...")
        result = await kling_lip_sync(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling lip-sync error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kling/multi-image", response_model=KlingGenerationResponse)
async def api_kling_multi_image(request: KlingMultiImageRequest):
    """
    Generate video from multiple images using Kling v2.6
    
    Creates smooth AI interpolation between keyframe images.
    Supports 2-8 images.
    """
    try:
        logger.info(f"Kling multi-image: {len(request.images)} images")
        result = await kling_multi_image_to_video(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling multi-image error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kling/avatar", response_model=KlingGenerationResponse)
async def api_kling_avatar(request: KlingAvatarRequest):
    """
    Generate AI avatar video from image + audio using Kling v2.6
    
    Creates realistic talking head video with lip-sync and facial expressions.
    Pricing: std (0.4/sec), pro (0.8/sec)
    """
    try:
        logger.info(f"Kling avatar: mode={request.mode}")
        result = await kling_avatar_generation(request)
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kling avatar error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# INFO ENDPOINT
# ============================================================================

@router.get("/")
async def media_info():
    """Media API information"""
    return {
        "success": True,
        "message": "Media Generation API is operational",
        "version": "1.3.0",
        "services": {
            "image": {
                "models": ["gpt-image-1.5"],
                "features": ["text-to-image", "inpainting", "reference-based"],
                "endpoints": ["/image/generate", "/image/inpaint", "/image/reference"]
            },
            "gemini": {
                "models": ["gemini-3-pro-image-preview"],
                "features": ["text-to-image", "image-editing", "multi-turn", "4K-output", "google-search-grounding"],
                "endpoints": ["/imagen", "/imagen/edit", "/imagen/chat", "/imagen/models"]
            },
            "audio": {
                "features": ["text-to-speech", "music", "sound-effects", "voice-cloning", "voice-design", "dialog"],
                "endpoints": ["/audio/speech", "/audio/music", "/audio/sound-effects", "/audio/voices", "/audio/voice-design", "/audio/dialog", "/audio/clone-voice"]
            },
            "video-veo": {
                "models": ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview"],
                "features": ["text-to-video", "image-to-video"],
                "endpoints": ["/video/generate", "/video/status", "/video/image-to-video"]
            },
            "video-sora": {
                "models": ["sora-2", "sora-2-pro"],
                "features": ["text-to-video", "image-to-video", "video-remix", "thumbnails", "spritesheets"],
                "endpoints": ["/sora/generate", "/sora/image-to-video", "/sora/remix", "/sora/status", "/sora/fetch"]
            },
            "video-runway": {
                "models": ["gen4_turbo", "gen4_aleph", "veo3.1"],
                "features": ["text-to-video", "image-to-video", "video-to-video", "video-upscale"],
                "endpoints": ["/runway/text-to-video", "/runway/image-to-video", "/runway/video-to-video", "/runway/upscale", "/runway/status", "/runway/models"]
            },
            "video-kling": {
                "models": ["kling-v2.6-pro", "kling-v2.6-standard"],
                "features": ["text-to-video", "image-to-video", "motion-control", "native-audio"],
                "endpoints": ["/kling/text-to-video", "/kling/image-to-video", "/kling/motion-control", "/kling/status", "/kling/models"]
            }
        }
    }


