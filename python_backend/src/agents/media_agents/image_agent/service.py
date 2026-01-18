"""
Image Generation Service
OpenAI gpt-image-1.5 implementation per latest API docs (2026)

Supported models: gpt-image-1.5 (best quality), gpt-image-1, gpt-image-1-mini
Note: DALL-E 2 and DALL-E 3 are deprecated as of May 2026
"""
import logging
import time
import base64
import httpx
from typing import Optional

from openai import AsyncOpenAI

from .schemas import (
    FrontendImageRequest,
    ImageEditRequest,
    ImageReferenceRequest,
    ImageGenerationResponse,
    ImageGenerationData,
    ImageGenerationMetadata,
)
from ....config import settings

logger = logging.getLogger(__name__)

# Lazy client initialization
_openai_client: Optional[AsyncOpenAI] = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create async OpenAI client"""
    global _openai_client
    
    if _openai_client is None:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured")
        _openai_client = AsyncOpenAI(api_key=api_key)
    
    return _openai_client


def base64_to_data_url(b64_data: str, format: str = "png") -> str:
    """Convert base64 to data URL"""
    return f"data:image/{format};base64,{b64_data}"


def get_extension_from_mime(mime_type: str) -> str:
    """Get file extension from mime type"""
    mime_to_ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }
    return mime_to_ext.get(mime_type, "png")


def bytes_to_file_tuple(data: bytes, mime_type: str, filename_prefix: str = "image") -> tuple:
    """
    Convert bytes to a file tuple for OpenAI API.
    OpenAI SDK expects: (filename, file_bytes, content_type)
    """
    ext = get_extension_from_mime(mime_type)
    filename = f"{filename_prefix}.{ext}"
    return (filename, data, mime_type)


async def url_to_bytes(url: str) -> tuple[bytes, str]:
    """Convert URL or data URL to bytes and detect mime type"""
    if url.startswith("data:"):
        # Parse data URL
        header, b64_data = url.split(",", 1)
        mime_type = header.split(";")[0].split(":")[1] if ":" in header else "image/png"
        return base64.b64decode(b64_data), mime_type
    else:
        # Fetch from HTTP URL
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "image/png")
            # Handle cases where content-type might have charset
            if ";" in content_type:
                content_type = content_type.split(";")[0].strip()
            return response.content, content_type


# Default model - gpt-image-1.5 is the latest and best quality
DEFAULT_IMAGE_MODEL = "gpt-image-1.5"


async def generate_image(request: FrontendImageRequest) -> ImageGenerationResponse:
    """
    Generate image using OpenAI gpt-image-1.5 (latest model as of 2026)
    
    Per OpenAI docs:
    - Models: gpt-image-1.5 (best), gpt-image-1, gpt-image-1-mini
    - Sizes: 1024x1024, 1536x1024, 1024x1536
    - Quality: low, medium, high
    - Background: transparent, opaque, auto
    - Output format: png (default), jpeg, webp
    - Max prompt: 32,000 characters
    - Multiple images: n parameter (1-10)
    
    Note: No response_format parameter - always returns base64
    """
    start_time = time.time()
    
    try:
        client = get_openai_client()
        opts = request.options or {}
        
        # Get size, handle 'auto'
        size = getattr(opts, 'size', None) or "1024x1024"
        if size == "auto":
            size = "1024x1024"
        
        # Build OpenAI API params
        # Note: gpt-image-1.5 always returns base64 - no response_format needed
        params = {
            "model": DEFAULT_IMAGE_MODEL,
            "prompt": request.prompt,
            "size": size,
        }
        
        # Add output format (png, jpeg, webp)
        output_format = getattr(opts, 'format', None) or "png"
        if output_format and output_format in ["png", "jpeg", "webp"]:
            params["output_format"] = output_format
        
        # Add quality
        quality = getattr(opts, 'quality', None)
        if quality and quality != "auto":
            params["quality"] = quality
        
        # Add background
        background = getattr(opts, 'background', None)
        if background and background != "auto":
            params["background"] = background
        
        # Add moderation
        moderation = getattr(opts, 'moderation', None)
        if moderation and moderation != "auto":
            params["moderation"] = moderation
        
        # Add n (number of images)
        n = getattr(opts, 'n', None)
        if n and n > 1:
            params["n"] = n
        
        logger.info(f"Generating image: size={size}, quality={quality}")
        
        response = await client.images.generate(**params)
        
        if not response.data or len(response.data) == 0:
            return ImageGenerationResponse(
                success=False,
                error="No image data received from API"
            )
        
        image_data = response.data[0]
        b64_image = image_data.b64_json
        
        if not b64_image:
            return ImageGenerationResponse(
                success=False,
                error="No base64 data in response"
            )
        
        # Convert to data URL
        output_format = getattr(opts, 'format', None) or "png"
        image_url = base64_to_data_url(b64_image, output_format)
        
        generation_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Image generated successfully in {generation_time}ms")
        
        metadata = ImageGenerationMetadata(
            model=DEFAULT_IMAGE_MODEL,
            promptUsed=request.prompt,
            revisedPrompt=getattr(image_data, "revised_prompt", None),
            size=size,
            quality=quality,
            format=output_format
        )
        
        return ImageGenerationResponse(
            success=True,
            data=ImageGenerationData(
                imageUrl=image_url,
                metadata=metadata
            )
        )
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return ImageGenerationResponse(success=False, error=str(e))
    
    except Exception as e:
        logger.error(f"Image generation error: {e}", exc_info=True)
        error_msg = str(e)
        if "api_key" in error_msg.lower():
            error_msg = "Invalid API key"
        elif "rate_limit" in error_msg.lower():
            error_msg = "Rate limit exceeded"
        
        return ImageGenerationResponse(success=False, error=error_msg)


async def generate_image_edit(request: ImageEditRequest) -> ImageGenerationResponse:
    """
    Edit image with optional mask (inpainting)
    
    Per OpenAI docs:
    - Mask indicates areas to edit (alpha channel required)
    - Supports all output options: size, quality, format, background
    """
    start_time = time.time()
    
    try:
        client = get_openai_client()
        
        logger.info(f"Image edit request: {request.prompt[:50]}...")
        
        # Get image bytes and mime type
        image_bytes, mime_type = await url_to_bytes(request.originalImageUrl)
        # Convert to proper file tuple for OpenAI API
        image_file = bytes_to_file_tuple(image_bytes, mime_type, "source_image")
        
        # Get size, handle 'auto'
        size = request.size or "1024x1024"
        if size == "auto":
            size = "1024x1024"
        
        # Build params
        # Note: gpt-image-1.5 always returns base64 - no response_format needed
        params = {
            "model": DEFAULT_IMAGE_MODEL,
            "image": image_file,
            "prompt": request.prompt,
            "size": size,
        }
        
        # Add mask if provided
        if request.maskImageUrl:
            mask_bytes, mask_mime = await url_to_bytes(request.maskImageUrl)
            params["mask"] = bytes_to_file_tuple(mask_bytes, mask_mime, "mask")
        
        # Add quality
        if request.quality and request.quality != "auto":
            params["quality"] = request.quality
        
        # Add background
        if request.background and request.background != "auto":
            params["background"] = request.background
        
        logger.info(f"Calling images.edit: size={size}, quality={request.quality}")
        
        response = await client.images.edit(**params)
        
        if not response.data or len(response.data) == 0:
            return ImageGenerationResponse(
                success=False,
                error="No edited image data received"
            )
        
        b64_image = response.data[0].b64_json
        
        if not b64_image:
            return ImageGenerationResponse(
                success=False,
                error="No base64 data in edit response"
            )
        
        # Use requested format
        output_format = request.format or "png"
        image_url = base64_to_data_url(b64_image, output_format)
        generation_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Image edited successfully in {generation_time}ms")
        
        return ImageGenerationResponse(
            success=True,
            data=ImageGenerationData(
                imageUrl=image_url,
                metadata=ImageGenerationMetadata(
                    model=DEFAULT_IMAGE_MODEL,
                    promptUsed=request.prompt,
                    size=size,
                    quality=request.quality,
                    format=output_format
                )
            )
        )
        
    except Exception as e:
        logger.error(f"Image edit error: {e}", exc_info=True)
        return ImageGenerationResponse(success=False, error=str(e))


async def generate_image_reference(request: ImageReferenceRequest) -> ImageGenerationResponse:
    """
    Generate image using reference images
    
    Per OpenAI docs:
    - Multiple reference images supported (up to 5 with high fidelity for gpt-image-1.5)
    - input_fidelity='high' preserves faces, logos, fine details
    - Supports all output options: size, quality, format, background
    """
    start_time = time.time()
    
    try:
        client = get_openai_client()
        
        logger.info(f"Reference image request: {request.prompt[:50]}...")
        
        # Get all reference image bytes with proper file formatting
        images = []
        for i, url in enumerate(request.referenceImages[:5]):  # Max 5 for high fidelity
            img_bytes, mime_type = await url_to_bytes(url)
            # Convert to proper file tuple for OpenAI API
            image_file = bytes_to_file_tuple(img_bytes, mime_type, f"ref_image_{i}")
            images.append(image_file)
        
        # Get size, handle 'auto'
        size = request.size or "1024x1024"
        if size == "auto":
            size = "1024x1024"
        
        # Note: gpt-image-1.5 always returns base64 - no response_format needed
        params = {
            "model": DEFAULT_IMAGE_MODEL,
            "image": images,
            "prompt": request.prompt,
            "size": size,
        }
        
        # Add input fidelity - key feature per docs
        if request.input_fidelity == "high":
            params["input_fidelity"] = "high"
        
        # Add quality
        if request.quality and request.quality != "auto":
            params["quality"] = request.quality
        
        # Add background
        if request.background and request.background != "auto":
            params["background"] = request.background
        
        logger.info(f"Calling images.edit with {len(images)} reference images, fidelity={request.input_fidelity}")
        
        response = await client.images.edit(**params)
        
        if not response.data or len(response.data) == 0:
            return ImageGenerationResponse(
                success=False,
                error="No image data received"
            )
        
        b64_image = response.data[0].b64_json
        
        if not b64_image:
            return ImageGenerationResponse(
                success=False,
                error="No base64 data in response"
            )
        
        output_format = request.format or "png"
        image_url = base64_to_data_url(b64_image, output_format)
        generation_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Reference image generated in {generation_time}ms")
        
        return ImageGenerationResponse(
            success=True,
            data=ImageGenerationData(
                imageUrl=image_url,
                metadata=ImageGenerationMetadata(
                    model=DEFAULT_IMAGE_MODEL,
                    promptUsed=request.prompt,
                    size=size,
                    quality=request.quality,
                    format=output_format
                )
            )
        )
        
    except Exception as e:
        logger.error(f"Reference image error: {e}", exc_info=True)
        return ImageGenerationResponse(success=False, error=str(e))
