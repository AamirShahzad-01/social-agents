/**
 * Cron Job API Route: Process Comments
 *
 * Endpoint: GET/POST /api/cron/process-comments
 *
 * This endpoint is called hourly by external cron services or manually
 * to automatically process and respond to comments on connected social media accounts.
 * 
 * Proxies to Python backend at /api/v1/comments/process
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PYTHON_BACKEND_URL } from '@/lib/backend-url';
import { createServerClient } from '@/lib/supabase/server';

// Configuration
const CONFIG = {
    MAX_WORKSPACES_PER_RUN: 5,
    PLATFORMS: ['instagram', 'facebook', 'youtube'] as const,
} as const;

interface SocialConnection {
    workspace_id: string;
    platform: string;
    is_connected: boolean;
    credentials_encrypted: any;
}

// Supabase Admin Client
let supabaseAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
    if (supabaseAdmin) return supabaseAdmin;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Missing Supabase configuration');
    }

    supabaseAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return supabaseAdmin;
}

// Authentication
async function verifyAuth(request: NextRequest): Promise<{ authorized: boolean; error?: string }> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Development mode - allow without secret
    if (!cronSecret) {
        return { authorized: true };
    }

    // Check Bearer token
    if (authHeader === `Bearer ${cronSecret}`) {
        return { authorized: true };
    }

    // Check x-cron-secret header
    const headerSecret = request.headers.get('x-cron-secret');
    if (headerSecret === cronSecret) {
        return { authorized: true };
    }

    // Allow authenticated app users to trigger manually from the UI
    // (Comments page calls POST without cron headers)
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            return { authorized: true };
        }
    } catch {
        // ignore and fall through to unauthorized
    }

    return { authorized: false, error: 'Invalid or missing CRON_SECRET' };
}

async function handleProcessComments(request: NextRequest) {
    const startTime = Date.now();

    // Verify authentication
    const auth = await verifyAuth(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    try {
        const supabase = getSupabaseAdmin();

        // Get workspaces with connected social accounts
        // NOTE: Table name aligned with supabase/projectdb.sql
        const { data: connections, error: connectionsError } = await supabase
            .from('social_accounts')
            .select('workspace_id, platform, is_connected, credentials_encrypted')
            .in('platform', CONFIG.PLATFORMS)
            .eq('is_connected', true)
            .limit(CONFIG.MAX_WORKSPACES_PER_RUN * 3);

        if (connectionsError) {
            console.error('Fetch connections error:', connectionsError);
            return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
        }

        if (!connections || connections.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No connected accounts to process',
                workspaces: 0,
                totalAutoReplied: 0,
                totalEscalated: 0,
            });
        }

        // Get unique workspace IDs
        const workspaceIds = [...new Set((connections as SocialConnection[]).map(c => c.workspace_id))];

        // Process each workspace
        const results = [];
        let totalAutoReplied = 0;
        let totalEscalated = 0;
        let totalErrors = 0;

        for (const workspaceId of workspaceIds.slice(0, CONFIG.MAX_WORKSPACES_PER_RUN)) {
            try {
                // Get credentials for this workspace
                const workspaceConnections = (connections as SocialConnection[]).filter(
                    c => c.workspace_id === workspaceId && c.is_connected
                );

                // Extract credentials from connections
                let accessToken = '';
                let instagramUserId: string | undefined;
                let facebookPageId: string | undefined;
                let youtubeAccessToken: string | undefined;
                let youtubeChannelId: string | undefined;

                for (const conn of workspaceConnections) {
                    const creds = typeof conn.credentials_encrypted === 'string'
                        ? JSON.parse(conn.credentials_encrypted)
                        : conn.credentials_encrypted;

                    if (conn.platform === 'instagram' || conn.platform === 'facebook') {
                        accessToken = creds?.access_token || creds?.accessToken || accessToken;
                        if (conn.platform === 'instagram') {
                            instagramUserId = creds?.user_id || creds?.userId;
                        }
                        if (conn.platform === 'facebook') {
                            facebookPageId = creds?.page_id || creds?.pageId;
                        }
                    }
                    if (conn.platform === 'youtube') {
                        youtubeAccessToken = creds?.access_token || creds?.accessToken;
                        youtubeChannelId = creds?.channel_id || creds?.channelId;
                    }
                }

                // Call Python backend
                const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/comments/process`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workspaceId,
                        userId: 'cron-system',
                        platforms: CONFIG.PLATFORMS,
                        runType: 'cron',
                        credentials: {
                            accessToken,
                            instagramUserId,
                            facebookPageId,
                            youtubeAccessToken,
                            youtubeChannelId,
                        },
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Backend processing failed');
                }

                const result = await response.json();

                results.push({
                    workspaceId,
                    ...result,
                });

                totalAutoReplied += result.autoReplied || 0;
                totalEscalated += result.escalated || 0;
                totalErrors += result.errors || 0;

            } catch (error) {
                totalErrors++;
                results.push({
                    workspaceId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const executionTime = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            workspaces: results.length,
            totalAutoReplied,
            totalEscalated,
            totalErrors,
            executionTime,
            results,
        });
    } catch (error) {
        console.error('Process comments error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    return handleProcessComments(request);
}

export async function POST(request: NextRequest) {
    return handleProcessComments(request);
}
