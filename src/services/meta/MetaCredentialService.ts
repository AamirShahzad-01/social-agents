/**
 * META CREDENTIAL SERVICE
 * Unified credential management for Facebook, Instagram, and Meta Ads
 * 
 * Key Features:
 * - Uses existing Facebook/Instagram OAuth credentials for Ads
 * - Fetches Ad Account ID from Facebook credentials
 * - Single source of truth for all Meta platform credentials
 * - Proper encryption/decryption with workspace-specific keys
 */

import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import {
  encryptCredentials,
  decryptCredentials,
  getOrCreateWorkspaceEncryptionKey,
} from '@/lib/auth/encryptionManager'
import { logAuditEvent } from '@/services/database/auditLogService'
import type { Platform } from '@/types'
import crypto from 'crypto'

const META_API_VERSION = 'v24.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// Token is considered expiring soon if less than 7 days remain
const TOKEN_EXPIRY_WARNING_DAYS = 7

/**
 * Generate appsecret_proof for Meta API calls
 * This is required for server-side API calls to prove the request comes from a server with the app secret
 */
function generateAppSecretProof(accessToken: string): string {
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET
  if (!appSecret) {
    return ''
  }
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex')
}

export interface MetaCredentials {
  accessToken: string
  userAccessToken?: string // User token for Meta Ads API (different from Page token)
  pageId?: string
  pageName?: string
  userId?: string
  username?: string
  expiresAt?: string
  isConnected: boolean
  // Ad Account specific
  adAccountId?: string
  adAccountName?: string
  currency?: string
  timezone?: string
  // Business Portfolio info
  businessId?: string
  businessName?: string
  // All available businesses (for switching)
  availableBusinesses?: Array<{
    id: string
    name: string
    adAccounts: Array<{ id: string; name: string; currency: string; timezone: string }>
  }>
  // Status flags
  isExpired?: boolean
  expiresSoon?: boolean
}

export interface MetaAdsCapability {
  hasAdsAccess: boolean
  adAccountId?: string
  adAccountName?: string
  pageId?: string
  pageName?: string
  missingPermissions?: string[]
}

/**
 * Get Supabase client (fresh for serverless)
 */
async function getSupabase() {
  return await createServerClient()
}

/**
 * Get admin client for cron/scheduled operations
 */
async function getSupabaseAdmin() {
  return await createAdminClient()
}

export class MetaCredentialService {
  /**
   * Get Meta credentials from any connected Meta platform
   * Priority: meta_ads > facebook > instagram
   * 
   * This allows using existing Facebook/Instagram OAuth for Ads
   */
  static async getMetaCredentials(
    workspaceId: string,
    userId?: string,
    options: { useAdmin?: boolean } = {}
  ): Promise<MetaCredentials | null> {
    try {
      const supabase = options.useAdmin ? await getSupabaseAdmin() : await getSupabase()

      // Try to find credentials in order of preference
      const platforms: Platform[] = ['meta_ads' as Platform, 'facebook', 'instagram']

      for (const platform of platforms) {
        const { data, error } = await (supabase
          .from('social_accounts') as any)
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('platform', platform)
          .maybeSingle()

        if (error) {
          continue
        }

        if (!data?.credentials_encrypted) {
          continue
        }

        // Decrypt credentials
        try {
          const encryptionKey = await getOrCreateWorkspaceEncryptionKey(workspaceId)
          const decrypted = await decryptCredentials(data.credentials_encrypted, encryptionKey)

          if (!decrypted?.accessToken) {
            continue
          }

          // Check token expiration
          const expiresAt = data.expires_at || decrypted.expiresAt
          const { isExpired, expiresSoon } = this.checkTokenExpiration(expiresAt)

          if (isExpired) {
            continue // Try next platform
          }


          return {
            accessToken: decrypted.accessToken,
            userAccessToken: decrypted.userAccessToken, // User token for ads
            pageId: data.page_id || decrypted.pageId,
            pageName: data.page_name || decrypted.pageName,
            userId: decrypted.userId,
            username: data.username || decrypted.username,
            expiresAt: expiresAt?.toString(),
            isConnected: true,
            adAccountId: decrypted.adAccountId || decrypted.account_id,
            adAccountName: decrypted.adAccountName || decrypted.account_name,
            currency: decrypted.currency,
            timezone: decrypted.timezone,
            isExpired,
            expiresSoon,
          }
        } catch (decryptError) {
          continue
        }
      }

      return null
    } catch (error) {
      return null
    }
  }

