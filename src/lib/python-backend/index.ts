/**
 * Python Backend API - Main Export
 * 
 * Production-ready API client library for connecting Next.js frontend
 * to the Python FastAPI backend.
 * 
 * @module python-backend
 * 
 * @example
 * ```typescript
 * import { api, checkHealth } from '@/lib/python-backend';
 * 
 * // Check backend health
 * const isHealthy = await checkHealth();
 * 
 * // Use content API
 * const response = await api.content.chatStrategist({
 *   message: "Create a LinkedIn post",
 *   threadId: "thread-123"
 * });
 * 
 * // Use social APIs
 * await api.social.facebook.postPhoto("Hello!", "https://...");
 * await api.social.instagram.postReel("Check this out!", "https://...");
 * ```
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
    PYTHON_BACKEND_URL,
    API_BASE_URL,
    API_VERSION,
    REQUEST_TIMEOUT,
    RETRY_CONFIG,
    FEATURE_FLAGS,
    ENDPOINTS,
    shouldUsePythonBackend,
    getEndpointUrl,
} from './config';

// =============================================================================
// HTTP CLIENT
// =============================================================================

export {
    backendClient,
    get,
    post,
    put,
    patch,
    del,
    uploadFile,
    streamPost,
    createEventSource,
    checkHealth,
    debugConnectivity,
    isBackendError,
    type BackendError,
} from './client';

// =============================================================================
// TYPES
// =============================================================================

export type {
    // Common types
    ApiError,
    ApiResponse,
    PaginationParams,
    PaginatedResponse,

    // Content types
    ContentBlock,
    ChatStrategistRequest,
    ChatStrategistResponse,
    StreamEvent,
    StreamEventType,

    // Media types
    MediaGenerationRequest,
    MediaGenerationResponse,
    PromptImprovementRequest,
    PromptImprovementResponse,
    CommentGenerationRequest,
    CommentGenerationResponse,

    // Media Studio types
    PlatformPreset,
    ImageResizeRequest,
    ImageResizeResponse,
    VideoResizeRequest,
    VideoResizeResponse,
    MergeConfig,
    VideoMergeRequest,
    VideoMergeResponse,
    AudioProcessRequest,
    AudioProcessResponse,
    MediaLibraryItem,
    MediaLibraryFilters,
    CreateMediaItemRequest,
    UpdateMediaItemRequest,

    // Storage types
    Base64UploadRequest,
    UploadResponse,
    SignedUrlRequest,
    SignedUrlResponse,
    FileListItem,
    FileListResponse,

    // Workspace types
    Workspace,
    UpdateWorkspaceRequest,
    WorkspaceMember,
    WorkspaceInvite,
    CreateInviteRequest,
    AcceptInviteRequest,
    InviteDetails,
    ActivityLogEntry,
    ActivityOptions,
    WorkspaceInfo,

    // Posts types
    PostContent,
    Post,
    CreatePostRequest,
    UpdatePostRequest,
    DeletePostParams,

    // Credentials types
    Platform,
    PlatformConnectionStatus,
    ConnectionStatusMap,
    PlatformCredential,
    DisconnectResponse,

    // Social platform types
    FacebookPostRequest,
    FacebookCarouselRequest,
    FacebookUploadMediaRequest,
    FacebookPostResponse,
    FacebookCarouselResponse,
    FacebookUploadResponse,
    InstagramPostRequest,
    InstagramUploadMediaRequest,
    InstagramPostResponse,
    InstagramUploadResponse,
    LinkedInPostRequest,
    LinkedInCarouselRequest,
    LinkedInUploadMediaRequest,
    LinkedInPostResponse,
    LinkedInCarouselResponse,
    LinkedInUploadResponse,
    TwitterPostRequest,
    TwitterUploadMediaRequest,
    TwitterPostResponse,
    TwitterUploadResponse,
    TikTokPostRequest,
    TikTokPostResponse,
    YouTubePostRequest,
    YouTubePostResponse,
    VerifyCredentialsResponse,
    PlatformApiInfo,

    // Canva types
    CanvaDesign,
    CanvaExportRequest,
    CanvaExportResponse,
    CanvaAuthResponse,

    // Webhooks types
    WebhookInfo,
    MetaAdsVerificationParams,

    // Auth types
    LoginRequest,
    AuthResponse,
    TokenResponse,

    // Provider types
    ProviderStatus,
    ProvidersResponse,

    // Health types
    HealthResponse,
} from './types';

// =============================================================================
// API MODULES
// =============================================================================

import * as content from './api/content';
import * as media from './api/media';
import * as storage from './api/storage';
import * as workspaceApi from './api/workspace';
import * as posts from './api/posts';
import * as credentials from './api/credentials';
import * as canva from './api/canva';
import * as webhooks from './api/webhooks';
import * as auth from './api/auth';
import * as mediaStudio from './api/mediaStudio';
import * as social from './api/social';

/**
 * Unified API object for all backend operations
 */
export const api = {
    content,
    media,
    storage,
    workspace: workspaceApi,
    posts,
    credentials,
    canva,
    webhooks,
    auth,
    mediaStudio,
    social,
} as const;

// Also export individual modules for tree-shaking
export {
    content as contentApi,
    media as mediaApi,
    storage as storageApi,
    workspaceApi,
    posts as postsApi,
    credentials as credentialsApi,
    canva as canvaApi,
    webhooks as webhooksApi,
    auth as authApi,
    mediaStudio as mediaStudioApi,
    social as socialApi,
};
