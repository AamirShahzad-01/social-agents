import { NextRequest, NextResponse } from 'next/server';
import { generateSpeech } from '@/agents/audio_agent/services/elevenlabs.service';
import { ttsRequestSchema } from '@/agents/audio_agent/schemas/audio.schemas';

// Extended timeout for audio generation (60 seconds)
export const maxDuration = 60;

/**
 * POST /api/ai/media/audio/tts
 * Generate speech from text using ElevenLabs TTS
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request
        const validation = ttsRequestSchema.safeParse(body);

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

        const { text, voiceId, modelId, outputFormat, speed, voiceSettings } = validation.data;

        // Call the TTS service
        const result = await generateSpeech({
            text,
            voiceId,
            modelId,
            outputFormat,
            speed,
            voiceSettings,
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
        console.error('TTS API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate speech',
            },
            { status: 500 }
        );
    }
}
