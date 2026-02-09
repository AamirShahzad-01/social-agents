import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';
import { normalizeApiResponse, createTimeoutResponse, createErrorResponse } from '@/lib/api-response';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Extended timeout for video generation (5 minutes)
export const maxDuration = 300;

/**
 * POST /api/ai/media/kling/multi-image
 * Generate video from multiple images using Kling AI
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Use AbortController with extended timeout (4.5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 270000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/kling/multi-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const data = await backendResponse.json();
            return normalizeApiResponse(data, backendResponse.status);
        } catch (fetchError: any) {
            clearTimeout(timeoutId);

            if (fetchError.name === 'AbortError') {
                return createTimeoutResponse('Request timed out. Video generation can take several minutes.');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Kling multi-image error:', error);
        return createErrorResponse(error, 'Failed to generate video from images');
    }
}
