/**
 * Rate Limits API Client
 * Frontend client for interacting with the Python backend rate limiting service.
 * 
 * Provides quota tracking and pre-publish validation for all social platforms.
 */
import { get, post } from '../client';
import { ENDPOINTS } from '../config';

// =============================================================================
// TYPES
// =============================================================================

export type Platform =
    | 'facebook'
    | 'instagram'
    | 'twitter'
    | 'linkedin'
    | 'tiktok'
    | 'youtube'
    | 'meta_ads';

export interface PlatformQuota {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
    isExceeded: boolean;
    isWarning: boolean;
    isCritical: boolean;
    resetsAt: string;
    description: string;
}

export interface AllQuotasResponse {
    success: boolean;
    quotas: Record<Platform, PlatformQuota>;
    summary: {
        totalPlatforms: number;
        exceededCount: number;
        warningCount: number;
        exceededPlatforms: string[];
        warningPlatforms: string[];
    };
    timestamp: string;
}

export interface QuotaCheckRequest {
    workspace_id: string;
    platform: string;
    post_count?: number;
}

export interface QuotaCheckResponse {
    success: boolean;
    allowed: boolean;
    platform: string;
    used: number;
    limit: number;
    remaining: number;
    message: string;
    error_code?: string;
}

export interface PlatformLimit {
    postsPerDay: number;
    apiCallsPerHour: number;
    apiCallsPerMinute: number;
    commentWritesPerHour: number;
    description: string;
    isDynamic: boolean;
}

export interface UsageHistoryItem {
    id: string;
    workspace_id: string;
    platform: string;
    date: string;
    posts_count: number;
    daily_limit: number;
    created_at: string;
    updated_at: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get quota status for all platforms.
 * Use this for dashboard display.
 */
export async function getAllQuotas(workspaceId: string): Promise<AllQuotasResponse> {
    return get<AllQuotasResponse>(
        `${ENDPOINTS.rateLimits.status}?workspace_id=${workspaceId}`
    );
}

/**
 * Get quota status for a specific platform.
 */
export async function getPlatformQuota(
    platform: Platform,
    workspaceId: string
): Promise<{ success: boolean } & PlatformQuota> {
    return get<{ success: boolean } & PlatformQuota>(
        `${ENDPOINTS.rateLimits.platform(platform)}?workspace_id=${workspaceId}`
    );
}

/**
 * Check if publishing is allowed before attempting to post.
 * Call this BEFORE publishing to verify quota is available.
 */
export async function checkCanPublish(
    workspaceId: string,
    platform: string,
    postCount: number = 1
): Promise<QuotaCheckResponse> {
    return post<QuotaCheckResponse>(
        ENDPOINTS.rateLimits.check,
        {
            workspace_id: workspaceId,
            platform,
            post_count: postCount,
        }
    );
}

/**
 * Increment usage after successful publish.
 * Call this AFTER a post is successfully published.
 */
export async function incrementUsage(
    workspaceId: string,
    platform: string,
    count: number = 1
): Promise<{
    success: boolean;
    message: string;
    currentUsage: number;
    remaining: number;
    limit: number;
}> {
    return post(ENDPOINTS.rateLimits.increment, {
        workspace_id: workspaceId,
        platform,
        count,
    });
}

/**
 * Get usage history for analytics.
 */
export async function getUsageHistory(
    workspaceId: string,
    platform?: Platform,
    days: number = 7
): Promise<{
    success: boolean;
    history: UsageHistoryItem[];
    days: number;
    platform: string | null;
}> {
    let url = `${ENDPOINTS.rateLimits.history(workspaceId)}?days=${days}`;
    if (platform) {
        url += `&platform=${platform}`;
    }
    return get(url);
}

/**
 * Get configured limits for all platforms.
 * Returns official rate limits from platform documentation.
 */
export async function getPlatformLimits(): Promise<{
    success: boolean;
    limits: Record<Platform, PlatformLimit>;
    platforms: Platform[];
}> {
    return get(ENDPOINTS.rateLimits.limits);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if user is approaching quota limit (80%+).
 */
export function isApproachingLimit(quota: PlatformQuota): boolean {
    return quota.isWarning && !quota.isExceeded;
}

/**
 * Get quota status color for UI display.
 */
export function getQuotaStatusColor(quota: PlatformQuota): 'green' | 'yellow' | 'red' {
    if (quota.isExceeded || quota.isCritical) return 'red';
    if (quota.isWarning) return 'yellow';
    return 'green';
}

/**
 * Format remaining quota for display.
 */
export function formatQuotaRemaining(quota: PlatformQuota): string {
    if (quota.isExceeded) {
        return 'Limit reached';
    }
    return `${quota.remaining} remaining`;
}

/**
 * Get time until quota resets.
 */
export function getTimeUntilReset(resetsAt: string): string {
    const resetTime = new Date(resetsAt);
    const now = new Date();
    const diffMs = resetTime.getTime() - now.getTime();

    if (diffMs <= 0) return 'Resetting soon';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `Resets in ${hours}h ${minutes}m`;
    }
    return `Resets in ${minutes}m`;
}
