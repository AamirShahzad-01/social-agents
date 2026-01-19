import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';
import { normalizeApiResponse, createTimeoutResponse, createErrorResponse } from '@/lib/api-response';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Extended timeout for long-running image operations (2 minutes)
export const maxDuration = 120;

/**
 * POST /api/ai/media/image/edit
 * Edit image with mask/inpainting - proxies to Python backend with extended timeout
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Use AbortController with extended timeout (90 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/image/edit`, {
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
                return createTimeoutResponse('Request timed out. Image editing can take up to 60 seconds. Please try again.');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Error in image edit proxy:', error);
        return createErrorResponse(error, 'Failed to process image edit');
    }
}
