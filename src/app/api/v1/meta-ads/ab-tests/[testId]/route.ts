import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

/**
 * GET /api/v1/meta-ads/ab-tests/[testId]
 * Get A/B test details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ testId: string }> }
) {
    try {
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { testId } = await params;

        const backendResponse = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/meta-ads/ab-tests/${testId}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });

    } catch (error) {
        console.error('Error fetching A/B test:', error);
        return NextResponse.json({ error: 'Failed to fetch A/B test' }, { status: 500 });
    }
}

/**
 * PATCH /api/v1/meta-ads/ab-tests/[testId]
 * Update A/B test status (pause/resume)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ testId: string }> }
) {
    try {
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { testId } = await params;
        const body = await request.json();

        const backendResponse = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/meta-ads/ab-tests/${testId}/status`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            }
        );

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });

    } catch (error) {
        console.error('Error updating A/B test:', error);
        return NextResponse.json({ error: 'Failed to update A/B test' }, { status: 500 });
    }
}

/**
 * DELETE /api/v1/meta-ads/ab-tests/[testId]
 * Cancel/delete A/B test
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ testId: string }> }
) {
    try {
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { testId } = await params;

        const backendResponse = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/meta-ads/ab-tests/${testId}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });

    } catch (error) {
        console.error('Error deleting A/B test:', error);
        return NextResponse.json({ error: 'Failed to delete A/B test' }, { status: 500 });
    }
}
