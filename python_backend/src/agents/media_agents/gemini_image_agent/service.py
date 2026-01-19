"""
Gemini Image Agent Service
Handles image generation and editing using Google Gemini API

Models:
- gemini-3-pro-image-preview: Advanced 4K, thinking mode, up to 14 reference images

API Reference: https://ai.google.dev/gemini-api/docs/image-generation
"""

import os
import base64
import logging
import httpx
from typing import Optional, List, Tuple

from .schemas import (
    GeminiImageGenerateRequest,
    GeminiImageEditRequest,
    GeminiMultiTurnRequest,
    GeminiImageResponse,
    ConversationMessage,
    ConversationPart,
    InlineImage,
)

logger = logging.getLogger(__name__)

# Gemini API endpoint
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def get_api_key() -> str:
    """Get Gemini API key from environment"""
    api_key = (
        os.environ.get("GEMINI_API_KEY") or 
        os.environ.get("GOOGLE_AI_API_KEY") or 
        os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key:
        raise ValueError("GEMINI_API_KEY, GOOGLE_AI_API_KEY, or GOOGLE_API_KEY environment variable not set")
    return api_key


def get_extension_from_mime(mime_type: str) -> str:
    """Get file extension from mime type"""
    mime_to_ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }
    return mime_to_ext.get(mime_type, "png")


def extract_base64_from_data_url(data_url: str) -> Tuple[str, str]:
    """
    Extract base64 data and MIME type from a data URL
    
    Args:
        data_url: Data URL like "data:image/png;base64,..."
        
    Returns:
        Tuple of (base64_data, mime_type)
    """
    if data_url.startswith("data:"):
        # Parse data URL: data:image/png;base64,xxxxx
        header, data = data_url.split(",", 1)
        mime_type = header.split(":")[1].split(";")[0]
        # Ensure we have a valid image MIME type
        if mime_type not in ["image/png", "image/jpeg", "image/jpg", "image/webp"]:
            mime_type = "image/png"
        return data, mime_type
    else:
        # Assume it's already base64
        return data_url, "image/png"


async def url_to_base64(url: str) -> Tuple[str, str]:
    """
    Convert a URL to base64 data
    
    Args:
        url: HTTP URL or data URL
        
    Returns:
        Tuple of (base64_data, mime_type)
    """
    if url.startswith("data:"):
        return extract_base64_from_data_url(url)
    
    # Fetch from HTTP URL
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "image/png")
        # Handle cases where content-type might have charset or other params
        mime_type = content_type.split(";")[0].strip()
        # Ensure we have a valid image MIME type (not application/octet-stream)
        if mime_type not in ["image/png", "image/jpeg", "image/jpg", "image/webp"]:
            # Try to infer from content or default to png
            mime_type = "image/png"
        b64_data = base64.b64encode(response.content).decode("utf-8")
        return b64_data, mime_type


def base64_to_data_url(b64_data: str, mime_type: str = "image/png") -> str:
    """Convert base64 data to a data URL"""
    return f"data:{mime_type};base64,{b64_data}"


