"""Schemas module - Re-exports from agent folders for backward compatibility"""

# Import from agent folders
from ..agents.content_agent import (
    AttachmentInput,
    ChatMessage,
    ChatStrategistRequest,
    ChatStrategistResponse,
    PlatformContent,
    GeneratedContent,
)
from ..agents.content_improvement_agent import (
    ImproveContentRequest,
    ImproveContentResponse,
    PLATFORM_GUIDELINES,
)
from ..agents.media_prompt_agent import (
    ImprovePromptRequest,
    ImprovePromptResponse,
    MediaType,
    MediaProvider,
    MEDIA_TYPE_GUIDELINES,
)

# Alias for media prompt schemas
MediaImprovePromptRequest = ImprovePromptRequest
MediaImprovePromptResponse = ImprovePromptResponse

__all__ = [
    # Content Agent
    "AttachmentInput",
    "ChatMessage",
    "ChatStrategistRequest",
    "ChatStrategistResponse",
    "PlatformContent",
    "GeneratedContent",
    # Content Improvement
    "ImproveContentRequest",
    "ImproveContentResponse",
    "PLATFORM_GUIDELINES",
    # Media Prompt Improvement
    "ImprovePromptRequest",
    "ImprovePromptResponse",
    "MediaImprovePromptRequest",
    "MediaImprovePromptResponse",
    "MediaType",
    "MediaProvider",
    "MEDIA_TYPE_GUIDELINES",
]
