import { NextRequest, NextResponse } from 'next/server';
import { generateSoundEffects } from '@/agents/audio_agent/services/elevenlabs.service';
import { soundEffectsRequestSchema } from '@/agents/audio_agent/schemas/audio.schemas';

// Extended timeout for sound effects generation (60 seconds)
export const maxDuration = 60;

/**
 * POST /api/ai/media/audio/sound-effects
 * Generate sound effects from text prompt using ElevenLabs
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request
        const validation = soundEffectsRequestSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Validation failed',
                    details: validation.error.errors,
                },
                { status: 400 }
            );
        }

        const { prompt, durationSeconds, loop, promptInfluence } = validation.data;

        // Call the Sound Effects service
        const result = await generateSoundEffects({
            prompt,
            durationSeconds,
            loop,
            promptInfluence,
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            audioBase64: result.audioBase64,
            mimeType: 'audio/mpeg',
        });
    } catch (error) {
        console.error('Sound Effects API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate sound effects',
            },
            { status: 500 }
        );
    }
}
