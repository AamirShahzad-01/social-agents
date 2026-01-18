import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Extended timeout for image generation (2 minutes)
export const maxDuration = 120;

/**
 * POST /api/ai/media/imagen
 * Generate/edit images using Google Gemini Pro Image
 * Supports text-to-image, image editing, multi-turn conversations
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Use AbortController with extended timeout (90 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/imagen`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const data = await backendResponse.json();
            return NextResponse.json(data, { status: backendResponse.status });
        } catch (fetchError: any) {
            clearTimeout(timeoutId);

            if (fetchError.name === 'AbortError') {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Request timed out. Image generation can take up to 60 seconds. Please try again.'
                    },
                    { status: 408 }
                );
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Imagen generation error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to process image request'
            },
            { status: 500 }
        );
    }
}
