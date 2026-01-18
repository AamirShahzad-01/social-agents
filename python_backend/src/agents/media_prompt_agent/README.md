# Media Prompt Agent

**AI-powered prompt improvement for image and video generation using LangChain Skills Pattern.**

---

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Complete Workflow](#complete-workflow)
5. [File Reference](#file-reference)
6. [Skills System](#skills-system)
7. [API Reference](#api-reference)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This agent transforms simple user prompts into production-ready prompts optimized for specific AI providers.

### What It Does
```
Input:  "shoe with 2025"
Output: "Professional product photography of a sleek high-end athletic sneaker 
         with a modern design, featuring matte charcoal and metallic silver 
         textures... 8K resolution, photorealistic, commercial quality."
```

### Supported Providers
| Provider | Type | Skill Name |
|----------|------|------------|
| Google Imagen 4 | Image | `google_imagen` |
| Google Veo 3.1 | Video | `google_veo` |
| OpenAI GPT Image 1.5 | Image | `openai_gpt_image` |
| OpenAI Sora | Video | `openai_sora` |
| Runway Gen-3 Alpha | Video | `runway_gen3` |

---

## Quick Start

### Testing the API
```bash
# From python_backend directory
curl -X POST http://localhost:8000/api/v1/improve/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "originalPrompt": "cat on a beach",
    "mediaType": "image-generation",
    "provider": "google"
  }'
```

### Expected Response
```json
{
  "success": true,
  "improvedPrompt": "A fluffy orange tabby cat sitting on pristine white sand beach..."
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Components that use prompt improvement:                                    │
│  • ImageGenerator.tsx      - Image generation UI                           │
│  • VideoGenerator.tsx      - OpenAI Sora video generation                  │
│  • VeoTextToVideo.tsx      - Google Veo video generation                   │
│  • ImageEditor.tsx         - Image editing with AI                         │
│                                                                             │
│  User clicks "Improve Prompt" button → Modal appears → Submit              │
│       │                                                                     │
│       ▼                                                                     │
│  POST /api/ai/media/prompt/improve  (Next.js API Route)                    │
│                                                                             │
└───────┼─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS API ROUTE (Proxy)                           │
│                                                                               │
│  File: src/app/api/ai/media/prompt/improve/route.ts                          │
│                                                                               │
│  Purpose: Forwards requests to Python backend with auth headers              │
│                                                                               │
│  POST ${PYTHON_BACKEND_URL}/api/v1/improve/prompt                            │
│                                                                               │
└───────┼───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           PYTHON BACKEND (FastAPI)                            │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. API Route receives request                                               │
│     └─► api/v1/improve_media_prompts.py                                      │
│                                                                               │
│  2. Calls service function                                                   │
│     └─► improve_media_prompt(request)  [service.py]                          │
│                                                                               │
│  3. Builds system prompt with skill routing                                  │
│     └─► build_prompt_improvement_system_prompt()  [prompts.py]               │
│         • Determines which skill to recommend based on provider              │
│         • e.g., provider="google" + mediaType="image" → "google_imagen"      │
│                                                                               │
│  4. Creates LLM instance                                                     │
│     └─► ChatGoogleGenerativeAI(model="gemini-3-flash-preview")              │
│                                                                               │
│  5. Creates agent with middleware                                            │
│     └─► create_agent(middleware=[SkillMiddleware()])                        │
│         • SkillMiddleware registers load_skill tool                          │
│         • SkillMiddleware injects available skills list into system prompt   │
│                                                                               │
│  6. Agent processes the request                                              │
│     └─► agent.ainvoke()                                                      │
│         • Agent reads system prompt                                          │
│         • Agent calls load_skill("google_imagen") to get expert knowledge    │
│         • Agent applies the skill content to improve the prompt              │
│         • Agent returns improved prompt text                                  │
│                                                                               │
│  7. Extract and return response                                              │
│     └─► ImprovePromptResponse(success=True, improvedPrompt="...")           │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Workflow

### Step 1: User Interaction (Frontend)
Location: `src/app/dashboard/media-studio/components/ImageGenerator.tsx`

```typescript
// User clicks "Improve Prompt" button
const handleImprovePrompt = () => {
  if (!prompt.trim()) {
    setImprovementError('Please enter a prompt first');
    return;
  }
  setShowImprovementModal(true);  // Shows modal
};

// User submits improvement request
const handleSubmitImprovement = async () => {
  const response = await fetch('/api/ai/media/prompt/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalPrompt: prompt,
      mediaType: 'image-generation',
      provider: provider,  // e.g., "google"
      model: model,        // e.g., "imagen-4"
      userInstructions: improvementInstructions,
    }),
  });
  
  const data = await response.json();
  setPrompt(data.improvedPrompt);  // Updates the prompt input
};
```

### Step 2: Next.js API Route (Proxy)
Location: `src/app/api/ai/media/prompt/improve/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Forward to Python backend
  const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/improve/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  return NextResponse.json(await response.json());
}
```

### Step 3: FastAPI Route Handler
Location: `python_backend/src/api/v1/improve_media_prompts.py`

```python
@router.post("/prompt", response_model=ImprovePromptResponse)
async def improve_prompt(request_body: ImprovePromptRequest):
    result = await improve_media_prompt(request_body)
    return result
