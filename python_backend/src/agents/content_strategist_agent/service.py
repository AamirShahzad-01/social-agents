"""
Content Strategist Agent - Service
LangChain create_agent with PostgresSaver for short-term memory
Supports multimodal input (text, images, PDFs)

Production pattern: Use AsyncPostgresSaver with connection pooling
managed via FastAPI lifespan context manager.
"""
import logging
from typing import AsyncGenerator, List
from contextlib import asynccontextmanager

from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.memory import MemorySaver

from .schemas import ChatStrategistRequest, ContentBlock
from .prompts import get_content_strategist_system_prompt
from ...config import settings

logger = logging.getLogger(__name__)

# Global references managed by lifespan
_checkpointer = None
_checkpointer_context = None
_agent = None


async def init_checkpointer():
    """
    Initialize the AsyncPostgresSaver checkpointer.
    Call this at application startup (in FastAPI lifespan).
    """
    global _checkpointer, _checkpointer_context
    
    db_uri = settings.DATABASE_URL
    if not db_uri:
        logger.warning("DATABASE_URL not configured, using in-memory checkpointer")
        _checkpointer = MemorySaver()
        return _checkpointer
    
    try:
        # Create the async context manager
        _checkpointer_context = AsyncPostgresSaver.from_conn_string(db_uri)
        # Enter the context
        _checkpointer = await _checkpointer_context.__aenter__()
        # Run setup to create tables if needed
        await _checkpointer.setup()
        logger.info("AsyncPostgresSaver checkpointer initialized successfully")
        return _checkpointer
    except Exception as e:
        logger.error(f"Failed to initialize AsyncPostgresSaver: {e}")
        logger.warning("Falling back to in-memory checkpointer")
        _checkpointer = MemorySaver()
        return _checkpointer


async def close_checkpointer():
    """
    Close the checkpointer connection.
    Call this at application shutdown (in FastAPI lifespan).
    """
    global _checkpointer, _checkpointer_context
    
    if _checkpointer_context is not None:
        try:
            await _checkpointer_context.__aexit__(None, None, None)
            logger.info("AsyncPostgresSaver checkpointer closed")
        except Exception as e:
            logger.error(f"Error closing checkpointer: {e}")
    
    _checkpointer = None
    _checkpointer_context = None


def get_checkpointer():
    """Get the current checkpointer instance"""
    global _checkpointer
    if _checkpointer is None:
        # Fallback to memory saver if not initialized
        logger.warning("Checkpointer not initialized, using in-memory fallback")
        _checkpointer = MemorySaver()
    return _checkpointer


async def get_agent():
    """Get or create the content strategist agent"""
    global _agent
    if _agent is None:
        model = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.7,
        )
        
        _agent = create_agent(
            model=model,
            tools=[],
            system_prompt=get_content_strategist_system_prompt(),
            checkpointer=get_checkpointer(),
        )
        logger.info("Content strategist agent created")
    return _agent


def build_multimodal_content(message: str, content_blocks: List[ContentBlock] = None) -> list:
    """
    Build multimodal content for LangChain message.
    
    Converts ContentBlocks to LangChain format:
    - text: {"type": "text", "text": "..."}
    - image: {"type": "image_url", "image_url": {"url": "data:mime;base64,..."}}
    """
    content = []
    
    # Add text message
    content.append({"type": "text", "text": message})
    
    # Add content blocks (images, files)
    if content_blocks:
        for block in content_blocks:
            if block.type == "image" and block.data:
                # Image block - convert to image_url format
                mime_type = block.mimeType or "image/png"
                data_url = f"data:{mime_type};base64,{block.data}"
                content.append({
                    "type": "image_url",
                    "image_url": {"url": data_url}
                })
            elif block.type == "file" and block.data:
                # PDF/document - add as text description for now
                # Note: Full document processing would require additional handling
                name = block.metadata.get("filename", "document") if block.metadata else "document"
                content.append({
                    "type": "text",
                    "text": f"[Attached file: {name}]"
                })
            elif block.type == "text" and block.text:
                content.append({
                    "type": "text",
                    "text": block.text
                })
    
    # If only one text block, return simple string for compatibility
    if len(content) == 1 and content[0]["type"] == "text":
        return content[0]["text"]
    
    return content


async def content_strategist_chat(
    request: ChatStrategistRequest
) -> AsyncGenerator[dict, None]:
    """
    Stream chat with the content strategist agent.
    
    Supports multimodal input via contentBlocks.
    Memory handled automatically via thread_id.
    
    Yields:
        dict with step and content for each chunk
    """
    try:
        thread_id = request.threadId
        logger.info(f"Content strategist - Thread: {thread_id}")
        
        # Build multimodal content
        message_content = build_multimodal_content(
            request.message, 
            request.contentBlocks
        )
        
        agent = await get_agent()
        
        # Track accumulated response for final message
        accumulated_content = ""
        
        # Use stream_mode="messages" for token-by-token streaming
        async for event in agent.astream(
            {"messages": [{"role": "user", "content": message_content}]},
            {"configurable": {"thread_id": thread_id}},
            stream_mode="messages",
        ):
            # stream_mode="messages" yields (message_chunk, metadata) tuples
            if isinstance(event, tuple) and len(event) == 2:
                message_chunk, metadata = event
                
                # Extract content from the message chunk
                if hasattr(message_chunk, 'content'):
                    chunk_content = message_chunk.content
                    
                    # Handle list-format content from Gemini
                    if isinstance(chunk_content, list):
                        for block in chunk_content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "")
                                if text:
                                    accumulated_content += text
                                    yield {"step": "streaming", "content": accumulated_content}
                    elif isinstance(chunk_content, str) and chunk_content:
                        accumulated_content += chunk_content
                        yield {"step": "streaming", "content": accumulated_content}
        
        logger.info(f"Content strategist completed - Thread: {thread_id}")
        
    except Exception as e:
        logger.error(f"Content strategist error: {e}", exc_info=True)
        yield {"step": "error", "content": str(e)}


def extract_text_content(content) -> str:
    """
    Extract text from LangChain message content.
    
    Content can be:
    - A plain string
    - A list of content blocks [{"type": "text", "text": "..."}]
    """
    if isinstance(content, str):
        return content
    
    if isinstance(content, list):
        # Extract text from content blocks
        text_parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
            elif isinstance(block, str):
                text_parts.append(block)
        return "\n".join(text_parts)
    
    # Fallback: convert to string
    return str(content)
