"""
Deep Agents - FastAPI Router

SSE streaming endpoint for the content writer agent.
Matches the deep-agents-ui streaming format.

Reference: https://github.com/langchain-ai/deep-agents-ui
"""
import json
import logging
from typing import Optional, AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from .agent import get_agent
from .tools.calendar_tools import set_workspace_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/deep-agents", tags=["Deep Agents"])


# =============================================================================
# Request/Response Models
# =============================================================================

class ContentBlock(BaseModel):
    """Multimodal content block."""
    type: str
    text: Optional[str] = None
    data: Optional[str] = None
    mimeType: Optional[str] = None
    metadata: Optional[dict] = None


class ChatRequest(BaseModel):
    """Chat request matching deep-agents-ui format."""
    message: str = Field(..., description="User message")
    threadId: str = Field(..., description="Thread ID for conversation persistence")
    workspaceId: Optional[str] = Field(None, description="Workspace ID")
    modelId: Optional[str] = Field(None, description="Model ID for runtime model selection")
    contentBlocks: Optional[list[ContentBlock]] = Field(None, description="Multimodal content")
    enableReasoning: Optional[bool] = Field(True, description="Enable thinking/reasoning display")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    agent: str


# =============================================================================
# SSE Helpers
# =============================================================================

def format_sse(data: dict) -> str:
    """Format data as SSE event."""
    return f"data: {json.dumps(data)}\n\n"


def parse_agent_error(error: Exception) -> str:
    """
    Parse agent/LLM errors and return user-friendly messages.
    
    Args:
        error: The exception from the agent execution
        
    Returns:
        User-friendly error message string
    """
    error_msg = str(error).lower()
    error_str = str(error)
    
    # Rate limit / quota errors
    if "rate_limit" in error_msg or "rate limit" in error_msg or "ratelimit" in error_msg:
        return "Rate limit exceeded. Please wait a moment and try again."
    
    if "quota" in error_msg or "exceeded" in error_msg:
        return "API quota exceeded. Please check your API plan and billing details."
    
    if "insufficient" in error_msg:
        return "Insufficient quota. Please add credits to your API account."
    
    # Authentication errors
    if "api_key" in error_msg or "invalid_api_key" in error_msg or "apikey" in error_msg:
        return "Invalid API key. Please check your API configuration in settings."
    
    if "unauthorized" in error_msg or "401" in error_str:
        return "API authentication failed. Please check your API keys."
    
    if "forbidden" in error_msg or "403" in error_str:
        return "Access forbidden. Your API key may not have permission for this operation."
    
    # Content policy / safety errors
    if "content_policy" in error_msg or "safety" in error_msg or "moderation" in error_msg:
        return "Content blocked by safety filters. Please modify your message."
    
    if "blocked" in error_msg:
        return "Request blocked. Please try rephrasing your message."
    
    # Model/service errors
    if "model" in error_msg and ("not found" in error_msg or "does not exist" in error_msg):
        return "AI model temporarily unavailable. Please try again later."
    
    if "overloaded" in error_msg or "capacity" in error_msg:
        return "AI service is currently overloaded. Please try again in a few moments."
    
    # Network/connection errors
    if "connection" in error_msg or "timeout" in error_msg or "network" in error_msg:
        return "Connection error. Please check your internet and try again."
    
    if "econnrefused" in error_msg or "enotfound" in error_msg:
        return "Unable to connect to AI service. Please try again later."
    
    # Context length errors
    if "context" in error_msg and ("length" in error_msg or "too long" in error_msg or "maximum" in error_msg):
        return "Message too long. Please try a shorter message or start a new conversation."
    
    if "token" in error_msg and ("limit" in error_msg or "maximum" in error_msg):
        return "Conversation is too long. Please start a new conversation."
    
    # Configuration errors
    if "not configured" in error_msg or "not set" in error_msg:
        return "Service not configured. Please check your API settings."
    
    # Generic server errors
    if "500" in error_str or "internal server error" in error_msg:
        return "Server error occurred. Please try again."
    
    if "502" in error_str or "503" in error_str or "504" in error_str:
        return "AI service temporarily unavailable. Please try again later."
    
    # Default: truncate and clean up
    if len(error_str) > 150:
        return f"An error occurred: {error_str[:150]}..."
    return f"An error occurred: {error_str}"


# =============================================================================
# Multimodal Content Builder
# =============================================================================

