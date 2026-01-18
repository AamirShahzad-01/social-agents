import { NextRequest, NextResponse } from 'next/server';
import { generateDialog } from '@/agents/audio_agent/services/elevenlabs.service';
import { dialogRequestSchema } from '@/agents/audio_agent/schemas/audio.schemas';

// Extended timeout for dialog generation (60 seconds)
export const maxDuration = 60;

/**
 * POST /api/ai/media/audio/dialog
 * Generate multi-speaker dialog using ElevenLabs Text-to-Dialog API
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate request
        const validation = dialogRequestSchema.safeParse(body);

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

        const { inputs, modelId, languageCode, outputFormat } = validation.data;

        // Call the Dialog service
        const result = await generateDialog({
            inputs,
            modelId,
            languageCode,
            outputFormat,
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
        console.error('Dialog API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate dialog',
            },
            { status: 500 }
        );
    }
}
