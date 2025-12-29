"""Comment Agent - Main Export"""
from .service import process_comments
from .schemas import (
    ProcessCommentsRequest,
    ProcessCommentsResponse,
    CommentAgentCredentials,
    CommentPlatform,
    RawComment,
    PendingComment,
    KnowledgeEntry,
)
from .prompts import get_comment_agent_system_prompt
from .tools import (
    create_fetch_tools,
    create_reply_tools,
    create_knowledge_tools,
    create_escalate_tools,
    create_youtube_fetch_tools,
    create_youtube_reply_tools,
    generate_appsecret_proof,
)

__all__ = [
    "process_comments",
    "ProcessCommentsRequest",
    "ProcessCommentsResponse",
    "CommentAgentCredentials",
    "CommentPlatform",
    "RawComment",
    "PendingComment",
    "KnowledgeEntry",
    "get_comment_agent_system_prompt",
    # Tools
    "create_fetch_tools",
    "create_reply_tools",
    "create_knowledge_tools",
    "create_escalate_tools",
    "create_youtube_fetch_tools",
    "create_youtube_reply_tools",
    "generate_appsecret_proof",
]
