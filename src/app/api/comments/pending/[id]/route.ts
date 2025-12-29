/**
 * Dismiss Pending Comment API
 * DELETE /api/comments/pending/[id] - Dismiss a pending comment
 * Proxies to Python backend
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

interface UserData {
    workspace_id: string;
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's workspace
        const { data: userData } = await supabase
            .from('users')
            .select('workspace_id')
            .eq('id', user.id)
            .single() as { data: UserData | null };

        if (!userData?.workspace_id) {
            return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        const commentId = params.id;

        // Call Python backend
        const response = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/comments/pending/${commentId}?workspace_id=${userData.workspace_id}`,
            {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json(
                { error: error.detail || 'Failed to dismiss comment' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Dismiss comment error:', error);
        return NextResponse.json(
            { error: 'Failed to dismiss comment' },
            { status: 500 }
        );
    }
}
