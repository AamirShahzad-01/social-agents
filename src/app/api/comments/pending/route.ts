/**
 * Pending Comments API
 * GET /api/comments/pending - Fetch comments needing user attention
 * Proxies to Python backend
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

interface UserData {
    workspace_id: string;
}

export async function GET(req: NextRequest) {
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

        // Call Python backend
        const response = await fetch(
            `${PYTHON_BACKEND_URL}/api/v1/comments/pending/${userData.workspace_id}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json(
                { error: error.detail || 'Failed to fetch comments' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Get pending comments error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch pending comments' },
            { status: 500 }
        );
    }
}
