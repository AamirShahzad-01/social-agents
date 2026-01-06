/**
 * TWITTER/X SERVICE
 * Implementation of Twitter API v2 integration
 * OAuth 2.0 with PKCE for enhanced security
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
 * Twitter API v2 Implementation
 * Documentation: https://developer.twitter.com/en/docs/twitter-api/latest
 */
export class TwitterService extends BasePlatformService {
  private apiBaseUrl = 'https://api.twitter.com/2'
  private uploadApiBaseUrl = 'https://upload.twitter.com/1.1'

  constructor() {
    super('twitter', PLATFORM_CONFIGS.twitter.name, PLATFORM_CONFIGS.twitter.icon)
  }

  /**
   * Generate OAuth authorization URL with PKCE support
   */
  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge || '',
      code_challenge_method: codeChallenge ? 'S256' : 'plain'
    })

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch('https://twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: callbackData.code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          code_verifier: callbackData.codeVerifier || ''
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('Twitter', `Token exchange failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || undefined,
        expiresIn: data.expires_in || 7200,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope
      }
    } catch (error) {
      this.handleError(error, 'Token exchange')
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch('https://twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('Twitter', `Token refresh failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 7200,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope
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
      const response = await fetch(`${this.apiBaseUrl}/users/me?user.fields=username,name,profile_image_url,verified`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        }
      })

      if (!response.ok) {
        throw new ExternalAPIError('Twitter', `Failed to fetch user profile: ${response.status}`)
      }

      const data = await response.json()

      if (!data.data) {
        throw new ExternalAPIError('Twitter', 'Invalid user profile response')
      }

      return {
        id: data.data.id,
        username: data.data.username,
        name: data.data.name,
        profileImageUrl: data.data.profile_image_url,
        verified: data.data.verified
      }
    } catch (error) {
      this.handleError(error, 'Get user profile')
    }
  }

  /**
   * Post content to Twitter
   * Twitter doesn't support scheduling via API (must use native Twitter scheduler)
   */
  async postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse> {
    try {
      // Validate content length
      if (post.content.length > PLATFORM_CONFIGS.twitter.maxCharacters) {
        return this.formatErrorResponse(
          new Error(`Content exceeds ${PLATFORM_CONFIGS.twitter.maxCharacters} characters`),
          'Post content'
        )
      }

      const body: any = {
        text: post.content
      }

      // Add media if present
      if (post.media && post.media.length > 0) {
        const mediaIds = await Promise.all(
          post.media.map(media => this.uploadMedia(credentials, media))
        )

        body.media = {
          media_ids: mediaIds
        }
      }

      // Add reply settings if mentions present
      if (post.mentions && post.mentions.length > 0) {
        body.reply_settings = 'mentionedUsers'
      }

      const response = await fetch(`${this.apiBaseUrl}/tweets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const error = await response.json()
        return this.formatErrorResponse(
          new Error(error.errors?.[0]?.message || 'Failed to post content'),
          'Post content'
        )
      }

      const data = await response.json()

      return {
        postId: data.data.id,
        platform: 'twitter',
        url: `https://twitter.com/${credentials.username}/status/${data.data.id}`,
        createdAt: new Date(),
        status: 'posted'
      }
    } catch (error) {
      return this.formatErrorResponse(error, 'Post content')
    }
  }

  /**
   * Upload media to Twitter
   * Returns media ID for use in post
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
      const mediaBase64 = Buffer.from(mediaBuffer).toString('base64')

      // Validate media type
      const validTypes = ['image', 'video', 'gif']
      if (!validTypes.includes(media.type)) {
        throw new Error(`Unsupported media type: ${media.type}`)
      }

      // Validate media size (15MB max for Twitter)
      if (mediaBuffer.byteLength > PLATFORM_CONFIGS.twitter.maxMediaSize) {
        throw new Error(`Media exceeds ${PLATFORM_CONFIGS.twitter.maxMediaSize} bytes`)
      }

      // Determine media category
      let mediaCategory = 'tweet_image'
      if (media.type === 'video') mediaCategory = 'tweet_video'
      if (media.type === 'gif') mediaCategory = 'tweet_gif'

      // Initiate upload
      const initResponse = await fetch(`${this.uploadApiBaseUrl}/media/upload.json?command=INIT&total_bytes=${mediaBuffer.byteLength}&media_type=image/jpeg`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        }
      })

      if (!initResponse.ok) {
        throw new Error('Failed to initiate media upload')
      }

      const initData = await initResponse.json()
      const mediaId = initData.media_id_string

      // Append media data
      const appendResponse = await fetch(
        `${this.uploadApiBaseUrl}/media/upload.json?command=APPEND&media_id=${mediaId}&segment_index=0`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'User-Agent': 'SocialMediaOS/1.0',
            'Content-Type': 'application/octet-stream'
          },
          body: mediaBuffer
        }
      )

      if (!appendResponse.ok) {
        throw new Error('Failed to append media data')
      }

      // Finalize upload
      const finalizeResponse = await fetch(`${this.uploadApiBaseUrl}/media/upload.json?command=FINALIZE&media_id=${mediaId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        }
      })

      if (!finalizeResponse.ok) {
        throw new Error('Failed to finalize media upload')
      }

      const finalData = await finalizeResponse.json()
      return finalData.media_id_string
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('Twitter', `Media upload failed: ${message}`)
    }
  }

  /**
   * Schedule post - Not supported by Twitter API v2
   * Twitter recommends using their native scheduling or third-party tools
   */
  async schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse> {
    return {
      postId: '',
      platform: 'twitter',
      status: 'failed',
      error: 'Scheduling is not supported by Twitter API v2. Use native Twitter scheduler or post immediately.',
      createdAt: new Date()
    }
  }

  /**
   * Verify credentials by attempting to fetch user profile
   */
  async verifyCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/users/me`, {
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
   * Get post metrics from Twitter Analytics API
   */
  async getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/tweets/${postId}?tweet.fields=public_metrics,created_at`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'User-Agent': 'SocialMediaOS/1.0'
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch tweet metrics')
      }

      const data = await response.json()
      const metrics = data.data.public_metrics

      return {
        postId,
        platform: 'twitter',
        impressions: metrics.impression_count || 0,
        engagements: metrics.like_count + metrics.retweet_count + metrics.reply_count,
        likes: metrics.like_count || 0,
        reposts: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        views: metrics.impression_count || 0,
        fetched_at: new Date()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('Twitter', `Failed to fetch metrics: ${message}`)
    }
  }

  /**
   * Get platform max character limit
   */
  getMaxCharacterLimit(): number {
    return PLATFORM_CONFIGS.twitter.maxCharacters
  }

  /**
   * Check if platform supports scheduling
   */
  supportsScheduling(): boolean {
    return PLATFORM_CONFIGS.twitter.supportsScheduling
  }

  /**
   * Check if platform supports media upload
   */
  supportsMediaUpload(): boolean {
    return PLATFORM_CONFIGS.twitter.supportsMediaUpload
  }
}

