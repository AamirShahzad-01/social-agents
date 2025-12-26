/**
 * Python Backend Type Definitions
 * 
 * Complete TypeScript type definitions for all Python backend API
 * requests and responses. Matches Pydantic schemas on the backend.
 */

// =============================================================================
// COMMON TYPES
// =============================================================================

/** Standard API error response */
export interface ApiError {
    error: string;
    message: string;
    code?: string;
    type?: string;
}

/** Standard success response wrapper */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

/** Pagination parameters */
export interface PaginationParams {
    limit?: number;
    offset?: number;
}

/** Pagination response */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

// =============================================================================
// CONTENT AGENT TYPES
// =============================================================================

/** Multimodal content block for LangChain */
export interface ContentBlock {
    type: 'text' | 'image' | 'file';
    mimeType?: string;
    data?: string;  // Base64 encoded
    text?: string;
    metadata?: {
        name?: string;
        filename?: string;
    };
}

/** Request to chat with content strategist */
export interface ChatStrategistRequest {
    message: string;
    threadId: string;
    modelId?: string;
    contentBlocks?: ContentBlock[];
}

/** Response from content strategist chat */
export interface ChatStrategistResponse {
    response: string;
    threadId: string;
    contentGenerated: boolean;
    readyToGenerate: boolean;
    isGeneratingMedia: boolean;
}

/** SSE event types for streaming */
export type StreamEventType = 'update' | 'done' | 'error';

/** SSE event data */
export interface StreamEvent {
    type: StreamEventType;
    step?: string;
    content?: string;
    response?: string;
    message?: string;
}

// =============================================================================
// MEDIA GENERATION TYPES
// =============================================================================

/** Media generation request */
export interface MediaGenerationRequest {
    prompt: string;
    type: 'image' | 'video' | 'audio';
    model?: string;
    options?: Record<string, unknown>;
}

/** Media generation response */
export interface MediaGenerationResponse {
    success: boolean;
    url?: string;
    status?: string;
    operationId?: string;
    error?: string;
}

/** Prompt improvement request */
export interface PromptImprovementRequest {
    originalPrompt: string;
    mediaType: 'image' | 'video' | 'audio';
    style?: string;
}

/** Prompt improvement response */
export interface PromptImprovementResponse {
    success: boolean;
    improvedPrompt: string;
    suggestions?: string[];
}

// =============================================================================
// COMMENTS TYPES
// =============================================================================

/** Comment generation request */
export interface CommentGenerationRequest {
    postContent: string;
    platform: string;
    tone?: string;
    count?: number;
}

/** Comment generation response */
export interface CommentGenerationResponse {
    success: boolean;
    comments: string[];
}

// =============================================================================
// MEDIA STUDIO TYPES
// =============================================================================

/** Platform preset dimensions */
export interface PlatformPreset {
    name: string;
    width: number;
    height: number;
    aspectRatio?: string;
}

/** Image resize request */
export interface ImageResizeRequest {
    workspaceId: string;
    imageUrl: string;
    platform?: string;
    customWidth?: number;
    customHeight?: number;
}

/** Image resize response */
export interface ImageResizeResponse {
    success: boolean;
    url: string;
    platform: string;
    dimensions: { width: number; height: number };
    format: string;
    file_size: number;
    mediaItem?: MediaLibraryItem;
}

/** Video resize request */
export interface VideoResizeRequest {
    workspaceId: string;
    videoUrl: string;
    platform?: string;
    customWidth?: number;
    customHeight?: number;
}

/** Video resize response */
export interface VideoResizeResponse {
    success: boolean;
    url: string;
    platform: string;
    dimensions: { width: number; height: number };
    duration: number;
    mediaItem?: MediaLibraryItem;
}

/** Video merge configuration */
export interface MergeConfig {
    resolution?: 'original' | '720p' | '1080p';
    quality?: 'draft' | 'high';
}

/** Video merge request */
export interface VideoMergeRequest {
    workspaceId: string;
    videoUrls: string[];
    title?: string;
    config?: MergeConfig;
}

/** Video merge response */
export interface VideoMergeResponse {
    success: boolean;
    url: string;
    clipCount: number;
    totalDuration: number;
    isVertical: boolean;
    mediaItem?: MediaLibraryItem;
}

/** Audio processing request */
export interface AudioProcessRequest {
    workspaceId: string;
    videoUrl: string;
    muteOriginal?: boolean;
    backgroundMusicUrl?: string;
    backgroundMusicName?: string;
    originalVolume?: number;
    musicVolume?: number;
}

