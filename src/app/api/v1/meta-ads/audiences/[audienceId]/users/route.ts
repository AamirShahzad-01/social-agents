import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getPythonBackendUrl } from '@/lib/backend-url';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ audienceId: string }> }
) {
    try {
        const supabase = await createServerClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { audienceId } = await params;
        const backendUrl = getPythonBackendUrl();
        const body = await request.json();

        const response = await fetch(
            `${backendUrl}/api/v1/meta-ads/audiences/${audienceId}/users`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(body),
            }
        );

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Error uploading audience users:', error);
        return NextResponse.json(
            { error: 'Failed to upload users' },
            { status: 500 }
        );
    }
}
