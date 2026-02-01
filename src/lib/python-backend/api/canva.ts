/**
 * Canva Integration API
 * 
 * API client for Canva design integration including OAuth,
 * design browsing, and export functionality.
 * 
 * Updated to match backend v2.0.0 with:
 * - Secure OAuth with PKCE
 * - Rate limiting
 * - Retry logic
 * - Permanent storage via Cloudinary
 */

import { get, post, del } from '../client';
import { ENDPOINTS } from '../config';
import type {
    CanvaDesign,
    CanvaExportRequest,
    CanvaExportResponse,
    CanvaAuthResponse,
    CanvaConnectionStatus,
    CanvaExportFormatsResponse,
    CanvaCreateDesignRequest,
} from '../types';

/**
 * Get Canva OAuth authorization URL
 * 
 * Initiates the Canva OAuth flow with PKCE.
 * The state and code_verifier are stored securely in the database.
 * 
 * @param userId - User ID to associate with the connection
 * @returns Promise resolving to auth URL
 */
export async function getAuthUrl(
    userId: string
): Promise<CanvaAuthResponse> {
    return get<CanvaAuthResponse>(ENDPOINTS.canva.auth, {
        params: { user_id: userId },
    });
}

/**
 * Check Canva connection status
 * 
 * Verifies whether Canva is connected and if the token is valid.
 * 
 * @param userId - User ID
 * @returns Promise resolving to connection status
 */
export async function getConnectionStatus(
    userId: string
): Promise<CanvaConnectionStatus> {
    return get<CanvaConnectionStatus>(ENDPOINTS.canva.authStatus, {
        params: { user_id: userId },
    });
}

/**
 * Proactive token refresh - Call on app startup
 * 
 * Checks if the Canva token expires within 2 hours and auto-refreshes if needed.
 * This prevents token expiration during active use.
 * 
 * @param userId - User ID
 * @param force - Force refresh regardless of expiration time
 * @returns Promise resolving to refresh result
 */
export async function refreshToken(
    userId: string,
    force: boolean = false
): Promise<{
    connected: boolean;
    refreshed: boolean;
    message: string;
    expiresAt?: string;
    hoursUntilExpiry?: number;
    needsReconnect?: boolean;
    error?: string;
}> {
    return post(ENDPOINTS.canva.authRefresh, {}, {
        params: { user_id: userId, force },
    });
}

/**
 * Auto-refresh Canva token on app startup
 * 
 * This function should be called when the app initializes.
 * It silently checks and refreshes the token if needed (within 2-hour threshold).
 * 
 * @param userId - User ID
 * @returns Promise resolving to boolean indicating if connected
 */
export async function autoRefreshOnStartup(userId: string): Promise<boolean> {
    try {
        const result = await refreshToken(userId, false);
        
        if (!result.connected) {
            console.log('[Canva] Not connected, skipping auto-refresh');
            return false;
        }
        
        if (result.refreshed) {
            console.log('[Canva] Token auto-refreshed successfully, expires at:', result.expiresAt);
        } else {
            console.log('[Canva] Token still valid, expires in', result.hoursUntilExpiry, 'hours');
        }
        
        return true;
    } catch (error) {
        // If it fails, don't break the app - just log and return false
        console.warn('[Canva] Auto-refresh failed:', error);
        return false;
    }
}

/**
 * Get Canva designs
 * 
 * Retrieves a list of designs from the connected Canva account.
 * 
 * @param userId - User ID
 * @param continuation - Pagination token for next page
 * @returns Promise resolving to array of Canva designs
 */
export async function getDesigns(
    userId: string,
    continuation?: string
): Promise<{
    items: CanvaDesign[];
    continuation?: string;
}> {
    return get(ENDPOINTS.canva.designs, {
        params: {
            user_id: userId,
            ...(continuation ? { continuation } : {}),
        },
    });
}

/**
 * Create a new Canva design
 * 
 * Creates a design from a media library asset.
 * 
 * @param userId - User ID
 * @param request - Design creation request
 * @returns Promise resolving to created design
 */
export async function createDesign(
    userId: string,
    request: CanvaCreateDesignRequest
): Promise<{
    success: boolean;
    design: CanvaDesign;
}> {
    return post(`${ENDPOINTS.canva.designs}`, request, {
        params: { user_id: userId },
    });
}

/**
 * Get available export formats for a design
 * 
 * @param userId - User ID
 * @param designId - Canva design ID
 * @returns Promise resolving to available formats
 */
export async function getExportFormats(
    userId: string,
    designId: string
): Promise<CanvaExportFormatsResponse> {
    return get<CanvaExportFormatsResponse>(ENDPOINTS.canva.exportFormats, {
        params: { user_id: userId, designId },
    });
}

/**
 * Export a Canva design
 * 
 * Exports a design in the specified format. The backend handles:
 * - Polling for export completion
 * - Downloading from Canva
 * - Uploading to Cloudinary for permanent storage
 * - Optionally saving to media library
 * 
 * @param userId - User ID
 * @param request - Export request with design ID and format
 * @returns Promise resolving to export response with permanent URLs
 */
export async function exportDesign(
    userId: string,
    request: CanvaExportRequest
): Promise<CanvaExportResponse> {
    return post<CanvaExportResponse>(ENDPOINTS.canva.export, request, {
        params: { user_id: userId },
    });
}

/**
 * Disconnect Canva account
 * 
 * Removes the Canva connection for the user.
 * 
 * @param userId - User ID
 * @returns Promise resolving when disconnection is complete
 */
export async function disconnect(
    userId: string
): Promise<{ success: boolean }> {
    return post<{ success: boolean }>(ENDPOINTS.canva.disconnect, {}, {
        params: { user_id: userId },
    });
}

/**
 * Get single design details
 * 
 * Retrieves detailed information about a specific design.
 * 
 * @param userId - User ID
 * @param designId - Canva design ID
 * @returns Promise resolving to design details
 */
export async function getDesign(
    userId: string,
    designId: string
): Promise<CanvaDesign> {
    return get<CanvaDesign>(`${ENDPOINTS.canva.designs}/${designId}`, {
        params: { user_id: userId },
    });
}

// ============================================================================
// DEPRECATED - Kept for backward compatibility
// The backend now handles polling internally
// ============================================================================

/**
 * @deprecated Use getConnectionStatus instead
 */
export async function isConnected(
    userId: string
): Promise<CanvaConnectionStatus> {
    return getConnectionStatus(userId);
}

/**
 * @deprecated Backend now handles polling - use exportDesign directly
 */
export async function exportDesignAndWait(
    userId: string,
    request: CanvaExportRequest,
    _maxAttempts: number = 30,
    _intervalMs: number = 2000
): Promise<CanvaExportResponse> {
    // Backend now handles polling internally
    return exportDesign(userId, request);
}
