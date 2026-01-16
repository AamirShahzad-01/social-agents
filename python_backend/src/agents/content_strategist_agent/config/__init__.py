"""
Content Strategist Agent - Configuration Module

Centralized configuration and constants for the agent.
"""
from pathlib import Path

# Agent directory (root of content_strategist_agent package)
AGENT_DIR = Path(__file__).parent.parent

# Configuration file paths
AGENTS_MD_PATH = AGENT_DIR / "AGENTS.md"
SUBAGENTS_YAML_PATH = AGENT_DIR / "subagents.yaml"
SKILLS_DIR = AGENT_DIR / "skills"

# Model configuration
# Use provider prefix to ensure correct provider (google_genai uses API key, not GCP credentials)
# Reference: https://reference.langchain.com/python/langchain/models/#langchain.chat_models.init_chat_model
DEFAULT_MODEL = "google_genai:gemini-2.5-pro"
DEFAULT_TEMPERATURE = 0.7

# Thinking configuration (Gemini 2.5)
# Reference: https://python.langchain.com/docs/integrations/chat/google_generative_ai/#thinking-support
INCLUDE_THOUGHTS = True  # Enable thought output in responses
DEFAULT_THINKING_BUDGET = 1024  # Token budget for thinking (Gemini 2.5)
# thinking_budget options:
#   0 = Disable thinking
#   -1 = Dynamic thinking (model decides)
#   128-24576 = Token budget range
MIN_THINKING_BUDGET = 0
MAX_THINKING_BUDGET = 24576


def get_memory_files() -> list:
    """Get list of memory file paths for create_deep_agent."""
    return [str(AGENTS_MD_PATH)]


def get_skills_dirs() -> list:
    """Get list of skill directory paths for create_deep_agent."""
    return [str(SKILLS_DIR)]


__all__ = [
    "AGENT_DIR",
    "AGENTS_MD_PATH",
    "SUBAGENTS_YAML_PATH",
    "SKILLS_DIR",
    "DEFAULT_MODEL",
    "DEFAULT_TEMPERATURE",
    "INCLUDE_THOUGHTS",
    "DEFAULT_THINKING_BUDGET",
    "MIN_THINKING_BUDGET",
    "MAX_THINKING_BUDGET",
    "get_memory_files",
    "get_skills_dirs",
]

