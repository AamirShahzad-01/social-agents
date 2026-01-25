/**
 * INSTAGRAM SERVICE
 * Implementation of Instagram Graph API integration (v18)
 * Uses Facebook OAuth 2.0 with long-lived token support (up to 60 days)
 * Latest API as of 2025
 *
 * Note: Instagram uses Facebook's Graph API for authentication and posting
 * This service reuses the same token exchange flow as Facebook
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
 * Instagram Graph API v18 Implementation
 * Documentation: https://developers.facebook.com/docs/instagram-graph-api
 * Uses Facebook's OAuth + long-lived tokens (same as Facebook service)
 */
export class InstagramService extends BasePlatformService {
  private apiBaseUrl = 'https://graph.instagram.com/v24.0'

  private getAppSecretProof(accessToken: string): string {
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET || ''
    if (!appSecret) return ''
    return createHmac('sha256', appSecret).update(accessToken).digest('hex')
  }

  constructor() {
    super('instagram', PLATFORM_CONFIGS.instagram.name, PLATFORM_CONFIGS.instagram.icon)
  }

  /**
   * Generate OAuth authorization URL
   * Instagram uses Facebook OAuth flow
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
   * Identical to Facebook - reuses Instagram's requirement for long-lived tokens
   */
  async exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse> {
    try {
      // Step 1: Get short-lived token
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code: callbackData.code
      })

      const shortLivedUrl = `https://graph.instagram.com/v24.0/oauth/access_token?${params.toString()}`
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

