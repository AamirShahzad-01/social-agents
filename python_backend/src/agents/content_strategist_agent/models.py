"""
Content Strategist Agent - Dynamic Model Configuration

Uses LangChain's init_chat_model for universal model initialization.
Supports reasoning/thinking for Gemini, Claude, and OpenAI models.

Reference: https://python.langchain.com/docs/integrations/chat/
"""
from typing import Optional
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

from .config import DEFAULT_TEMPERATURE


# =============================================================================
# Model Configuration
# =============================================================================

# Default model if none specified
DEFAULT_MODEL_ID = "google-genai:gemini-2.5-pro"

# Reasoning configuration per provider
# Reference: https://python.langchain.com/docs/integrations/chat/google_generative_ai/#thinking-support
# Reference: https://python.langchain.com/docs/integrations/chat/anthropic/#extended-thinking
# Reference: https://python.langchain.com/docs/integrations/chat/openai/#reasoning-output
REASONING_CONFIG = {
    "google-genai": {
        # Gemini 2.5/3 thinking support
        "include_thoughts": True,
        "thinking_budget": 1024,  # 0=off, -1=dynamic, 128-24576=budget
    },
    "anthropic": {
        # Claude extended thinking
        "thinking": {"type": "enabled", "budget_tokens": 2000},
    },
    "openai": {
        # OpenAI o1/GPT reasoning
        "reasoning": {"effort": "medium", "summary": "auto"},
    },
}

# Models that support reasoning
REASONING_MODELS = {
    # Gemini models with thinking support
    "google-genai:gemini-2.5-pro",
    "google-genai:gemini-2.5-flash",
    "google-genai:gemini-3-pro-preview",
    "google-genai:gemini-3-flash-preview",
    # Claude models with extended thinking
    "anthropic:claude-sonnet-4-5-20250929",
    "anthropic:claude-opus-4-5-20251101",
    # OpenAI models with reasoning
    "openai:gpt-5.1",
    "openai:gpt-5.2",
    "openai:o1",
    "openai:o1-mini",
}


def get_provider_from_model_id(model_id: str) -> str:
    """Extract provider from model ID string (e.g., 'google-genai:gemini-2.5-pro' -> 'google-genai')."""
    if ":" in model_id:
        return model_id.split(":")[0]
    # Infer provider from model name
    if model_id.startswith("gemini"):
        return "google-genai"
    elif model_id.startswith("claude"):
        return "anthropic"
    elif model_id.startswith("gpt") or model_id.startswith("o1"):
        return "openai"
    elif model_id.startswith("llama"):
        return "groq"
    elif model_id.startswith("deepseek"):
        return "deepseek"
    return "openai"  # Default fallback


def create_model(
    model_id: Optional[str] = None,
    temperature: float = DEFAULT_TEMPERATURE,
    enable_reasoning: bool = True,
) -> BaseChatModel:
    """
    Create a chat model dynamically using LangChain's init_chat_model.
    
    Args:
        model_id: Model identifier (e.g., 'google-genai:gemini-2.5-pro', 'anthropic:claude-sonnet-4-5')
        temperature: Model temperature for response creativity
        enable_reasoning: Whether to enable thinking/reasoning for supported models
    
    Returns:
        BaseChatModel: Configured chat model instance
    
    Reference: https://python.langchain.com/docs/integrations/chat/
    """
    if not model_id:
        model_id = DEFAULT_MODEL_ID
    
    provider = get_provider_from_model_id(model_id)
    
    # Base configuration
    config = {
        "temperature": temperature,
    }
    
    # Add reasoning configuration if enabled and model supports it
    if enable_reasoning and model_id in REASONING_MODELS:
        provider_config = REASONING_CONFIG.get(provider, {})
        config.update(provider_config)
    
    # Create model using init_chat_model
    # Format: "provider:model_name" or just "model_name" (provider inferred)
    model = init_chat_model(model_id, **config)
    
    return model


def supports_reasoning(model_id: str) -> bool:
    """Check if a model supports reasoning/thinking output."""
    return model_id in REASONING_MODELS