```

### Step 4: Main Service Function
Location: `python_backend/src/agents/media_prompt_agent/service.py`

```python
async def improve_media_prompt(request: ImprovePromptRequest) -> ImprovePromptResponse:
    # 1. Build system prompt (includes skill routing)
    system_prompt = build_prompt_improvement_system_prompt(
        media_type=request.mediaType,
        provider=request.provider
    )
    
    # 2. Create LLM
    model = ChatGoogleGenerativeAI(
        model="gemini-3-flash-preview",
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.7,
    )
    
    # 3. Create agent with SkillMiddleware
    agent = create_agent(
        model=model,
        tools=[],
        system_prompt=system_prompt,
        middleware=[SkillMiddleware()],  # Adds load_skill tool
    )
    
    # 4. Invoke agent
    result = await agent.ainvoke({
        "messages": [{"role": "user", "content": user_message}]
    })
    
    # 5. Extract text from response
    # ... content extraction logic ...
    
    return ImprovePromptResponse(success=True, improvedPrompt=improved_prompt)
```

### Step 5: SkillMiddleware
Location: `python_backend/src/agents/media_prompt_agent/middleware.py`

```python
class SkillMiddleware(AgentMiddleware):
    # Registers load_skill tool with the agent
    tools = [load_skill]
    
    async def awrap_model_call(self, request, handler):
        # Injects available skills into system prompt
        skills_addendum = self._build_skills_addendum()
        # ... append to system message ...
        return await handler(modified_request)
```

### Step 6: load_skill Tool
Location: `python_backend/src/agents/media_prompt_agent/tools.py`

```python
@tool
def load_skill(skill_name: str) -> str:
    """Load a skill by name to get expert prompt engineering knowledge."""
    skill = get_skill(skill_name)
    if not skill:
        return f"Skill '{skill_name}' not found. Available: {get_available_skills()}"
    return skill["content"]  # Returns the full expert prompt guide
```

---

## File Reference

### Backend Files

| File | Description | When to Edit |
|------|-------------|--------------|
| `service.py` | Main `improve_media_prompt()` function | Change LLM model, temperature, response extraction |
| `prompts.py` | System prompt builder + skill routing | Add new providers to routing, change prompt structure |
| `middleware.py` | `SkillMiddleware` class | Change how skills are injected into prompts |
| `tools.py` | `load_skill` tool definition | Modify tool behavior or add new tools |
| `schemas.py` | Pydantic request/response models | Add new fields to API |
| `__init__.py` | Module exports | Add new exports |

### Skills Files

| File | Provider | When to Edit |
|------|----------|--------------|
| `skills/google_imagen.py` | Google Imagen 4 | Update Imagen-specific prompting techniques |
| `skills/google_veo.py` | Google Veo 3 | Update Veo-specific prompting techniques |
| `skills/openai_gpt_image.py` | OpenAI GPT Image 1.5 | Update GPT Image-specific techniques |
| `skills/openai_sora.py` | OpenAI Sora | Update Sora-specific techniques |
| `skills/runway_gen3.py` | Runway Gen-3 Alpha | Update Runway-specific techniques |
| `skills/__init__.py` | Registry | Add new skills to SKILLS list |
| `skills/types.py` | Type definition | Extend Skill TypedDict if needed |

### Frontend Files

| File | Description |
|------|-------------|
| `src/app/api/ai/media/prompt/improve/route.ts` | Next.js API proxy to Python |
| `src/lib/python-backend/config.ts` | Backend URL and endpoints |
| `src/lib/python-backend/types.ts` | TypeScript types for API |

---

## Skills System

### What is a Skill?
A skill is a structured knowledge package containing expert prompt engineering guidelines for a specific AI provider.

### Skill Structure
```python
GOOGLE_IMAGEN_SKILL: Skill = {
    "name": "google_imagen",           # Unique identifier
    "description": "Expert for Google Imagen 4...",  # Brief summary
    "content": """                      # Full expert knowledge
    # Google Imagen 4 Expert Prompt Guide
    
    ## CORE PRINCIPLES
    1. Be specific and descriptive
    2. Use natural language
    ...
    
    ## PROMPT STRUCTURE
    [subject] + [artistic medium] + [style] + [lighting] + [quality]
    
    ## EXAMPLE TRANSFORMATIONS
    Input: "a cat"
    Output: "A fluffy orange tabby cat with bright green eyes..."
    """
}
```

### How Skills Are Used
1. **System prompt** tells agent: "You MUST call `load_skill('google_imagen')`"
2. **Agent calls** `load_skill("google_imagen")` tool
3. **Tool returns** the full skill content (expert prompt guide)
4. **Agent reads** the content and applies the techniques
5. **Agent outputs** the improved prompt following the skill's guidelines

---

## API Reference

### Endpoint
```
POST /api/v1/improve/prompt
```

### Request Body
```typescript
interface ImprovePromptRequest {
  originalPrompt: string;     // Required: The prompt to improve
  mediaType: string;          // Required: "image-generation" | "video-generation" | etc.
  provider?: string;          // Optional: "google" | "openai" | "runway" | "sora"
  model?: string;             // Optional: Specific model name
  mediaSubType?: string;      // Optional: "text-to-image" | "image-to-video" | etc.
  userInstructions?: string;  // Optional: Additional guidance
  modelId?: string;           // Optional: LLM model to use for improvement
}
```

### Response Body
```typescript
interface ImprovePromptResponse {
  success: boolean;
  improvedPrompt: string;
}
```

### Media Types
- `image-generation` - Text-to-image
- `image-editing` - Image modification
- `video-generation` - Text-to-video or image-to-video
- `video-editing` - Video modification/remix

### Provider → Skill Mapping
| Provider | Media Type | Skill Used |
|----------|------------|------------|
| `google` | `image-*` | `google_imagen` |
| `google` | `video-*` | `google_veo` |
| `openai` | `image-*` | `openai_gpt_image` |
| `openai` | `video-*` | `openai_sora` |
| `sora` | `video-*` | `openai_sora` |
| `runway` | `video-*` | `runway_gen3` |

---

## Common Tasks

### Adding a New Provider/Skill

**Step 1: Create the skill file**
```python
# skills/new_provider.py
from .types import Skill

