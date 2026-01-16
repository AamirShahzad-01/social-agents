"""
Content Strategist Agent - Main Service
DeepAgents-based implementation with memory, skills, and subagents.

This is the main entry point. Components are organized in:
- config/: Configuration and constants
- tools/: Tool definitions (@tool decorated functions)
- subagents/: Subagent loader and definitions
- checkpointer/: Database persistence
- utils/: Helper functions
- skills/: Platform-specific SKILL.md files
"""
import logging
from typing import AsyncGenerator, Optional

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model

from .config import (
    SUBAGENTS_YAML_PATH,
    DEFAULT_MODEL,
    DEFAULT_TEMPERATURE,
    get_memory_files,
    get_skills_dirs,
)
from .tools import (
    web_search,
    get_today_entries,
    get_tomorrow_entries,
    get_week_calendar,
    add_calendar_entry,
    add_weekly_content_plan,
    find_and_update_entry,
    find_and_delete_entry,
    clear_day,
    set_workspace_id,
    load_skill,
)
from .subagents import load_subagents
from .checkpointer import init_checkpointer, close_checkpointer, get_checkpointer
from .utils import build_multimodal_content
from .schemas import ChatStrategistRequest
from ...config import settings

logger = logging.getLogger(__name__)

# Global agent reference
_agent = None




    # Use init_chat_model with configurable_fields for runtime model/thinking selection
    # Reference: https://python.langchain.com/docs/concepts/chat_models/#configurable-models
    # configurable_fields should be a TUPLE of field names that can be overridden at runtime
    # Include thinking params as configurable so they can be toggled at runtime
    model = init_chat_model(
        model=DEFAULT_MODEL,  # Default model (can be overridden at runtime)
        configurable_fields=(
            "model",              # Allow switching model at runtime
            "model_provider",     # Allow switching provider
            "temperature",        # Allow adjusting temperature
            "include_thoughts",   # Allow toggling thinking output
            "thinking_budget",    # Allow adjusting thinking budget (Gemini 2.5)
        ),
        config_prefix="llm",      # Config prefix: config={"configurable": {"llm_model": "..."}}
        temperature=DEFAULT_TEMPERATURE,
        # Enable thinking by default for Gemini models
        include_thoughts=True,
        thinking_budget=1024,
    )
    
    _agent = create_deep_agent(
        model=model,
        memory=get_memory_files(),
        skills=get_skills_dirs(),
        tools=[
            web_search,
            # Skills - Dynamic platform expertise
            load_skill,
            # Calendar - View
            get_today_entries,
            get_tomorrow_entries,
            get_week_calendar,
            # Calendar - Add
            add_calendar_entry,
            add_weekly_content_plan,
            # Calendar - Modify (no IDs needed!)
            find_and_update_entry,
            find_and_delete_entry,
            clear_day,
        ],
        subagents=load_subagents(SUBAGENTS_YAML_PATH),
        checkpointer=get_checkpointer(),
    )
    logger.info("Content strategist deep agent created")
    
    return _agent


# =============================================================================
# Thread History
# =============================================================================

