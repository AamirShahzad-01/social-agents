/**
 * Meta Credentials API
 * 
 * API client for Meta platform credentials management (SDK-based endpoints).
 * Provides access to Facebook, Instagram, and Meta Ads credential operations.
 */

import { get, post } from '../client';
import { ENDPOINTS } from '../config';

// =============================================================================
// TYPES
// =============================================================================

export interface MetaConnectionStatus {
    facebook: {
        connected: boolean;
        pageId?: string;
        pageName?: string;
        accountId?: string;
        expiresAt?: string;
        isExpired?: boolean;
        isExpiringSoon?: boolean;
    };
    instagram: {
        connected: boolean;
        igUserId?: string;
        username?: string;
        expiresAt?: string;
        isExpired?: boolean;
    };
    meta_ads: {
        connected: boolean;
        accountId?: string;
        accountName?: string;
        businessId?: string;
        expiresAt?: string;
        isExpired?: boolean;
    };
}

export interface MetaCapabilities {
    ads: {
        hasAccess: boolean;
        permissions?: string[];
        missingPermissions?: string[];
        accountId?: string;
    };
    instagram: {
        hasAccess: boolean;
        igUserId?: string;
        pageId?: string;
    };
}

export interface MetaBusiness {
    id: string;
    name: string;
    adAccounts: Array<{
        id: string;
        accountId: string;
        name: string;
        currency: string;
        timezone: string;
    }>;
}

export interface TokenValidationResult {
    success: boolean;
    isValid: boolean;
    expiresAt?: string;
    scopes?: string[];
    userId?: string;
    error?: string;
}

export interface TokenRefreshResult {
    success: boolean;
    message?: string;
    expiresAt?: string;
    expiresIn?: number;
    error?: string;
}

// =============================================================================
// META CREDENTIALS API
// =============================================================================

/**
 * Get detailed Meta connection status (SDK-based)
 */
export async function getMetaStatus(): Promise<MetaConnectionStatus> {
    return get<MetaConnectionStatus>(ENDPOINTS.credentials.meta.status);
}

/**
 * Get Meta platform capabilities (Ads, Instagram posting)
 */
export async function getMetaCapabilities(): Promise<MetaCapabilities> {
    return get<MetaCapabilities>(ENDPOINTS.credentials.meta.capabilities);
}

/**
 * Get available business portfolios and ad accounts
 */
export async function getMetaBusinesses(): Promise<{ success: boolean; businesses: MetaBusiness[] }> {
    return get(ENDPOINTS.credentials.meta.businesses);
}

/**
 * Switch to a different business portfolio/ad account
 */
export async function switchMetaBusiness(
    businessId: string,
    adAccountId?: string
): Promise<{ success: boolean; error?: string }> {
    return post(ENDPOINTS.credentials.meta.switchBusiness, {
        business_id: businessId,
        ad_account_id: adAccountId,
    });
}

/**
 * Validate current Meta access token
 */
export async function validateMetaToken(): Promise<TokenValidationResult> {
    return post<TokenValidationResult>(ENDPOINTS.credentials.meta.validateToken);
}

/**
 * Refresh Meta access token (exchange for 60-day long-lived token)
 */
export async function refreshMetaToken(): Promise<TokenRefreshResult> {
    return post<TokenRefreshResult>(ENDPOINTS.credentials.meta.refreshToken);
}

// =============================================================================
// TOKEN REFRESH API
// =============================================================================

/**
 * Get valid credentials for a platform (auto-refreshes if needed)
 */
export async function getValidCredentials(platform: string): Promise<{
    success: boolean;
    platform: string;
    was_refreshed: boolean;
    credentials?: {
        accessToken: string;
        expiresAt?: string;
        pageId?: string;
        pageName?: string;
        accountId?: string;
        igUserId?: string;
    };
    error?: string;
    needs_reconnect?: boolean;
}> {
    return get(ENDPOINTS.tokens.get(platform));
}

/**
 * Force refresh a platform token
 */
export async function forceRefreshToken(platform: string): Promise<{
    success: boolean;
    was_refreshed: boolean;
    expires_at?: string;
    error?: string;
    needs_reconnect?: boolean;
}> {
    return post(ENDPOINTS.tokens.refresh(platform));
}

/**
 * Get token status for all platforms
 */
export async function getTokenStatus(): Promise<{
    success: boolean;
    accounts: Array<{
        platform: string;
        account_id: string;
        account_name: string;
        is_connected: boolean;
        expires_at?: string;
        expires_in_hours?: number;
        is_expiring_soon: boolean;
        is_expired: boolean;
        is_meta_platform: boolean;
    }>;
    meta_details?: MetaConnectionStatus;
    summary: {
        total: number;
        connected: number;
        expired: number;
        expiring_soon: number;
        healthy: number;
    };
}> {
    return get(ENDPOINTS.tokens.status);
}

/**
 * Validate Meta tokens with SDK
 */
export async function validateMetaTokens(): Promise<{
    success: boolean;
    platform?: string;
    token_valid: boolean;
    token_info?: {
        user_id?: string;
        app_id?: string;
        scopes?: string[];
        expires_at?: string;
        type?: string;
    };
    credentials?: {
        page_id?: string;
        page_name?: string;
        account_id?: string;
        ig_user_id?: string;
    };
    error?: string;
}> {
    return get(ENDPOINTS.tokens.metaValidate);
}
