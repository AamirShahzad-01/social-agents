import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

/**
 * GET /api/v1/meta-ads/status
 * Proxy to Python backend for Meta Ads status
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return NextResponse.json(
                {
                    isConnected: false,
                    canRunAds: false,
                    error: 'Not authenticated'
                },
                { status: 401 }
            );
        }

        const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/api/v1/meta-ads/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await backendResponse.json();

        return NextResponse.json(data, { status: backendResponse.status });

    } catch (error) {
        console.error('Error fetching Meta Ads status:', error);
        return NextResponse.json(
            {
                isConnected: false,
                canRunAds: false,
                error: 'Failed to check status'
            },
            { status: 500 }
        );
    }
}

