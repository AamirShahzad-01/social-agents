/**
 * LINKEDIN SERVICE
 * Implementation of LinkedIn API v3 integration
 * OAuth 2.0 for member authorization
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
 * LinkedIn API v3 Implementation
 * Documentation: https://learn.microsoft.com/en-us/linkedin/shared/api-reference/api-reference-v2
 */
export class LinkedInService extends BasePlatformService {
  private apiBaseUrl = 'https://api.linkedin.com/v2'
  private restApiUrl = 'https://api.linkedin.com/rest'
  private apiVersion = '202411' // LinkedIn API version in YYYYMM format

  constructor() {
    super('linkedin', PLATFORM_CONFIGS.linkedin.name, PLATFORM_CONFIGS.linkedin.icon)
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state
    })

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(callbackData: OAuthCallbackData): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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
          redirect_uri: this.config.redirectUri
        }).toString()
      })

      if (!response.ok) {
        const error = await response.json()
        throw new ExternalAPIError('LinkedIn', `Token exchange failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        accessToken: data.access_token,
        refreshToken: undefined,
        expiresIn: data.expires_in,
        tokenType: data.token_type || 'Bearer'
      }
    } catch (error) {
      this.handleError(error, 'Token exchange')
    }
  }

  /**
   * Refresh access token - LinkedIn doesn't currently support refresh tokens
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    throw new ExternalAPIError(
      'LinkedIn',
      'LinkedIn API does not support token refresh. Use native token expiration handling.'
    )
  }

  /**
   * Get authenticated user profile
   */
  async getUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'SocialMediaOS/1.0'
        }
      })

      if (!response.ok) {
        throw new ExternalAPIError('LinkedIn', `Failed to fetch user profile: ${response.status}`)
      }

      const data = await response.json()

      return {
        id: data.id,
        username: `${data.localizedFirstName} ${data.localizedLastName}`,
        name: `${data.localizedFirstName} ${data.localizedLastName}`
      }
    } catch (error) {
      this.handleError(error, 'Get user profile')
    }
  }

  /**
   * Post content to LinkedIn using the new Posts API
   * Documentation: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
   */
  async postContent(
    credentials: PlatformCredentials,
    post: PlatformPost
  ): Promise<PlatformPostResponse> {
    try {
      if (post.content.length > PLATFORM_CONFIGS.linkedin.maxCharacters) {
        return this.formatErrorResponse(
          new Error(`Content exceeds ${PLATFORM_CONFIGS.linkedin.maxCharacters} characters`),
          'Post content'
        )
      }

      // Use the author URN from credentials (should be urn:li:person:xxx format)
      const authorUrn = credentials.userId?.startsWith('urn:li:')
        ? credentials.userId
        : `urn:li:person:${credentials.userId}`

      // New Posts API request body
      const body: any = {
        author: authorUrn,
        commentary: post.content,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      }


      const response = await fetch(`${this.restApiUrl}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': this.apiVersion,
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Failed to post content'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.error_description || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        return this.formatErrorResponse(
          new Error(errorMessage),
          'Post content'
        )
      }

      // Post ID is returned in the x-restli-id header
      const postId = response.headers.get('x-restli-id') || ''

      return {
        postId,
        platform: 'linkedin',
        url: `https://www.linkedin.com/feed/update/${postId}`,
        createdAt: new Date(),
        status: 'posted'
      }
    } catch (error) {
      return this.formatErrorResponse(error, 'Post content')
    }
  }

  /**
   * Upload media to LinkedIn
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

      // Validate media size (10MB max for LinkedIn)
      if (mediaBuffer.byteLength > PLATFORM_CONFIGS.linkedin.maxMediaSize) {
        throw new Error(`Media exceeds ${PLATFORM_CONFIGS.linkedin.maxMediaSize} bytes`)
      }

      // Return placeholder for now - full implementation needs presigned URL handling
      return `urn:li:digitalmediaAsset:${credentials.userId}:${Date.now()}`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('LinkedIn', `Media upload failed: ${message}`)
    }
  }

  /**
   * Schedule post to LinkedIn (creates as DRAFT)
   * Note: LinkedIn API doesn't support native scheduling, so we create as draft
   * and the app should handle publishing at the scheduled time
   */
  async schedulePost(
    credentials: PlatformCredentials,
    post: PlatformPost,
    scheduledTime: Date
  ): Promise<PlatformPostResponse> {
    try {
      const authorUrn = credentials.userId?.startsWith('urn:li:')
        ? credentials.userId
        : `urn:li:person:${credentials.userId}`

      const body: any = {
        author: authorUrn,
        commentary: post.content,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: 'DRAFT', // Create as draft for scheduling
        isReshareDisabledByAuthor: false
      }

      const response = await fetch(`${this.restApiUrl}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': this.apiVersion,
          'User-Agent': 'SocialMediaOS/1.0'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to schedule post: ${errorText}`)
      }

      const postId = response.headers.get('x-restli-id') || ''

      return {
        postId,
        platform: 'linkedin',
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
      const response = await fetch(`${this.apiBaseUrl}/me`, {
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
   * Get post metrics from LinkedIn Analytics
   */
  async getPostMetrics(
    credentials: PlatformCredentials,
    postId: string
  ): Promise<PlatformAnalytics> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/socialMetadata/${postId}?fields=totalShareStatistics`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'User-Agent': 'SocialMediaOS/1.0'
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch post metrics')
      }

      const data = await response.json()
      const stats = data.value?.totalShareStatistics || {}

      return {
        postId,
        platform: 'linkedin',
        impressions: stats.impressionCount || 0,
        engagements: (stats.commentCount || 0) + (stats.likeCount || 0) + (stats.shareCount || 0),
        comments: stats.commentCount || 0,
        likes: stats.likeCount || 0,
        shares: stats.shareCount || 0,
        fetched_at: new Date()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ExternalAPIError('LinkedIn', `Failed to fetch metrics: ${message}`)
    }
  }

  /**
   * Get platform max character limit
   */
  getMaxCharacterLimit(): number {
    return PLATFORM_CONFIGS.linkedin.maxCharacters
  }

  /**
   * Check if platform supports scheduling
   */
  supportsScheduling(): boolean {
    return PLATFORM_CONFIGS.linkedin.supportsScheduling
  }

  /**
   * Check if platform supports media upload
   */
  supportsMediaUpload(): boolean {
    return PLATFORM_CONFIGS.linkedin.supportsMediaUpload
  }
}

/**
 * Post to LinkedIn via backend API
 * Supports text posts with optional media
 * LinkedIn API - 3000 character limit
 * 
 * @param credentials - Credentials (not used, backend fetches from DB)
 * @param options - Post options including text, visibility, mediaUrn, and postToPage
 */
export async function postToLinkedIn(
  credentials: any,
  options: { text: string; visibility: string; mediaUrn?: string; postToPage?: boolean }
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Use Python backend client for LinkedIn posting
    const { createPost } = await import('@/lib/python-backend/api/social/linkedin');

    const result = await createPost({
      text: options.text,
      visibility: options.visibility as 'PUBLIC' | 'CONNECTIONS',
      mediaUrn: options.mediaUrn,
      postToPage: options.postToPage,
    });

    return {
      success: result.success,
      postId: result.postId,
      url: result.postUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post to LinkedIn'
    };
  }
}

/**
 * Post carousel to LinkedIn via backend API
 * Supports 2-20 images
 * LinkedIn API - 3000 character limit
 * 
 * @param credentials - Credentials (not used, backend fetches from DB)
 * @param options - Post options including text, imageUrls, visibility, and postToPage
 */
export async function postCarouselToLinkedIn(
  credentials: any,
  options: { text: string; imageUrls: string[]; visibility?: string; postToPage?: boolean }
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Use Python backend client for LinkedIn carousel posting
    const { createCarousel } = await import('@/lib/python-backend/api/social/linkedin');

    const result = await createCarousel({
      text: options.text,
      imageUrls: options.imageUrls,
      visibility: (options.visibility || 'PUBLIC') as 'PUBLIC' | 'CONNECTIONS',
      postToPage: options.postToPage,
    });

    return {
      success: result.success,
      postId: result.postId,
      url: result.postUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post carousel to LinkedIn'
    };
  }
}

/**
 * Upload media to LinkedIn via backend API
 * Supports images and videos
 * Returns media URN for use in post
 */
export async function uploadLinkedInMedia(
  credentials: any,
  mediaUrl: string,
  mediaType?: string
): Promise<{ success: boolean; mediaUrn?: string; error?: string }> {
  try {
    // Use Python backend client for LinkedIn media upload
    const { uploadMedia } = await import('@/lib/python-backend/api/social/linkedin');

    const result = await uploadMedia({
      mediaData: mediaUrl, // Pass the URL or base64 data as mediaData
      mediaType: (mediaType || 'image') as 'image' | 'video',
    });

    return {
      success: result.success,
      mediaUrn: result.mediaUrn
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload media'
    };
  }
}