def build_multimodal_content(message: str, content_blocks: list = None):
    """
    Build multimodal content for LangChain message.
    
    Converts ContentBlocks to LangChain format:
    - text: {"type": "text", "text": "..."}
    - image: {"type": "image_url", "image_url": {"url": "data:mime;base64,..."}}
    - file: Extracted text content using document processor
    """
    from src.utils.document_processor import process_document_from_base64
    
    content = []
    document_texts = []
    
    # Process content blocks (images, files) first to gather document context
    if content_blocks:
        for block in content_blocks:
            if isinstance(block, dict):
                block_type = block.get('type')
                block_data = block.get('data')
                block_mime = block.get('mimeType')
                block_text = block.get('text')
                block_metadata = block.get('metadata')
            else:
                block_type = getattr(block, 'type', None)
                block_data = getattr(block, 'data', None)
                block_mime = getattr(block, 'mimeType', None)
                block_text = getattr(block, 'text', None)
                block_metadata = getattr(block, 'metadata', None)
            
            if block_type == "image" and block_data:
                # Image block - convert to image_url format
                mime_type = block_mime or "image/png"
                data_url = f"data:{mime_type};base64,{block_data}"
                content.append({
                    "type": "image_url",
                    "image_url": {"url": data_url}
                })
                logger.info(f"Added image block: {mime_type}")
            elif block_type == "file" and block_data:
                # PDF/document - extract text using document processor
                filename = None
                if block_metadata:
                    filename = block_metadata.get("filename") or block_metadata.get("name")
                
                mime_type = block_mime or "application/pdf"
                
                try:
                    extracted_text = process_document_from_base64(
                        data=block_data,
                        mime_type=mime_type,
                        filename=filename
                    )
                    if extracted_text:
                        document_texts.append(extracted_text)
                        logger.info(f"Extracted {len(extracted_text)} chars from document: {filename}")
                except Exception as e:
                    logger.error(f"Failed to process document {filename}: {e}")
                    document_texts.append(f"[Failed to process document: {filename}]")
                    
            elif block_type == "text" and block_text:
                content.append({
                    "type": "text",
                    "text": block_text
                })
    
    # Build the message with document context
    full_message = message
    
    if document_texts:
        # Prepend document context to the message
        doc_context = "\n\n---\n## Attached Documents\n\nThe following document(s) have been provided for analysis:\n\n"
        doc_context += "\n\n---\n\n".join(document_texts)
        doc_context += "\n\n---\n\n**User's Request:** "
        full_message = doc_context + message
    
    # Add the combined text message at the beginning
    content.insert(0, {"type": "text", "text": full_message})
    
    # If only one text block, return simple string for compatibility
    if len(content) == 1 and content[0]["type"] == "text":
        return content[0]["text"]
    
    return content


# =============================================================================
# Streaming Handler (matches content_writer.py pattern)
# =============================================================================

