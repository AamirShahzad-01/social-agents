/**
 * Knowledge Base API
 * GET /api/comments/knowledge - Fetch knowledge entries
 * POST /api/comments/knowledge - Add a new knowledge entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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

        // Fetch knowledge entries
        const { data: entries, error } = await supabase
            .from('company_knowledge')
            .select('id, category, title, question, answer, is_active')
            .eq('workspace_id', userData.workspace_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Fetch knowledge error:', error);
            return NextResponse.json(
                { error: 'Failed to fetch knowledge entries' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            entries: entries || [],
        });
    } catch (error) {
        console.error('Get knowledge error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch knowledge entries' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { category, title, question, answer } = body;

        if (!title || !answer) {
            return NextResponse.json(
                { error: 'Title and answer are required' },
                { status: 400 }
            );
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

        // Insert knowledge entry
        const { data: entry, error } = await (supabase
            .from('company_knowledge') as any)
            .insert({
                workspace_id: userData.workspace_id,
                category: category || 'general',
                title,
                question: question || null,
                answer,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            console.error('Insert knowledge error:', error);
            return NextResponse.json(
                { error: 'Failed to add knowledge entry' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            entry,
        });
    } catch (error) {
        console.error('Add knowledge error:', error);
        return NextResponse.json(
            { error: 'Failed to add knowledge entry' },
            { status: 500 }
        );
    }
}