NEW_PROVIDER_SKILL: Skill = {
    "name": "new_provider",
    "description": "Expert for New Provider AI. Optimizes prompts with...",
    "content": """# New Provider Expert Prompt Guide

## CORE PRINCIPLES
1. ...
2. ...

## PROMPT STRUCTURE
[describe the ideal prompt format]

## KEYWORDS AND MODIFIERS
- Quality: ...
- Style: ...
- Lighting: ...

## EXAMPLE TRANSFORMATIONS
Input: "simple prompt"
Output: "detailed, optimized prompt with all the right keywords..."
"""
}
```

**Step 2: Register the skill**
```python
# skills/__init__.py
from .new_provider import NEW_PROVIDER_SKILL

SKILLS: list[Skill] = [
    GOOGLE_IMAGEN_SKILL,
    GOOGLE_VEO_SKILL,
    # ... other skills ...
    NEW_PROVIDER_SKILL,  # Add here
]

__all__ = [
    # ... other exports ...
    "NEW_PROVIDER_SKILL",
]
```

**Step 3: Add routing**
```python
# prompts.py
SKILL_MAPPING = {
    # ... existing mappings ...
    
    # Add your new provider
    ("new_provider", "image"): ("new_provider", "New Provider Name"),
    ("new_provider", "video"): ("new_provider", "New Provider Name"),
}
```

**Step 4: Update backend schema (if new provider)**
```python
# schemas.py
MediaProvider = Literal[
    "openai", "google", "midjourney", "runway", 
    "veo", "imagen", "stable-diffusion", "sora",
    "new_provider"  # Add here
]
```

**Step 5: Update frontend types (if new provider)**
```typescript
// src/lib/python-backend/types.ts
interface PromptImprovementRequest {
  provider?: 'openai' | 'google' | ... | 'new_provider';  // Add here
}
```

### Changing the LLM Model
```python
# service.py
model = ChatGoogleGenerativeAI(
    model="gemini-3-flash-preview",  # Change this
    google_api_key=settings.GOOGLE_API_KEY,
    temperature=0.7,  # Adjust creativity (0=focused, 1=creative)
)
```

### Adding New Fields to API
1. Update `schemas.py` with new Pydantic fields
2. Update `types.ts` with matching TypeScript types
3. Use the new fields in `service.py`

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `404 NOT_FOUND models/gemini-...` | Invalid model name | Check [Google AI docs](https://ai.google.dev/gemini-api/docs/models) for valid names |
| `awrap_model_call is not available` | Missing async method | Ensure middleware has `awrap_model_call` method (not `wrap_model_call_async`) |
| `Unsupported media type` | Invalid mediaType | Use: `image-generation`, `video-generation`, etc. |
| Response contains `[{'type': 'text'...}]` | Wrong content extraction | Content is list of blocks, need to extract `.text` field |

### Debug Steps
1. Check uvicorn logs for Python errors
2. Test API directly with curl (bypass frontend)
3. Print intermediate values in `service.py`
4. Verify skill is loaded correctly with `get_skill("skill_name")`

### Testing Skills
```python
# Quick test in Python
from src.agents.media_prompt_agent.skills import get_skill, get_available_skills

# List all skills
print(get_available_skills())

# Get a specific skill
skill = get_skill("google_imagen")
print(skill["content"][:500])
```
