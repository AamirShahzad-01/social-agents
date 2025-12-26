"""Agents Module - AI Agents for Content Creation"""

# Content Agent (Content Strategist Chat)
from .content_agent import (
    content_strategist_chat,
    get_content_agent_memory,
    close_content_agent_memory,
    ChatStrategistRequest,
    ChatStrategistResponse,
    PlatformContent,
    GeneratedContent,
    AttachmentInput,
)

# Content Improvement Agent
from .content_improvement_agent import (
    improve_content_description,
    ImproveContentRequest,
    ImproveContentResponse,
    PLATFORM_GUIDELINES,
)

# Media Prompt Improvement Agent
from .media_prompt_agent import (
    improve_media_prompt,
    ImprovePromptRequest,
    ImprovePromptResponse,
    MediaType,
    MediaProvider,
    MEDIA_TYPE_GUIDELINES,
)

# Media Agents (Image, Audio, Video)
from .media_agents.image_agent import (
    generate_image,
    generate_image_edit,
    ImageGenerationRequest,
    ImageGenerationResponse,
    ImageEditRequest,
    IMAGE_GENERATION_PRESETS,
)

from .media_agents.audio_agent import (
    generate_speech,
    generate_music,
    generate_sound_effects,
    get_voices,
    clone_voice,
    TTSRequest,
    TTSResponse,
    MusicRequest,
    MusicResponse,
    SoundEffectsRequest,
    SoundEffectsResponse,
)

from .media_agents.video_agent import (
    generate_video,
    get_video_status,
    generate_image_to_video,
    VideoGenerationRequest,
    VideoGenerationResponse,
    VideoStatusResponse,
)

# Comment Agent
from .comment_agent import (
    process_comments,
    ProcessCommentsRequest,
    ProcessCommentsResponse,
    CommentAgentCredentials,
    CommentPlatform,
    get_comment_agent_system_prompt,
)

__all__ = [
    # Content Agent
    "content_strategist_chat",
    "get_content_agent_memory",
    "close_content_agent_memory",
    "ChatStrategistRequest",
    "ChatStrategistResponse",
    "PlatformContent",
    "GeneratedContent",
    "AttachmentInput",
    # Content Improvement Agent
    "improve_content_description",
    "ImproveContentRequest",
    "ImproveContentResponse",
    "PLATFORM_GUIDELINES",
    # Media Prompt Improvement Agent
    "improve_media_prompt",
    "ImprovePromptRequest",
    "ImprovePromptResponse",
    "MediaType",
    "MediaProvider",
    "MEDIA_TYPE_GUIDELINES",
    # Image Agent
    "generate_image",
    "generate_image_edit",
    "ImageGenerationRequest",
    "ImageGenerationResponse",
    "ImageEditRequest",
    "IMAGE_GENERATION_PRESETS",
    # Audio Agent
    "generate_speech",
    "generate_music",
    "generate_sound_effects",
    "get_voices",
    "clone_voice",
    "TTSRequest",
    "TTSResponse",
    "MusicRequest",
    "MusicResponse",
    "SoundEffectsRequest",
    "SoundEffectsResponse",
    # Video Agent
    "generate_video",
    "get_video_status",
    "generate_image_to_video",
    "VideoGenerationRequest",
    "VideoGenerationResponse",
    "VideoStatusResponse",
    # Comment Agent
    "process_comments",
    "ProcessCommentsRequest",
    "ProcessCommentsResponse",
    "CommentAgentCredentials",
    "CommentPlatform",
    "get_comment_agent_system_prompt",
]
