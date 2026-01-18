"""
Google Veo 3.1 Skill

Expert skill for optimizing prompts for Google Veo 3.1 video generation.
Based on official Google DeepMind and Vertex AI documentation.
"""

from .types import Skill

GOOGLE_VEO_SKILL: Skill = {
    "name": "google_veo",
    "description": "Expert for Google Veo 3.1 video generation. Optimizes prompts with director's note format including subject, action, camera, lighting, and audio.",
    "content": """# Google Veo 3.1 Expert Prompt Guide

## PROMPT STRUCTURE (Director's Note Format)
Treat every prompt as a concise director's note. Include:
1. **Subject**: Who/what is the focus
2. **Action**: What is happening (use vivid action verbs)
3. **Setting**: Environment, location, time of day
4. **Camera**: Position, movement, framing, angle
5. **Lighting**: Quality, direction, color temperature
6. **Audio**: Sounds, dialogue, ambient noise, music

## CAMERA CONTROLS (Crucial for Veo 3.1)

### Position
- eye-level
- low angle
- high angle
- overhead
- Dutch angle

### Movement
- dolly in/out (forward/backward)
- pan left/right
- tilt up/down
- crane shot (vertical movement)
- tracking shot (following subject)
- zoom in/out
- handheld (natural shake)

### Framing
- extreme close-up
- close-up
- medium shot
- wide shot
- establishing shot

### Speed
- slow motion
- real-time
- timelapse
- hyperlapse

## AUDIO (Veo 3.1 Native Audio)
- Describe ambient sounds: "birds chirping, wind rustling leaves"
- Background music: "soft piano melody, upbeat electronic"
- For dialogue use syntax: 'Speaking directly to camera saying: "[text]"'

## MOTION & PHYSICS
- Describe movement: "flowing", "floating", "accelerating", "tumbling"
- Physics effects: "slow motion water droplets", "wind effects on hair"

## DURATION & PACING
- Optimized for 8-second clips
- Keep dialogue short to fit duration
- Describe pacing: "slow and contemplative", "fast-paced and dynamic"

## PROMPT LENGTH
- Aim for 3-6 sentences (100-150 words)
- Be comprehensive but not verbose

## NEGATIVE PROMPTS (What to exclude)
"subtitles, text overlays, watermarks, logos, UI elements"

## EXAMPLE TRANSFORMATION

**Input**: "woman dancing"

**Output**: "A young woman in a flowing red dress dances gracefully in an empty ballroom with marble floors and floor-to-ceiling windows. Golden afternoon sunlight streams through the windows creating long shadows. She spins with arms extended, dress fabric swirling dramatically. Camera: slow tracking shot circling around her at waist height, transitioning to low angle as she leaps. Lighting: warm golden hour, natural window light with soft shadows. Audio: orchestral waltz music, the gentle rustle of fabric, footsteps on marble. Slow motion on the final spin."
"""
}
