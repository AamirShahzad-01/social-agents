/**
 * USE CREDENTIAL STATUS HOOK
 * 
 * Custom React hook for managing credential/connection status.
 * Provides loading state, error handling, and convenience methods.
 * 
 * Usage:
 * ```tsx
 * const { status, isLoading, error, refresh, isConnected } = useCredentialStatus();
 * 
 * if (isLoading) return <Spinner />;
 * if (error) return <ErrorMessage error={error} />;
 * 
 * return (
 *   <div>
 *     {PLATFORMS.map(platform => (
 *       <PlatformCard
 *         key={platform}
 *         status={status?.[platform]}
 *         isConnected={isConnected(platform)}
 *       />
 *     ))}
 *   </div>
 * );
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { credentialsService } from '@/services/credentialsService';
import type {
    Platform,
    CredentialsStatusResponse,
    ConnectedAccountsSummary
} from '@/types/credentials';
import { createEmptyStatus, extractConnectedSummary } from '@/types/credentials';

/**
 * Return type for useCredentialStatus hook.
 */
export interface UseCredentialStatusReturn {
    /** Full status response for all platforms */
    status: CredentialsStatusResponse;

    /** Boolean map of connected platforms */
    connectedAccounts: ConnectedAccountsSummary;

    /** List of currently connected platform names */
    connectedPlatforms: Platform[];

    /** Whether the initial load is in progress */
    isLoading: boolean;

    /** Error from the last fetch attempt, if any */
    error: Error | null;

    /** Refresh the status (use after connect/disconnect) */
    refresh: () => Promise<void>;

    /** Check if a specific platform is connected */
    isConnected: (platform: Platform) => boolean;
}

/**
 * Hook options.
 */
export interface UseCredentialStatusOptions {
    /** Skip initial fetch (useful for conditional loading) */
    skip?: boolean;

    /** Auto-refresh interval in milliseconds (0 = disabled) */
    refreshInterval?: number;
}

/**
 * Hook for managing credential/connection status.
 */
export function useCredentialStatus(
    options: UseCredentialStatusOptions = {}
): UseCredentialStatusReturn {
    const { skip = false, refreshInterval = 0 } = options;

    const [status, setStatus] = useState<CredentialsStatusResponse>(createEmptyStatus);
    const [isLoading, setIsLoading] = useState(!skip);
    const [error, setError] = useState<Error | null>(null);

    /**
     * Fetch the latest status from the API.
     */
    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await credentialsService.getStatus();
            setStatus(data);
        } catch (e) {
            const err = e instanceof Error ? e : new Error('Failed to load credentials status');
            setError(err);
            console.error('[useCredentialStatus] Error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Initial load on mount.
     */
    useEffect(() => {
        if (!skip) {
            refresh();
        }
    }, [skip, refresh]);

    /**
     * Auto-refresh interval (if configured).
     */
    useEffect(() => {
        if (refreshInterval > 0 && !skip) {
            const interval = setInterval(refresh, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [refreshInterval, skip, refresh]);

    /**
     * Derived: connected accounts summary.
     */
    const connectedAccounts = useMemo(() => extractConnectedSummary(status), [status]);

    /**
     * Derived: list of connected platform names.
     */
    const connectedPlatforms = useMemo(() => {
        return (Object.entries(status) as [Platform, any][])
            .filter(([_, info]) => info.isConnected)
            .map(([platform, _]) => platform);
    }, [status]);

    /**
     * Helper: check if a specific platform is connected.
     */
    const isConnected = useCallback(
        (platform: Platform): boolean => {
            return status[platform]?.isConnected ?? false;
        },
        [status]
    );

    return {
        status,
        connectedAccounts,
        connectedPlatforms,
        isLoading,
        error,
        refresh,
        isConnected,
    };
}

export default useCredentialStatus;