      const longLivedUrl = `https://graph.instagram.com/v24.0/oauth/access_token?${longLivedParams.toString()}`
      const longLivedResponse = await fetch(longLivedUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'SocialMediaOS/1.0' }
      })

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
   * Instagram tokens expire every 60 days and must be refreshed
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
        `${this.apiBaseUrl}/me?fields=id,username,name,profile_picture_url,biography,followers_count&access_token=${accessToken}${proofParam}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!response.ok) {
        throw new ExternalAPIError('Instagram', `Failed to fetch user profile: ${response.status}`)
      }

      const data = await response.json()

      return {
        id: data.id,
        username: data.username,
        name: data.name,
        profileImageUrl: data.profile_picture_url
      }
    } catch (error) {
      this.handleError(error, 'Get user profile')
    }
  }

  /**
   * Post content to Instagram
   * Instagram requires 2-step process: create media container → publish
   */
  async postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse> {
    try {
      if (post.content.length > PLATFORM_CONFIGS.instagram.maxCharacters) {
        return this.formatErrorResponse(
          new Error(`Caption exceeds ${PLATFORM_CONFIGS.instagram.maxCharacters} characters`),
          'Post content'
        )
      }

      // Instagram requires media for posting
      if (!post.media || post.media.length === 0) {
        return this.formatErrorResponse(
          new Error('Instagram posts require at least one media item'),
          'Post content'
        )
      }

      const userId = credentials.userId
      const media = post.media[0]
      const appsecretProof = this.getAppSecretProof(credentials.accessToken)

      // Step 1: Create media container
      const containerBody = {
        image_url: media.url,
        caption: post.content,
        access_token: credentials.accessToken
      }

      if (appsecretProof) {
        (containerBody as any).appsecret_proof = appsecretProof
      }

      const containerResponse = await fetch(
        `${this.apiBaseUrl}/${userId}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SocialMediaOS/1.0'
          },
          body: new URLSearchParams(containerBody as any).toString()
        }
      )

      if (!containerResponse.ok) {
        const error = await containerResponse.json()
        return this.formatErrorResponse(
          new Error(error.error?.message || 'Failed to create media container'),
          'Post content'
        )
      }

      const containerData = await containerResponse.json()
      const mediaId = containerData.id

      // Step 2: Publish media container
      const publishBody = {
        creation_id: mediaId,
        access_token: credentials.accessToken
      }

      if (appsecretProof) {
        (publishBody as any).appsecret_proof = appsecretProof
      }

      const publishResponse = await fetch(
        `${this.apiBaseUrl}/${userId}/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SocialMediaOS/1.0'
          },
          body: new URLSearchParams(publishBody as any).toString()
        }
      )

      if (!publishResponse.ok) {
        throw new Error('Failed to publish media')
      }

      const publishData = await publishResponse.json()

      return {
        postId: publishData.id,
        platform: 'instagram',
        url: `https://instagram.com/p/${publishData.id}`,
        createdAt: new Date(),
        status: 'posted'
      }
    } catch (error) {
      return this.formatErrorResponse(error, 'Post content')
    }
  }

  /**
   * Upload media to Instagram
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

      // Validate media size (100MB max for Instagram)
      if (mediaBuffer.byteLength > PLATFORM_CONFIGS.instagram.maxMediaSize) {
        throw new Error(`Media exceeds ${PLATFORM_CONFIGS.instagram.maxMediaSize} bytes`)
      }

      // Return media URL - Instagram accepts direct URLs
      return media.url
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('Instagram', `Media upload failed: ${message}`)
    }
  }

  /**
   * Schedule post to Instagram
   */
  async schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse> {
    try {
      if (!post.media || post.media.length === 0) {
        return this.formatErrorResponse(
          new Error('Instagram posts require at least one media item'),
          'Schedule post'
        )
      }

      const userId = credentials.userId
      const media = post.media[0]
      const unixTime = Math.floor(scheduledTime.getTime() / 1000)
      const appsecretProof = this.getAppSecretProof(credentials.accessToken)

      const body = {
        image_url: media.url,
        caption: post.content,
        scheduled_publish_time: unixTime,
        access_token: credentials.accessToken
      }

      if (appsecretProof) {
        (body as any).appsecret_proof = appsecretProof
      }

      const response = await fetch(
        `${this.apiBaseUrl}/${userId}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SocialMediaOS/1.0'
          },
          body: new URLSearchParams(body as any).toString()
        }
      )

      if (!response.ok) {
        throw new Error('Failed to schedule post')
      }

      const data = await response.json()

      return {
        postId: data.id,
        platform: 'instagram',
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
   * Get post metrics from Instagram Insights
   */
  async getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics> {
    try {
      const appsecretProof = this.getAppSecretProof(credentials.accessToken)
      const proofParam = appsecretProof ? `&appsecret_proof=${appsecretProof}` : ''
      const response = await fetch(
        `${this.apiBaseUrl}/${postId}/insights?metric=engagement,impressions,reach,saved&access_token=${credentials.accessToken}${proofParam}`,
        {
          method: 'GET',
          headers: { 'User-Agent': 'SocialMediaOS/1.0' }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch post metrics')
      }

      const data = await response.json()

      // Map Instagram insights to standard analytics
      const metricsMap: Record<string, number> = {}
      if (data.data) {
        data.data.forEach((metric: any) => {
          metricsMap[metric.name] = metric.values?.[0]?.value || 0
        })
      }

      return {
        postId,
        platform: 'instagram',
        impressions: metricsMap.impressions || 0,
        engagements: metricsMap.engagement || 0,
        saves: metricsMap.saved || 0,
        fetched_at: new Date()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('Instagram', `Failed to fetch metrics: ${message}`)
    }
  }

  /**
   * Get platform max character limit
   */
  getMaxCharacterLimit(): number {
    return PLATFORM_CONFIGS.instagram.maxCharacters
  }

  /**
   * Check if platform supports scheduling
   */
  supportsScheduling(): boolean {
    return PLATFORM_CONFIGS.instagram.supportsScheduling
  }

  /**
   * Check if platform supports media upload
   */
  supportsMediaUpload(): boolean {
    return PLATFORM_CONFIGS.instagram.supportsMediaUpload
  }
}

/**
 * Post to Instagram via Python backend API
 * Supports single image, video, Reels, and Stories posts
 * Backend handles credentials from database
 */
export async function postToInstagram(
  credentials: any,
  options: {
    caption: string;
    imageUrl?: string;
    mediaType?: string;
    postType?: string; // 'story' for Stories, 'reel' for Reels
    carouselUrls?: string[]; // Array of URLs for carousel posts
  }
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Detect media type for the API
    // 'reel' = Instagram Reels (short-form vertical video)
    // 'video' = Regular video post
    // 'image' = Image post
    const mediaType = options.mediaType === 'reel' ? 'reel'
      : options.mediaType === 'video' ? 'video'
        : 'image';

    // Use Python backend client for Instagram posting
    const { createPost } = await import('@/lib/python-backend/api/social/instagram');

    const result = await createPost({
      caption: options.caption,
      imageUrl: options.imageUrl,
      mediaType: mediaType as 'image' | 'video' | 'carousel' | 'reel' | 'story',
      carouselImages: options.carouselUrls,
    });

    return {
      success: result.success,
      postId: result.postId,
      url: result.postUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post to Instagram'
    };
  }
}

/**
 * Post carousel to Instagram via backend API
 * Supports mixed images and videos (2-10 items)
 * 
 * Supported formats:
 * - Images: JPEG, PNG (max 8MB each)
 * - Videos: MP4, MOV (max 100MB each, 3s-60min duration)
 * 
 * Backend handles:
 * - Credentials from database
 * - Video processing wait (videos must finish processing before carousel can be created)
 * - Mixed media type detection
 */
export async function postCarouselToInstagram(
  credentials: any,
  options: {
    caption: string;
    mediaUrls: string[]; // Array of image/video URLs (2-10 items)
  }
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Analyze media types for logging
    const mediaTypes = options.mediaUrls?.map(url => {
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.match(/\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)/i) ||
        lowerUrl.includes('/video/') || lowerUrl.includes('/videos/')) {
        return 'VIDEO';
      }
      return 'IMAGE';
    }) || [];


    if (!options.mediaUrls || options.mediaUrls.length < 2) {
      return {
        success: false,
        error: 'Carousel requires at least 2 media items'
      };
    }

    if (options.mediaUrls.length > 10) {
      return {
        success: false,
        error: 'Carousel cannot have more than 10 media items'
      };
    }

    // Validate URLs are not blob/data URLs (Instagram requires public URLs)
    const invalidUrls = options.mediaUrls.filter(url =>
      url.startsWith('blob:') || url.startsWith('data:')
    );
    if (invalidUrls.length > 0) {
      return {
        success: false,
        error: 'Instagram requires publicly accessible URLs. Please upload media to storage first.'
      };
    }

    // Use Python backend client for Instagram carousel posting
    const { createPost } = await import('@/lib/python-backend/api/social/instagram');

    const result = await createPost({
      caption: options.caption || '',
      carouselImages: options.mediaUrls,
      mediaType: 'carousel',
    });

    return {
      success: result.success,
      postId: result.postId,
      url: result.postUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post carousel to Instagram'
    };
  }
}

/**
 * Upload media to Instagram
 * Instagram requires publicly accessible URLs, so we just validate the URL
 * The actual upload happens when creating the media container
 */
export async function uploadInstagramMedia(
  credentials: any,
  mediaUrl: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    // Instagram requires publicly accessible URLs
    // If the URL is already a public URL (starts with http/https), use it directly
    // If it's a base64 data URL, we need to upload it to storage first

    if (mediaUrl.startsWith('data:')) {
      // Upload base64 to storage via Python backend API
      const { uploadMedia } = await import('@/lib/python-backend/api/social/instagram');

      const result = await uploadMedia({ mediaData: mediaUrl });

      return {
        success: result.success,
        imageUrl: result.imageUrl
      };
    }

    // URL is already public, use it directly
    return {
      success: true,
      imageUrl: mediaUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload media'
    };
  }
}

