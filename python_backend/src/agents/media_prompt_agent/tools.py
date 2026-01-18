"""
Skill Loading Tool

Tool for agents to load skill content on-demand (progressive disclosure).
"""

from langchain.tools import tool

from .skills import SKILLS, get_skill


@tool
def load_skill(skill_name: str) -> str:
    """Load detailed expertise for a specific media generation platform.
    
    Use this when you need comprehensive prompt engineering guidelines
    for a specific AI provider. This will provide you with the full
    prompt structure, vocabulary, modifiers, and examples.
    
    Available skills:
    - google_imagen: Google Imagen 4 image generation expert
    - google_veo: Google Veo 3.1 video generation expert
    - openai_gpt_image: OpenAI GPT Image 1.5 expert
    - runway_gen3: Runway Gen-3 Alpha video generation expert
    
    Args:
        skill_name: The name of the skill to load
    
    Returns:
        The full skill content with detailed instructions
    """
    skill = get_skill(skill_name)
    
    if skill:
        return f"Loaded skill: {skill_name}\n\n{skill['content']}"
    
    # Skill not found - return available options
    from .skills import get_available_skills
    available = ", ".join(get_available_skills())
    return f"Skill '{skill_name}' not found. Available skills: {available}"
