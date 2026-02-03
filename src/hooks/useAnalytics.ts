/**
 * Analytics Hooks
 * React hooks for fetching analytics data from the backend API.
 * Provides loading states, error handling, and auto-refresh.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    UnifiedDashboardData,
    FacebookInsights,
    InstagramInsights,
    YouTubeAnalytics,
    TikTokAnalytics,
    TopPerformingPost,
    PlatformComparisonData,
    DatePreset,
    Platform,
    AnalyticsRequest,
    DashboardRequest,
    ApiResponse,
} from '@/types/analytics';
import { PYTHON_BACKEND_URL } from '@/lib/python-backend/config';

// =============================================================================
// API BASE URL
// =============================================================================

const ANALYTICS_API = `${PYTHON_BACKEND_URL}/api/v1/analytics`;


// =============================================================================
// FETCH HELPER
// =============================================================================

async function fetchWithAuth<T>(
    url: string,
    options: RequestInit = {}
): Promise<T> {
    // Get auth token from localStorage or session
    const token = typeof window !== 'undefined'
        ? localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
        : null;

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.detail || error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// =============================================================================
// HOOK: useAnalyticsDashboard
// =============================================================================

interface UseAnalyticsDashboardOptions {
    workspaceId: string;
    datePreset?: DatePreset;
    startDate?: string;
    endDate?: string;
    platforms?: Platform[];
    includeTopPosts?: boolean;
    includeComparison?: boolean;
    autoRefresh?: boolean;
    refreshInterval?: number; // ms
}

interface UseAnalyticsDashboardResult {
    data: UnifiedDashboardData | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    isRefetching: boolean;
}

// =============================================================================
// LOCALSTORAGE CACHE HELPERS
// =============================================================================

const ANALYTICS_CACHE_KEY = 'analytics_dashboard_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours max cache age
const MAX_CACHE_ENTRIES = 3; // Maximum number of cache entries to keep

interface CachedAnalyticsData {
    data: UnifiedDashboardData;
    timestamp: number;
    workspaceId: string;
    datePreset: DatePreset;
}

function getCacheKey(workspaceId: string, datePreset: DatePreset): string {
    return `${ANALYTICS_CACHE_KEY}_${workspaceId}_${datePreset}`;
}

function getAllAnalyticsCacheKeys(): string[] {
    if (typeof window === 'undefined') return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(ANALYTICS_CACHE_KEY)) {
            keys.push(key);
        }
    }
    return keys;
}

function cleanupOldCacheEntries(): void {
    if (typeof window === 'undefined') return;

    try {
        const keys = getAllAnalyticsCacheKeys();
        const entries: { key: string; timestamp: number }[] = [];

        // Collect all entries with timestamps
        for (const key of keys) {
            try {
                const cached = localStorage.getItem(key);
                if (cached) {
                    const parsed: CachedAnalyticsData = JSON.parse(cached);
                    const age = Date.now() - parsed.timestamp;

                    // Remove expired entries immediately
                    if (age > CACHE_TTL_MS) {
                        localStorage.removeItem(key);
                    } else {
                        entries.push({ key, timestamp: parsed.timestamp });
                    }
                }
            } catch {
                // Invalid cache entry, remove it
                localStorage.removeItem(key);
            }
        }

        // If still too many entries, remove oldest ones
        if (entries.length > MAX_CACHE_ENTRIES) {
            entries.sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first
            const toRemove = entries.slice(MAX_CACHE_ENTRIES);
            for (const entry of toRemove) {
                localStorage.removeItem(entry.key);
            }
        }
    } catch {
        // Ignore cleanup errors
    }
}

function getCachedData(workspaceId: string, datePreset: DatePreset): UnifiedDashboardData | null {
    if (typeof window === 'undefined') return null;

    try {
        const key = getCacheKey(workspaceId, datePreset);
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const parsed: CachedAnalyticsData = JSON.parse(cached);

        // Check if cache is still valid (not expired)
        const age = Date.now() - parsed.timestamp;
        if (age > CACHE_TTL_MS) {
            localStorage.removeItem(key);
            return null;
        }

        // Verify cache is for the same workspace
        if (parsed.workspaceId !== workspaceId) return null;

        return parsed.data;
    } catch {
        return null;
    }
}

function setCachedData(workspaceId: string, datePreset: DatePreset, data: UnifiedDashboardData): void {
    if (typeof window === 'undefined') return;

    try {
        // Cleanup old entries first
        cleanupOldCacheEntries();

        const key = getCacheKey(workspaceId, datePreset);
        const cacheEntry: CachedAnalyticsData = {
            data,
            timestamp: Date.now(),
            workspaceId,
            datePreset,
        };
        localStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (err) {
        // localStorage might be full or disabled - try clearing old entries and retry
        try {
            cleanupOldCacheEntries();
        } catch {
            // Ignore
        }
        console.warn('Failed to cache analytics data:', err);
    }
}

// =============================================================================
// HOOK: useAnalyticsDashboard (with localStorage caching)
// =============================================================================

export function useAnalyticsDashboard(
    options: UseAnalyticsDashboardOptions
): UseAnalyticsDashboardResult {
    const {
        workspaceId,
        datePreset = 'last_30d',
        startDate,
        endDate,
        platforms,
        includeTopPosts = true,
        includeComparison = true,
        autoRefresh = false,
        refreshInterval = 5 * 60 * 1000, // 5 minutes
    } = options;

    // Initialize with cached data if available
    const [data, setData] = useState<UnifiedDashboardData | null>(() => {
        if (workspaceId) {
            return getCachedData(workspaceId, datePreset);
        }
        return null;
    });
    // If we have cached data, don't show loading spinner
    const [loading, setLoading] = useState(() => {
        if (workspaceId) {
            return getCachedData(workspaceId, datePreset) === null;
        }
        return true;
    });
    const [error, setError] = useState<string | null>(null);
    const [isRefetching, setIsRefetching] = useState(false);

    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchDashboard = useCallback(async (isRefetch = false) => {
        if (!workspaceId) {
            setError('Workspace ID is required');
            setLoading(false);
            return;
        }

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        // If we have cached data, treat as refetch (no loading spinner)
        const hasCachedData = data !== null;
        if (isRefetch || hasCachedData) {
            setIsRefetching(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            // Build query params
            const params = new URLSearchParams({
                workspace_id: workspaceId,
                include_top_posts: String(includeTopPosts),
                include_comparison: String(includeComparison),
            });

            if (startDate && endDate) {
                params.set('start_date', startDate);
                params.set('end_date', endDate);
            } else if (datePreset) {
                params.set('date_preset', datePreset);
            }

            if (platforms?.length) {
                params.set('platforms', platforms.join(','));
            }

            const response = await fetchWithAuth<ApiResponse<UnifiedDashboardData>>(
                `${ANALYTICS_API}/dashboard?${params.toString()}`,
                { signal: abortControllerRef.current.signal }
            );

            if (response.success && response.data) {
                setData(response.data);
                // Cache the fresh data
                setCachedData(workspaceId, datePreset, response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch dashboard data');
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            setError((err as Error).message);
        } finally {
            setLoading(false);
            setIsRefetching(false);
        }
    }, [workspaceId, datePreset, startDate, endDate, platforms, includeTopPosts, includeComparison, data]);

    // Load cached data when workspaceId or datePreset changes
    useEffect(() => {
        if (workspaceId) {
            const cached = getCachedData(workspaceId, datePreset);
            if (cached) {
                setData(cached);
                setLoading(false);
            }
        }
    }, [workspaceId, datePreset]);

    // Initial fetch - ONLY if no cached data exists
    // User must click refresh button to get fresh data when cache exists
    useEffect(() => {
        // Check if we already have cached data
        const cached = workspaceId ? getCachedData(workspaceId, datePreset) : null;

        // Only fetch if no cache - otherwise wait for manual refresh
        if (!cached) {
            fetchDashboard();
        }

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, datePreset]);

    // Auto-refresh disabled - user must manually click refresh
    // Keeping the hook structure in case auto-refresh is needed in the future
    useEffect(() => {
        // Auto-refresh is now disabled by default to reduce API calls
        // Data will only be refreshed when user clicks the refresh button
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchDashboard(true);
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchDashboard]);

    return {
        data,
        loading,
        error,
        refetch: () => fetchDashboard(true),
        isRefetching,
    };
}

// =============================================================================
// HOOK: useFacebookInsights
// =============================================================================

interface UseFacebookInsightsOptions extends Omit<AnalyticsRequest, 'workspace_id'> {
    workspaceId: string;
}

export function useFacebookInsights(options: UseFacebookInsightsOptions) {
    const [data, setData] = useState<FacebookInsights | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { workspaceId, datePreset = 'last_30d', startDate, endDate } = options;

    const fetchInsights = useCallback(async () => {
        if (!workspaceId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (startDate && endDate) {
                params.set('start_date', startDate);
                params.set('end_date', endDate);
            } else if (datePreset) {
                params.set('date_preset', datePreset);
            }

            const response = await fetchWithAuth<ApiResponse<FacebookInsights>>(
                `${ANALYTICS_API}/facebook/insights?${params.toString()}`
            );

            if (response.success && response.data) {
                setData(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch Facebook insights');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, datePreset, startDate, endDate]);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    return { data, loading, error, refetch: fetchInsights };
}

// =============================================================================
// HOOK: useInstagramInsights
// =============================================================================

interface UseInstagramInsightsOptions extends Omit<AnalyticsRequest, 'workspace_id'> {
    workspaceId: string;
    includeAudience?: boolean;
}

export function useInstagramInsights(options: UseInstagramInsightsOptions) {
    const [data, setData] = useState<InstagramInsights | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { workspaceId, datePreset = 'last_30d', includeAudience = true } = options;

    const fetchInsights = useCallback(async () => {
        if (!workspaceId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                workspace_id: workspaceId,
                date_preset: datePreset,
                include_audience: String(includeAudience),
            });

            const response = await fetchWithAuth<ApiResponse<InstagramInsights>>(
                `${ANALYTICS_API}/instagram/insights?${params.toString()}`
            );

            if (response.success && response.data) {
                setData(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch Instagram insights');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, datePreset, includeAudience]);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    return { data, loading, error, refetch: fetchInsights };
}

// =============================================================================
// HOOK: useYouTubeAnalytics
// =============================================================================

interface UseYouTubeAnalyticsOptions extends Omit<AnalyticsRequest, 'workspace_id'> {
    workspaceId: string;
    includeTopVideos?: boolean;
    topVideosLimit?: number;
}

export function useYouTubeAnalytics(options: UseYouTubeAnalyticsOptions) {
    const [data, setData] = useState<YouTubeAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const {
        workspaceId,
        datePreset = 'last_30d',
        includeTopVideos = true,
        topVideosLimit = 10,
    } = options;

    const fetchAnalytics = useCallback(async () => {
        if (!workspaceId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                workspace_id: workspaceId,
                date_preset: datePreset,
                include_top_videos: String(includeTopVideos),
                top_videos_limit: String(topVideosLimit),
            });

            const response = await fetchWithAuth<ApiResponse<YouTubeAnalytics>>(
                `${ANALYTICS_API}/youtube/insights?${params.toString()}`
            );

            if (response.success && response.data) {
                setData(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch YouTube analytics');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, datePreset, includeTopVideos, topVideosLimit]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    return { data, loading, error, refetch: fetchAnalytics };
}

// =============================================================================
// HOOK: useTikTokAnalytics
// =============================================================================

interface UseTikTokAnalyticsOptions extends Omit<AnalyticsRequest, 'workspace_id'> {
    workspaceId: string;
    maxVideos?: number;
}

export function useTikTokAnalytics(options: UseTikTokAnalyticsOptions) {
    const [data, setData] = useState<TikTokAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { workspaceId, datePreset = 'last_30d', maxVideos = 20 } = options;

    const fetchAnalytics = useCallback(async () => {
        if (!workspaceId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                workspace_id: workspaceId,
                date_preset: datePreset,
                max_videos: String(maxVideos),
            });

            const response = await fetchWithAuth<ApiResponse<TikTokAnalytics>>(
                `${ANALYTICS_API}/tiktok/insights?${params.toString()}`
            );

            if (response.success && response.data) {
                setData(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch TikTok analytics');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, datePreset, maxVideos]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    return { data, loading, error, refetch: fetchAnalytics };
}

// =============================================================================
// HOOK: useTopPosts
// =============================================================================

interface UseTopPostsOptions {
    workspaceId: string;
    datePreset?: DatePreset;
    limit?: number;
}

export function useTopPosts(options: UseTopPostsOptions) {
    const [data, setData] = useState<TopPerformingPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { workspaceId, datePreset = 'last_30d', limit = 10 } = options;

    const fetchTopPosts = useCallback(async () => {
        if (!workspaceId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                workspace_id: workspaceId,
                date_preset: datePreset,
                limit: String(limit),
            });

            const response = await fetchWithAuth<ApiResponse<TopPerformingPost[]>>(
                `${ANALYTICS_API}/dashboard/top-posts?${params.toString()}`
            );

            if (response.success && response.data) {
                setData(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch top posts');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, datePreset, limit]);

    useEffect(() => {
        fetchTopPosts();
    }, [fetchTopPosts]);

    return { data, loading, error, refetch: fetchTopPosts };
}

// =============================================================================
// HOOK: usePlatformComparison
// =============================================================================

interface UsePlatformComparisonOptions {
    workspaceId: string;
    datePreset?: DatePreset;
}

export function usePlatformComparison(options: UsePlatformComparisonOptions) {
    const [data, setData] = useState<PlatformComparisonData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { workspaceId, datePreset = 'last_30d' } = options;

    const fetchComparison = useCallback(async () => {
        if (!workspaceId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                workspace_id: workspaceId,
                date_preset: datePreset,
            });

            const response = await fetchWithAuth<ApiResponse<PlatformComparisonData>>(
                `${ANALYTICS_API}/dashboard/comparison?${params.toString()}`
            );

            if (response.success && response.data) {
                setData(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch platform comparison');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, datePreset]);

    useEffect(() => {
        fetchComparison();
    }, [fetchComparison]);

    return { data, loading, error, refetch: fetchComparison };
}
