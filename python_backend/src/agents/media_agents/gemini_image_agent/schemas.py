"""
Gemini Image Agent Schemas
Pydantic models for Gemini image generation and editing

Supports:
- gemini-3-pro-image-preview (4K, thinking mode, up to 14 reference images)
"""

from typing import Optional, Literal, List
from pydantic import BaseModel, Field


# Valid aspect ratios per Gemini docs
AspectRatio = Literal["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]

# Valid image sizes
ImageSize = Literal["1K", "2K", "4K"]

# Available models
GeminiImageModel = Literal["gemini-3-pro-image-preview"]


class InlineImage(BaseModel):
    """Inline image data for input"""
    data: str = Field(..., description="Base64-encoded image data")
    mime_type: str = Field(default="image/png", alias="mimeType", description="MIME type of the image")
    
    class Config:
        populate_by_name = True


class ImageConfig(BaseModel):
    """Image configuration options"""
    aspect_ratio: Optional[AspectRatio] = Field(default="1:1", alias="aspectRatio")
    image_size: Optional[ImageSize] = Field(default="1K", alias="imageSize")
    
    class Config:
        populate_by_name = True


class ConversationPart(BaseModel):
    """A part of a conversation message"""
    text: Optional[str] = None
    inline_data: Optional[InlineImage] = Field(default=None, alias="inlineData")
    thought: Optional[bool] = None
    thought_signature: Optional[str] = Field(default=None, alias="thoughtSignature")
    
    class Config:
        populate_by_name = True


class ConversationMessage(BaseModel):
    """A message in the conversation history"""
    role: Literal["user", "model"]
    parts: List[ConversationPart]


# ============================================================================
# REQUEST SCHEMAS
# ============================================================================

class GeminiImageGenerateRequest(BaseModel):
    """
    Request for Gemini image generation (text-to-image)
    
    Example:
    {
        "prompt": "A sunset over mountains",
        "model": "gemini-3-pro-image-preview",
        "aspectRatio": "16:9",
        "imageSize": "2K"
    }
    
    Frontend may use 'action' field instead of 'model':
    - action: 'gemini-3-pro' -> model: 'gemini-3-pro-image-preview'
    - action: 'gemini-3-pro-image' -> model: 'gemini-3-pro-image-preview'
    """
    prompt: str = Field(..., min_length=1, max_length=10000, description="Text prompt for image generation")
    model: Optional[GeminiImageModel] = Field(default=None, description="Gemini model to use")
    action: Optional[str] = Field(default=None, description="Frontend action identifier (alternative to model)")
    aspect_ratio: Optional[str] = Field(default="1:1", alias="aspectRatio")
    image_size: Optional[str] = Field(default="1K", alias="imageSize")
    enable_google_search: bool = Field(default=False, alias="enableGoogleSearch", description="Enable Google Search grounding")
    response_modalities: Optional[List[str]] = Field(default=None, alias="responseModalities", description="Response modalities: ['TEXT', 'IMAGE'] or ['IMAGE']")
    
    class Config:
        populate_by_name = True
    
    def get_model(self) -> str:
        """Get the actual model name from either model or action field"""
        if self.model:
            return self.model
        
        # Map action to model
        action_map = {
            "gemini-3-pro": "gemini-3-pro-image-preview",
            "gemini-3-pro-image": "gemini-3-pro-image-preview",
        }
        
        if self.action and self.action in action_map:
            return action_map[self.action]
        
        # Default to Gemini 3 Pro Image Preview
        return "gemini-3-pro-image-preview"


class GeminiImageEditRequest(BaseModel):
    """
    Request for Gemini image editing (text + image → image)
    
    Example:
    {
        "prompt": "Add a wizard hat to the cat",
        "imageUrl": "data:image/png;base64,...",
        "model": "gemini-3-pro-image-preview"
    }
    """
    prompt: str = Field(..., min_length=1, max_length=10000, description="Edit instructions")
    image_url: str = Field(..., alias="imageUrl", description="Base64 data URL or http URL of source image")
    model: GeminiImageModel = Field(default="gemini-3-pro-image-preview")
    aspect_ratio: Optional[AspectRatio] = Field(default=None, alias="aspectRatio")
    image_size: Optional[ImageSize] = Field(default=None, alias="imageSize")
    enable_google_search: bool = Field(default=False, alias="enableGoogleSearch")
    response_modalities: Optional[List[str]] = Field(default=None, alias="responseModalities", description="Response modalities: ['TEXT', 'IMAGE'] or ['IMAGE']")
    # Additional reference images (Gemini 3 Pro supports up to 14 total)
    reference_images: Optional[List[InlineImage]] = Field(default=None, alias="referenceImages")
    
    class Config:
        populate_by_name = True


class GeminiMultiTurnRequest(BaseModel):
    """
    Request for multi-turn conversational image editing
    
    The conversation history maintains context across turns.
    Thought signatures from previous responses should be passed back.
    """
    prompt: str = Field(..., min_length=1, max_length=10000, description="Current turn prompt")
    model: GeminiImageModel = Field(default="gemini-3-pro-image-preview")
    conversation_history: Optional[List[ConversationMessage]] = Field(
        default=None, 
        alias="conversationHistory",
        description="Previous conversation messages for context"
    )
    aspect_ratio: Optional[AspectRatio] = Field(default="1:1", alias="aspectRatio")
    image_size: Optional[ImageSize] = Field(default="1K", alias="imageSize")
    enable_google_search: bool = Field(default=False, alias="enableGoogleSearch")
    response_modalities: Optional[List[str]] = Field(default=None, alias="responseModalities", description="Response modalities: ['TEXT', 'IMAGE'] or ['IMAGE']")
    
    class Config:
        populate_by_name = True


# ============================================================================
# RESPONSE SCHEMAS
# ============================================================================

class GeneratedImagePart(BaseModel):
    """A generated image from the response"""
    data: str = Field(..., description="Base64-encoded image data")
    mime_type: str = Field(default="image/png", alias="mimeType")
    thought_signature: Optional[str] = Field(default=None, alias="thoughtSignature")
    is_thought: bool = Field(default=False, alias="isThought", description="Whether this is a thinking image")
    
    class Config:
        populate_by_name = True


class GeminiImageResponse(BaseModel):
    """
    Response from Gemini image generation/editing
    
    The response may contain:
    - Generated images (as data URLs)
    - Text explanations
    - Conversation history for multi-turn
    """
    success: bool = True
    images: List[str] = Field(default_factory=list, description="Generated image data URLs")
    text: Optional[str] = Field(default=None, description="Text response from the model")
    conversation_history: Optional[List[ConversationMessage]] = Field(
        default=None,
        alias="conversationHistory",
        description="Updated conversation history for multi-turn"
    )
    thinking_images: Optional[List[str]] = Field(
        default=None,
        alias="thinkingImages", 
        description="Intermediate thinking images (Gemini 3 Pro)"
    )
    grounding_metadata: Optional[dict] = Field(
        default=None,
        alias="groundingMetadata",
        description="Search grounding metadata if enabled"
    )
    error: Optional[str] = None
    
    class Config:
        populate_by_name = True