async def get_thread_history(thread_id: str) -> dict:
    """
    Fetch conversation history from LangGraph checkpoints.
    
    Args:
        thread_id: The LangGraph thread ID
        
    Returns:
        dict with messages array and metadata
    """
    checkpointer = get_checkpointer()
    logger.info(f"Fetching history for thread: {thread_id}")
    
    try:
        checkpoint = await checkpointer.aget({"configurable": {"thread_id": thread_id}})
        
        if not checkpoint:
            return {"messages": [], "threadId": thread_id, "messageCount": 0}
        
        messages_raw = checkpoint.get("channel_values", {}).get("messages", [])
        
        ui_messages = []
        for msg in messages_raw:
            msg_type = getattr(msg, 'type', None) or msg.get('type', '') if isinstance(msg, dict) else None
            
            if msg_type in ('tool', 'function', 'system'):
                continue
            
            if hasattr(msg, 'tool_call_id') or (isinstance(msg, dict) and msg.get('tool_call_id')):
                continue
            
            role = 'user'
            if msg_type in ('ai', 'assistant', 'AIMessage'):
                role = 'assistant'
            elif hasattr(msg, '_type') and 'ai' in str(msg._type).lower():
                role = 'assistant'
            
            content = ''
            if hasattr(msg, 'content'):
                content = msg.content
            elif isinstance(msg, dict) and 'content' in msg:
                content = msg['content']
            
            if isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get('type') == 'text':
                        text_parts.append(part.get('text', ''))
                    elif isinstance(part, str):
                        text_parts.append(part)
                content = '\n'.join(text_parts)
            
            if content:
                ui_messages.append({"role": role, "content": content})
        
        return {
            "success": True,
            "messages": ui_messages,
            "threadId": thread_id,
            "messageCount": len(ui_messages)
        }
        
    except Exception as e:
        logger.error(f"Error fetching thread history: {e}")
        return {"success": False, "messages": [], "threadId": thread_id, "error": str(e)}


# =============================================================================
# Chat Handler
# =============================================================================