def parse_api_error_message(status_code: int, error_text: str) -> str:
    """
    Parse Gemini API error response and extract a user-friendly error message
    
    Args:
        status_code: HTTP status code from the API response
        error_text: Raw error text from the API (may be JSON)
        
    Returns:
        User-friendly error message string
    """
    import json
    
    try:
        error_data = json.loads(error_text)
        error_info = error_data.get("error", {})
        
        message = error_info.get("message", "")
        status = error_info.get("status", "")
        
        # Handle rate limit / quota errors (429)
        if status_code == 429 or status == "RESOURCE_EXHAUSTED":
            # Check for retry info
            details = error_info.get("details", [])
            retry_time = None
            for detail in details:
                if detail.get("@type", "").endswith("RetryInfo"):
                    retry_delay = detail.get("retryDelay", "")
                    if retry_delay:
                        retry_time = retry_delay
                        break
            
            # Build user-friendly message
            if "quota" in message.lower() or "exceeded" in message.lower():
                if retry_time:
                    return f"Rate limit exceeded. Please retry in {retry_time}. Consider checking your API quota."
                return "API quota exceeded. Please check your Gemini API plan and billing details at https://ai.google.dev/gemini-api/docs/rate-limits"
            
            if retry_time:
                return f"Too many requests. Please retry in {retry_time}."
            return "Rate limit exceeded. Please wait a moment and try again."
        
        # Handle authentication errors (401, 403)
        if status_code in (401, 403):
            return "API authentication failed. Please check your Gemini API key configuration."
        
        # Handle not found errors (404)
        if status_code == 404:
            return f"Model or endpoint not found: {message or 'Unknown resource'}"
        
        # Handle safety/content blocked
        if "safety" in message.lower() or "blocked" in message.lower():
            return "Content blocked by safety filters. Please modify your prompt."
        
        # Handle invalid request (400)
        if status_code == 400:
            return f"Invalid request: {message or 'Please check your input parameters.'}"
        
        # Default: return a cleaned up message
        if message:
            # Truncate very long messages but keep the key info
            if len(message) > 200:
                return f"API error ({status_code}): {message[:200]}..."
            return f"API error ({status_code}): {message}"
        
        return f"API error: {status_code}"
        
    except json.JSONDecodeError:
        # Not JSON, return raw text (truncated if too long)
        if len(error_text) > 200:
            return f"API error ({status_code}): {error_text[:200]}..."
        return f"API error ({status_code}): {error_text}"


def build_generation_config(
    aspect_ratio: Optional[str] = None,
    image_size: Optional[str] = None,
    response_modalities: Optional[List[str]] = None,
) -> dict:
    """
    Build the generationConfig for Gemini API
    
    Args:
        aspect_ratio: Aspect ratio for the image (e.g., "16:9", "1:1")
        image_size: Image size for Gemini 3 Pro (1K, 2K, 4K)
        response_modalities: Response types, defaults to ["TEXT", "IMAGE"]
    
    Returns:
        Generation config dictionary
    """
    config = {
        "responseModalities": response_modalities or ["TEXT", "IMAGE"]
    }
    
    image_config = {}
    if aspect_ratio:
        image_config["aspectRatio"] = aspect_ratio
    if image_size:
        # Gemini 3 Pro always supports imageSize (1K, 2K, 4K)
        image_config["imageSize"] = image_size
    
    if image_config:
        config["imageConfig"] = image_config
    
    return config


def build_tools(enable_google_search: bool = False) -> Optional[List[dict]]:
    """Build tools list for API request"""
    if enable_google_search:
        return [{"google_search": {}}]
    return None


async def generate_image(request: GeminiImageGenerateRequest) -> GeminiImageResponse:
    """
    Generate an image from a text prompt
    
    Uses Gemini's native image generation capability.
    
    All parameters come from the frontend request:
    - request.prompt: Text prompt for generation
    - request.get_model(): Model from action or model field
    - request.aspect_ratio: Aspect ratio from frontend (e.g., "16:9", "1:1")
    - request.image_size: Image size from frontend (1K, 2K, 4K)
    - request.response_modalities: Response types from frontend (["TEXT", "IMAGE"] or ["IMAGE"])
    - request.enable_google_search: Google Search grounding flag from frontend
    """
    try:
        api_key = get_api_key()
        # Use get_model() to handle both model and action fields
        model = request.get_model()
        
        # Build request payload - all parameters from frontend request
        payload = {
            "contents": [{
                "parts": [{"text": request.prompt}]
            }],
            "generationConfig": build_generation_config(
                aspect_ratio=request.aspect_ratio,  # From frontend
                image_size=request.image_size,  # From frontend
                response_modalities=request.response_modalities  # From frontend
            )
        }
        
        # Add tools if needed - based on frontend request
        tools = build_tools(request.enable_google_search)
        if tools:
            payload["tools"] = tools
        
        # Call Gemini API
        url = f"{GEMINI_API_BASE}/models/{model}:generateContent"
        
        logger.info(f"Gemini image generation: model={model}, prompt={request.prompt[:50]}...")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json"
                },
                json=payload
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"Gemini API error: {response.status_code} - {error_text}")
                return GeminiImageResponse(
                    success=False,
                    error=parse_api_error_message(response.status_code, error_text)
                )
            
            data = response.json()
        
        # Parse response
        return parse_gemini_response(data)
        
    except Exception as e:
        logger.error(f"Gemini image generation error: {e}", exc_info=True)
        return GeminiImageResponse(success=False, error=str(e))


