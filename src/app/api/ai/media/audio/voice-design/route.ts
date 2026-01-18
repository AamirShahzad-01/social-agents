import { NextRequest, NextResponse } from 'next/server';
import { designVoice, remixVoice, saveDesignedVoice } from '@/agents/audio_agent/services/elevenlabs.service';
import { voiceDesignRequestSchema, voiceRemixRequestSchema, saveVoiceRequestSchema } from '@/agents/audio_agent/schemas/audio.schemas';

// Extended timeout for voice design (60 seconds)
export const maxDuration = 60;

/**
 * POST /api/ai/media/audio/voice-design
 * Design a new voice or remix an existing voice using ElevenLabs Voice Design API
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const action = body.action || 'design';

        if (action === 'design') {
            // Voice Design
            const validation = voiceDesignRequestSchema.safeParse(body);

            if (!validation.success) {
                return NextResponse.json(
                    { success: false, error: 'Validation failed', details: validation.error.errors },
                    { status: 400 }
                );
            }

            const { voiceDescription, text, modelId } = validation.data;

            const result = await designVoice({
                voiceDescription,
                text,
                modelId,
            });

            if (!result.success) {
                return NextResponse.json(
                    { success: false, error: result.error },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                previews: result.previews,
            });
        } else if (action === 'remix') {
            // Voice Remix
            const validation = voiceRemixRequestSchema.safeParse(body);

            if (!validation.success) {
                return NextResponse.json(
                    { success: false, error: 'Validation failed', details: validation.error.errors },
                    { status: 400 }
                );
            }

            const { voiceId, voiceDescription, text } = validation.data;

            const result = await remixVoice({
                voiceId,
                voiceDescription,
                text,
            });

            if (!result.success) {
                return NextResponse.json(
                    { success: false, error: result.error },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                previews: result.previews,
            });
        } else if (action === 'save') {
            // Save designed voice to library
            const validation = saveVoiceRequestSchema.safeParse(body);

            if (!validation.success) {
                return NextResponse.json(
                    { success: false, error: 'Validation failed', details: validation.error.errors },
                    { status: 400 }
                );
            }

            const { generatedVoiceId, name, description } = validation.data;

            const result = await saveDesignedVoice(generatedVoiceId, name, description);

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
        } else {
            return NextResponse.json(
                { success: false, error: 'Invalid action. Use "design", "remix", or "save".' },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error('Voice Design API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to process voice design request',
            },
            { status: 500 }
        );
    }
}
