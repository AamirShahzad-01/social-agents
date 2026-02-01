'use client'

/**
 * Canva Auto-Refresh Hook
 * 
 * Automatically checks and refreshes Canva tokens on app startup.
 * Prevents token expiration during active use by refreshing tokens
 * that expire within 2 hours.
 */

import React, { useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { autoRefreshOnStartup } from '../lib/python-backend/api/canva';

interface UseCanvaAutoRefreshOptions {
    /** Enable/disable auto-refresh (default: true) */
    enabled?: boolean;
    /** Run on mount (default: true) */
    runOnMount?: boolean;
}

interface UseCanvaAutoRefreshReturn {
    /** Manually trigger a token refresh check */
    checkAndRefresh: () => Promise<boolean>;
    /** Whether auto-refresh is currently running */
    isChecking: boolean;
}

/**
 * Hook for automatic Canva token refresh on app startup
 * 
 * This hook should be used at the app level (e.g., in AppProvider or layout)
 * to ensure Canva tokens are refreshed proactively before they expire.
 * 
 * @example
 * ```tsx
 * // In your AppProvider or root layout
 * function AppProvider({ children }) {
 *   useCanvaAutoRefresh({ enabled: true });
 *   return <>{children}</>;
 * }
 * ```
 */
export function useCanvaAutoRefresh(
    options: UseCanvaAutoRefreshOptions = {}
): UseCanvaAutoRefreshReturn {
    const { enabled = true, runOnMount = true } = options;
    const { user } = useAuth();
    const isCheckingRef = useRef(false);

    const isAuthenticated = !!user;

    const checkAndRefresh = useCallback(async (): Promise<boolean> => {
        // Prevent concurrent checks
        if (isCheckingRef.current) {
            console.log('[CanvaAutoRefresh] Already checking, skipping');
            return false;
        }

        if (!isAuthenticated || !user?.id) {
            console.log('[CanvaAutoRefresh] User not authenticated, skipping');
            return false;
        }

        isCheckingRef.current = true;

        try {
            console.log('[CanvaAutoRefresh] Checking Canva token...');
            const result = await autoRefreshOnStartup(user.id);
            
            if (result) {
                console.log('[CanvaAutoRefresh] Token check completed successfully');
            } else {
                console.log('[CanvaAutoRefresh] Token check completed, user not connected or refresh failed');
            }
            
            return result;
        } catch (error) {
            console.error('[CanvaAutoRefresh] Error during token refresh:', error);
            return false;
        } finally {
            isCheckingRef.current = false;
        }
    }, [isAuthenticated, user?.id]);

    // Run on mount if enabled
    useEffect(() => {
        if (enabled && runOnMount && isAuthenticated && user?.id) {
            // Use setTimeout to not block initial render
            const timeoutId = setTimeout(() => {
                checkAndRefresh();
            }, 1000); // 1 second delay to not interfere with app startup

            return () => clearTimeout(timeoutId);
        }
    }, [enabled, runOnMount, isAuthenticated, user?.id, checkAndRefresh]);

    return {
        checkAndRefresh,
        isChecking: isCheckingRef.current,
    };
}

interface CanvaAutoRefreshProviderProps {
    children: ReactNode;
    enabled?: boolean;
}

/**
 * Canva Auto-Refresh Provider Component
 * 
 * Wrapper component that provides automatic token refresh functionality.
 * Include this in your app layout to enable auto-refresh for all users.
 * 
 * @example
 * ```tsx
 * // In your root layout
 * export default function RootLayout({ children }) {
 *   return (
 *     <CanvaAutoRefreshProvider>
 *       {children}
 *     </CanvaAutoRefreshProvider>
 *   );
 * }
 * ```
 */
export function CanvaAutoRefreshProvider({ 
    children,
    enabled = true 
}: CanvaAutoRefreshProviderProps) {
    useCanvaAutoRefresh({ enabled, runOnMount: true });
    return <>{children}</>;
}