  /**
   * Check if workspace has Meta Ads capability
   * Uses existing Facebook/Instagram credentials if available
   */
  static async checkAdsCapability(
    workspaceId: string,
    userId?: string
  ): Promise<MetaAdsCapability> {
    const credentials = await this.getMetaCredentials(workspaceId, userId)

    if (!credentials) {
      return {
        hasAdsAccess: false,
        missingPermissions: ['No Meta platform connected'],
      }
    }

    // If we already have ad account info, return it
    if (credentials.adAccountId) {
      return {
        hasAdsAccess: true,
        adAccountId: credentials.adAccountId,
        adAccountName: credentials.adAccountName,
        pageId: credentials.pageId,
        pageName: credentials.pageName,
      }
    }

    // Try to fetch ad account from Facebook API using user token
    try {
      const adsToken = credentials.userAccessToken || credentials.accessToken
      const adAccountInfo = await this.fetchAdAccountFromAPI(adsToken)

      if (adAccountInfo) {
        // Update stored credentials with ad account info
        await this.updateAdAccountInfo(workspaceId, adAccountInfo)

        return {
          hasAdsAccess: true,
          adAccountId: adAccountInfo.accountId,
          adAccountName: adAccountInfo.accountName,
          pageId: credentials.pageId,
          pageName: credentials.pageName,
        }
      }
    } catch (error) {
    }

    // Check if we at least have a page for posting
    if (credentials.pageId) {
      return {
        hasAdsAccess: false,
        pageId: credentials.pageId,
        pageName: credentials.pageName,
        missingPermissions: ['No Ad Account found. Please ensure your Facebook account has access to an Ad Account.'],
      }
    }

    return {
      hasAdsAccess: false,
      missingPermissions: ['No Facebook Page or Ad Account connected'],
    }
  }

  /**
   * Fetch user's Business Portfolios (Business Managers)
   * Returns list of businesses the user has access to
   */
  static async fetchUserBusinesses(
    accessToken: string
  ): Promise<Array<{ id: string; name: string }> | null> {
    try {
      const appSecretProof = generateAppSecretProof(accessToken)
      const proofParam = appSecretProof ? `&appsecret_proof=${appSecretProof}` : ''

      const response = await fetch(
        `${META_API_BASE}/me/businesses?fields=id,name&access_token=${accessToken}${proofParam}`
      )

      if (!response.ok) {
        const error = await response.json()
        return null
      }

      const data = await response.json()
      return data.data || []
    } catch (error) {
      return null
    }
  }

  /**
   * Fetch Ad Accounts owned by a specific Business Portfolio
   * This ensures we get the correct business ad accounts, not personal ones
   */
  static async fetchBusinessAdAccounts(
    accessToken: string,
    businessId: string
  ): Promise<Array<{ accountId: string; accountName: string; currency: string; timezone: string; businessId: string; businessName?: string }> | null> {
    try {
      const appSecretProof = generateAppSecretProof(accessToken)
      const proofParam = appSecretProof ? `&appsecret_proof=${appSecretProof}` : ''

      // Fetch owned ad accounts from the business
      const response = await fetch(
        `${META_API_BASE}/${businessId}/owned_ad_accounts?fields=id,account_id,name,currency,timezone_name&access_token=${accessToken}${proofParam}`
      )

      if (!response.ok) {
        const error = await response.json()
        return null
      }

      const data = await response.json()

      if (!data.data || data.data.length === 0) {
        return []
      }

      return data.data.map((account: any) => ({
        accountId: account.account_id || account.id?.replace('act_', ''),
        accountName: account.name,
        currency: account.currency,
        timezone: account.timezone_name,
        businessId: businessId,
      }))
    } catch (error) {
      return null
    }
  }

