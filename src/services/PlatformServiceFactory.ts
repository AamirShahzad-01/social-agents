/**
 * PLATFORM SERVICE FACTORY
 * Factory pattern for creating and managing platform service instances
 * Provides centralized service instantiation and configuration
 */

import { IPlatformService, SupportedPlatform, PLATFORMS, OAuthConfig } from '@/core/types/PlatformTypes'
import { TwitterService } from './platforms/twitterService'
import { LinkedInService } from './platforms/linkedinService'
import { FacebookService } from './platforms/facebookService'
import { InstagramService } from './platforms/instagramService'
import { TikTokService } from './platforms/tiktokService'
import { YouTubeService } from './platforms/youtubeService'

/**
 * Platform Service Factory
 * Creates and manages platform service instances with configuration
 */
export class PlatformServiceFactory {
  /**
   * Create platform service instance
   * Automatically loads environment configuration
   */
  createService(platform: SupportedPlatform): IPlatformService | null {
    const config = this.getOAuthConfig(platform)
    if (!config) return null

    const service = this.instantiateService(platform)
    if (!service) return null

    service.initialize(config)
    return service
  }

  /**
   * Get OAuth configuration from environment
   */
  private getOAuthConfig(platform: SupportedPlatform): OAuthConfig | null {
    const envPrefix = platform.toUpperCase()
    const clientId = process.env[`${envPrefix}_CLIENT_ID`]
    const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`]
    const redirectUri = process.env[`${envPrefix}_REDIRECT_URI`]

    if (!clientId || !clientSecret || !redirectUri) {
      return null
    }

    return {
      platform,
      clientId,
      clientSecret,
      redirectUri,
      scopes: this.getScopes(platform),
      authorizationUrl: this.getAuthorizationUrl(platform),
      tokenUrl: this.getTokenUrl(platform)
    }
  }

  /**
   * Instantiate service for platform
   */
  private instantiateService(platform: SupportedPlatform): IPlatformService | null {
    switch (platform) {
      case PLATFORMS.TWITTER:
        return new TwitterService()
      case PLATFORMS.LINKEDIN:
        return new LinkedInService()
      case PLATFORMS.FACEBOOK:
        return new FacebookService()
      case PLATFORMS.INSTAGRAM:
        return new InstagramService()
      case PLATFORMS.TIKTOK:
        return new TikTokService()
      case PLATFORMS.YOUTUBE:
        return new YouTubeService()
      default:
        return null
    }
  }

  /**
   * Get OAuth scopes for platform
   */
  private getScopes(platform: SupportedPlatform): string[] {
    // Map platform to OAuth scopes from environment or defaults
    const scopesEnv = process.env[`${platform.toUpperCase()}_OAUTH_SCOPES`]
    if (scopesEnv) {
      return scopesEnv.split(',').map(s => s.trim())
    }

    // Return platform-specific defaults
    const scopeDefaults: Record<SupportedPlatform, string[]> = {
      twitter: [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access'
      ],
      linkedin: [
        'openid',
        'profile',
        'email',
        'w_member_social'
      ],
      facebook: [
        'pages_manage_posts',
        'pages_read_engagement',
        'instagram_basic',
        'instagram_graph_user_content'
      ],
      instagram: [
        'instagram_business_basic',
        'instagram_business_content_publish'
      ],
      tiktok: [
        'user.info.basic',
        'video.upload',
        'video.publish'
      ],
      youtube: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube'
      ]
    }

    return scopeDefaults[platform] || []
  }

  /**
   * Get authorization URL for platform
   */
  private getAuthorizationUrl(platform: SupportedPlatform): string {
    const urls: Record<SupportedPlatform, string> = {
      twitter: 'https://x.com/i/oauth2/authorize',
      linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
      facebook: 'https://www.facebook.com/v24.0/dialog/oauth',
      instagram: 'https://www.facebook.com/v24.0/dialog/oauth',
      tiktok: 'https://www.tiktok.com/v2/auth/authorize/',
      youtube: 'https://accounts.google.com/o/oauth2/v2/auth'
    }

    return urls[platform]
  }

  /**
   * Get token URL for platform
   */
  private getTokenUrl(platform: SupportedPlatform): string {
    const urls: Record<SupportedPlatform, string> = {
      twitter: 'https://api.x.com/2/oauth2/token',
      linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
      facebook: 'https://graph.facebook.com/v24.0/oauth/access_token',
      instagram: 'https://graph.instagram.com/v24.0/oauth/access_token',
      tiktok: 'https://open.tiktokapis.com/v2/oauth/token/',
      youtube: 'https://oauth2.googleapis.com/token'
    }

    return urls[platform]
  }

  /**
   * Get platform metadata
   */
  getPlatformMetadata(platform: SupportedPlatform): {
    name: string
    icon: string
    maxCharacters: number
    supportsScheduling: boolean
    supportsMediaUpload: boolean
  } | null {
    const service = this.instantiateService(platform)
    if (!service) return null

    return {
      name: service.getPlatformName(),
      icon: service.getPlatformIcon(),
      maxCharacters: service.getMaxCharacterLimit(),
      supportsScheduling: service.supportsScheduling(),
      supportsMediaUpload: service.supportsMediaUpload()
    }
  }

  /**
   * Get all supported platforms metadata
   */
  getAllPlatformsMetadata(): Record<
    SupportedPlatform,
    {
      name: string
      icon: string
      maxCharacters: number
      supportsScheduling: boolean
      supportsMediaUpload: boolean
    }
  > {
    const platforms: SupportedPlatform[] = [
      PLATFORMS.TWITTER,
      PLATFORMS.LINKEDIN,
      PLATFORMS.FACEBOOK,
      PLATFORMS.INSTAGRAM,
      PLATFORMS.TIKTOK,
      PLATFORMS.YOUTUBE
    ]

    const metadata: Record<string, any> = {}

    for (const platform of platforms) {
      const meta = this.getPlatformMetadata(platform)
      if (meta) {
        metadata[platform] = meta
      }
    }

    return metadata
  }

  /**
   * Validate platform is supported
   */
  isSupported(platform: string): platform is SupportedPlatform {
    return Object.values(PLATFORMS).includes(platform as SupportedPlatform)
  }

  /**
   * Get all supported platform names
   */
  getSupportedPlatforms(): SupportedPlatform[] {
    return Object.values(PLATFORMS) as SupportedPlatform[]
  }
}

// Export singleton instance
export const platformServiceFactory = new PlatformServiceFactory()
