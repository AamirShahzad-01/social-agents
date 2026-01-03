"""Schemas module - Re-exports from agent folders"""

from ..agents.content_strategist_agent import (
    ChatStrategistRequest,
    ChatStrategistResponse,
    ContentBlock,
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
from .audiences import (
    AudienceSubtype,
    CustomerFileSource,
    CustomerDataField,
    CreateCustomAudienceRequest,
    CreateLookalikeRequest,
    AudienceResponse,
    AudienceListItem,
    UploadUsersRequest,
    UploadUsersResponse,
)

__all__ = [
    # Content Strategist Agent
    "ChatStrategistRequest",
    "ChatStrategistResponse",
    "ContentBlock",
    # Content Improvement
    "ImproveContentRequest",
    "ImproveContentResponse",
    "PLATFORM_GUIDELINES",
    # Media Prompt Improvement
    "ImprovePromptRequest",
    "ImprovePromptResponse",
    "MediaType",
    "MediaProvider",
    "MEDIA_TYPE_GUIDELINES",
    # Audiences
    "AudienceSubtype",
    "CustomerFileSource",
    "CustomerDataField",
    "CreateCustomAudienceRequest",
    "CreateLookalikeRequest",
    "AudienceResponse",
    "AudienceListItem",
    "UploadUsersRequest",
    "UploadUsersResponse",
]
