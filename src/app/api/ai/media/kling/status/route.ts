import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Shorter timeout for status checks (30 seconds)
export const maxDuration = 30;

/**
 * POST /api/ai/media/kling/status
 * Get status of Kling video generation task
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/kling/status`, {
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
                    { success: false, error: 'Status check timed out' },
                    { status: 408 }
                );
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Kling status error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get task status' },
            { status: 500 }
        );
    }
}
