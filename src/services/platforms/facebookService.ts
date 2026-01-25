/**
 * FACEBOOK SERVICE
 * Implementation of Facebook Graph API v18 integration
 * OAuth 2.0 with long-lived token support (up to 60 days)
 * Latest API as of 2025
 */

import { BasePlatformService } from './BasePlatformService'
import { createHmac } from 'crypto'
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
 * Facebook Graph API v18 Implementation
 * Documentation: https://developers.facebook.com/docs/graph-api
 * Long-lived tokens: https://developers.facebook.com/docs/facebook-login/access-tokens/long-lived
 */
export class FacebookService extends BasePlatformService {
  private apiBaseUrl = 'https://graph.facebook.com/v24.0'

  private getAppSecretProof(accessToken: string): string {
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET || ''
    if (!appSecret) return ''
    return createHmac('sha256', appSecret).update(accessToken).digest('hex')
  }

  constructor() {
    super('facebook', PLATFORM_CONFIGS.facebook.name, PLATFORM_CONFIGS.facebook.icon)
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(','),
      state,
      response_type: 'code'
    })

    return `https://www.facebook.com/v24.0/dialog/oauth?${params.toString()}`
  }

  /**
   * Exchange authorization code for long-lived access token
   * Facebook provides short-lived tokens by default (1 hour)
   * We must exchange for long-lived token (up to 60 days)
   */
  async exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse> {
    try {
      // Step 1: Get short-lived token
      const shortLivedResponse = await fetch(
        `${this.apiBaseUrl}/oauth/access_token`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code: callbackData.code
      })

      const shortLivedUrl = `${this.apiBaseUrl}/oauth/access_token?${params.toString()}`
      const shortLivedFetch = await fetch(shortLivedUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'SocialMediaOS/1.0' }
      })

      if (!shortLivedFetch.ok) {
        throw new Error('Failed to get short-lived token')
      }

      const shortLivedData = await shortLivedFetch.json()

      // Step 2: Exchange for long-lived token
      const longLivedParams = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        fb_exchange_token: shortLivedData.access_token
      })

      const longLivedResponse = await fetch(
        `${this.apiBaseUrl}/oauth/access_token?${longLivedParams.toString()}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!longLivedResponse.ok) {
        throw new Error('Failed to extend token to long-lived')
      }

      const longLivedData = await longLivedResponse.json()

      return {
        accessToken: longLivedData.access_token,
        refreshToken: undefined,
        expiresIn: longLivedData.expires_in || 5184000, // 60 days
        tokenType: 'Bearer'
      }
    } catch (error) {
      this.handleError(error, 'Token exchange')
    }
  }

  /**
   * Refresh long-lived token
   * Facebook tokens expire every 60 days and must be refreshed
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const params = new URLSearchParams({
        grant_type: 'fb_extend_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        fb_exchange_token: refreshToken
      })

      const response = await fetch(
        `${this.apiBaseUrl}/oauth/access_token?${params.toString()}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to refresh token')
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: data.access_token, // Use new token as refresh token
        expiresIn: data.expires_in || 5184000, // 60 days
        tokenType: 'Bearer'
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
      const appsecretProof = this.getAppSecretProof(accessToken)
      const proofParam = appsecretProof ? `&appsecret_proof=${appsecretProof}` : ''
      const response = await fetch(
        `${this.apiBaseUrl}/me?fields=id,name,email,picture&access_token=${accessToken}${proofParam}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!response.ok) {
        throw new ExternalAPIError('Facebook', `Failed to fetch user profile: ${response.status}`)
      }

      const data = await response.json()

      return {
        id: data.id,
        username: data.name || data.id,
        name: data.name,
        email: data.email,
        profileImageUrl: data.picture?.data?.url
      }
    } catch (error) {
      this.handleError(error, 'Get user profile')
    }
  }

  /**
   * Post content to Facebook page
   */
  async postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse> {
    try {
      if (post.content.length > PLATFORM_CONFIGS.facebook.maxCharacters) {
        return this.formatErrorResponse(
          new Error(`Content exceeds ${PLATFORM_CONFIGS.facebook.maxCharacters} characters`),
          'Post content'
        )
      }

      const pageId = credentials.pageId || credentials.userId
      const body: any = {
        message: post.content,
        access_token: credentials.accessToken
      }

      const appsecretProof = this.getAppSecretProof(credentials.accessToken)
      if (appsecretProof) {
        body.appsecret_proof = appsecretProof
      }

      // Add media if present
      if (post.media && post.media.length > 0) {
        body.source = post.media[0].url // Facebook uses 'source' for image URLs
      }

      // Add link if present
      if (post.url) {
        body.link = post.url
      }

      const response = await fetch(
        `${this.apiBaseUrl}/${pageId}/feed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SocialMediaOS/1.0'
          },
          body: new URLSearchParams(body).toString()
        }
      )

      if (!response.ok) {
        const error = await response.json()
        return this.formatErrorResponse(
          new Error(error.error?.message || 'Failed to post content'),
          'Post content'
        )
      }

      const data = await response.json()

      return {
        postId: data.id,
        platform: 'facebook',
        url: `https://www.facebook.com/${pageId}/posts/${data.id}`,
        createdAt: new Date(),
        status: 'posted'
      }
    } catch (error) {
      return this.formatErrorResponse(error, 'Post content')
    }
  }

  /**
   * Upload media to Facebook
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

      // Validate media size (4GB max for Facebook)
      if (mediaBuffer.byteLength > PLATFORM_CONFIGS.facebook.maxMediaSize) {
        throw new Error(`Media exceeds ${PLATFORM_CONFIGS.facebook.maxMediaSize} bytes`)
      }

      // Return media URL directly - Facebook can handle URLs
      return media.url
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('Facebook', `Media upload failed: ${message}`)
    }
  }

  /**
   * Schedule post to Facebook page
   */
  async schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse> {
    try {
      const pageId = credentials.pageId || credentials.userId
      const body: any = {
        message: post.content,
        published: false,
        scheduled_publish_time: Math.floor(scheduledTime.getTime() / 1000),
        access_token: credentials.accessToken
      }

      const appsecretProof = this.getAppSecretProof(credentials.accessToken)
      if (appsecretProof) {
        body.appsecret_proof = appsecretProof
      }

      if (post.media && post.media.length > 0) {
        body.source = post.media[0].url
      }

      const response = await fetch(
        `${this.apiBaseUrl}/${pageId}/feed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SocialMediaOS/1.0'
          },
          body: new URLSearchParams(body).toString()
        }
      )

      if (!response.ok) {
        throw new Error('Failed to schedule post')
      }

      const data = await response.json()

      return {
        postId: data.id,
        platform: 'facebook',
        createdAt: new Date(),
        status: 'scheduled'
      }
    } catch (error) {
      return this.formatErrorResponse(error, 'Schedule post')
    }
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      const appsecretProof = this.getAppSecretProof(credentials.accessToken)
      const proofParam = appsecretProof ? `&appsecret_proof=${appsecretProof}` : ''
      const response = await fetch(
        `${this.apiBaseUrl}/me?fields=id&access_token=${credentials.accessToken}${proofParam}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      return response.ok && response.status === 200
    } catch (error) {
      return false
    }
  }

  /**
   * Get post metrics from Facebook Insights
   */
  async getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics> {
    try {
      const appsecretProof = this.getAppSecretProof(credentials.accessToken)
      const proofParam = appsecretProof ? `&appsecret_proof=${appsecretProof}` : ''
      const response = await fetch(
        `${this.apiBaseUrl}/${postId}?fields=shares,likes.summary(total_count).limit(0),comments.summary(total_count).limit(0)&access_token=${credentials.accessToken}${proofParam}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch post metrics')
      }

      const data = await response.json()

      return {
        postId,
        platform: 'facebook',
        impressions: 0, // Not directly available in basic API
        engagements:
          (data.likes?.summary?.total_count || 0) +
          (data.comments?.summary?.total_count || 0) +
          (data.shares?.count || 0),
        likes: data.likes?.summary?.total_count || 0,
        comments: data.comments?.summary?.total_count || 0,
        shares: data.shares?.count || 0,
        fetched_at: new Date()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('Facebook', `Failed to fetch metrics: ${message}`)
    }
  }

  /**
   * Get platform max character limit
   */
  getMaxCharacterLimit(): number {
    return PLATFORM_CONFIGS.facebook.maxCharacters
  }

  /**
   * Check if platform supports scheduling
   */
  supportsScheduling(): boolean {
    return PLATFORM_CONFIGS.facebook.supportsScheduling
  }

  /**
   * Check if platform supports media upload
   */
  supportsMediaUpload(): boolean {
    return PLATFORM_CONFIGS.facebook.supportsMediaUpload
  }
}

/**
 * Post to Facebook (exported function for compatibility)
 * Supports: post, reel, story, video, photo
 */
export async function postToFacebook(
  credentials: any,
  options: { message: string; imageUrl?: string; mediaType?: string; postType?: string }
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Use Python backend client for Facebook posting
    const { createPost } = await import('@/lib/python-backend/api/social/facebook');

    const result = await createPost({
      message: options.message,
      imageUrl: options.imageUrl,
      mediaType: options.mediaType as 'image' | 'video' | undefined,
      postType: options.postType as 'post' | 'reel' | 'story' | undefined,
    });

    return {
      success: result.success,
      postId: result.postId,
      url: result.postUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post to Facebook'
    };
  }
}

/**
 * Post carousel to Facebook (exported function for compatibility)
 * Facebook supports multi-photo posts via the Graph API
 */
export async function postCarouselToFacebook(
  credentials: any,
  options: { message: string; imageUrls: string[] }
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Use Python backend client for Facebook carousel posting
    const { createCarousel } = await import('@/lib/python-backend/api/social/facebook');

    const result = await createCarousel({
      message: options.message,
      imageUrls: options.imageUrls,
    });

    return {
      success: result.success,
      postId: result.postId,
      url: result.postUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post carousel to Facebook'
    };
  }
}

/**
 * Upload photo to Facebook (exported function for compatibility)
 */
export async function uploadFacebookPhoto(
  credentials: any,
  imageUrl: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    // Backend will handle actual media upload with credentials from database
    return {
      success: true,
      imageUrl: imageUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload photo'
    };
  }
}
