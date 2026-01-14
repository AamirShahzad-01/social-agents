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

try:
    from psycopg_pool import AsyncConnectionPool
except ImportError:
    AsyncConnectionPool = None
    logger.warning("psycopg_pool not found. Connection pooling will be disabled.")

logger = logging.getLogger(__name__)

# Global references managed by lifespan
_checkpointer = None
_checkpointer_context = None
_agent = None


async def init_checkpointer():
    """
    Initialize the AsyncPostgresSaver checkpointer.
    Call this at application startup (in FastAPI lifespan).
    
    Uses prepare_threshold=0 for Supabase pooler (PgBouncer/Supavisor) compatibility.
    """
    global _checkpointer, _checkpointer_context
    
    # Skip if already initialized (prevents hot-reload conflicts)
    if _checkpointer is not None:
        logger.info("Checkpointer already initialized, skipping")
        return _checkpointer
    
    db_uri = settings.DATABASE_URL
    if not db_uri:
        logger.warning("DATABASE_URL not configured, using in-memory checkpointer")
        _checkpointer = MemorySaver()
        return _checkpointer
    
    try:
        if AsyncConnectionPool:
            # Create async connection pool
            # prepare_threshold=0 is required for Supabase pooler compatibility
            _checkpointer_context = AsyncConnectionPool(
                conninfo=db_uri,
                max_size=10,
                min_size=1,
                open=False,  # Prevents deprecated auto-open in constructor
                kwargs={
                    "autocommit": True,
                    "prepare_threshold": 0,
                }
            )
            # Open the pool
            await _checkpointer_context.open()
            
            # Create checkpointer from the pool
            _checkpointer = AsyncPostgresSaver(conn=_checkpointer_context)
            
            # Run setup to create tables if needed
            await _checkpointer.setup()
            logger.info("AsyncPostgresSaver checkpointer initialized with AsyncConnectionPool")
        else:
            # Fallback to single connection if pool not available
            from psycopg import AsyncConnection
            from psycopg.rows import dict_row
            
            conn = await AsyncConnection.connect(
                db_uri,
                autocommit=True,
                prepare_threshold=0,
                row_factory=dict_row,
            )
            _checkpointer = AsyncPostgresSaver(conn=conn)
            _checkpointer_context = conn
            await _checkpointer.setup()
            logger.info("AsyncPostgresSaver checkpointer initialized with single connection (pool fallback)")
            
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
            # Close the connection pool
            await _checkpointer_context.close()
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


async def get_thread_history(thread_id: str) -> dict:
    """
    Fetch conversation history from LangGraph checkpoints.
    
    LangGraph automatically stores all messages in the checkpoint.
    We retrieve them using the checkpointer's aget method.
    
    Args:
        thread_id: The LangGraph thread ID
        
    Returns:
        dict with messages array and metadata
    """
    checkpointer = get_checkpointer()
    logger.info(f"Fetching history for thread: {thread_id}, checkpointer type: {type(checkpointer).__name__}")
    
    try:
        # Fetch the checkpoint for this thread
        checkpoint = await checkpointer.aget({"configurable": {"thread_id": thread_id}})
        
        logger.info(f"Checkpoint result: {checkpoint is not None}, keys: {list(checkpoint.keys()) if checkpoint else 'None'}")
        
        if not checkpoint:
            return {"messages": [], "threadId": thread_id, "messageCount": 0}
        
        # Extract messages from checkpoint channel_values
        messages_raw = checkpoint.get("channel_values", {}).get("messages", [])
        
        # Transform to UI format, filtering out tool/system messages
        ui_messages = []
        for msg in messages_raw:
            # Get message type
            msg_type = getattr(msg, 'type', None) or msg.get('type', '') if isinstance(msg, dict) else None
            
            # Skip tool messages and system messages
            if msg_type in ('tool', 'function', 'system'):
                continue
            
            # Skip tool call results
            if hasattr(msg, 'tool_call_id') or (isinstance(msg, dict) and msg.get('tool_call_id')):
                continue
            
            # Determine role
            role = 'user'
            if msg_type in ('ai', 'assistant', 'AIMessage'):
                role = 'assistant'
            elif hasattr(msg, '_type') and 'ai' in str(msg._type).lower():
                role = 'assistant'
            
            # Extract content
            content = ''
            if hasattr(msg, 'content'):
                content = msg.content
            elif isinstance(msg, dict) and 'content' in msg:
                content = msg['content']
            
            # Handle list content (multimodal)
            if isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get('type') == 'text':
                        text_parts.append(part.get('text', ''))
                    elif isinstance(part, str):
                        text_parts.append(part)
                content = '\n'.join(text_parts)
            
            if content:
                ui_messages.append({
                    "role": role,
                    "content": content
                })
        
        return {
            "success": True,
            "messages": ui_messages,
            "threadId": thread_id,
            "messageCount": len(ui_messages)
        }
        
    except Exception as e:
        logger.error(f"Error fetching thread history: {e}")
        return {"success": False, "messages": [], "threadId": thread_id, "error": str(e)}


async def get_agent():
    """Get or create the content strategist agent"""
    global _agent
    if _agent is None:
        model = ChatGoogleGenerativeAI(
            model="gemini-3-flash-preview",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.7,
        )
        
        _agent = create_agent(
            model=model,
            tools=[],  # No browser tools needed
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
    - file: Extracted text content using document processor
    """
    from src.utils.document_processor import process_document_from_base64
    
    content = []
    document_texts = []
    
    # Process content blocks (images, files) first to gather document context
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
                # PDF/document - extract text using document processor
                filename = None
                if block.metadata:
                    filename = block.metadata.get("filename") or block.metadata.get("name")
                
                mime_type = block.mimeType or "application/pdf"
                
                try:
                    extracted_text = process_document_from_base64(
                        data=block.data,
                        mime_type=mime_type,
                        filename=filename
                    )
                    if extracted_text:
                        document_texts.append(extracted_text)
                        logger.info(f"Extracted {len(extracted_text)} chars from document: {filename}")
                except Exception as e:
                    logger.error(f"Failed to process document {filename}: {e}")
                    document_texts.append(f"[Failed to process document: {filename}]")
                    
            elif block.type == "text" and block.text:
                content.append({
                    "type": "text",
                    "text": block.text
                })
    
    # Build the message with document context
    full_message = message
    
    if document_texts:
        # Prepend document context to the message
        doc_context = "\n\n---\n## Attached Documents\n\nThe following document(s) have been provided for analysis:\n\n"
        doc_context += "\n\n---\n\n".join(document_texts)
        doc_context += "\n\n---\n\n**User's Request:** "
        full_message = doc_context + message
    
    # Add the combined text message
    content.insert(0, {"type": "text", "text": full_message})
    
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
