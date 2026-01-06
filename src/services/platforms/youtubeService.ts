/**
 * YOUTUBE SERVICE
 * Implementation of YouTube Data API v3 integration
 * Google OAuth 2.0 with long-lived refresh token support
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
import { ExternalAPIError } from '@/core/errors/AppError'

/**
 * YouTube Data API v3 Implementation
 * Documentation: https://developers.google.com/youtube/v3
 * Refresh tokens: https://developers.google.com/identity/protocols/oauth2
 */
export class YouTubeService extends BasePlatformService {
  private apiBaseUrl = 'https://www.googleapis.com/youtube/v3'

  constructor() {
    super('youtube', PLATFORM_CONFIGS.youtube.name, PLATFORM_CONFIGS.youtube.icon)
  }

  /**
   * Generate OAuth authorization URL
   * Includes access_type=offline to get refresh token
   */
  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      access_type: 'offline', // Critical for getting refresh token
      prompt: 'consent' // Force consent screen to get new refresh token
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * Google provides refresh tokens that can last indefinitely
   */
  async exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: new URLSearchParams({
          code: callbackData.code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('YouTube', `Token exchange failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
        tokenType: data.token_type || 'Bearer'
      }
    } catch (error) {
      this.handleError(error, 'Token exchange')
    }
  }

  /**
   * Refresh access token using refresh token
   * Refresh tokens don't expire (unless revoked)
   * Keep refresh token unchanged for future use
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('YouTube', `Token refresh failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: refreshToken, // Keep original refresh token
        expiresIn: data.expires_in || 3600,
        tokenType: data.token_type || 'Bearer'
      }
    } catch (error) {
      this.handleError(error, 'Token refresh')
    }
  }

  /**
   * Get authenticated user profile
   */
  async getUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!response.ok) {
        throw new ExternalAPIError('YouTube', `Failed to fetch user profile: ${response.status}`)
      }

      const data = await response.json()

      return {
        id: data.id,
        email: data.email,
        name: data.name,
        username: data.email?.split('@')[0],
        profileImageUrl: data.picture
      }
    } catch (error) {
      this.handleError(error, 'Get user profile')
    }
  }

  /**
   * Post video to YouTube (upload and publish)
   */
  async postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse> {
    try {
      if (post.content.length > PLATFORM_CONFIGS.youtube.maxCharacters) {
        return this.formatErrorResponse(
          new Error(`Description exceeds ${PLATFORM_CONFIGS.youtube.maxCharacters} characters`),
          'Post content'
        )
      }

      // YouTube requires video for posting
      if (!post.media || post.media.length === 0) {
        return this.formatErrorResponse(
          new Error('YouTube requires video content to post'),
          'Post content'
        )
      }

      // For now, return not implemented
      // Full implementation requires chunked upload handling
      return this.formatErrorResponse(
        new Error('Video upload requires backend implementation with resumable upload support'),
        'Post content'
      )
    } catch (error) {
      return this.formatErrorResponse(error, 'Post content')
    }
  }

  /**
   * Upload media to YouTube
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

      // Validate media size (128GB max for YouTube)
      if (mediaBuffer.byteLength > PLATFORM_CONFIGS.youtube.maxMediaSize) {
        throw new Error(`Media exceeds ${PLATFORM_CONFIGS.youtube.maxMediaSize} bytes`)
      }

      // Return placeholder - actual upload requires resumable upload
      return `youtube_${Date.now()}`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('YouTube', `Media upload failed: ${message}`)
    }
  }

  /**
   * Schedule video for publishing
   */
  async schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse> {
    try {
      if (!post.media || post.media.length === 0) {
        return this.formatErrorResponse(
          new Error('YouTube requires video content'),
          'Schedule post'
        )
      }

      // For now, return not implemented
      return this.formatErrorResponse(
        new Error('Scheduled publishing requires backend implementation'),
        'Schedule post'
      )
    } catch (error) {
      return this.formatErrorResponse(error, 'Schedule post')
    }
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/channels?part=id&mine=true`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        }
      })

      return response.ok && response.status === 200
    } catch (error) {
      return false
    }
  }

  /**
   * Get video metrics from YouTube Analytics
   */
  async getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/videos?part=statistics&id=${postId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'User-Agent': 'SocialMediaOS/1.0'
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch video metrics')
      }

      const data = await response.json()
      const stats = data.items[0]?.statistics || {}

      return {
        postId,
        platform: 'youtube',
        impressions: parseInt(stats.viewCount || '0'),
        views: parseInt(stats.viewCount || '0'),
        likes: parseInt(stats.likeCount || '0'),
        comments: parseInt(stats.commentCount || '0'),
        engagements:
          parseInt(stats.likeCount || '0') +
          parseInt(stats.commentCount || '0') +
          parseInt(stats.favoriteCount || '0'),
        fetched_at: new Date()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('YouTube', `Failed to fetch metrics: ${message}`)
    }
  }

  /**
   * Get platform max character limit
   */
  getMaxCharacterLimit(): number {
    return PLATFORM_CONFIGS.youtube.maxCharacters
  }

  /**
   * Check if platform supports scheduling
   */
  supportsScheduling(): boolean {
    return PLATFORM_CONFIGS.youtube.supportsScheduling
  }

  /**
   * Check if platform supports media upload
   */
  supportsMediaUpload(): boolean {
    return PLATFORM_CONFIGS.youtube.supportsMediaUpload
  }
}

/**
 * Upload to YouTube via backend API
 * YouTube Data API v3
 * Supports video upload with title (100 chars), description (5000 chars), tags
 * Privacy: public, private, unlisted
 * For Shorts: Add #Shorts to title and description for YouTube to recognize as Short
 */
export async function uploadToYouTube(
  credentials: any,
  options: { title: string; description: string; videoUrl: string; privacyStatus: string; tags?: string[]; isShort?: boolean; thumbnailUrl?: string }
): Promise<{ success: boolean; videoId?: string; url?: string; error?: string; thumbnailWarning?: string }> {
  try {
    // For YouTube Shorts, add #Shorts hashtag to title and description
    // YouTube recognizes Shorts by: vertical video (9:16), under 60 seconds, and #Shorts in title/description
    let title = options.title;
    let description = options.description;
    let tags = options.tags || [];

    if (options.isShort) {
      // Add #Shorts to title if not already present (keep within 100 char limit)
      if (!title.includes('#Shorts') && !title.includes('#shorts')) {
        const shortsTag = ' #Shorts';
        if (title.length + shortsTag.length <= 100) {
          title = title + shortsTag;
        } else {
          // Truncate title to make room for #Shorts
          title = title.substring(0, 100 - shortsTag.length) + shortsTag;
        }
      }

      // Add #Shorts to description if not already present
      if (!description.includes('#Shorts') && !description.includes('#shorts')) {
        description = description + '\n\n#Shorts';
      }

      // Add 'Shorts' to tags if not present
      if (!tags.some(tag => tag.toLowerCase() === 'shorts')) {
        tags = ['Shorts', ...tags];
      }
    }

    // Use Python backend client for YouTube posting
    const { createPost } = await import('@/lib/python-backend/api/social/youtube');

    const result = await createPost({
      title: title,
      description: description,
      videoUrl: options.videoUrl,
      privacyStatus: options.privacyStatus as 'public' | 'private' | 'unlisted',
      tags: tags,
      thumbnailUrl: options.thumbnailUrl,  // Pass thumbnail URL to backend
    });

    return {
      success: result.success,
      videoId: result.data?.videoId,
      url: result.data?.videoUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload to YouTube'
    };
  }
}
