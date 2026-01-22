"""
Comment Agent Schemas
Type definitions for AI-powered comment management
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


# Platform types
CommentPlatform = Literal["instagram", "facebook", "youtube", "tiktok"]
KnowledgeCategory = Literal[
    "faq", "policy", "product", "pricing", "shipping", "returns", "support", "hours", "contact", "general"
]


class RawComment(BaseModel):
    """Raw comment from social media"""
    id: str
    text: str
    username: str
    timestamp: Optional[str] = None
    likeCount: Optional[int] = None
    postId: str
    platform: CommentPlatform
    hasReply: Optional[bool] = False


class PendingComment(BaseModel):
    """Comment pending user review"""
    id: str
    comment_id: str
    post_id: str
    platform: CommentPlatform
    workspace_id: str
    username: str
    original_comment: str
    comment_timestamp: Optional[str] = None
    post_caption: Optional[str] = None
    summary: str
    status: Literal["pending"] = "pending"
    created_at: str
    updated_at: str


class KnowledgeEntry(BaseModel):
    """Knowledge base entry"""
    id: str
    workspace_id: str
    category: KnowledgeCategory
    title: str
    question: Optional[str] = None
    answer: str
    keywords: Optional[List[str]] = None
    is_active: bool = True
    created_at: str
    updated_at: str


class CommentAgentCredentials(BaseModel):
    """Credentials for social media platforms"""
    accessToken: str = Field(default="", description="Meta platforms access token (optional for YouTube-only)")
    instagramUserId: Optional[str] = None
    facebookPageId: Optional[str] = None
    pageAccessToken: Optional[str] = None
    youtubeAccessToken: Optional[str] = None
    youtubeChannelId: Optional[str] = None


class ProcessCommentsRequest(BaseModel):
    """Request to process comments"""
    workspaceId: str
    userId: str
    platforms: Optional[List[CommentPlatform]] = Field(
        default=["instagram", "facebook", "youtube"],
        description="Platforms to process"
    )
    postIds: Optional[List[str]] = Field(None, description="Specific posts, or all recent if empty")
    runType: Optional[Literal["cron", "manual"]] = "cron"
    credentials: Optional[CommentAgentCredentials] = None


class ProcessCommentsResponse(BaseModel):
    """Response from processing comments"""
    success: bool
    commentsFetched: int = 0
    autoReplied: int = 0
    escalated: int = 0
    errors: int = 0
    executionTime: int = Field(..., description="Time in ms")
    errorMessage: Optional[str] = None


class PendingCommentsResponse(BaseModel):
    """Response from fetching pending comments"""
    success: bool
    comments: List[PendingComment] = []
    stats: dict = Field(default_factory=lambda: {"pending": 0, "total": 0})


class ReplyResponse(BaseModel):
    """Response from replying to a comment"""
    success: bool
    replyId: Optional[str] = None
    error: Optional[str] = None


class ProcessingResult(BaseModel):
    """Structured result from agent"""
    summary: str
    autoReplied: int = 0
    escalated: int = 0
    skipped: int = 0
    errors: int = 0