async def content_strategist_chat(
    request: ChatStrategistRequest
) -> AsyncGenerator[dict, None]:
    """
    Stream chat with the content strategist agent.
    
    Supports multimodal input via contentBlocks.
    Memory handled automatically via thread_id.
    
    Streams only the final AI response (filters out tool messages).
    """
    from langchain_core.messages import AIMessageChunk, ToolMessage
    
    try:
        thread_id = request.threadId
        logger.info(f"Content strategist - Thread: {thread_id}")
        
        message_content = build_multimodal_content(
            request.message, 
            request.contentBlocks
        )
        
        # Set workspace_id for calendar tools before agent runs
        if request.workspaceId:
            set_workspace_id(request.workspaceId)
            logger.info(f"Workspace ID set for calendar tools: {request.workspaceId}")
        
        agent = await get_agent()
        accumulated_content = ""
        accumulated_thinking = ""
        
        # Build runtime config for model selection and reasoning
        # Reference: https://reference.langchain.com/python/langchain/models/#langchain.chat_models.init_chat_model
        # Reference: https://python.langchain.com/docs/integrations/chat/google_generative_ai/#thinking-support
        runtime_config = {"thread_id": thread_id}
        
        if request.modelId:
            # Use llm_ prefix as defined in init_chat_model config_prefix
            runtime_config["llm_model"] = request.modelId
            logger.info(f"Using model from request: {request.modelId}")
        
        # Configure reasoning/thinking at runtime based on provider
        # Each provider has different thinking parameters:
        # - Gemini: include_thoughts, thinking_budget
        # - Anthropic/Claude: thinking={"type": "enabled", "budget_tokens": N}
        # - OpenAI: reasoning={"effort": "low/medium/high"}
        model_id = request.modelId or ""
        
        if request.enableReasoning:
            if model_id.startswith("google_genai:") or model_id.startswith("gemini"):
                # Gemini thinking support
                # Use thinking_budget for all Gemini models (in configurable_fields)
                # Reference: https://python.langchain.com/docs/integrations/chat/google_generative_ai/#thinking-support
                runtime_config["llm_include_thoughts"] = True
                runtime_config["llm_thinking_budget"] = 1024  # Token budget for thinking
                logger.info(f"Gemini thinking enabled (include_thoughts=True, thinking_budget=1024)")
            elif model_id.startswith("anthropic:") or model_id.startswith("claude"):
                # Claude extended thinking
                runtime_config["llm_thinking"] = {"type": "enabled", "budget_tokens": 2000}
                logger.info("Claude extended thinking enabled")
            elif model_id.startswith("openai:") or model_id.startswith("gpt") or model_id.startswith("o1"):
                # OpenAI reasoning
                runtime_config["llm_reasoning"] = {"effort": "medium", "summary": "auto"}
                logger.info("OpenAI reasoning enabled")
            else:
                # Fallback: try Gemini params (most common default)
                runtime_config["llm_include_thoughts"] = True
                runtime_config["llm_thinking_budget"] = 1024
                logger.info("Reasoning enabled (fallback)")
        else:
            # Disable thinking for Gemini (other providers use absence of param)
            if model_id.startswith("google_genai:") or model_id.startswith("gemini") or not model_id:
                runtime_config["llm_thinking_budget"] = 0
            logger.info("Reasoning disabled")
        
        # DEBUG: Log full runtime config
        logger.info(f"Runtime config: {runtime_config}")
        
        async for event in agent.astream(
            {"messages": [{"role": "user", "content": message_content}]},
            {"configurable": runtime_config},
            stream_mode="messages",
        ):
            if isinstance(event, tuple) and len(event) == 2:
                message_chunk, metadata = event
                
                # Skip ToolMessages - only stream AIMessageChunks
                # Reference: https://python.langchain.com/docs/how_to/streaming/
                if isinstance(message_chunk, ToolMessage):
                    continue
                
                # Only process AIMessageChunks (the actual LLM response)
                if not isinstance(message_chunk, AIMessageChunk):
                    continue
                
                # Skip if this is a tool call chunk (has tool_calls or tool_call_chunks)
                if hasattr(message_chunk, 'tool_calls') and message_chunk.tool_calls:
                    continue
                if hasattr(message_chunk, 'tool_call_chunks') and message_chunk.tool_call_chunks:
                    continue
                
                if hasattr(message_chunk, 'content'):
                    chunk_content = message_chunk.content
                    
                    # Log content type and structure (INFO level for visibility)
                    if chunk_content:
                        logger.info(f"Content type: {type(chunk_content).__name__}, preview: {str(chunk_content)[:150]}")
                    
                    # Handle content blocks format (thinking/reasoning + text)
                    # Supports multiple model formats:
                    # - Gemini 2.5/3: type="thinking" with "thinking" field
                    # - Claude (extended thinking): type="reasoning" with "reasoning" field
                    # - OpenAI o1/GPT: type="reasoning" with "reasoning" field
                    # Reference: https://python.langchain.com/docs/integrations/chat/google_generative_ai/#viewing-model-thoughts
                    # Reference: https://python.langchain.com/docs/integrations/chat/anthropic/#extended-thinking
                    # Reference: https://python.langchain.com/docs/integrations/chat/openai/#reasoning-output
                    if isinstance(chunk_content, list):
                        for block in chunk_content:
                            if isinstance(block, dict):
                                block_type = block.get("type", "")
                                
                                # Gemini thinking block
                                if block_type == "thinking":
                                    thinking_text = block.get("thinking", "")
                                    if thinking_text:
                                        accumulated_thinking += thinking_text
                                        yield {
                                            "step": "thinking",
                                            "content": accumulated_thinking
                                        }
                                
                                # Claude/OpenAI reasoning block (same format)
                                elif block_type == "reasoning":
                                    reasoning_text = block.get("reasoning", "")
                                    if reasoning_text:
                                        accumulated_thinking += reasoning_text
                                        yield {
                                            "step": "thinking",
                                            "content": accumulated_thinking
                                        }
                                
                                # Regular text block
                                elif block_type == "text":
                                    text = block.get("text", "")
                                    if text:
                                        accumulated_content += text
                                        yield {
                                            "step": "streaming",
                                            "content": accumulated_content
                                        }
                    
                    # Plain string content (standard streaming or fallback)
                    elif isinstance(chunk_content, str) and chunk_content:
                        accumulated_content += chunk_content
                        yield {"step": "streaming", "content": accumulated_content}
        
        logger.info(f"Content strategist completed - Thread: {thread_id}")
        
    except Exception as e:
        logger.error(f"Content strategist error: {e}", exc_info=True)
        yield {"step": "error", "content": str(e)}

