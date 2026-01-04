import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

/**
 * POST /api/v1/meta-ads/ab-tests/[testId]/duplicate
 * Duplicate an A/B test
 */
export async function POST(
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
            `${PYTHON_BACKEND_URL}/api/v1/meta-ads/ab-tests/${testId}/duplicate`,
            {
                method: 'POST',
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
        console.error('Error duplicating A/B test:', error);
        return NextResponse.json({ error: 'Failed to duplicate test' }, { status: 500 });
    }
}
