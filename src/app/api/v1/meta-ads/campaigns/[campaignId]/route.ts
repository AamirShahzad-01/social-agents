'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

const PYTHON_BACKEND_URL = getPythonBackendUrl();

/**
 * PATCH /api/v1/meta-ads/campaigns/[campaignId]
 * Update a campaign
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> }
) {
    try {
        const { campaignId } = await params;
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();

        const backendResponse = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/meta-ads/campaigns/${campaignId}`,
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
        console.error('Error updating campaign:', error);
        return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
    }
}

/**
 * DELETE /api/v1/meta-ads/campaigns/[campaignId]
 * Delete a campaign
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> }
) {
    try {
        const { campaignId } = await params;
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const backendResponse = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/meta-ads/campaigns/${campaignId}`,
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
        console.error('Error deleting campaign:', error);
        return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
    }
}