/** Audio processing response */
export interface AudioProcessResponse {
    success: boolean;
    url: string;
    mediaItem?: MediaLibraryItem;
}

/** Media library item */
export interface MediaLibraryItem {
    id?: string;
    type: 'image' | 'video' | 'audio';
    source: 'generated' | 'uploaded' | 'edited';
    url: string;
    prompt?: string;
    model?: string;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    tags?: string[];
    is_favorite?: boolean;
    folder?: string;
    workspace_id?: string;
    created_at?: string;
    updated_at?: string;
}

/** Media library filters */
export interface MediaLibraryFilters {
    type?: string;
    source?: string;
    is_favorite?: boolean;
    folder?: string;
    search?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
}

/** Create media item request */
export interface CreateMediaItemRequest {
    workspaceId: string;
    mediaItem: Partial<MediaLibraryItem>;
}

/** Update media item request */
export interface UpdateMediaItemRequest {
    workspaceId: string;
    mediaId: string;
    updates: Partial<MediaLibraryItem>;
}

// =============================================================================
// STORAGE TYPES
// =============================================================================

/** Base64 upload request */
export interface Base64UploadRequest {
    base64Data: string;
    fileName: string;
    folder?: string;
    type?: string;
}

/** File upload response */
export interface UploadResponse {
    url: string;
    path: string;
    message: string;
}

/** Signed URL request */
export interface SignedUrlRequest {
    fileName: string;
    contentType?: string;
    folder?: string;
}

/** Signed URL response */
export interface SignedUrlResponse {
    signedUrl: string;
    token: string;
    path: string;
    publicUrl: string;
}

/** File list item */
export interface FileListItem {
    name: string;
    id: string;
    updated_at?: string;
    created_at?: string;
    metadata?: Record<string, unknown>;
}

/** File list response */
export interface FileListResponse {
    files: FileListItem[];
    folder: string;
}

// =============================================================================
// WORKSPACE TYPES
// =============================================================================

/** Workspace data */
export interface Workspace {
    id: string;
    name: string;
    owner_id: string;
    created_at?: string;
    updated_at?: string;
    description?: string | null;
    max_users?: number;
    settings?: Record<string, unknown>;
}

/** Update workspace request (mirrors FastAPI UpdateWorkspaceRequest) */
export interface UpdateWorkspaceRequest {
    name?: string;
    description?: string | null;
    /** backend expects camelCase maxMembers */
    maxMembers?: number;
    settings?: Record<string, unknown>;
}

/** Workspace member (matches /workspace/members response) */
export interface WorkspaceMember {
    id: string; // user id
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    role: 'admin' | 'editor' | 'viewer';
    created_at: string;
    workspace_id: string;
}

/** Workspace invitation */
export interface WorkspaceInvite {
    id: string;
    workspace_id: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
    token: string;
    expires_at: string;
    created_at?: string;
    accepted_at?: string;
}

/** Create invitation request */
export interface CreateInviteRequest {
    email?: string;
    role: 'admin' | 'editor' | 'viewer';
    /** default 7 days */
    expiresInDays?: number;
}

/** Accept invitation request */
export interface AcceptInviteRequest {
    token: string;
}

/** Invitation details */
export interface InviteDetails {
    id?: string;
    role: string;
    email: string | null;
    expires_at?: string | null;
    workspace_id: string;
    workspace_name?: string;
    status?: string;
}

export interface InviteDetailsResponse {
    data: InviteDetails;
    isValid: boolean;
}

/** Activity log entry */
export interface ActivityLogEntry {
    id: string;
    workspace_id: string;
    user_id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    details?: Record<string, unknown>;
    created_at: string;
    user_email?: string;
    user_name?: string;
}

/** Activity options (filters) */
export interface ActivityOptions {
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}

