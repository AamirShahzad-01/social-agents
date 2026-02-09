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
    from ...agents.deep_agents.tools.calendar_tools import set_workspace_id
    
    message = request.message
    if request.workspaceId:
        set_workspace_id(request.workspaceId)
    thread_id = request.threadId or str(uuid.uuid4())
    
    async def generate():
        """Wrapper that formats events as SSE."""
        try:
            async for event in stream_agent_response(
                message, 
                thread_id, 
                request.contentBlocks,
                enable_reasoning=request.enableReasoning,
            ):
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
    Returns messages from LangGraph checkpointer.
    """
    from ...agents.deep_agents.agent import get_agent
    from langchain_core.messages import AIMessage, HumanMessage
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Get strategist history - Thread: {threadId}")
    
    try:
        agent = get_agent()
        config = {"configurable": {"thread_id": threadId}}
        
        # Get state from checkpointer
        state = await agent.aget_state(config)
        
        messages = []
        if state and state.values and "messages" in state.values:
            raw_messages = state.values["messages"]
            
            for msg in raw_messages:
                # Format to UI expected structure
                role = "assistant" if isinstance(msg, AIMessage) else "user" if isinstance(msg, HumanMessage) else "system"
                
                # Extract content string
                content = msg.content
                if isinstance(content, list):
                    text_parts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                    content = "\n".join(text_parts)
                
                messages.append({
                    "role": role,
                    "content": content,
                    "timestamp": msg.additional_kwargs.get("timestamp", ""),
                })
        
        return {
            "success": True,
            "threadId": threadId,
            "messages": messages,
        }
    except Exception as e:
        logger.error(f"Failed to get thread history: {e}")
        return {
            "success": False,
            "threadId": threadId,
            "messages": [],
            "error": str(e),
        }


@router.get("/strategist/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "content-strategist"}
