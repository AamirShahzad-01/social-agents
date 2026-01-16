"""
Content Agent API Routes
"""
import logging
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse

from ...agents.content_strategist_agent import (
    content_strategist_chat,
    ChatStrategistRequest,
    get_thread_history,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.get("/strategist/history")
async def get_history(threadId: str = Query(..., description="LangGraph thread ID")):
    """
    GET /api/v1/content/strategist/history
    
    Fetch conversation history from LangGraph checkpoints.
    The history is automatically stored by LangGraph when using the checkpointer.
    """
    if not threadId:
        raise HTTPException(status_code=400, detail="threadId query parameter is required")
    
    result = await get_thread_history(threadId)
    
    if not result.get("success", True) and "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return result


@router.post("/strategist/chat")
async def chat_strategist(request_body: ChatStrategistRequest):
    """
    POST /api/v1/content/strategist/chat
    
    Stream chat with content strategist agent.
    Memory handled automatically via thread_id.
    """
    
    async def generate_stream() -> AsyncGenerator[str, None]:
        full_response = ""
        full_thinking = ""
        
        async for chunk in content_strategist_chat(request_body):
            step = chunk.get("step", "")
            content = chunk.get("content", "")
            
            if step == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': content})}\n\n"
                return
            
            # Handle thinking/reasoning stream
            if step == "thinking" and content:
                full_thinking = content
                yield f"data: {json.dumps({'type': 'thinking', 'content': content})}\n\n"
            
            # Handle regular content stream
            elif step == "streaming" and content:
                full_response = content
                yield f"data: {json.dumps({'type': 'update', 'step': step, 'content': content})}\n\n"
        
        # Include thinking in final response for persistence
        yield f"data: {json.dumps({'type': 'done', 'response': full_response, 'thinking': full_thinking})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
