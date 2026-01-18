import { NextRequest, NextResponse } from 'next/server';
import { generateMusic } from '@/agents/audio_agent/services/elevenlabs.service';
import { musicRequestSchema } from '@/agents/audio_agent/schemas/audio.schemas';

// Extended timeout for music generation (2 minutes)
export const maxDuration = 120;

/**
 * POST /api/ai/media/audio/music
 * Generate music from text prompt using ElevenLabs Music API
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request
        const validation = musicRequestSchema.safeParse(body);

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

        const { prompt, durationMs } = validation.data;

        // Call the Music service
        const result = await generateMusic({
            prompt,
            durationMs,
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
        console.error('Music API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate music',
            },
            { status: 500 }
        );
    }
}
