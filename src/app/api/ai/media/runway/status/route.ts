import { NextRequest, NextResponse } from 'next/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

// Status checks are quick (30 seconds)
export const maxDuration = 30;

/**
 * POST /api/ai/media/runway/status
 * Get status of Runway video generation task
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/runway/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });

    } catch (error) {
        console.error('Runway status error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get task status' },
            { status: 500 }
        );
    }
}