/**
 * Post a tweet via backend API
 * Supports text with optional media (images/videos)
 * Twitter API v2 - 280 character limit
 */
export async function postTweet(
  credentials: any,
  options: { text: string; mediaIds?: string[] }
): Promise<{ success: boolean; tweetId?: string; url?: string; error?: string }> {
  try {
    // Use Python backend client for Twitter posting
    const { createPost } = await import('@/lib/python-backend/api/social/twitter');

    const result = await createPost({
      text: options.text,
      mediaIds: options.mediaIds,
    });

    return {
      success: result.success,
      tweetId: result.tweetId,
      url: result.tweetUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post tweet'
    };
  }
}

/**
 * Upload media to Twitter via backend API
 * Supports images (up to 5MB) and videos (up to 512MB)
 * Returns media_id for use in tweet
 */
export async function uploadTwitterMedia(
  credentials: any,
  mediaUrl: string,
  mediaType: 'image' | 'video' = 'image'
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    // Use Python backend client for Twitter media upload
    const { uploadMedia } = await import('@/lib/python-backend/api/social/twitter');

    const result = await uploadMedia({
      mediaUrl: mediaUrl,
      mediaType: mediaType,
    });

    return {
      success: result.success,
      mediaId: result.mediaId
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload media'
    };
  }
}
