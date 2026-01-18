import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Extended timeout for video fetch (2 minutes)
export const maxDuration = 120;

/**
 * POST /api/ai/media/sora/fetch
 * Fetch Sora generated video
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        try {
            const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/sora/fetch`, {
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
                    { success: false, error: 'Fetch timed out' },
                    { status: 408 }
                );
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Sora fetch error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch video' },
            { status: 500 }
        );
    }
}
