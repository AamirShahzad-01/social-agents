"""
Content Strategist Agent - Schemas
Request/response models for chat with multimodal support
"""
from typing import Optional, List, Literal, Dict, Any
from pydantic import BaseModel, Field


class ContentBlock(BaseModel):
    """Multimodal content block (text, image, file)"""
    type: Literal["text", "image", "file"]
    mimeType: Optional[str] = None
    data: Optional[str] = None  # Base64 encoded content
    text: Optional[str] = None  # For text blocks
    metadata: Optional[Dict[str, Any]] = None


class ChatStrategistRequest(BaseModel):
    """Request to chat with the content strategist agent"""
    message: str = Field(..., description="User message")
    threadId: str = Field(default="", description="Thread ID for conversation")
    workspaceId: Optional[str] = Field(default=None, description="Workspace ID for calendar tools")
    modelId: Optional[str] = Field(default=None, description="Model ID to use")
    enableReasoning: bool = Field(default=True, description="Enable thinking/reasoning for supported models")
    contentBlocks: Optional[List[ContentBlock]] = Field(default=None, description="Multimodal content")


class ChatStrategistResponse(BaseModel):
    """Response from the content strategist agent"""
    response: str = Field(..., description="AI response message")
    threadId: str = Field(default="", description="Thread ID")
    contentGenerated: bool = Field(default=False)
    readyToGenerate: bool = Field(default=False)
    isGeneratingMedia: bool = Field(default=False)
