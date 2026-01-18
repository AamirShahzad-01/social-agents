"""Content Strategist API Routes

This router provides the Content Strategist chat endpoints.
It uses the deep_agents implementation for the LangGraph-powered agent.
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import uuid
import json

router = APIRouter(prefix="/api/v1/content", tags=["Content Strategist"])


# SSE helper - same as deep_agents router
def format_sse(data: dict) -> str:
    """Format data as SSE event."""
    return f"data: {json.dumps(data)}\n\n"


class ContentBlock(BaseModel):
    """Multimodal content block."""
    type: str
    text: Optional[str] = None
    data: Optional[str] = None
    mimeType: Optional[str] = None


class StrategistChatRequest(BaseModel):
    """Chat request for content strategist."""
    message: str
    threadId: Optional[str] = None
    workspaceId: Optional[str] = None
    contentBlocks: Optional[List[ContentBlock]] = None
    enableReasoning: Optional[bool] = True


@router.post("/strategist/chat")
async def chat_strategist(request: StrategistChatRequest):
    """
    Chat endpoint for the Content Strategist.
    Forwards to the deep_agents implementation.
    """
    from ...agents.deep_agents.router import stream_agent_response
    
    message = request.message
    thread_id = request.threadId or str(uuid.uuid4())
    
    async def generate():
        """Wrapper that formats events as SSE."""
        try:
            async for event in stream_agent_response(message, thread_id, request.contentBlocks):
                yield format_sse(event)
        except Exception as e:
            yield format_sse({"step": "error", "content": str(e)})
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/strategist/history")
async def get_history(threadId: str):
    """
    Get history for a specific thread.
    Forwards to the deep_agents implementation.
    """
    from ...agents.deep_agents.router import get_thread_history
    return await get_thread_history(threadId)


@router.get("/strategist/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "content-strategist"}