async def edit_image(request: GeminiImageEditRequest) -> GeminiImageResponse:
    """
    Edit an image using text prompts
    
    Supports:
    - Single image editing
    - Multi-reference images (up to 14 with Gemini 3 Pro)
    - Style transfer
    - Object addition/removal
    """
    try:
        api_key = get_api_key()
        model = request.model
        
        # Convert source image to base64
        img_data, img_mime = await url_to_base64(request.image_url)
        
        # Build content parts
        parts = [
            {"text": request.prompt},
            {
                "inline_data": {
                    "mime_type": img_mime,
                    "data": img_data
                }
            }
        ]
        
        # Add reference images if provided (Gemini 3 Pro supports up to 14)
        if request.reference_images:
            for ref_img in request.reference_images[:13]:  # Max 13 additional (14 total)
                parts.append({
                    "inline_data": {
                        "mime_type": ref_img.mime_type,
                        "data": ref_img.data
                    }
                })
        
        # Build request payload - all parameters from frontend request
        payload = {
            "contents": [{
                "parts": parts
            }],
            "generationConfig": build_generation_config(
                aspect_ratio=request.aspect_ratio,  # From frontend
                image_size=request.image_size,  # From frontend
                response_modalities=request.response_modalities  # From frontend
            )
        }
        
        # Add tools if needed - based on frontend request
        tools = build_tools(request.enable_google_search)
        if tools:
            payload["tools"] = tools
        
        # Call Gemini API
        url = f"{GEMINI_API_BASE}/models/{model}:generateContent"
        
        logger.info(f"Gemini image edit: model={model}, prompt={request.prompt[:50]}...")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json"
                },
                json=payload
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"Gemini API error: {response.status_code} - {error_text}")
                return GeminiImageResponse(
                    success=False,
                    error=parse_api_error_message(response.status_code, error_text)
                )
            
            data = response.json()
        
        return parse_gemini_response(data)
        
    except Exception as e:
        logger.error(f"Gemini image edit error: {e}", exc_info=True)
        return GeminiImageResponse(success=False, error=str(e))


