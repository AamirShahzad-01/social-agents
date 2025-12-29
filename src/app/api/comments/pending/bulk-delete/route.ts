/**
 * Bulk Delete Pending Comments API
 * DELETE /api/comments/pending/bulk-delete - Delete all pending comments
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

interface UserData {
    workspace_id: string;
}

export async function DELETE(req: NextRequest) {
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

        // Get count before delete
        const { count } = await supabase
            .from('pending_comments')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', userData.workspace_id);

        // Delete all pending comments
        const { error } = await supabase
            .from('pending_comments')
            .delete()
            .eq('workspace_id', userData.workspace_id);

        if (error) {
            console.error('Bulk delete error:', error);
            return NextResponse.json(
                { error: 'Failed to delete comments' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            deleted: count || 0,
            message: `Deleted ${count || 0} comments`,
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        return NextResponse.json(
            { error: 'Failed to delete comments' },
            { status: 500 }
        );
    }
}