  /**
   * Fetch Ad Account info from Facebook Graph API
   * ONLY uses Business Portfolio owned ad accounts - NO personal accounts
   * 
   * Note: If the token is a Page token, we try to get the Page's business
   */
  static async fetchAdAccountFromAPI(
    accessToken: string,
    preferredBusinessId?: string
  ): Promise<{ accountId: string; accountName: string; currency: string; timezone: string; businessId?: string; businessName?: string } | null> {
    try {
      const appSecretProof = generateAppSecretProof(accessToken)
      const proofParam = appSecretProof ? `&appsecret_proof=${appSecretProof}` : ''

      // ONLY fetch ad accounts from Business Portfolios - NO personal accounts
      const businesses = await this.fetchUserBusinesses(accessToken)

      if (businesses && businesses.length > 0) {

        // If a preferred business ID is specified, try that first
        if (preferredBusinessId) {
          const preferredBusiness = businesses.find(b => b.id === preferredBusinessId)
          if (preferredBusiness) {
            const adAccounts = await this.fetchBusinessAdAccounts(accessToken, preferredBusiness.id)
            if (adAccounts && adAccounts.length > 0) {
              return {
                ...adAccounts[0],
                businessName: preferredBusiness.name,
              }
            }
          }
        }

        // Otherwise, try each business to find one with ad accounts
        for (const business of businesses) {
          const adAccounts = await this.fetchBusinessAdAccounts(accessToken, business.id)
          if (adAccounts && adAccounts.length > 0) {
            return {
              ...adAccounts[0],
              businessName: business.name,
            }
          }
        }

      }

      // Try Page token approach - get ad accounts via Page's business (still business-owned)
      const meResponse = await fetch(
        `${META_API_BASE}/me?fields=id,name&access_token=${accessToken}${proofParam}`
      )

      if (meResponse.ok) {
        const meData = await meResponse.json()

        // Try to get the Page's business and then its owned ad accounts
        const businessResponse = await fetch(
          `${META_API_BASE}/${meData.id}?fields=business{id,name,owned_ad_accounts{id,account_id,name,currency,timezone_name}}&access_token=${accessToken}${proofParam}`
        )

        if (businessResponse.ok) {
          const businessData = await businessResponse.json()
          const adAccounts = businessData.business?.owned_ad_accounts?.data

          if (adAccounts && adAccounts.length > 0) {
            const account = adAccounts[0]
            return {
              accountId: account.account_id || account.id?.replace('act_', ''),
              accountName: account.name,
              currency: account.currency,
              timezone: account.timezone_name,
              businessId: businessData.business?.id,
              businessName: businessData.business?.name,
            }
          }
        }
      }

      // No Business Portfolio ad accounts found - do NOT fall back to personal accounts
      return null
    } catch (error) {
      return null
    }
  }

