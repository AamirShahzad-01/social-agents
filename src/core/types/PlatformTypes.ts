/**
 * PLATFORM INTEGRATION TYPES
 * Unified types for all social media platforms
 * Supports: Twitter/X, LinkedIn, Facebook, Instagram, TikTok, YouTube
 */

// ============================================================================
// PLATFORM TYPES
// ============================================================================

export type SupportedPlatform = 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'youtube'

export const PLATFORMS = {
  TWITTER: 'twitter',
  LINKEDIN: 'linkedin',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  YOUTUBE: 'youtube'
} as const

// ============================================================================
// OAUTH TYPES
// ============================================================================

export interface OAuthConfig {
  platform: SupportedPlatform
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  authorizationUrl: string
  tokenUrl: string
}

export interface OAuthCallbackData {
  code: string
  state: string
  codeVerifier?: string
}

export interface OAuthTokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: string
  scope?: string
}

export interface OAuthUserProfile {
  id: string
  username: string
  email?: string
  name?: string
  profileImageUrl?: string
  verified?: boolean
}

// ============================================================================
// PLATFORM CREDENTIALS
// ============================================================================

export interface PlatformCredentials {
  platform: SupportedPlatform
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  userId?: string
  username?: string
  email?: string
  accountName?: string
  profileImageUrl?: string
  pageId?: string // For Facebook pages
  pageName?: string
  additionalData?: Record<string, any>
}

export interface EncryptedCredentials {
  encrypted: string
  iv: string
  authTag: string
}

export interface DecryptedCredentials extends PlatformCredentials {}

// ============================================================================
// POST/CONTENT TYPES
// ============================================================================

export interface PlatformPost {
  id?: string
  content: string
  media?: PlatformMedia[]
  hashtags?: string[]
  mentions?: string[]
  url?: string
  scheduledAt?: Date
  platformSpecificData?: Record<string, any>
}

export interface PlatformMedia {
  type: 'image' | 'video' | 'gif'
  url: string
  altText?: string
  width?: number
  height?: number
  duration?: number // For videos
}

export interface PlatformPostResponse {
  postId: string
  platform: SupportedPlatform
  url?: string
  createdAt: Date
  status: 'pending' | 'posted' | 'scheduled' | 'failed'
  error?: string
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface PlatformAnalytics {
  postId: string
  platform: SupportedPlatform
  impressions: number
  engagements: number
  clicks?: number
  shares?: number
  comments?: number
  likes?: number
  reposts?: number
  replies?: number
  saves?: number
  views?: number
  engagementRate?: number
  fetched_at: Date
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface PlatformError {
  code: string
  message: string
  platform: SupportedPlatform
  statusCode?: number
  details?: Record<string, any>
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface IPlatformService {
  // Initialization
  initialize(config: OAuthConfig): void

  // OAuth
  getAuthorizationUrl(state: string, codeChallenge?: string): string
  exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse>
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse>
  getUserProfile(accessToken: string): Promise<OAuthUserProfile>

  // Posting
  postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse>
  uploadMedia(credentials: PlatformCredentials, media: PlatformMedia): Promise<string>
  schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse>

  // Content
  verifyCredentials(credentials: PlatformCredentials): Promise<boolean>
  getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics>

  // Metadata
  getPlatformName(): string
  getPlatformIcon(): string
  getMaxCharacterLimit(): number
  supportsScheduling(): boolean
  supportsMediaUpload(): boolean
}

// ============================================================================
// PLATFORM SPECIFIC CONFIGS
// ============================================================================

export const PLATFORM_CONFIGS = {
  twitter: {
    name: 'Twitter/X',
    icon: '𝕏',
    maxCharacters: 280,
    supportsScheduling: false,
    supportsMediaUpload: true,
    supportedMediaTypes: ['image', 'video', 'gif'],
    maxMediaSize: 15728640 // 15MB
  },
  linkedin: {
    name: 'LinkedIn',
    icon: 'in',
    maxCharacters: 3000,
    supportsScheduling: true,
    supportsMediaUpload: true,
    supportedMediaTypes: ['image', 'video'],
    maxMediaSize: 10485760 // 10MB
  },
  facebook: {
    name: 'Facebook',
    icon: 'f',
    maxCharacters: 63206,
    supportsScheduling: true,
    supportsMediaUpload: true,
    supportedMediaTypes: ['image', 'video'],
    maxMediaSize: 4294967296 // 4GB
  },
  instagram: {
    name: 'Instagram',
    icon: '📷',
    maxCharacters: 2200,
    supportsScheduling: true,
    supportsMediaUpload: true,
    supportedMediaTypes: ['image', 'video'],
    maxMediaSize: 100000000 // 100MB
  },
  tiktok: {
    name: 'TikTok',
    icon: '♪',
    maxCharacters: 150,
    supportsScheduling: false,
    supportsMediaUpload: true,
    supportedMediaTypes: ['video'],
    maxMediaSize: 287883247 // 287MB
  },
  youtube: {
    name: 'YouTube',
    icon: '▶',
    maxCharacters: 5000,
    supportsScheduling: true,
    supportsMediaUpload: true,
    supportedMediaTypes: ['video'],
    maxMediaSize: 137438953472 // 128GB
  }
} as const

// ============================================================================
// OAUTH SCOPE DEFINITIONS (Latest as of 2025)
// ============================================================================

export const OAUTH_SCOPES = {
  twitter: [
    'tweet.read',
    'tweet.write',
    'tweet.moderate.write',
    'users.read',
    'media.write',
    'mute.read',
    'mute.write',
    'offline.access'
  ],
  linkedin: [
    'openid',           // Required for OpenID Connect
    'profile',          // User profile info
    'email',            // User email address
    'w_member_social'   // Posting to LinkedIn (requires "Share on LinkedIn" product)
  ],
  facebook: [
    'pages_manage_posts',
    'pages_manage_metadata',
    'pages_read_engagement',
    'pages_manage_on_behalf_of',
    'instagram_basic',
    'instagram_graph_user_content',
    'instagram_manage_insights'
  ],
  instagram: [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'pages_manage_metadata'
  ],
  tiktok: [
    'video.list',
    'video.create',
    'video.publish',
    'user.info.basic',
    'comment.read',
    'analytics.read'
  ],
  youtube: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ]
} as const
