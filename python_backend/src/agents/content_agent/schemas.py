"""
Content Agent Schemas
Pydantic models for content strategist chat
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


class AttachmentInput(BaseModel):
    """Attachment input for multimodal content"""
    type: Literal["image", "pdf", "document", "text", "csv", "json"] = Field(
        ..., description="Type of attachment"
    )
    name: str = Field(..., description="Filename")
    data: str = Field(..., description="Base64 encoded data")
    mimeType: Optional[str] = Field(None, description="MIME type")
    size: Optional[int] = Field(None, description="File size in bytes")


class ChatMessage(BaseModel):
    """Chat message in conversation history"""
    role: Literal["user", "assistant"] = Field(..., description="Message role")
    content: str = Field(..., description="Message content")


class ChatStrategistRequest(BaseModel):
    """Request for content strategist chat"""
    message: str = Field(..., description="User message")
    userId: Optional[str] = Field(None, description="User ID for memory")
    threadId: Optional[str] = Field(None, description="Thread ID for conversation continuity")
    attachments: Optional[List[AttachmentInput]] = Field(None, description="Multimodal attachments")
    modelId: Optional[str] = Field(None, description="LLM model ID (e.g., 'openai:gpt-4o')")


class PlatformContent(BaseModel):
    """Platform-specific generated content"""
    platform: str = Field(..., description="Platform name (lowercase)")
    contentType: Literal["image", "video"] = Field(..., description="Content type")
    format: Optional[Literal["post", "reel", "short", "story", "carousel", "feed"]] = Field(
        None, description="Content format"
    )
    title: Optional[str] = Field(None, description="Content title or headline")
    description: str = Field(..., description="Caption or description")
    prompt: Optional[str] = Field(None, description="AI generation prompt for image/video")


class GeneratedContent(BaseModel):
    """Generated content structure"""
    contents: List[PlatformContent] = Field(..., description="Array of platform-specific content")


class ChatStrategistResponse(BaseModel):
    """Response from content strategist chat"""
    success: bool = Field(..., description="Success status")
    response: str = Field(..., description="Conversational response message")
    threadId: Optional[str] = Field(None, description="Thread ID for this conversation")
    contentGenerated: Optional[bool] = Field(False, description="Whether content was generated")
    generatedContent: Optional[GeneratedContent] = Field(
        None, description="Generated platform content"
    )
    generatedAt: Optional[int] = Field(None, description="Timestamp")
    generationTime: Optional[int] = Field(None, description="Generation time in milliseconds")
