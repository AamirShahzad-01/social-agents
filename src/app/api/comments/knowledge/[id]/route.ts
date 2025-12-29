/**
 * Delete Knowledge Entry API
 * DELETE /api/comments/knowledge/[id] - Delete a knowledge entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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

        const entryId = params.id;

        // Delete knowledge entry
        const { error } = await (supabase
            .from('company_knowledge') as any)
            .delete()
            .eq('id', entryId)
            .eq('workspace_id', userData.workspace_id);

        if (error) {
            console.error('Delete knowledge error:', error);
            return NextResponse.json(
                { error: 'Failed to delete knowledge entry' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Knowledge entry deleted',
        });
    } catch (error) {
        console.error('Delete knowledge error:', error);
        return NextResponse.json(
            { error: 'Failed to delete knowledge entry' },
            { status: 500 }
        );
    }
}
