"""
Media Prompt Improvement System Prompt

Base system prompt for the AI prompt engineer agent.
This prompt is enhanced by SkillMiddleware which injects available skills.
"""


# Skill mapping based on provider and media type
SKILL_MAPPING = {
    # Image generation skills
    ("google", "image"): ("google_imagen", "Google Imagen 4"),
    ("imagen", "image"): ("google_imagen", "Google Imagen 4"),
    ("openai", "image"): ("openai_gpt_image", "OpenAI GPT Image 1.5"),
    ("gpt", "image"): ("openai_gpt_image", "OpenAI GPT Image 1.5"),
    ("dall-e", "image"): ("openai_gpt_image", "OpenAI GPT Image 1.5"),
    ("dalle", "image"): ("openai_gpt_image", "OpenAI GPT Image 1.5"),
    
    # Video generation skills
    ("google", "video"): ("google_veo", "Google Veo 3.1"),
    ("veo", "video"): ("google_veo", "Google Veo 3.1"),
    ("openai", "video"): ("openai_sora", "OpenAI Sora"),
    ("sora", "video"): ("openai_sora", "OpenAI Sora"),
    ("runway", "video"): ("runway_gen3", "Runway Gen-3 Alpha"),
    ("gen-3", "video"): ("runway_gen3", "Runway Gen-3 Alpha"),
    ("gen3", "video"): ("runway_gen3", "Runway Gen-3 Alpha"),
}


def get_skill_for_request(provider: str | None, media_type: str) -> tuple[str, str]:
    """
    Get the appropriate skill name and display name for a request.
    
    Args:
        provider: AI provider (google, openai, runway, etc.)
        media_type: Media type (image-generation, video-generation, etc.)
        
    Returns:
        Tuple of (skill_name, display_name)
    """
    provider_lower = (provider or "").lower()
    
    # Determine if image or video
    is_video = "video" in media_type.lower()
    media_key = "video" if is_video else "image"
    
    # Check direct mapping
    key = (provider_lower, media_key)
    if key in SKILL_MAPPING:
        return SKILL_MAPPING[key]
    
    # Fallback based on media type
    if is_video:
        return ("google_veo", "Google Veo 3.1")
    else:
        return ("google_imagen", "Google Imagen 4")


def build_prompt_improvement_system_prompt(media_type: str, provider: str | None) -> str:
    """
    Build the base system prompt for prompt improvement agent.
    
    Generates a provider and media-type specific prompt that instructs
    the agent to use the appropriate skill.
    
    Args:
        media_type: Type of media (image-generation, video-generation)
        provider: Target AI provider (google, openai, runway)
        
    Returns:
        System prompt string
    """
    
    # Get the recommended skill for this request
    skill_name, skill_display_name = get_skill_for_request(provider, media_type)
    
    # Determine media type display
    is_video = "video" in media_type.lower()
    media_display = "video" if is_video else "image"
    
    # Build provider-specific instruction
    if provider:
        provider_display = provider.title()
        target_info = f"**Target Provider**: {provider_display}\n**Media Type**: {media_display} generation"
    else:
        target_info = f"**Media Type**: {media_display} generation"
    
    prompt = f"""You are a world-class AI prompt engineer with access to specialized SKILLS.

## YOUR MISSION
Transform the user's prompt into a stunning, production-ready prompt for {media_display} generation.

## TARGET
{target_info}

## REQUIRED SKILL FOR THIS REQUEST
🎯 **You MUST use**: `load_skill('{skill_name}')`

This skill contains expert knowledge for **{skill_display_name}** including:
- Optimal prompt structure and templates
- Specialized vocabulary (lighting, camera, style keywords)  
- Aspect ratios and technical parameters
- Before/after transformation examples

## YOUR WORKFLOW (MANDATORY)

### Step 1: LOAD THE SKILL FIRST ⚠️
```python
load_skill('{skill_name}')
```
DO NOT skip this step. The skill contains essential provider-specific knowledge.

### Step 2: APPLY THE LOADED EXPERTISE
- Use the structure from the skill (Subject + Context + Style + Technical)
- Apply the recommended keywords and modifiers
- Follow {skill_display_name}'s best practices

### Step 3: OUTPUT THE IMPROVED PROMPT
- Return ONLY the pure prompt text
- NO explanations, headers, or prefixes
- NO "Here is your prompt:" text
- Just the optimized prompt, ready to paste

## PROMPT STRUCTURE (Based on Loaded Skill)

For **{media_display}** prompts, always include:
1. **Subject**: Clear main focus with specific details
2. **Context/Setting**: Environment, background, atmosphere
3. **Style**: Art style, technique, aesthetic approach
4. **Technical**: Lighting, camera angles, composition, quality modifiers

## GOLDEN RULES
✅ Be SPECIFIC - vague prompts = vague results
✅ Use POSITIVE phrasing - describe what TO include
✅ Add SENSORY details - textures, colors, mood
✅ Include QUALITY modifiers - "professional", "8K", "cinematic"

## CRITICAL REMINDER
❌ NEVER write a prompt without calling `load_skill('{skill_name}')` first
✅ ALWAYS load the skill as your FIRST action before any analysis
"""

    return prompt


# Keep backwards compatibility - export the constant version too
PROMPT_IMPROVEMENT_SYSTEM_PROMPT = build_prompt_improvement_system_prompt(
    media_type="image-generation",
    provider=None
)
