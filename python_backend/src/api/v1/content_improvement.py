"""
Content Improvement API Endpoint
Exposes AI-powered content improvement via REST API
"""
from fastapi import APIRouter, HTTPException
import logging

from ...agents.content_improvement_agent import (
    improve_content_description,
    ImproveContentRequest,
    ImproveContentResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/content", tags=["Content Improvement"])


def parse_content_error(error: Exception) -> str:
    """Parse content improvement errors into user-friendly messages."""
    error_msg = str(error).lower()
    error_str = str(error)
    
    if "rate" in error_msg or "limit" in error_msg:
        return "Rate limit exceeded. Please wait a moment and try again."
    if "quota" in error_msg or "exceeded" in error_msg:
        return "API quota exceeded. Please check your API plan."
    if "api_key" in error_msg or "apikey" in error_msg:
        return "API key not configured. Please check your settings."
    if "unauthorized" in error_msg or "401" in error_str:
        return "API authentication failed. Please check your API key."
    if "timeout" in error_msg or "connection" in error_msg:
        return "Connection error. Please try again."
    if "model" in error_msg and "not found" in error_msg:
        return "AI model temporarily unavailable."
    
    # Truncate long error messages
    if len(error_str) > 150:
        return f"Content improvement failed: {error_str[:150]}..."
    return f"Content improvement failed: {error_str}"


@router.post("/improve", response_model=ImproveContentResponse)
async def improve_content(request: ImproveContentRequest) -> ImproveContentResponse:
    """
    Improve social media content description using AI
    
    Args:
        request: Content improvement request with description and platform
        
    Returns:
        Improved content with metadata
    """
    try:
        result = await improve_content_description(request)
        return result
    except ValueError as e:
        logger.warning(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Content improvement failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=parse_content_error(e)
        )