  /**
   * Update stored credentials with Ad Account info
   */
  static async updateAdAccountInfo(
    workspaceId: string,
    adAccountInfo: { accountId: string; accountName: string; currency?: string; timezone?: string }
  ): Promise<void> {
    try {
      const supabase = await getSupabase()

      // Find existing Facebook or Instagram credentials
      const { data: existing } = await (supabase
        .from('social_accounts') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('platform', ['facebook', 'instagram'])
        .maybeSingle()

      if (!existing?.credentials_encrypted) {
        return
      }

      // Decrypt, update, and re-encrypt
      const encryptionKey = await getOrCreateWorkspaceEncryptionKey(workspaceId)
      const decrypted = await decryptCredentials(existing.credentials_encrypted, encryptionKey)

      const updated = {
        ...decrypted,
        adAccountId: adAccountInfo.accountId,
        adAccountName: adAccountInfo.accountName,
        currency: adAccountInfo.currency,
        timezone: adAccountInfo.timezone,
      }

      const encrypted = await encryptCredentials(updated, encryptionKey)

      await (supabase
        .from('social_accounts') as any)
        .update({
          credentials_encrypted: encrypted,
          account_id: adAccountInfo.accountId,
          account_name: adAccountInfo.accountName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

    } catch (error) {
    }
  }

  /**
   * Get credentials specifically for Meta Ads operations
   * Returns format compatible with existing getMetaAdsCredentials
   * 
   * IMPORTANT: Uses userAccessToken (User token) for ads API calls,
   * NOT the accessToken (Page token) which is for posting to pages.
   */
  static async getAdsCredentials(
    workspaceId: string,
    userId?: string
  ): Promise<{
    access_token: string
    account_id?: string
    account_name?: string
    page_id?: string
    page_name?: string
    expires_at?: string
    is_expired?: boolean
    expires_soon?: boolean
  } | null> {
    const credentials = await this.getMetaCredentials(workspaceId, userId)

    if (!credentials) {
      return null
    }

    // Use userAccessToken for ads API calls (User token, not Page token)
    // Fall back to accessToken if userAccessToken is not available (legacy data)
    const adsToken = credentials.userAccessToken || credentials.accessToken

    // If no ad account ID, try to fetch it using the user token
    let adAccountId = credentials.adAccountId
    let adAccountName = credentials.adAccountName

    if (!adAccountId && adsToken) {
      const adAccountInfo = await this.fetchAdAccountFromAPI(adsToken)
      if (adAccountInfo) {
        adAccountId = adAccountInfo.accountId
        adAccountName = adAccountInfo.accountName
        // Update stored credentials
        await this.updateAdAccountInfo(workspaceId, adAccountInfo)
      }
    }

    return {
      access_token: adsToken,
      account_id: adAccountId,
      account_name: adAccountName,
      page_id: credentials.pageId,
      page_name: credentials.pageName,
      expires_at: credentials.expiresAt,
      is_expired: credentials.isExpired,
      expires_soon: credentials.expiresSoon,
    }
  }

  /**
   * Check token expiration status
   */
  static checkTokenExpiration(expiresAt: string | Date | undefined): {
    isExpired: boolean
    expiresSoon: boolean
    daysRemaining: number | null
  } {
    if (!expiresAt) {
      return { isExpired: false, expiresSoon: false, daysRemaining: null }
    }

    const expiryDate = new Date(expiresAt)
    const now = new Date()
    const daysRemaining = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

    return {
      isExpired: daysRemaining <= 0,
      expiresSoon: daysRemaining > 0 && daysRemaining <= TOKEN_EXPIRY_WARNING_DAYS,
      daysRemaining: Math.ceil(daysRemaining),
    }
  }

  /**
   * Get connection status for Meta platforms
   */
  static async getConnectionStatus(
    workspaceId: string
  ): Promise<{
    facebook: { isConnected: boolean; username?: string; pageId?: string; pageName?: string }
    instagram: { isConnected: boolean; username?: string }
    metaAds: { isConnected: boolean; adAccountId?: string; adAccountName?: string }
    canRunAds: boolean
    missingForAds?: string[]
  }> {
    try {
      const supabase = await getSupabase()

      const { data: accounts } = await (supabase
        .from('social_accounts') as any)
        .select('platform, is_connected, username, page_id, page_name, account_id, account_name, credentials_encrypted')
        .eq('workspace_id', workspaceId)
        .in('platform', ['facebook', 'instagram', 'meta_ads'])

      const status = {
        facebook: { isConnected: false } as any,
        instagram: { isConnected: false } as any,
        metaAds: { isConnected: false } as any,
        canRunAds: false,
        missingForAds: [] as string[],
      }

      for (const account of accounts || []) {
        const hasCredentials = account.credentials_encrypted?.length > 0

        if (account.platform === 'facebook') {
          status.facebook = {
            isConnected: hasCredentials,
            username: account.username,
            pageId: account.page_id,
            pageName: account.page_name,
          }
        } else if (account.platform === 'instagram') {
          status.instagram = {
            isConnected: hasCredentials,
            username: account.username,
          }
        } else if (account.platform === 'meta_ads') {
          status.metaAds = {
            isConnected: hasCredentials,
            adAccountId: account.account_id,
            adAccountName: account.account_name,
          }
        }
      }

      // Determine if we can run ads
      // Need: Facebook connected + (Ad Account OR can fetch one)
      if (status.facebook.isConnected || status.metaAds.isConnected) {
        const adsCapability = await this.checkAdsCapability(workspaceId)
        status.canRunAds = adsCapability.hasAdsAccess

        if (!adsCapability.hasAdsAccess) {
          status.missingForAds = adsCapability.missingPermissions || []
        } else {
          status.metaAds.adAccountId = adsCapability.adAccountId
          status.metaAds.adAccountName = adsCapability.adAccountName
        }
      } else {
        status.missingForAds = ['Connect Facebook to run ads']
      }

      return status
    } catch (error) {
      return {
        facebook: { isConnected: false },
        instagram: { isConnected: false },
        metaAds: { isConnected: false },
        canRunAds: false,
        missingForAds: ['Error checking connection status'],
      }
    }
  }

  /**
   * Refresh long-lived token
   */
  static async refreshToken(
    workspaceId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getMetaCredentials(workspaceId, userId)

      if (!credentials) {
        return { success: false, error: 'No Meta credentials found' }
      }

      const appId = process.env.FACEBOOK_CLIENT_ID || process.env.META_APP_ID
      const appSecret = process.env.FACEBOOK_CLIENT_SECRET || process.env.META_APP_SECRET

      if (!appId || !appSecret) {
        return { success: false, error: 'Meta app credentials not configured' }
      }

      // Exchange for new long-lived token
      const response = await fetch(
        `${META_API_BASE}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${credentials.accessToken}`
      )

      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error?.message || 'Token refresh failed' }
      }

      const data = await response.json()
      const newToken = data.access_token
      const expiresIn = data.expires_in || 5184000 // ~60 days

      // Update stored credentials
      const supabase = await getSupabase()
      const encryptionKey = await getOrCreateWorkspaceEncryptionKey(workspaceId)

      // Find and update the credential
      const { data: existing } = await (supabase
        .from('social_accounts') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('platform', ['facebook', 'instagram', 'meta_ads'])
        .not('credentials_encrypted', 'is', null)
        .limit(1)
        .maybeSingle()

      if (existing) {
        const decrypted = await decryptCredentials(existing.credentials_encrypted, encryptionKey)
        const updated = {
          ...decrypted,
          accessToken: newToken,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        }
        const encrypted = await encryptCredentials(updated, encryptionKey)

        await (supabase
          .from('social_accounts') as any)
          .update({
            credentials_encrypted: encrypted,
            expires_at: updated.expiresAt,
            last_refreshed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)

        await logAuditEvent({
          workspaceId,
          userId,
          platform: existing.platform,
          action: 'token_refreshed',
          status: 'success',
        })
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}
