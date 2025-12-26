"""
Content Agent API Routes
Production-ready endpoints for content strategist chat
"""
import logging
import json
import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ...agents.content_agent import (
    content_strategist_chat,
    ChatStrategistRequest,
    ChatStrategistResponse,
    get_content_agent_memory
)
from ...services.llm_factory import LLMFactory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.post("/strategist/chat", response_model=ChatStrategistResponse)
async def chat_strategist(request_body: ChatStrategistRequest):
    """
    POST /api/v1/content/strategist/chat
    
    Expert content strategist chat with multimodal support (text, images, documents).
    
    Workflow: CONSULT → CONFIRM → GENERATE → DELIVER
    
    Features:
    - Multimodal input (text + images/PDFs/documents)
    - Multiple LLM provider support (OpenAI, Anthropic, Google, Groq)
    - Vision model auto-selection for image inputs
    - Conversation memory with PostgreSQL persistence
    - Structured output (conversational vs content generation)
    
    Args:
        request_body: Chat strategist request
        
    Returns:
        ChatStrategistResponse with either conversational message or generated content
        
    Raises:
        HTTPException: 400 for validation errors, 500 for server errors
    """
    try:
        logger.info(f"Chat strategist request - Thread: {request_body.threadId}")
        
        # Call content strategist agent
        result = await content_strategist_chat(request_body)
        
        logger.info(f"Chat strategist success - Content generated: {result.contentGenerated}")
        return result
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Validation error",
                "message": str(e)
            }
        )
    
    except Exception as e:
        logger.error(f"Chat strategist error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )


@router.post("/strategist/chat-stream")
async def chat_strategist_stream(request_body: ChatStrategistRequest):
    """
    POST /api/v1/content/strategist/chat-stream
    
    Streaming version of content strategist chat.
    Returns Server-Sent Events (SSE) for real-time token streaming.
    
    Event types:
    - token: Individual token from LLM
    - content: Generated content chunk
    - done: Stream complete
    - error: Error occurred
    
    Args:
        request_body: Chat strategist request
        
    Returns:
        StreamingResponse with SSE events
    """
    
    async def generate_stream() -> AsyncGenerator[str, None]:
        """Generate SSE stream"""
        try:
            # Initialize LLM with streaming
            llm_factory = LLMFactory()
            model = llm_factory.create_model(
                model_id=request_body.modelId or "gemini-2.5-flash",
                temperature=0.7
            )
            
            if not model:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No LLM available'})}\n\n"
                return
            
            # Build messages
            from langchain_core.messages import HumanMessage, SystemMessage
            
            messages = [
                SystemMessage(content="You are an expert content strategist."),
                HumanMessage(content=request_body.message)
            ]
            
            # Stream tokens
            full_response = ""
            async for chunk in model.astream(messages):
                if hasattr(chunk, 'content') and chunk.content:
                    token = chunk.content
                    full_response += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                    await asyncio.sleep(0)  # Allow other tasks
            
            # Send completion
            yield f"data: {json.dumps({'type': 'done', 'fullResponse': full_response})}\n\n"
            
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/strategist/history/{thread_id}")
async def get_chat_history(thread_id: str):
    """
    GET /api/v1/content/strategist/history/{thread_id}
    
    Retrieve conversation history for a thread.
    
    Args:
        thread_id: Thread ID to retrieve history for
        
    Returns:
        Chat history
    """
    try:
        memory = await get_content_agent_memory()
        
        # Get checkpoints for this thread
        checkpoints = []
        async for checkpoint in memory.checkpointer.list({"thread_id": thread_id}):
            checkpoints.append({
                "checkpoint_id": checkpoint.metadata.get("checkpoint_id"),
                "created_at": checkpoint.metadata.get("created_at"),
                "step": checkpoint.metadata.get("step")
            })
        
        return JSONResponse(
            content={
                "success": True,
                "thread_id": thread_id,
                "checkpoints": checkpoints
            }
        )
    
    except Exception as e:
        logger.error(f"Error retrieving chat history: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve chat history",
                "message": str(e)
            }
        )