/** Paginated activity log */
export interface PaginatedActivityLog {
    data: ActivityLogEntry[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}


/** Workspace info */
export interface WorkspaceInfo {
    workspace: Workspace;
    members: WorkspaceMember[];
    member_count: number;
    role: string;
}


// =============================================================================
// POSTS TYPES
// =============================================================================

/** Post content stored as JSONB */
export interface PostContent {
    generatedImage?: string;
    carouselImages?: string[];
    generatedVideoUrl?: string;
    isGeneratingImage?: boolean;
    isGeneratingVideo?: boolean;
    videoGenerationStatus?: string;
    videoOperation?: string;
    platformTemplates?: Record<string, string>;
    imageMetadata?: Record<string, unknown>;
    generatedImageTimestamp?: string;
    imageGenerationProgress?: number;
}

/** Post data */
export interface Post {
    id: string;
    topic: string;
    platforms: string[];
    content?: PostContent;
    postType: 'post' | 'carousel' | 'reel' | 'story' | 'video';
    status: 'draft' | 'scheduled' | 'published' | 'archived';
    createdAt?: string;
    scheduledAt?: string;
    publishedAt?: string;
    engagementScore?: number;
    engagementSuggestions?: string[];
    // Flattened content fields for convenience
    generatedImage?: string;
    carouselImages?: string[];
    generatedVideoUrl?: string;
    isGeneratingImage?: boolean;
    isGeneratingVideo?: boolean;
    videoGenerationStatus?: string;
    videoOperation?: string;
    platformTemplates?: Record<string, string>;
    imageMetadata?: Record<string, unknown>;
    generatedImageTimestamp?: string;
    imageGenerationProgress?: number;
}

/** Create post request */
export interface CreatePostRequest {
    workspaceId: string;
    post: {
        id?: string;
        topic: string;
        platforms: string[];
        content?: PostContent;
        postType?: string;
        status?: string;
        scheduledAt?: string;
        publishedAt?: string;
        generatedImage?: string;
        carouselImages?: string[];
        generatedVideoUrl?: string;
        isGeneratingImage?: boolean;
        isGeneratingVideo?: boolean;
        videoGenerationStatus?: string;
        videoOperation?: string;
        platformTemplates?: Record<string, string>;
        imageMetadata?: Record<string, unknown>;
        generatedImageTimestamp?: string;
        imageGenerationProgress?: number;
    };
}

/** Update post request */
export interface UpdatePostRequest extends CreatePostRequest { }

/** Delete post params */
export interface DeletePostParams {
    workspace_id: string;
}

// =============================================================================
// CREDENTIALS TYPES
// =============================================================================

/** Supported social platforms */
export type Platform = 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'youtube';

/** Platform connection status */
export interface PlatformConnectionStatus {
    connected: boolean;
    accountId?: string;
    accountName?: string;
    connectedAt?: string;
    expiresAt?: string;
}

/** All platforms status */
export type ConnectionStatusMap = Record<Platform, PlatformConnectionStatus>;

/** Platform credential details */
export interface PlatformCredential {
    connected: boolean;
    platform: Platform;
    accountId?: string;
    accountName?: string;
    accountType?: string;
    connectedAt?: string;
    expiresAt?: string;
    scopes?: string[];
}

/** Disconnect response */
export interface DisconnectResponse {
    success: boolean;
    message: string;
}

// =============================================================================
// SOCIAL PLATFORM TYPES
// =============================================================================

// Facebook
export interface FacebookPostRequest {
    message: string;
    imageUrl?: string;
    link?: string;
    mediaType?: 'image' | 'video';
    postType?: 'post' | 'reel' | 'story';
    workspaceId?: string;
    userId?: string;
    scheduledPublish?: boolean;
}

export interface FacebookCarouselRequest {
    message: string;
    imageUrls: string[];
}

export interface FacebookUploadMediaRequest {
    mediaData: string;
}

export interface FacebookPostResponse {
    success: boolean;
    postId: string;
    postUrl: string;
    message: string;
    postType: string;
}

export interface FacebookCarouselResponse {
    success: boolean;
    postId: string;
    postUrl: string;
    imageCount: number;
}

export interface FacebookUploadResponse {
    success: boolean;
    imageUrl: string;
    fileName: string;
}

// Instagram
export interface InstagramPostRequest {
    caption: string;
    imageUrl?: string;
    videoUrl?: string;
    mediaType: 'image' | 'video' | 'carousel' | 'reel' | 'story';
    carouselImages?: string[];
    coverUrl?: string;
    shareToFeed?: boolean;
    workspaceId?: string;
    userId?: string;
    scheduledPublish?: boolean;
}

export interface InstagramUploadMediaRequest {
    mediaData: string;
}

export interface InstagramPostResponse {
    success: boolean;
    postId: string;
    postUrl: string;
    mediaType: string;
}

export interface InstagramUploadResponse {
    success: boolean;
    imageUrl: string;
    fileName: string;
}

// LinkedIn
export interface LinkedInPostRequest {
    text: string;
    imageUrl?: string;
    videoUrl?: string;
    mediaType?: 'image' | 'video';
    visibility?: 'PUBLIC' | 'CONNECTIONS';
    workspaceId?: string;
    userId?: string;
    scheduledPublish?: boolean;
}

export interface LinkedInCarouselRequest {
    text: string;
    imageUrls: string[];
    visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export interface LinkedInUploadMediaRequest {
    mediaData: string;
    mediaType: 'image' | 'video';
}

export interface LinkedInPostResponse {
    success: boolean;
    postId: string;
    postUrl: string;
}

export interface LinkedInCarouselResponse {
    success: boolean;
    postId: string;
    postUrl: string;
    imageCount: number;
}

export interface LinkedInUploadResponse {
    success: boolean;
    assetUrn: string;
}

// Twitter
export interface TwitterPostRequest {
    text: string;
    mediaIds?: string[];
    workspaceId?: string;
    userId?: string;
    scheduledPublish?: boolean;
}

export interface TwitterUploadMediaRequest {
    mediaData: string;
    mediaType: 'image' | 'video' | 'gif';
}

export interface TwitterPostResponse {
    success: boolean;
    tweetId: string;
    tweetUrl: string;
}

export interface TwitterUploadResponse {
    success: boolean;
    mediaId: string;
}

// TikTok
export interface TikTokPostRequest {
    caption: string;
    videoUrl: string;
    coverUrl?: string;
    workspaceId?: string;
    userId?: string;
    scheduledPublish?: boolean;
}

export interface TikTokPostResponse {
    success: boolean;
    publishId: string;
    status: string;
}

// YouTube
export interface YouTubePostRequest {
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    tags?: string[];
    categoryId?: string;
    workspaceId?: string;
    userId?: string;
    scheduledPublish?: boolean;
}

export interface YouTubePostResponse {
    success: boolean;
    videoId: string;
    videoUrl: string;
}

// Verify response (common for all platforms)
export interface VerifyCredentialsResponse {
    success: boolean;
    connected: boolean;
    pageId?: string;
    pageName?: string;
    accountId?: string;
    accountName?: string;
    expiresAt?: string;
    error?: string;
}

// Platform info (common structure)
export interface PlatformApiInfo {
    success: boolean;
    message: string;
    version: string;
    endpoints: Record<string, string>;
    supportedPostTypes?: string[];
}

// =============================================================================
// CANVA TYPES
// =============================================================================

/** Canva design */
export interface CanvaDesign {
    id: string;
    title: string;
    thumbnail_url?: string;
    created_at?: string;
    updated_at?: string;
    urls?: {
        edit_url?: string;
        view_url?: string;
    };
}

/** Canva export request */
export interface CanvaExportRequest {
    designId: string;
    format?: 'png' | 'jpg' | 'pdf' | 'mp4';
    pages?: number[];
}

/** Canva export response */
export interface CanvaExportResponse {
    success: boolean;
    url?: string;
    jobId?: string;
    status?: string;
    error?: string;
}

/** Canva auth URL response */
export interface CanvaAuthResponse {
    url: string;
}

// =============================================================================
// WEBHOOKS TYPES
// =============================================================================

/** Webhook info */
export interface WebhookInfo {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    created_at?: string;
}

/** Meta Ads webhook verification params */
export interface MetaAdsVerificationParams {
    'hub.mode': string;
    'hub.verify_token': string;
    'hub.challenge': string;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

/** Login request */
export interface LoginRequest {
    email: string;
    password: string;
}

/** Auth response */
export interface AuthResponse {
    success: boolean;
    user?: {
        id: string;
        email: string;
        workspaceId?: string;
        role?: string;
    };
    token?: string;
    error?: string;
}

/** Token response */
export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/** Provider status */
export interface ProviderStatus {
    configured: boolean;
    models: string[];
}

/** Providers response */
export interface ProvidersResponse {
    providers: {
        openai: ProviderStatus;
        anthropic: ProviderStatus;
        'google-genai': ProviderStatus;
        groq: ProviderStatus;
    };
    default_model: string;
}

// =============================================================================
// HEALTH TYPES
// =============================================================================

/** Health check response */
export interface HealthResponse {
    status: 'healthy' | 'unhealthy';
    service: string;
    llm_factory: string;
    environment: 'debug' | 'production';
}
