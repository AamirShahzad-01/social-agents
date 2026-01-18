import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Extended timeout for video generation (5 minutes)
export const maxDuration = 300;

/**
 * POST /api/ai/media/veo/reference-images
 * Generate video using reference images with Google Veo
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Use AbortController with extended timeout (4.5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 270000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/video/reference-images`, {
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
                        error: 'Request timed out. Video generation can take several minutes.'
                    },
                    { status: 408 }
                );
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Veo reference-images error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate video from reference images' },
            { status: 500 }
        );
    }
}
