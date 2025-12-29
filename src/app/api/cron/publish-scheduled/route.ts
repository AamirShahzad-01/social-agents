/**
 * Cron Job API Route: Publish Scheduled Posts
 *
 * Endpoint: GET/POST /api/cron/publish-scheduled
 *
 * This endpoint is called by external cron services (cron-job.org recommended)
 * to automatically publish posts that have reached their scheduled time.
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Setup with cron-job.org:
 * 1. Go to https://cron-job.org and create an account
 * 2. Create a new cron job with URL: https://your-domain.com/api/cron/publish-scheduled
 * 3. Set schedule to every 5 minutes
 * 4. Add header: x-cron-secret = YOUR_CRON_SECRET
 *
 * See docs/CRON_SETUP.md for full documentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// Configuration
// ============================================

const CONFIG = {
    MAX_RETRY_COUNT: 3,        // Max publish attempts before marking as failed
    MAX_POSTS_PER_RUN: 50,     // Max posts to process per cron run
    REQUEST_TIMEOUT_MS: 60000, // 60 second timeout for platform API calls
} as const;

// ============================================
// Types
// ============================================

interface PublishResult {
    platform: string;
    success: boolean;
    postId?: string;
    error?: string;
}

interface ProcessedPost {
    postId: string;
    topic: string;
    status: 'published' | 'failed' | 'partial';
    platforms: PublishResult[];
}

interface CronResponse {
    success: boolean;
    message?: string;
    processed: number;
    published: number;
    failed: number;
    results?: ProcessedPost[];
    error?: string;
}

// ============================================
// Supabase Admin Client (bypasses RLS)
// ============================================

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
    if (supabaseAdmin) return supabaseAdmin;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Missing Supabase configuration');
    }

    supabaseAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    return supabaseAdmin;
}

// ============================================
// Authentication
// ============================================

function verifyAuth(request: NextRequest): { authorized: boolean; error?: string } {
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

    // Check x-cron-secret header (for cron-job.org)
    const headerSecret = request.headers.get('x-cron-secret');
    if (headerSecret === cronSecret) {
        return { authorized: true };
    }

    return { authorized: false, error: 'Invalid or missing CRON_SECRET' };
}

// ============================================
// Platform Publishing
// ============================================

async function publishToPlatform(
    platform: string,
    post: any,
    appUrl: string
): Promise<PublishResult> {
    try {
        const rawContent = post.content?.[platform] || post.topic;

        let textContent = '';
        if (typeof rawContent === 'string') {
            textContent = rawContent;
        } else if (typeof rawContent === 'object' && rawContent !== null) {
            textContent = rawContent.description || rawContent.content || rawContent.title || rawContent.caption || '';
        }

        if (!textContent && post.topic) {
            textContent = post.topic;
        }

        const generatedImage = post.content?.generatedImage;
        const generatedVideoUrl = post.content?.generatedVideoUrl;
        const carouselImages = post.content?.carouselImages;

        let mediaUrl = generatedImage || generatedVideoUrl;
        if (!mediaUrl && carouselImages && carouselImages.length > 0) {
            mediaUrl = carouselImages[0];
        }

        const videoPostTypes = ['reel', 'video', 'short'];
        let mediaType: 'image' | 'video' = 'image';
        if (post.post_type && videoPostTypes.includes(post.post_type)) {
            mediaType = 'video';
        } else if (generatedVideoUrl) {
            mediaType = 'video';
        }

        const baseBody = {
            workspaceId: post.workspace_id,
            userId: post.created_by,
            scheduledPublish: true,
        };

        let body: any = { ...baseBody };

        switch (platform) {
            case 'facebook':
                body.message = textContent;
                body.imageUrl = mediaUrl;
                body.mediaType = mediaType;
                body.postType = post.post_type;
                break;
            case 'instagram':
                body.caption = textContent;
                body.imageUrl = mediaUrl;
                body.mediaType = mediaType;
                body.postType = post.post_type;
                body.carouselUrls = carouselImages?.length >= 2 ? carouselImages : undefined;
                break;
            case 'linkedin':
                body.text = textContent;
                body.mediaUrl = mediaUrl;
                body.visibility = 'PUBLIC';
                break;
            case 'twitter':
                body.text = textContent;
                body.mediaUrl = mediaUrl;
                break;
            case 'tiktok':
                body.caption = textContent;
                body.videoUrl = generatedVideoUrl;
                body.videoSize = 0;
                break;
            case 'youtube':
                body.title = textContent?.substring(0, 100) || post.topic?.substring(0, 100);
                body.description = textContent;
                body.videoUrl = generatedVideoUrl;
                body.privacyStatus = 'public';
                break;
            default:
                body.content = textContent;
                body.text = textContent;
                body.mediaUrl = mediaUrl;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(`${appUrl}/api/${platform}/post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': process.env.CRON_SECRET || '',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const result = await response.json();

            return {
                platform,
                success: result.success === true || response.ok,
                postId: result.postId || result.tweetId || result.id,
                error: result.error || (response.ok ? undefined : `HTTP ${response.status}`),
            };
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                return { platform, success: false, error: 'Request timeout' };
            }
            throw fetchError;
        }
    } catch (error) {
        return {
            platform,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

async function publishToAllPlatforms(post: any): Promise<PublishResult[]> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
        return post.platforms.map((p: string) => ({
            platform: p,
            success: false,
            error: 'NEXT_PUBLIC_APP_URL not configured',
        }));
    }

    const results = await Promise.all(
        post.platforms.map((platform: string) => publishToPlatform(platform, post, appUrl))
    );

    return results;
}

// ============================================
// Post Status Management
// ============================================

async function updatePostStatus(
    postId: string,
    status: 'published' | 'failed',
    errorMessage?: string,
    publishResults?: PublishResult[]
): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { data: currentPost } = await supabase
        .from('posts')
        .select('content, publish_retry_count')
        .eq('id', postId)
        .single();

    const currentRetryCount = currentPost?.publish_retry_count || 0;
    const now = new Date().toISOString();

    if (status === 'published') {
        // Delete the post after successful publishing
        await supabase.from('posts').delete().eq('id', postId);
    } else {
        const newRetryCount = currentRetryCount + 1;
        const updateData: Record<string, any> = {
            updated_at: now,
            last_publish_attempt: now,
            publish_retry_count: newRetryCount,
            publish_error: errorMessage,
        };

        if (newRetryCount >= CONFIG.MAX_RETRY_COUNT) {
            updateData.status = 'failed';
        }

        if (currentPost?.content) {
            updateData.content = {
                ...currentPost.content,
                _publishLog: {
                    lastAttempt: now,
                    retryCount: updateData.publish_retry_count,
                    error: errorMessage,
                    results: publishResults,
                },
            };
        }

        await supabase.from('posts').update(updateData).eq('id', postId);
    }
}

async function logPublishActivity(
    post: any,
    status: 'published' | 'failed',
    results: PublishResult[]
): Promise<void> {
    const supabase = getSupabaseAdmin();
    const successCount = results.filter(r => r.success).length;

    await (supabase.from('activity_logs') as any).insert({
        workspace_id: post.workspace_id,
        user_id: post.created_by,
        action: status === 'published' ? 'post_published' : 'post_publish_failed',
        resource_type: 'post',
        resource_id: post.id,
        details: {
            scheduled: true,
            scheduled_at: post.scheduled_at,
            published_at: new Date().toISOString(),
            platforms: results,
            success_count: successCount,
            total_platforms: post.platforms?.length || 0,
        },
    });
}

// ============================================
// Main Handler
// ============================================

async function handlePublishScheduled(request: NextRequest): Promise<NextResponse<CronResponse>> {
    const startTime = Date.now();

    try {
        // 1. Verify authentication
        const auth = verifyAuth(request);
        if (!auth.authorized) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized', processed: 0, published: 0, failed: 0 },
                { status: 401 }
            );
        }

        // 2. Get Supabase client
        const supabase = getSupabaseAdmin();
        const now = new Date().toISOString();

        // 3. Fetch scheduled posts that are due
        const { data: scheduledPosts, error: fetchError } = await supabase
            .from('posts')
            .select('*')
            .eq('status', 'scheduled')
            .lte('scheduled_at', now)
            .is('deleted_at', null)
            .or(`publish_retry_count.is.null,publish_retry_count.lt.${CONFIG.MAX_RETRY_COUNT}`)
            .order('scheduled_at', { ascending: true })
            .limit(CONFIG.MAX_POSTS_PER_RUN);

        if (fetchError) {
            return NextResponse.json(
                { success: false, error: 'Database error', processed: 0, published: 0, failed: 0 },
                { status: 500 }
            );
        }

        // 4. Handle no posts case
        if (!scheduledPosts || scheduledPosts.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No scheduled posts to process',
                processed: 0,
                published: 0,
                failed: 0,
            });
        }

        // 5. Process each post
        const results: ProcessedPost[] = [];

        for (const post of scheduledPosts) {
            try {
                const publishResults = await publishToAllPlatforms(post);
                const successCount = publishResults.filter(r => r.success).length;
                const totalPlatforms = publishResults.length;

                let postStatus: 'published' | 'failed' | 'partial';
                if (successCount === totalPlatforms) {
                    postStatus = 'published';
                } else if (successCount === 0) {
                    postStatus = 'failed';
                } else {
                    postStatus = 'partial';
                }

                const dbStatus = postStatus === 'partial' ? 'published' : postStatus;
                const errorMsg = postStatus !== 'published'
                    ? publishResults.filter(r => !r.success).map(r => `${r.platform}: ${r.error}`).join('; ')
                    : undefined;

                await updatePostStatus(post.id, dbStatus, errorMsg, publishResults);
                await logPublishActivity(post, dbStatus, publishResults);

                results.push({
                    postId: post.id,
                    topic: post.topic,
                    status: postStatus,
                    platforms: publishResults,
                });

            } catch (error) {
                await updatePostStatus(
                    post.id,
                    'failed',
                    error instanceof Error ? error.message : 'Processing error'
                );

                results.push({
                    postId: post.id,
                    topic: post.topic,
                    status: 'failed',
                    platforms: [{ platform: 'all', success: false, error: 'Processing error' }],
                });
            }
        }

        // 6. Calculate summary
        const published = results.filter(r => r.status === 'published' || r.status === 'partial').length;
        const failed = results.filter(r => r.status === 'failed').length;

        return NextResponse.json({
            success: true,
            processed: results.length,
            published,
            failed,
            results,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
                processed: 0,
                published: 0,
                failed: 0,
            },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    return handlePublishScheduled(request);
}

export async function POST(request: NextRequest) {
    return handlePublishScheduled(request);
}
