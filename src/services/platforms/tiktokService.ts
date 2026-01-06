/**
 * TIKTOK SERVICE
 * Implementation of TikTok API v2 integration
 * OAuth 2.0 for content creator access
 * Latest API as of 2025
 */

import { BasePlatformService } from './BasePlatformService'
import {
  OAuthCallbackData,
  OAuthTokenResponse,
  OAuthUserProfile,
  PlatformCredentials,
  PlatformPost,
  PlatformPostResponse,
  PlatformAnalytics,
  PlatformMedia,
  PLATFORM_CONFIGS,
  OAUTH_SCOPES
} from '@/core/types/PlatformTypes'
import type { TikTokCredentials } from '@/types'
import { ExternalAPIError } from '@/core/errors/AppError'

/**
 * TikTok API v2 Implementation
 * Documentation: https://developers.tiktok.com/doc/tiktok-api
 * Note: TikTok API has strict limitations on direct video posting
 * Most operations require TikTok app integration or server-side uploads
 */
export class TikTokService extends BasePlatformService {
  private apiBaseUrl = 'https://open.tiktokapis.com/v2'

  constructor() {
    super('tiktok', PLATFORM_CONFIGS.tiktok.name, PLATFORM_CONFIGS.tiktok.icon)
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_key: this.config.clientId,
      response_type: 'code',
      scope: this.config.scopes.join(','),
      redirect_uri: this.config.redirectUri,
      state
    })

    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  }

  /**
   * Exchange authorization code for access token (v2 API)
   */
  async exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/oauth/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        },
        body: new URLSearchParams({
          client_key: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: callbackData.code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('TikTok', `Token exchange failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 7200,
        tokenType: data.token_type || 'Bearer'
      }
    } catch (error) {
      this.handleError(error, 'Token exchange')
    }
  }

  /**
   * Refresh access token using refresh token (v2 API)
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/oauth/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        },
        body: new URLSearchParams({
          client_key: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('TikTok', `Token refresh failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 7200,
        tokenType: data.token_type || 'Bearer'
      }
    } catch (error) {
      this.handleError(error, 'Token refresh')
    }
  }

  /**
   * Get authenticated user profile (v2 API)
   */
  async getUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/user/info/?fields=open_id,union_id,display_name,avatar_url`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new ExternalAPIError('TikTok', `Failed to fetch user profile: ${response.status}`)
      }

      const data = await response.json()
      const user = data.data.user

      return {
        id: user.open_id,
        username: user.display_name,
        name: user.display_name
      }
    } catch (error) {
      this.handleError(error, 'Get user profile')
    }
  }

  /**
   * Post content to TikTok
   * Note: Direct posting via API requires business account and complex upload process
   */
  async postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse> {
    try {
      if (post.content.length > PLATFORM_CONFIGS.tiktok.maxCharacters) {
        return this.formatErrorResponse(
          new Error(`Content exceeds ${PLATFORM_CONFIGS.tiktok.maxCharacters} characters`),
          'Post content'
        )
      }

      // TikTok requires video for posting
      if (!post.media || post.media.length === 0) {
        return this.formatErrorResponse(
          new Error('TikTok requires video content to post'),
          'Post content'
        )
      }

      return this.formatErrorResponse(
        new Error('Direct TikTok posting requires additional setup. Use TikTok Creator Studio instead.'),
        'Post content'
      )
    } catch (error) {
      return this.formatErrorResponse(error, 'Post content')
    }
  }

  /**
   * Upload media to TikTok
   */
  async uploadMedia(
    credentials: PlatformCredentials,
    media: PlatformMedia
  ): Promise<string> {
    try {
      // Fetch media from URL
      const mediaResponse = await fetch(media.url)
      if (!mediaResponse.ok) {
        throw new Error('Failed to fetch media from URL')
      }

      const mediaBuffer = await mediaResponse.arrayBuffer()

      // Validate media size (287MB max for TikTok)
      if (mediaBuffer.byteLength > PLATFORM_CONFIGS.tiktok.maxMediaSize) {
        throw new Error(`Media exceeds ${PLATFORM_CONFIGS.tiktok.maxMediaSize} bytes`)
      }

      return media.url
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('TikTok', `Media upload failed: ${message}`)
    }
  }

  /**
   * Schedule post - TikTok doesn't support scheduled posting via API
   */
  async schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse> {
    return {
      postId: '',
      platform: 'tiktok',
      status: 'failed',
      error: 'TikTok does not support scheduled posting via API. Use TikTok Creator Studio.',
      createdAt: new Date()
    }
  }

  /**
   * Verify credentials (v2 API)
   */
  async verifyCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/user/info/?fields=open_id`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`
        }
      })

      return response.ok && response.status === 200
    } catch (error) {
      return false
    }
  }

  /**
   * Get post metrics from TikTok Analytics
   */
  async getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/video/query/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: JSON.stringify({
          filters: {
            video_ids: [postId]
          },
          fields: ['like_count', 'comment_count', 'share_count', 'view_count']
        })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch video metrics')
      }

      const data = await response.json()
      const video = data.data.videos[0]

      return {
        postId,
        platform: 'tiktok',
        impressions: video.view_count || 0,
        views: video.view_count || 0,
        likes: video.like_count || 0,
        comments: video.comment_count || 0,
        shares: video.share_count || 0,
        engagements:
          (video.like_count || 0) + (video.comment_count || 0) + (video.share_count || 0),
        fetched_at: new Date()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('TikTok', `Failed to fetch metrics: ${message}`)
    }
  }

  /**
   * Get platform max character limit
   */
  getMaxCharacterLimit(): number {
    return PLATFORM_CONFIGS.tiktok.maxCharacters
  }

  /**
   * Check if platform supports scheduling
   */
  supportsScheduling(): boolean {
    return PLATFORM_CONFIGS.tiktok.supportsScheduling
  }

  /**
   * Check if platform supports media upload
   */
  supportsMediaUpload(): boolean {
    return PLATFORM_CONFIGS.tiktok.supportsMediaUpload
  }
}

/**
 * Upload video to storage (returns public URL)
 * Backend endpoint: /api/tiktok/upload-media
 * Returns public URL for use in TikTok API
 */
export async function uploadTikTokVideo(
  credentials: TikTokCredentials,
  videoData: string  // base64 or public URL
): Promise<{ success: boolean; videoUrl?: string; videoSize?: number; error?: string }> {
  try {
    // If it's already a public URL, return it directly
    if (videoData.startsWith('http')) {
      return {
        success: true,
        videoUrl: videoData,
        videoSize: 0
      };
    }

    // Use Python backend client for TikTok media upload
    const { uploadMedia } = await import('@/lib/python-backend/api/social/tiktok');

    const result = await uploadMedia({ videoData });

    return {
      success: result.success,
      videoUrl: result.videoUrl,
      videoSize: result.videoSize || 0
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

/**
 * Get TikTok account info via backend API
 */
export async function getTikTokAccountInfo(
  credentials: TikTokCredentials
): Promise<{ success: boolean; accountInfo?: any; error?: string }> {
  try {
    if (!credentials.isConnected) {
      return { success: false, error: 'TikTok account not connected' };
    }

    // Use Python backend client for TikTok verification
    const { verifyCredentials } = await import('@/lib/python-backend/api/social/tiktok');

    const result = await verifyCredentials();

    return {
      success: result.success,
      accountInfo: {
        username: result.username,
        displayName: result.displayName,
        avatarUrl: result.avatarUrl,
        connectedAt: result.connectedAt
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch account info'
    };
  }
}

/**
 * Post to TikTok via backend API
 * TikTok Content Posting API
 * Supports video posts with caption (2200 char limit)
 */
export async function postToTikTok(
  credentials: any,
  options: { caption: string; videoUrl: string; videoSize: number }
): Promise<{ success: boolean; videoId?: string; url?: string; error?: string }> {
  try {
    // Use Python backend client for TikTok posting
    const { createPost } = await import('@/lib/python-backend/api/social/tiktok');

    const result = await createPost({
      caption: options.caption,
      videoUrl: options.videoUrl,
      videoSize: options.videoSize,
    });

    return {
      success: result.success,
      videoId: result.data?.videoId,
      url: result.data?.shareUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post to TikTok'
    };
  }
}
