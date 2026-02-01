'use client'

/**
 * YouTube Auto-Refresh Hook
 * 
 * Automatically checks and refreshes YouTube tokens on app startup.
 * Prevents token expiration during active use by refreshing tokens
 * that expire within 2 hours.
 */

import React, { useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { autoRefreshOnStartup } from '../lib/python-backend/api/social/youtube';

interface UseYouTubeAutoRefreshOptions {
    /** Enable/disable auto-refresh (default: true) */
    enabled?: boolean;
    /** Run on mount (default: true) */
    runOnMount?: boolean;
}

interface UseYouTubeAutoRefreshReturn {
    /** Manually trigger a token refresh check */
    checkAndRefresh: () => Promise<boolean>;
    /** Whether auto-refresh is currently running */
    isChecking: boolean;
}

export function useYouTubeAutoRefresh(
    options: UseYouTubeAutoRefreshOptions = {}
): UseYouTubeAutoRefreshReturn {
    const { enabled = true, runOnMount = true } = options;
    const { user } = useAuth();
    const isCheckingRef = useRef(false);

    const isAuthenticated = !!user;

    const checkAndRefresh = useCallback(async (): Promise<boolean> => {
        if (isCheckingRef.current) {
            console.log('[YouTubeAutoRefresh] Already checking, skipping');
            return false;
        }

        if (!isAuthenticated || !user?.id) {
            console.log('[YouTubeAutoRefresh] User not authenticated, skipping');
            return false;
        }

        isCheckingRef.current = true;

        try {
            console.log('[YouTubeAutoRefresh] Checking YouTube token...');
            const result = await autoRefreshOnStartup();

            if (result) {
                console.log('[YouTubeAutoRefresh] Token check completed successfully');
            } else {
                console.log('[YouTubeAutoRefresh] Token check completed, user not connected or refresh failed');
            }

            return result;
        } catch (error) {
            console.error('[YouTubeAutoRefresh] Error during token refresh:', error);
            return false;
        } finally {
            isCheckingRef.current = false;
        }
    }, [isAuthenticated, user?.id]);

    useEffect(() => {
        if (enabled && runOnMount && isAuthenticated && user?.id) {
            const timeoutId = setTimeout(() => {
                checkAndRefresh();
            }, 1000);

            return () => clearTimeout(timeoutId);
        }
    }, [enabled, runOnMount, isAuthenticated, user?.id, checkAndRefresh]);

    return {
        checkAndRefresh,
        isChecking: isCheckingRef.current,
    };
}

interface YouTubeAutoRefreshProviderProps {
    children: ReactNode;
    enabled?: boolean;
}

export function YouTubeAutoRefreshProvider({
    children,
    enabled = true,
}: YouTubeAutoRefreshProviderProps): ReactNode {
    useYouTubeAutoRefresh({ enabled, runOnMount: true });
    return children;
}
