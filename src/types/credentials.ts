/**
 * CANONICAL TYPES FOR CREDENTIALS/CONNECTION STATUS
 * 
 * These types MUST match the Python backend API response exactly.
 * Single source of truth - do not create duplicate types elsewhere.
 * 
 * Backend endpoint: GET /api/v1/credentials/status
 * Next.js proxy: GET /api/credentials/status
 */

/**
 * Supported social media platforms.
 * Must match Python backend VALID_PLATFORMS list.
 */
export type Platform = 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'youtube';

/**
 * All supported platforms as an array (for iteration).
 */
export const PLATFORMS: Platform[] = ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube'];

/**
 * Connection status for a single platform.
 * Field names MUST match Python backend response (camelCase).
 */
export interface PlatformStatus {
    /** Whether the platform is currently connected and token is valid */
    isConnected: boolean;

    /** Platform-specific account ID */
    accountId?: string;

    /** Display name for the account */
    accountName?: string;

    /** Facebook/Instagram page ID (if applicable) */
    pageId?: string;

    /** Facebook/Instagram page name (if applicable) */
    pageName?: string;

    /** Instagram user ID (if applicable) */
    igUserId?: string;

    /** Platform username (e.g., @handle) */
    username?: string;

    /** ISO timestamp when the account was connected */
    connectedAt?: string;

    /** ISO timestamp when the access token expires */
    expiresAt?: string;

    /** Whether the token has expired */
    isExpired?: boolean;

    /** Whether the token expires within 7 days */
    isExpiringSoon?: boolean;
}

/**
 * Response from GET /api/credentials/status endpoint.
 * Contains connection status for all supported platforms.
 */
export type CredentialsStatusResponse = Record<Platform, PlatformStatus>;

/**
 * Summary of connected platforms (used by DashboardContext).
 */
export type ConnectedAccountsSummary = Record<Platform, boolean>;

/**
 * Helper to create an empty status response.
 */
export function createEmptyStatus(): CredentialsStatusResponse {
    return {
        twitter: { isConnected: false },
        linkedin: { isConnected: false },
        facebook: { isConnected: false },
        instagram: { isConnected: false },
        tiktok: { isConnected: false },
        youtube: { isConnected: false },
    };
}

/**
 * Extract connected accounts summary from full status.
 */
export function extractConnectedSummary(status: CredentialsStatusResponse): ConnectedAccountsSummary {
    return {
        twitter: status.twitter?.isConnected ?? false,
        linkedin: status.linkedin?.isConnected ?? false,
        facebook: status.facebook?.isConnected ?? false,
        instagram: status.instagram?.isConnected ?? false,
        tiktok: status.tiktok?.isConnected ?? false,
        youtube: status.youtube?.isConnected ?? false,
    };
}
