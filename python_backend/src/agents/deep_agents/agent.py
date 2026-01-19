#!/usr/bin/env python3
"""
Content Writer Agent

A content writer agent configured entirely through files on disk:
- AGENTS.md defines brand voice and style guide
- skills/ provides specialized workflows (blog posts, social media)
- skills/*/scripts/ provides tools bundled with each skill
- subagents handle research and other delegated tasks

Reference: https://github.com/langchain-ai/deepagents/tree/master/examples/content-builder-agent

Usage:
    # Via FastAPI endpoint
    POST /api/v1/deep-agents/chat
"""

import os
import yaml
from pathlib import Path
from typing import Literal

from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from ...config import settings
from .middleware import SkillMiddleware

# Directory containing this agent's files
AGENT_DIR = Path(__file__).parent


# =============================================================================
# Tools
# =============================================================================

@tool
def web_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news"] = "general",
) -> dict:
    """Search the web for current information.

    Args:
        query: The search query (be specific and detailed)
        max_results: Number of results to return (default: 5)
        topic: "general" for most queries, "news" for current events

    Returns:
        Search results with titles, URLs, and content excerpts.
    """
    try:
        from tavily import TavilyClient

        api_key = os.environ.get("TAVILY_API_KEY")
        if not api_key:
            return {"error": "Web search not configured. Please add TAVILY_API_KEY to your settings."}

        client = TavilyClient(api_key=api_key)
        return client.search(query, max_results=max_results, topic=topic)
    except Exception as e:
        error_msg = str(e).lower()
        if "rate" in error_msg or "limit" in error_msg:
            return {"error": "Search rate limit reached. Please try again in a moment."}
        if "api" in error_msg and "key" in error_msg:
            return {"error": "Invalid search API key. Please check your TAVILY_API_KEY."}
        return {"error": f"Search failed: {str(e)[:100]}"}


@tool
def generate_cover(prompt: str, slug: str) -> str:
    """Generate a cover image for a blog post.

    Args:
        prompt: Detailed description of the image to generate.
        slug: Blog post slug. Image saves to blogs/<slug>/hero.png
    """
    try:
        from google import genai

        client = genai.Client()
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=[prompt],
        )

        for part in response.parts:
            if part.inline_data is not None:
                image = part.as_image()
                output_path = AGENT_DIR / "blogs" / slug / "hero.png"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                image.save(str(output_path))
                return f"Image saved to {output_path}"

        return "No image was generated. Try being more specific in your prompt."
    except Exception as e:
        error_msg = str(e).lower()
        if "quota" in error_msg or "rate" in error_msg or "limit" in error_msg:
            return "Image generation quota exceeded. Please try again later."
        if "api" in error_msg and "key" in error_msg:
            return "Image API not configured. Please check your GOOGLE_API_KEY."
        if "safety" in error_msg or "blocked" in error_msg:
            return "Image blocked by safety filters. Please modify your prompt."
        return f"Image generation failed: {str(e)[:100]}"


@tool
def generate_social_image(prompt: str, platform: str, slug: str) -> str:
    """Generate an image for a social media post.

    Args:
        prompt: Detailed description of the image to generate.
        platform: Either "linkedin" or "tweets"
        slug: Post slug. Image saves to <platform>/<slug>/image.png
    """
    try:
        from google import genai

        client = genai.Client()
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=[prompt],
        )

        for part in response.parts:
            if part.inline_data is not None:
                image = part.as_image()
                output_path = AGENT_DIR / platform / slug / "image.png"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                image.save(str(output_path))
                return f"Image saved to {output_path}"

        return "No image was generated. Try being more specific in your prompt."
    except Exception as e:
        error_msg = str(e).lower()
        if "quota" in error_msg or "rate" in error_msg or "limit" in error_msg:
            return "Image generation quota exceeded. Please try again later."
        if "api" in error_msg and "key" in error_msg:
            return "Image API not configured. Please check your GOOGLE_API_KEY."
        if "safety" in error_msg or "blocked" in error_msg:
            return "Image blocked by safety filters. Please modify your prompt."
        return f"Image generation failed: {str(e)[:100]}"


# =============================================================================
# Subagent Loader
# =============================================================================

def load_subagents(config_path: Path) -> list:
    """Load subagent definitions from YAML and wire up tools.

    NOTE: This is a custom utility for this example. Unlike `memory` and `skills`,
    deepagents doesn't natively load subagents from files - they're normally
    defined inline in the create_deep_agent() call. We externalize to YAML here
    to keep configuration separate from code.
    """
    # Map tool names to actual tool objects
    available_tools = {
        "web_search": web_search,
    }

    with open(config_path) as f:
        config = yaml.safe_load(f)

    subagents = []
    for name, spec in config.items():
        subagent = {
            "name": name,
            "description": spec["description"],
            "system_prompt": spec["system_prompt"],
        }
        if "model" in spec:
            subagent["model"] = spec["model"]
        if "tools" in spec:
            subagent["tools"] = [available_tools[t] for t in spec["tools"]]
        subagents.append(subagent)

    return subagents


# =============================================================================
# Agent Factory
# =============================================================================

# Global instances for persistence
_agent = None
_checkpointer = MemorySaver()

from langchain_openai import ChatOpenAI

# Import SYSTEM_PROMPT from dedicated prompts file for easier maintenance
from .prompts import SYSTEM_PROMPT


def create_content_writer():
    """Create a content writer agent configured by filesystem files.
    
    Following official LangGraph patterns for persistent short-term memory.
    """
    if settings.OPENAI_API_KEY and not os.environ.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.OPENAI_API_KEY,
    )
    return create_deep_agent(
        model=llm,
        system_prompt=SYSTEM_PROMPT,      # Human-in-the-loop workflow
        memory=["./AGENTS.md"],           # Static brand memory        # Dynamic skills
        tools=[generate_cover, generate_social_image],
        subagents=load_subagents(AGENT_DIR / "subagents.yaml"),
        middleware=[SkillMiddleware()],
        backend=(lambda rt: StateBackend(rt)),  # Store files in state, not filesystem
        checkpointer=_checkpointer,       # Persistent in-memory checkpointer
    )


def get_agent():
    """Get or create the content writer agent."""
    global _agent
    if _agent is None:
        _agent = create_content_writer()
    return _agent
