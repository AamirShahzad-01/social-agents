/**
 * Python Backend Configuration
 * 
 * Centralized configuration for connecting to the Python FastAPI backend.
 * Supports environment-based configuration for development and production.
 */

// Environment-based backend URL configuration
// Normalize URL to handle various formats including Render's internal service URLs
const rawBackendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:8000';
export const PYTHON_BACKEND_URL = (() => {
    let url = rawBackendUrl.trim();

    // Handle Render's internal hostport format: "service-name:8000"
    // Transform to external URL: "https://service-name.onrender.com"
    if (!url.includes('://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        // Remove port if present (e.g., ":8000")
        url = url.replace(/:\d+$/, '');
        // Add .onrender.com if not already a full domain
        if (!url.includes('.')) {
            url = `${url}.onrender.com`;
        }
        // Add https:// for production
        url = `https://${url}`;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Local development URL without protocol
        url = url.includes('localhost') || url.includes('127.0.0.1')
            ? `http://${url}`
            : `https://${url}`;
    }

    // Remove trailing slash if present
    return url.replace(/\/$/, '');
})();

// API version
export const API_VERSION = process.env.PYTHON_BACKEND_API_VERSION || 'v1';

// Base API URL with version
export const API_BASE_URL = `${PYTHON_BACKEND_URL}/api/${API_VERSION}`;

// Request timeout in milliseconds
export const REQUEST_TIMEOUT =
    parseInt(process.env.PYTHON_BACKEND_TIMEOUT || '30000', 10);

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

    // Content Agent
    content: {
        chat: '/content/strategist/chat',
        chatStream: '/content/strategist/chat-stream',
        history: (threadId: string) => `/content/strategist/history/${threadId}`,
    },

    // Media Generation
    media: {
        generate: '/media-generating/generate',
        improvePrompt: '/improve-media-prompts/improve',
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
        callback: '/canva/callback',
        designs: '/canva/designs',
        export: '/canva/export',
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
        businessSettings: '/workspace/business-settings',
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
        },
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
