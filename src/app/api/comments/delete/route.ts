/**
 * Delete Comment API
 * POST /api/comments/delete - Delete/hide a comment from the platform
 * Supports: Instagram, Facebook (Meta Graph API), YouTube (YouTube Data API v3)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

interface UserData {
    workspace_id: string;
}

const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

function generateAppSecretProof(accessToken: string): string {
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET || '';
    if (!appSecret) return '';
    return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

/**
 * Delete/hide a YouTube comment
 */
async function deleteYouTubeComment(
    commentId: string,
    accessToken: string
): Promise<{ success: boolean; hidden?: boolean; error?: string }> {
    try {
        // YouTube API - set moderation status to "rejected" to hide the comment
        const url = `${YOUTUBE_API_BASE}/comments/setModerationStatus?id=${commentId}&moderationStatus=rejected&banAuthor=false`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                error: error.error?.message || 'Failed to hide YouTube comment'
            };
        }

        return { success: true, hidden: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Hide a Meta (Instagram/Facebook) comment
 * Note: Instagram/Facebook don't allow deletion, only hiding
 */
async function hideMetaComment(
    commentId: string,
    accessToken: string
): Promise<{ success: boolean; hidden?: boolean; error?: string }> {
    try {
        const proof = generateAppSecretProof(accessToken);
        const params = new URLSearchParams({
            is_hidden: 'true',
            access_token: accessToken,
        });
        if (proof) {
            params.append('appsecret_proof', proof);
        }

        const response = await fetch(`${GRAPH_API_BASE}/${commentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                error: error.error?.message || 'Failed to hide comment'
            };
        }

        return { success: true, hidden: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get platform credentials from social_accounts table
 * (aligned with supabase/projectdb.sql)
 */
async function getPlatformCredentials(
    supabase: any,
    platform: string,
    workspaceId: string
): Promise<{ accessToken?: string } | null> {
    try {
        const { data } = await supabase
            .from('social_accounts')
            .select('credentials_encrypted')
            .eq('workspace_id', workspaceId)
            .eq('platform', platform)
            .eq('is_connected', true)
            .single();

        if (!data?.credentials_encrypted) {
            return null;
        }

        const creds = typeof data.credentials_encrypted === 'string'
            ? JSON.parse(data.credentials_encrypted)
            : data.credentials_encrypted;

        return {
            accessToken: creds.access_token || creds.accessToken,
        };
    } catch (error) {
        console.error('Error fetching credentials:', error);
        return null;
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
        const { commentId, pendingId, platform } = body;

        if (!commentId || !platform) {
            return NextResponse.json(
                { error: 'Missing required fields: commentId, platform' },
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

        // Get platform credentials
        const credentials = await getPlatformCredentials(
            supabase,
            platform,
            userData.workspace_id
        );

        if (!credentials?.accessToken) {
            return NextResponse.json(
                { error: `${platform} not connected. Please connect your account first.` },
                { status: 400 }
            );
        }

        // Delete/hide comment using platform-specific API
        let result: { success: boolean; hidden?: boolean; error?: string };

        if (platform === 'youtube') {
            result = await deleteYouTubeComment(commentId, credentials.accessToken);
        } else {
            result = await hideMetaComment(commentId, credentials.accessToken);
        }

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to delete comment' },
                { status: 400 }
            );
        }

        // Delete pending comment after successful hide/delete
        if (pendingId) {
            await supabase
                .from('pending_comments')
                .delete()
                .eq('id', pendingId)
                .eq('workspace_id', userData.workspace_id);
        }

        return NextResponse.json({
            success: true,
            hidden: result.hidden,
            message: result.hidden ? 'Comment hidden' : 'Comment deleted',
        });
    } catch (error) {
        console.error('Delete comment error:', error);
        return NextResponse.json(
            { error: 'Failed to delete comment' },
            { status: 500 }
        );
    }
}