async def multi_turn_edit(request: GeminiMultiTurnRequest) -> GeminiImageResponse:
    """
    Multi-turn conversational image editing
    
    Maintains conversation context across turns.
    Thought signatures from previous responses are preserved.
    """
    try:
        api_key = get_api_key()
        model = request.model
        
        # Build contents from history + new prompt
        contents = []
        
        # Add conversation history
        if request.conversation_history:
            for msg in request.conversation_history:
                content_parts = []
                for part in msg.parts:
                    if part.text:
                        part_dict = {"text": part.text}
                        if part.thought_signature:
                            part_dict["thought_signature"] = part.thought_signature
                        content_parts.append(part_dict)
                    elif part.inline_data:
                        part_dict = {
                            "inline_data": {
                                "mime_type": part.inline_data.mime_type,
                                "data": part.inline_data.data
                            }
                        }
                        if part.thought_signature:
                            part_dict["thought_signature"] = part.thought_signature
                        content_parts.append(part_dict)
                
                contents.append({
                    "role": msg.role,
                    "parts": content_parts
                })
        
        # Add new user message
        contents.append({
            "role": "user",
            "parts": [{"text": request.prompt}]
        })
        
        # Build request payload - all parameters from frontend request
        payload = {
            "contents": contents,
            "generationConfig": build_generation_config(
                aspect_ratio=request.aspect_ratio,  # From frontend
                image_size=request.image_size,  # From frontend
                response_modalities=request.response_modalities  # From frontend
            )
        }
        
        # Add tools if needed - based on frontend request
        tools = build_tools(request.enable_google_search)
        if tools:
            payload["tools"] = tools
        
        # Call Gemini API
        url = f"{GEMINI_API_BASE}/models/{model}:generateContent"
        
        logger.info(f"Gemini multi-turn edit: model={model}, turns={len(contents)}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json"
                },
                json=payload
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"Gemini API error: {response.status_code} - {error_text}")
                return GeminiImageResponse(
                    success=False,
                    error=parse_api_error_message(response.status_code, error_text)
                )
            
            data = response.json()
        
        # Parse response and build updated conversation history
        result = parse_gemini_response(data)
        
        if result.success:
            # Build updated conversation history
            new_history = list(request.conversation_history or [])
            
            # Add user message
            new_history.append(ConversationMessage(
                role="user",
                parts=[ConversationPart(text=request.prompt)]
            ))
            
            # Add model response
            model_parts = []
            if result.text:
                model_parts.append(ConversationPart(text=result.text))
            
            # Add generated images with their signatures
            if "candidates" in data and data["candidates"]:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    for part in candidate["content"]["parts"]:
                        if "inlineData" in part or "inline_data" in part:
                            inline = part.get("inlineData") or part.get("inline_data")
                            sig = part.get("thoughtSignature") or part.get("thought_signature")
                            thought = part.get("thought", False)
                            if inline and not thought:
                                model_parts.append(ConversationPart(
                                    inline_data=InlineImage(
                                        data=inline.get("data"),
                                        mime_type=inline.get("mimeType") or inline.get("mime_type", "image/png")
                                    ),
                                    thought_signature=sig
                                ))
            
            new_history.append(ConversationMessage(
                role="model",
                parts=model_parts
            ))
            
            result.conversation_history = new_history
        
        return result
        
    except Exception as e:
        logger.error(f"Gemini multi-turn edit error: {e}", exc_info=True)
        return GeminiImageResponse(success=False, error=str(e))


def parse_gemini_response(data: dict) -> GeminiImageResponse:
    """
    Parse Gemini API response
    
    Extracts:
    - Generated images (as data URLs)
    - Text responses
    - Thinking images (if using Gemini 3 Pro)
    - Grounding metadata
    """
    images = []
    thinking_images = []
    text_parts = []
    grounding_metadata = None
    
    try:
        if "candidates" not in data or not data["candidates"]:
            # Check for error
            if "error" in data:
                return GeminiImageResponse(
                    success=False,
                    error=data["error"].get("message", "Unknown error")
                )
            return GeminiImageResponse(success=False, error="No candidates in response")
        
        candidate = data["candidates"][0]
        
        # Check for blocked content
        if candidate.get("finishReason") == "SAFETY":
            return GeminiImageResponse(
                success=False,
                error="Content blocked by safety filters"
            )
        
        if "content" not in candidate or "parts" not in candidate["content"]:
            return GeminiImageResponse(success=False, error="No content parts in response")
        
        # Extract parts
        for part in candidate["content"]["parts"]:
            # Text part
            if "text" in part:
                is_thought = part.get("thought", False)
                if not is_thought:
                    text_parts.append(part["text"])
            
            # Image part
            elif "inlineData" in part or "inline_data" in part:
                inline = part.get("inlineData") or part.get("inline_data")
                is_thought = part.get("thought", False)
                
                if inline and "data" in inline:
                    mime = inline.get("mimeType") or inline.get("mime_type", "image/png")
                    data_url = base64_to_data_url(inline["data"], mime)
                    
                    if is_thought:
                        thinking_images.append(data_url)
                    else:
                        images.append(data_url)
        
        # Extract grounding metadata
        if "groundingMetadata" in candidate:
            grounding_metadata = candidate["groundingMetadata"]
        
        # Combine text parts
        combined_text = "\n".join(text_parts) if text_parts else None
        
        return GeminiImageResponse(
            success=True,
            images=images,
            text=combined_text,
            thinking_images=thinking_images if thinking_images else None,
            grounding_metadata=grounding_metadata
        )
        
    except Exception as e:
        logger.error(f"Error parsing Gemini response: {e}", exc_info=True)
        return GeminiImageResponse(success=False, error=f"Failed to parse response: {e}")
