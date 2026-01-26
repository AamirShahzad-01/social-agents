/**
 * CREDENTIALS SERVICE
 * 
 * Single service for all credentials/connection status operations.
 * All components should use this service instead of direct fetch calls.
 * 
 * This ensures:
 * - Consistent API calls
 * - Single point of error handling
 * - Easy to test and mock
 */

import type {
    Platform,
    CredentialsStatusResponse,
    PlatformStatus,
    ConnectedAccountsSummary
} from '@/types/credentials';
import { createEmptyStatus, extractConnectedSummary } from '@/types/credentials';

/** API endpoint for credentials status (proxied through Next.js) */
const CREDENTIALS_STATUS_URL = '/api/credentials/status';

/** Disconnect endpoint pattern */
const CREDENTIALS_DISCONNECT_URL = (platform: Platform) => `/api/credentials/${platform}/disconnect`;

/**
 * Credentials service for managing social platform connections.
 */
export const credentialsService = {
    /**
     * Get connection status for all platforms.
     * @throws Error if the request fails
     */
    async getStatus(): Promise<CredentialsStatusResponse> {
        const response = await fetch(CREDENTIALS_STATUS_URL, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include', // Include cookies for auth
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Failed to fetch credentials status: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        // Validate response structure
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid credentials status response');
        }

        return data as CredentialsStatusResponse;
    },

    /**
     * Get connection status for all platforms, with fallback to empty status on error.
     * Use this when you want to gracefully handle errors.
     */
    async getStatusSafe(): Promise<CredentialsStatusResponse> {
        try {
            return await this.getStatus();
        } catch (error) {
            console.error('[credentialsService] Failed to get status:', error);
            return createEmptyStatus();
        }
    },

    /**
     * Get status for a specific platform.
     */
    async getPlatformStatus(platform: Platform): Promise<PlatformStatus> {
        const status = await this.getStatus();
        return status[platform] ?? { isConnected: false };
    },

    /**
     * Check if a specific platform is connected.
     */
    async isConnected(platform: Platform): Promise<boolean> {
        const status = await this.getPlatformStatus(platform);
        return status.isConnected;
    },

    /**
     * Get list of all connected platforms.
     */
    async getConnectedPlatforms(): Promise<Platform[]> {
        const status = await this.getStatus();
        return (Object.entries(status) as [Platform, PlatformStatus][])
            .filter(([_, info]) => info.isConnected)
            .map(([platform, _]) => platform);
    },

    /**
     * Get connected accounts summary (boolean map).
     */
    async getConnectedSummary(): Promise<ConnectedAccountsSummary> {
        const status = await this.getStatus();
        return extractConnectedSummary(status);
    },

    /**
     * Disconnect a platform.
     * @throws Error if the request fails
     */
    async disconnect(platform: Platform): Promise<void> {
        const response = await fetch(CREDENTIALS_DISCONNECT_URL(platform), {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.details || errorData?.error || 'Failed to disconnect';
            throw new Error(errorMessage);
        }
    },
};

export default credentialsService;
