/**
 * Reply to Comment API
 * POST /api/comments/reply - Reply to a comment from the dashboard
 * Supports: Instagram, Facebook (Meta Graph API), YouTube (YouTube Data API v3)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

interface UserData {
    workspace_id: string;
}

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

function generateAppSecretProof(accessToken: string): string {
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET || '';
    if (!appSecret) return '';
    return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

/**
 * Reply to a YouTube comment using YouTube Data API v3
 */
async function replyToYouTubeComment(
    commentId: string,
    message: string,
    accessToken: string
): Promise<{ success: boolean; replyId?: string; error?: string }> {
    try {
        const url = `${YOUTUBE_API_BASE}/comments?part=snippet`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                snippet: {
                    parentId: commentId,
                    textOriginal: message,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                error: error.error?.message || 'Failed to post reply to YouTube'
            };
        }

        const data = await response.json();
        return { success: true, replyId: data.id };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Reply to a Meta (Instagram/Facebook) comment using Graph API
 */
async function replyToMetaComment(
    commentId: string,
    message: string,
    accessToken: string
): Promise<{ success: boolean; replyId?: string; error?: string }> {
    try {
        const proof = generateAppSecretProof(accessToken);
        const params = new URLSearchParams({
            message,
            access_token: accessToken,
        });
        if (proof) {
            params.append('appsecret_proof', proof);
        }

        const response = await fetch(`${GRAPH_API_BASE}/${commentId}/replies`, {
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
                error: error.error?.message || 'Failed to post reply to platform'
            };
        }

        const data = await response.json();
        return { success: true, replyId: data.id };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get platform credentials from social_connections table
 */
async function getPlatformCredentials(
    supabase: any,
    platform: string,
    workspaceId: string
): Promise<{ accessToken?: string } | null> {
    try {
        const { data } = await supabase
            .from('social_connections')
            .select('credentials_encrypted')
            .eq('workspace_id', workspaceId)
            .eq('platform', platform)
            .eq('is_connected', true)
            .single();

        if (!data?.credentials_encrypted) {
            return null;
        }

        // Parse credentials (stored as JSON string or object)
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
        const { commentId, pendingId, message, platform } = body;

        if (!commentId || !message || !platform) {
            return NextResponse.json(
                { error: 'Missing required fields: commentId, message, platform' },
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

        // Post reply using platform-specific API
        let result: { success: boolean; replyId?: string; error?: string };

        if (platform === 'youtube') {
            result = await replyToYouTubeComment(commentId, message, credentials.accessToken);
        } else {
            result = await replyToMetaComment(commentId, message, credentials.accessToken);
        }

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to post reply' },
                { status: 400 }
            );
        }

        // Delete pending comment after successful reply
        if (pendingId) {
            await supabase
                .from('pending_comments')
                .delete()
                .eq('id', pendingId)
                .eq('workspace_id', userData.workspace_id);
        }

        return NextResponse.json({
            success: true,
            replyId: result.replyId,
            message: 'Reply posted successfully',
        });
    } catch (error) {
        console.error('Reply error:', error);
        return NextResponse.json(
            { error: 'Failed to post reply' },
            { status: 500 }
        );
    }
}