async def stream_agent_response(
    message: str,
    thread_id: str,
    content_blocks: list = None,
) -> AsyncGenerator[dict, None]:
    """Stream agent response using events stream mode.
    
    This provides token-by-token streaming for a better UI experience.
    Supports multimodal content via content_blocks.
    """
    try:
        logger.info(f"Streaming chat - Thread: {thread_id}, Message: {message[:100]}, Blocks: {len(content_blocks) if content_blocks else 0}")
        
        agent = get_agent()
        config = {"configurable": {"thread_id": thread_id}}
        
        accumulated_content = ""
        accumulated_thinking = ""
        
        # Build multimodal content if blocks provided
        message_content = build_multimodal_content(message, content_blocks)
        
        # Checkpointer automatically handles message history via thread_id
        async for event in agent.astream_events(
            {"messages": [HumanMessage(content=message_content)]},
            config=config,
            version="v2",
        ):
            kind = event["event"]
            name = event.get("name", "unknown")
            
            # 1. Handle Token Streaming (Content & Thinking/Reasoning)
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                
                # === Handle Reasoning/Thinking Content ===
                # Method 1: Check additional_kwargs (OpenAI o1, some models)
                thinking = chunk.additional_kwargs.get("reasoning_content") or \
                           chunk.additional_kwargs.get("thought") or \
                           chunk.additional_kwargs.get("reasoning")
                
                if thinking:
                    accumulated_thinking += thinking
                    yield {"step": "thinking", "content": accumulated_thinking}
                
                # Method 2: Check content_blocks attribute (newer LangChain pattern)
                if hasattr(chunk, "content_blocks") and chunk.content_blocks:
                    for block in chunk.content_blocks:
                        if isinstance(block, dict) and block.get("type") == "reasoning":
                            # Handle direct reasoning text
                            reasoning_text = block.get("text", "") or block.get("content", "")
                            if reasoning_text:
                                accumulated_thinking += reasoning_text
                                yield {"step": "thinking", "content": accumulated_thinking}
                            
                            # Handle reasoning summaries (responses/v1 format)
                            summaries = block.get("summary", [])
                            if summaries:
                                for summary in summaries:
                                    if isinstance(summary, dict):
                                        summary_text = summary.get("text", "")
                                        if summary_text:
                                            accumulated_thinking += f"\n{summary_text}"
                                            yield {"step": "thinking", "content": accumulated_thinking, "summary": True}
                
                # === Handle Regular Content ===
                content = chunk.content
                if isinstance(content, str) and content:
                    accumulated_content += content
                    yield {"step": "streaming", "content": accumulated_content}
                elif isinstance(content, list):
                    for part in content:
                        text_to_add = ""
                        if isinstance(part, dict):
                            part_type = part.get("type", "")
                            
                            # Regular text content
                            if part_type == "text":
                                text_to_add = part.get("text", "")
                            
                            # Reasoning/thinking content blocks with summaries
                            elif part_type in ["thought", "reasoning", "thinking"]:
                                # Direct reasoning text
                                reasoning_text = part.get("text", "") or part.get("content", "")
                                if reasoning_text:
                                    accumulated_thinking += reasoning_text
                                    yield {"step": "thinking", "content": accumulated_thinking}
                                
                                # Reasoning summaries (responses/v1 format)
                                summaries = part.get("summary", [])
                                if summaries:
                                    for summary in summaries:
                                        if isinstance(summary, dict):
                                            summary_text = summary.get("text", "")
                                            if summary_text:
                                                accumulated_thinking += f"\n{summary_text}"
                                                yield {"step": "thinking", "content": accumulated_thinking, "summary": True}
                            
                            # Tool use blocks (handled separately)
                            elif part_type == "tool_use":
                                pass  # Handled in tool events
                                
                        elif isinstance(part, str):
                            text_to_add = part
                        
                        if text_to_add:
                            accumulated_content += text_to_add
                            yield {"step": "streaming", "content": accumulated_content}

            # 1.1 Model End (no fallback in production)
            elif kind == "on_chat_model_end":
                logger.info(f"Model end: {name}")
            
            # 2. Handle State Updates (Todos, Files)
            elif kind == "on_chain_end":
                logger.info(f"Chain end: {name}")
                # Sync on key middleware completions
                if name in {"LangGraph", "agent", "TodoListMiddleware.after_model", "TodoListMiddleware", "FilesystemMiddleware", "tools"}:
                    state = await agent.aget_state(config)
                    if state and state.values:
                        # Get todos and ensure each has an id
                        raw_todos = state.values.get("todos", [])
                        todos = []
                        for i, todo in enumerate(raw_todos):
                            todo_with_id = {
                                "id": todo.get("id") or f"todo-{i}",
                                "content": todo.get("content", ""),
                                "status": todo.get("status", "pending"),
                            }
                            todos.append(todo_with_id)
                        
                        # Get files from StateBackend and transform to frontend format
                        # StateBackend stores: {path: {content: [...], created_at, modified_at}}
                        # Frontend expects: {path: "content string"}
                        raw_files = state.values.get("files", {})
                        files = {}
                        for path, file_data in raw_files.items():
                            if isinstance(file_data, dict) and "content" in file_data:
                                content = file_data["content"]
                                # Content may be a list of lines or a string
                                if isinstance(content, list):
                                    files[path] = "\n".join(content)
                                else:
                                    files[path] = str(content)
                            elif isinstance(file_data, str):
                                files[path] = file_data
                            else:
                                files[path] = str(file_data)
                        
                        logger.info(f"Syncing state - Thread: {thread_id}, Todos: {len(todos)}, Files: {len(files)}")
                        yield {
                            "step": "sync",
                            "todos": todos,
                            "files": files,
                        }
            
            # 3. Handle Tool Calls (filter out middleware tools from UI)
            elif kind == "on_tool_start":
                tool_name = event["name"]
                logger.info(f"Tool start: {tool_name}")
                
                # Middleware tools to hide from UI but show activity
                hidden_tools = {
                    "write_file", "read_file", "edit_file", "ls", "glob", "grep", "execute",
                    "write_todos", "read_todos",
                }
                
                # Emit activity event for all tools (shows what agent is doing)
                activity_messages = {
                    "write_todos": "Updating task list...",
                    "read_todos": "Reading tasks...",
                    "write_file": "Writing file...",
                    "read_file": "Reading file...",
                    "edit_file": "Editing file...",
                    "ls": "Listing files...",
                    "glob": "Searching files...",
                    "grep": "Searching content...",
                    "task": "Delegating to sub-agent...",
                    "web_search": "Searching the web...",
                }
                activity_msg = activity_messages.get(tool_name, f"Running {tool_name}...")
                yield {"step": "activity", "message": activity_msg, "tool": tool_name}
                
                # Only emit tool_call for user-visible tools
                if tool_name not in hidden_tools:
                    yield {
                        "step": "tool_call",
                        "id": event["run_id"],
                        "name": tool_name,
                        "args": event["data"].get("input", {}),
                    }
                
                # If it's the task tool, also signal sub_agent
                if tool_name == "task":
                    yield {
                        "step": "sub_agent",
                        "id": event["run_id"],
                        "name": "researcher",
                        "status": "active",
                        "description": event["data"].get("input", {}).get("description", "Working..."),
                    }
            
            # 4. Handle Tool Results (filter out middleware tools from UI)
            elif kind == "on_tool_end":
                tool_name = event["name"]
                logger.info(f"Tool end: {tool_name}")
                
                # Middleware tools to hide from UI
                hidden_tools = {
                    "write_file", "read_file", "edit_file", "ls", "glob", "grep", "execute",
                    "write_todos", "read_todos",
                }
                
                # Only emit tool_result for user-visible tools
                if tool_name not in hidden_tools:
                    result = str(event["data"].get("output", ""))[:1000]
                    yield {
                        "step": "tool_result",
                        "id": event["run_id"],
                        "name": tool_name,
                        "result": result,
                    }
                
                if tool_name == "task":
                    yield {
                        "step": "sub_agent",
                        "id": event["run_id"],
                        "name": "researcher",
                        "status": "completed",
                    }
                
                # Sync state after state-changing tools (todos, files)
                if tool_name in {"write_todos", "write_file", "edit_file"}:
                    state = await agent.aget_state(config)
                    if state and state.values:
                        # Get todos with proper formatting
                        raw_todos = state.values.get("todos", [])
                        todos = [
                            {
                                "id": todo.get("id") or f"todo-{i}",
                                "content": todo.get("content", ""),
                                "status": todo.get("status", "pending"),
                            }
                            for i, todo in enumerate(raw_todos)
                        ]
                        
                        # Get files with proper formatting
                        raw_files = state.values.get("files", {})
                        files = {}
                        for path, file_data in raw_files.items():
                            if isinstance(file_data, dict) and "content" in file_data:
                                content = file_data["content"]
                                files[path] = "\n".join(content) if isinstance(content, list) else str(content)
                            else:
                                files[path] = str(file_data) if not isinstance(file_data, str) else file_data
                        
                        logger.info(f"Tool sync - Todos: {len(todos)}, Files: {len(files)}")
                        yield {"step": "sync", "todos": todos, "files": files}

        # Final done event
        yield {"step": "done", "content": accumulated_content}
        logger.info(f"Streaming completed - Thread: {thread_id}, Content length: {len(accumulated_content)}")
        
    except Exception as e:
        logger.error(f"Streaming error: {e}", exc_info=True)
        yield {"step": "error", "content": parse_agent_error(e)}


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the deep agents service is healthy."""
    try:
        get_agent()
        return HealthResponse(status="healthy", agent="content-writer")
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=parse_agent_error(e))


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """Stream chat with the content writer agent.
    
    Returns Server-Sent Events (SSE) stream with:
    - streaming: Content being generated
    - tool_call: Tool invocation with name and args
    - tool_result: Tool execution result
    - sub_agent: Sub-agent activity
    - done: Final response
    - error: Error message
    """
    async def generate():
        try:
            message = request.message
            if request.workspaceId:
                set_workspace_id(request.workspaceId)
            
            async for event in stream_agent_response(
                message=message,
                thread_id=request.threadId,
                content_blocks=request.contentBlocks,
            ):
                yield format_sse(event)
                
        except Exception as e:
            logger.error(f"Chat stream error: {e}", exc_info=True)
            yield format_sse({"step": "error", "content": parse_agent_error(e)})
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/threads/{thread_id}/history")
async def get_thread_history(thread_id: str):
    """Get conversation history for a thread from LangGraph checkpointer."""
    logger.info(f"Get history - Thread: {thread_id}")
    
    try:
        agent = get_agent()
        config = {"configurable": {"thread_id": thread_id}}
        
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
            "threadId": thread_id,
            "messages": messages,
        }
    except Exception as e:
        logger.error(f"Failed to get thread history: {e}")
        return {
            "success": False,
            "threadId": thread_id,
            "messages": [],
            "error": parse_agent_error(e),
        }


class ResumeRequest(BaseModel):
    """Request to resume from an interrupt."""
    decision: str = Field(..., description="approve or deny")
    actionId: str = Field(..., description="ID of the action to resume")
    reason: Optional[str] = Field(None, description="Reason for denial")


@router.post("/threads/{thread_id}/resume")
async def resume_interrupt(thread_id: str, request: ResumeRequest):
    """Resume from an interrupt (tool approval/denial).
    
    This endpoint handles human-in-the-loop approval for tool calls.
    """
    logger.info(f"Resume interrupt - Thread: {thread_id}, Decision: {request.decision}")
    
    # For now, return success - full implementation requires LangGraph checkpointer
    # with interrupt support in the agent configuration
    return {
        "success": True,
        "threadId": thread_id,
        "decision": request.decision,
        "actionId": request.actionId,
        "message": f"Action {request.decision}d successfully",
    }


@router.get("/threads/{thread_id}/state")
async def get_thread_state(thread_id: str):
    """Get current thread state including todos and files.
    
    Returns the current state from the LangGraph checkpointer.
    """
    logger.info(f"Get thread state - Thread: {thread_id}")
    
    try:
        agent = get_agent()
        
        # Get state from checkpointer
        config = {"configurable": {"thread_id": thread_id}}
        state = await agent.aget_state(config)
        
        if state and state.values:
            values = state.values
            return {
                "success": True,
                "threadId": thread_id,
                "todos": values.get("todos", []),
                "files": values.get("files", {}),
            }
        
        return {
            "success": True,
            "threadId": thread_id,
            "todos": [],
            "files": {},
        }
    except Exception as e:
        logger.error(f"Failed to get thread state: {e}")
        return {
            "success": False,
            "threadId": thread_id,
            "todos": [],
            "files": {},
            "error": parse_agent_error(e),
        }


class DeleteThreadRequest(BaseModel):
    """Request to delete a thread and its checkpoints."""
    workspaceId: Optional[str] = Field(None, description="Workspace ID for verification")


@router.delete("/threads/{thread_id}")
async def delete_thread_checkpoints(thread_id: str, request: Optional[DeleteThreadRequest] = None):
    """Delete all LangGraph checkpoints for a thread.
    
    This permanently removes all conversation history for the thread from the
    checkpoint tables. Should be called when a user deletes a conversation.
    """
    logger.info(f"Delete thread checkpoints - Thread: {thread_id}")
    
    try:
        from ...config import settings
        import psycopg
        
        if not settings.DATABASE_URL:
            logger.warning("DATABASE_URL not configured - cannot delete checkpoints")
            return {
                "success": True,
                "threadId": thread_id,
                "message": "No database configured, using in-memory storage",
            }
        
        # Connect and delete from all checkpoint tables
        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # Delete from checkpoint_writes
                cur.execute(
                    "DELETE FROM checkpoint_writes WHERE thread_id = %s",
                    (thread_id,)
                )
                writes_deleted = cur.rowcount
                
                # Delete from checkpoint_blobs
                cur.execute(
                    "DELETE FROM checkpoint_blobs WHERE thread_id = %s",
                    (thread_id,)
                )
                blobs_deleted = cur.rowcount
                
                # Delete from checkpoints
                cur.execute(
                    "DELETE FROM checkpoints WHERE thread_id = %s",
                    (thread_id,)
                )
                checkpoints_deleted = cur.rowcount
                
                conn.commit()
        
        logger.info(
            f"Deleted checkpoints for thread {thread_id}: "
            f"{checkpoints_deleted} checkpoints, {blobs_deleted} blobs, {writes_deleted} writes"
        )
        
        return {
            "success": True,
            "threadId": thread_id,
            "deleted": {
                "checkpoints": checkpoints_deleted,
                "blobs": blobs_deleted,
                "writes": writes_deleted,
            },
            "message": "Thread checkpoints deleted successfully",
        }
        
    except Exception as e:
        logger.error(f"Failed to delete thread checkpoints: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete thread checkpoints: {str(e)}"
        )
