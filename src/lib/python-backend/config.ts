/**
 * Python Backend Configuration
 * 
 * Centralized configuration for connecting to the Python FastAPI backend.
 * Supports environment-based configuration for development and production.
 */

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const IS_BROWSER = typeof window !== 'undefined';

// =============================================================================
// BACKEND URL CONFIGURATION WITH STRICT VALIDATION
// =============================================================================

/**
 * Validate and normalize backend URL with strict production requirements.
 * Production-grade approach:
 * - Fail fast on invalid configuration
 * - Clear error messages for debugging
 * - No silent fixes in production
 * - Explicit logging of all transformations
 */
const rawBackendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL;

export const PYTHON_BACKEND_URL = (() => {
    // 1. VALIDATION: Require backend URL in production
    if (!rawBackendUrl) {
        const error = new Error(
            '[Backend Config] CRITICAL: NEXT_PUBLIC_PYTHON_BACKEND_URL is not set.\n' +
            'This environment variable is REQUIRED.\n' +
            'Set it to your Python backend URL (e.g., https://your-backend.onrender.com)'
        );

        if (IS_PRODUCTION) {
            // Fail immediately in production
            throw error;
        } else {
            // Warn in development, use localhost fallback
            console.error(error.message);
            console.warn('[Backend Config] Falling back to http://localhost:8000 for development');
            return 'http://localhost:8000';
        }
    }

    let url = rawBackendUrl.trim();
    const originalUrl = url;

    // 2. HANDLE RENDER SERVICE NAMES
    // Transform "service-name" or "service-name:8000" to "https://service-name.onrender.com"
    if (!url.includes('://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        url = url.replace(/:\d+$/, ''); // Remove port
        if (!url.includes('.')) {
            url = `${url}.onrender.com`;
        }
        url = `https://${url}`;
        console.info(`[Backend Config] Transformed Render service name: ${originalUrl} → ${url}`);
    }
    // 3. ADD PROTOCOL IF MISSING
    else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
        url = isLocal ? `http://${url}` : `https://${url}`;
        console.info(`[Backend Config] Added protocol: ${originalUrl} → ${url}`);
    }

    // 4. PRODUCTION SECURITY: Enforce HTTPS
    if (url.startsWith('http://')) {
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

        if (!isLocal) {
            if (IS_PRODUCTION) {
                // CRITICAL: In production, HTTP for non-localhost is a security violation
                throw new Error(
                    `[Backend Config] SECURITY ERROR: HTTP protocol detected for production URL.\n` +
                    `Current URL: ${url}\n` +
                    `NEXT_PUBLIC_PYTHON_BACKEND_URL must use HTTPS in production.\n` +
                    `Update your environment variable to: ${url.replace('http://', 'https://')}`
                );
            } else {
                // Development: Auto-fix with warning
                const httpsUrl = url.replace('http://', 'https://');
                console.warn(
                    `[Backend Config] WARNING: Converting HTTP to HTTPS for development.\n` +
                    `From: ${url}\n` +
                    `To: ${httpsUrl}\n` +
                    `This auto-conversion only works in development. Fix your env var for production.`
                );
                url = httpsUrl;
            }
        }
    }

    // 5. VALIDATE FINAL URL
    try {
        const parsedUrl = new URL(url);

        // Ensure it's a valid HTTP/HTTPS URL
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
        }

        // Production: Must be HTTPS (except localhost)
        if (IS_PRODUCTION && parsedUrl.protocol === 'http:' &&
            !parsedUrl.hostname.includes('localhost') &&
            !parsedUrl.hostname.includes('127.0.0.1')) {
            throw new Error('HTTP not allowed in production for non-localhost URLs');
        }

    } catch (error) {
        throw new Error(
            `[Backend Config] Invalid backend URL: ${url}\n` +
            `Original: ${originalUrl}\n` +
            `Error: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    // 6. REMOVE TRAILING SLASH
    const finalUrl = url.replace(/\/$/, '');

    // 7. LOG FINAL CONFIGURATION
    if (IS_BROWSER) {
        console.info(
            `[Backend Config] ✓ Backend URL configured:\n` +
            `  Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}\n` +
            `  URL: ${finalUrl}\n` +
            `  Protocol: ${new URL(finalUrl).protocol}\n` +
            `  Secure: ${finalUrl.startsWith('https://') ? 'YES ✓' : 'NO (localhost only)'}`
        );
    }

    return finalUrl;
})();

// API version
export const API_VERSION = process.env.PYTHON_BACKEND_API_VERSION || 'v1';

// Base API URL with version
export const API_BASE_URL = `${PYTHON_BACKEND_URL}/api/${API_VERSION}`;

// Validate BASE URL on module load
if (IS_BROWSER && IS_PRODUCTION) {
    try {
        const baseUrl = new URL(API_BASE_URL);
        const isLocalhost = baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1';

        // Skip HTTPS check for localhost - HTTP is expected for local dev
        if (baseUrl.protocol !== 'https:' && !isLocalhost) {
            console.error(
                `[Backend Config] CRITICAL: API Base URL is not HTTPS in production!\n` +
                `This will cause mixed content errors.\n` +
                `Current: ${API_BASE_URL}`
            );
        }
    } catch (error) {
        console.error(`[Backend Config] Invalid API_BASE_URL: ${API_BASE_URL}`);
    }
}

// Request timeout in milliseconds (15 minutes for large YouTube video uploads)
export const REQUEST_TIMEOUT = 900000


// Retry configuration
export const RETRY_CONFIG = {
    /** Maximum number of retry attempts */
    maxRetries: parseInt(process.env.PYTHON_BACKEND_RETRY_ATTEMPTS || '3', 10),
    /** Base delay in milliseconds for exponential backoff */
    baseDelay: 1000,
    /** Maximum delay in milliseconds */
    maxDelay: 10000,
    /** Status codes that should trigger a retry */
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
} as const;

// Feature flags for gradual migration from legacy Next.js API routes
export const FEATURE_FLAGS = {
    /** Use Python backend for content agent */
    useContentBackend: process.env.NEXT_PUBLIC_USE_PYTHON_BACKEND_CONTENT === 'true',
    /** Use Python backend for media generation */
    useMediaBackend: process.env.NEXT_PUBLIC_USE_PYTHON_BACKEND_MEDIA === 'true',
    /** Use Python backend for social platforms */
    useSocialBackend: process.env.NEXT_PUBLIC_USE_PYTHON_BACKEND_SOCIAL === 'true',
    /** Use Python backend for storage */
    useStorageBackend: process.env.NEXT_PUBLIC_USE_PYTHON_BACKEND_STORAGE === 'true',
    /** Use Python backend for all features (master toggle) */
    useAllBackend: process.env.NEXT_PUBLIC_USE_PYTHON_BACKEND_ALL === 'true',
} as const;

// Endpoint configuration
export const ENDPOINTS = {
    // Health check
    health: '/health',
    providers: '/api/v1/providers',

    // Content Agent (single streaming endpoint)
    content: {
        chat: '/api/v1/content/strategist/chat',
    },

    // Media Generation
    media: {
        generate: '/media-generating/generate',
        improvePrompt: '/api/v1/improve/prompt',
    },

    // Comments
    comments: {
        generate: '/comments/generate',
    },

    // Media Studio
    mediaStudio: {
        base: '/media-studio',
        resizeImage: '/media-studio/resize-image',
        resizeVideo: '/media-studio/resize-video',
        mergeVideos: '/media-studio/merge-videos',
        processAudio: '/media-studio/process-audio',
        library: '/media-studio/library',
    },

    // Storage
    storage: {
        base: '/storage',
        upload: '/storage/upload',
        uploadJson: '/storage/upload/json',
        signedUrl: '/storage/signed-url',
        deleteFile: '/storage/file',
        list: '/storage/list',
    },

    // Canva
    canva: {
        auth: '/canva/auth',
        authStatus: '/canva/auth/status',
        authRefresh: '/canva/auth/refresh',
        callback: '/canva/callback',
        designs: '/canva/designs',
        export: '/canva/export',
        exportFormats: '/canva/export-formats',
        disconnect: '/canva/disconnect',
    },

    // Workspace
    workspace: {
        base: '/workspace',
        members: '/workspace/members',
        invites: '/workspace/invites',
        acceptInvite: '/workspace/invites/accept',
        inviteDetails: (token: string) => `/workspace/invites/${token}`,
        activity: '/workspace/activity',
        info: '/workspace/info',
    },

    // Posts
    posts: {
        base: '/posts',
        byId: (id: string) => `/posts/${id}`,
        info: '/posts/info/service',
    },

    // Credentials
    credentials: {
        base: '/credentials',
        status: '/credentials/status',
        platform: (platform: string) => `/credentials/${platform}`,
        disconnect: (platform: string) => `/credentials/${platform}/disconnect`,
        // Meta-specific endpoints (SDK-based)
        meta: {
            status: '/credentials/meta/status',
            capabilities: '/credentials/meta/capabilities',
            businesses: '/credentials/meta/businesses',
            switchBusiness: '/credentials/meta/switch-business',
            validateToken: '/credentials/meta/validate-token',
            refreshToken: '/credentials/meta/refresh-token',
        },
    },

    // Token Refresh
    tokens: {
        base: '/tokens',
        get: (platform: string) => `/tokens/get/${platform}`,
        refresh: (platform: string) => `/tokens/refresh/${platform}`,
        status: '/tokens/status',
        health: '/tokens/health',
        metaValidate: '/tokens/meta/validate',
    },

    // Webhooks
    webhooks: {
        base: '/webhooks',
        metaAds: '/webhooks/meta-ads',
    },

    // Auth
    auth: {
        base: '/auth',
    },

    // Social Platforms
    social: {
        facebook: {
            base: '/social/facebook',
            post: '/social/facebook/post',
            carousel: '/social/facebook/carousel',
            uploadMedia: '/social/facebook/upload-media',
            verify: '/social/facebook/verify',
        },
        instagram: {
            base: '/social/instagram',
            post: '/social/instagram/post',
            uploadMedia: '/social/instagram/upload-media',
            verify: '/social/instagram/verify',
        },
        linkedin: {
            base: '/social/linkedin',
            post: '/social/linkedin/post',
            carousel: '/social/linkedin/carousel',
            uploadMedia: '/social/linkedin/upload-media',
            verify: '/social/linkedin/verify',
        },
        twitter: {
            base: '/social/twitter',
            post: '/social/twitter/post',
            uploadMedia: '/social/twitter/upload-media',
            verify: '/social/twitter/verify',
        },
        tiktok: {
            base: '/social/tiktok',
            post: '/social/tiktok/post',
            proxyMedia: '/social/tiktok/proxy-media',
            verify: '/social/tiktok/verify',
        },
        youtube: {
            base: '/social/youtube',
            post: '/social/youtube/post',
            verify: '/social/youtube/verify',
            authRefresh: '/social/youtube/auth/refresh',
        },
    },

    // Cloudinary Media Storage
    cloudinary: {
        base: '/cloudinary',
        uploadImage: '/cloudinary/upload/image',
        uploadVideo: '/cloudinary/upload/video',
        uploadAudio: '/cloudinary/upload/audio',
        uploadUrl: '/cloudinary/upload/url',
        transform: '/cloudinary/transform',
        media: (publicId: string) => `/cloudinary/media/${publicId}`,
        presets: '/cloudinary/presets',
        presetsByType: (type: string) => `/cloudinary/presets/${type}`,
    },

    // Meta Ads
    metaAds: {
        base: '/meta-ads',
        status: '/meta-ads/status',
        authUrl: '/meta-ads/auth/url',
        campaigns: '/meta-ads/campaigns',
        campaign: (id: string) => `/meta-ads/campaigns/${id}`,
        adsets: '/meta-ads/adsets',
        adset: (id: string) => `/meta-ads/adsets/${id}`,
        ads: '/meta-ads/ads',
        ad: (id: string) => `/meta-ads/ads/${id}`,
        audiences: '/meta-ads/audiences',
        switchBusiness: '/meta-ads/switch-business',
    },

    // Rate Limits (Quota Management)
    rateLimits: {
        base: '/rate-limits',
        status: '/rate-limits/status',
        platform: (platform: string) => `/rate-limits/${platform}`,
        check: '/rate-limits/check',
        increment: '/rate-limits/increment',
        history: (workspaceId: string) => `/rate-limits/history/${workspaceId}`,
        limits: '/rate-limits/limits',
        cleanup: '/rate-limits/cleanup',
    },
} as const;


/**
 * Check if Python backend should be used for a specific feature
 */
export function shouldUsePythonBackend(feature: keyof typeof FEATURE_FLAGS): boolean {
    if (FEATURE_FLAGS.useAllBackend) {
        return true;
    }
    return FEATURE_FLAGS[feature];
}

/**
 * Get the full URL for an endpoint
 */
export function getEndpointUrl(endpoint: string): string {
    // If endpoint already starts with a slash, prepend base URL without version
    if (endpoint.startsWith('/api/')) {
        return `${PYTHON_BACKEND_URL}${endpoint}`;
    }
    return `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}
