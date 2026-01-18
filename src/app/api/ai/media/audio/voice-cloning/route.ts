import { NextRequest, NextResponse } from 'next/server';
import { cloneVoice } from '@/agents/audio_agent/services/elevenlabs.service';
import { voiceCloningRequestSchema } from '@/agents/audio_agent/schemas/audio.schemas';

// Extended timeout for voice cloning (60 seconds)
export const maxDuration = 60;

/**
 * POST /api/ai/media/audio/voice-cloning
 * Clone a voice from uploaded audio using ElevenLabs Instant Voice Cloning
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request
        const validation = voiceCloningRequestSchema.safeParse(body);

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

        const { name, description, audioBase64, removeBackgroundNoise } = validation.data;

        // Call the Voice Cloning service
        const result = await cloneVoice({
            name,
            description,
            audioBase64,
            removeBackgroundNoise,
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            voiceId: result.voiceId,
        });
    } catch (error) {
        console.error('Voice Cloning API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to clone voice',
            },
            { status: 500 }
        );
    }
}
