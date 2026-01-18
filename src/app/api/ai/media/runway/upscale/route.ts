import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Extended timeout for video upscaling (5 minutes)
export const maxDuration = 300;

/**
 * POST /api/ai/media/runway/upscale
 * Upscale video resolution using Runway
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Use AbortController with extended timeout (4.5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 270000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/runway/upscale`, {
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
                        error: 'Request timed out. Video upscaling can take several minutes. Please check status endpoint.'
                    },
                    { status: 408 }
                );
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Runway upscale error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to upscale video' },
            { status: 500 }
        );
    }
}

