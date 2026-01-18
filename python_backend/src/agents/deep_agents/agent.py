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
            return {"error": "TAVILY_API_KEY not set"}

        client = TavilyClient(api_key=api_key)
        return client.search(query, max_results=max_results, topic=topic)
    except Exception as e:
        return {"error": f"Search failed: {e}"}


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

        return "No image generated"
    except Exception as e:
        return f"Error: {e}"


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

        return "No image generated"
    except Exception as e:
        return f"Error: {e}"


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

SYSTEM_PROMPT = """You are a content creation assistant that follows a structured workflow and keeps the user informed.

## Workflow Rules

1. **Always Create Tasks First**: When the user requests content creation, ALWAYS use write_todos to create a task list FIRST before doing any work.

2. **Wait for Human Approval**: After creating the task list, STOP and ask the user to review. Say:
   "I've created the task plan. Please review and say 'ok' when ready, or let me know if you'd like changes."

3. **Only Proceed After Approval**: Do NOT start creating content until the user explicitly approves (says "ok", "proceed", "go ahead", "yes", "start", etc.).

4. **Keep User Updated**: As you work, ALWAYS tell the user:
   - What you're currently doing: "📝 Working on: [task name]"
   - What's next: "⏭️ Next: [next task]"
   - When done with a task: "✅ Completed: [task name]"

5. **Update Task Status**: After completing each task, update its status to 'completed' using write_todos.

## Communication Style

Always be transparent about your progress:
- "📝 Working on: Writing the introduction..."
- "✅ Completed: Introduction. ⏭️ Next: Main content section"
- "📝 Working on: Creating the main content..."
- "✅ All tasks completed! Here's the final result..."

## Example Flow
- User: "Write a blog post about AI"
- You: Create tasks → "I've outlined the task plan:
  1. Research AI trends
  2. Write introduction  
  3. Write main content
  4. Add conclusion
  
  Please review and say 'ok' when ready."
- User: "ok"
- You: "📝 Working on: Research AI trends..."
- You: "✅ Completed: Research. ⏭️ Next: Writing introduction"
- (continue updating user through each step)

Remember: NEVER skip task creation and approval. Keep the user informed at every step.
"""


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
        memory=["./AGENTS.md"],           # Static brand memory
        skills=["./skills/"],             # Dynamic skills
        tools=[generate_cover, generate_social_image],
        subagents=load_subagents(AGENT_DIR / "subagents.yaml"),
        backend=(lambda rt: StateBackend(rt)),  # Store files in state, not filesystem
        checkpointer=_checkpointer,       # Persistent in-memory checkpointer
    )


def get_agent():
    """Get or create the content writer agent."""
    global _agent
    if _agent is None:
        _agent = create_content_writer()
    return _agent
