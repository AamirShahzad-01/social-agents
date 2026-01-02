'use client'

import React, { useState, useEffect } from 'react'
import {
  CheckCircle,
  Link,
  AlertCircle,
  Settings,
  Loader2,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { PLATFORMS } from '@/constants'
import type { Platform } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase/client'
import { credentialsService } from '@/services/credentialsService'
import { extractConnectedSummary } from '@/types/credentials'

interface ConnectedAccountsViewProps {
  connectedAccounts: Record<Platform, boolean>
  onUpdateAccounts: (accounts: Record<Platform, boolean>) => void
}

const ConnectedAccountsView: React.FC<ConnectedAccountsViewProps> = ({
  connectedAccounts,
  onUpdateAccounts,
}) => {
  const { user } = useAuth()
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null)
  const [errors, setErrors] = useState<Record<Platform, string | undefined>>({
    twitter: undefined,
    linkedin: undefined,
    facebook: undefined,
    instagram: undefined,
    tiktok: undefined,
    youtube: undefined,
  })
  const [statusInfo, setStatusInfo] = useState<Record<Platform, any>>({
    twitter: {},
    linkedin: {},
    facebook: {},
    instagram: {},
    tiktok: {},
    youtube: {},
  })
  const [timeoutWarnings, setTimeoutWarnings] = useState<Set<Platform>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  // Adaptive timeouts per platform
  const TIMEOUTS = {
    twitter: 45000, // 45 seconds
    linkedin: 60000, // 60 seconds
    facebook: 90000, // 90 seconds
    instagram: 90000, // 90 seconds
    tiktok: 60000, // 60 seconds
    youtube: 60000, // 60 seconds
  }


  useEffect(() => {
    loadConnectionStatus()

    // Check for OAuth callbacks
    const urlParams = new URLSearchParams(window.location.search)
    const successPlatform = urlParams.get('oauth_success')
    const errorCode = urlParams.get('oauth_error')

    if (successPlatform) {
      // Success - reload status with retry mechanism
      // Database transaction might still be in progress, so retry multiple times
      const retryLoadStatus = async () => {
        if (!user) return

        const maxRetries = 4
        const retryDelays = [1500, 1000, 2000, 3000] // milliseconds between retries

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (attempt > 0) {
            // Wait before retry (with exponential backoff)
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt - 1]))
          }

          try {
            setIsLoading(true)
            const data = await credentialsService.getStatus()

            // Check if the platform we're looking for is now connected
            const platformConnected = data[successPlatform as Platform]?.isConnected

            if (platformConnected) {
              // Found credentials! Update state and we're done
              setStatusInfo(data)
              onUpdateAccounts(extractConnectedSummary(data))
              setConnectingPlatform(null)
              break // Exit retry loop
            } else if (attempt === maxRetries - 1) {
              // Last attempt failed - show what we got
              setStatusInfo(data)
              onUpdateAccounts(extractConnectedSummary(data))
              setConnectingPlatform(null)
            }
          } catch (err) {
            console.error('Failed to load status in retry:', err)
            if (attempt === maxRetries - 1) {
              // All retries failed
              setConnectingPlatform(null)
            }
          } finally {
            setIsLoading(false)
          }
        }
      }

      retryLoadStatus()
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (errorCode) {
      // Error - show to user
      const platform = detectPlatformFromError(errorCode)
      if (platform) {
        setErrors(prev => ({
          ...prev,
          [platform]: mapErrorCode(errorCode),
        }))
      }
      setConnectingPlatform(null)
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadConnectionStatus = async () => {
    if (!user) return

    try {
      setIsLoading(true)
      const data = await credentialsService.getStatus()
      setStatusInfo(data)
      onUpdateAccounts(extractConnectedSummary(data))
    } catch (error: any) {
      console.error('Failed to load connection status:', error)
      // Clear any previous errors when loading fails
      setErrors({
        twitter: undefined,
        linkedin: undefined,
        facebook: undefined,
        instagram: undefined,
        tiktok: undefined,
        youtube: undefined,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnect = async (platform: Platform) => {
    setErrors(prev => ({ ...prev, [platform]: undefined }))
    setConnectingPlatform(platform)
    setTimeoutWarnings(new Set())

    try {
      // Use OAuth 1.0a for Twitter/X (required for media upload)
      // Other platforms use OAuth 2.0 via unified auth endpoint
      const isTwitter = platform === 'twitter'
      const oauthEndpoint = isTwitter
        ? '/api/twitter/auth'  // OAuth 1.0a
        : `/api/auth/oauth/${platform}/initiate`  // OAuth 2.0

      // For non-Twitter platforms, we need auth token
      let fetchOptions: RequestInit = { method: 'POST' }

      if (!isTwitter) {
        const supabase = getSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.access_token) {
          throw new Error('Please log in to connect your accounts')
        }

        fetchOptions = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      }

      // POST to initiate OAuth
      const response = await fetch(oauthEndpoint, fetchOptions)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || errorData.detail || 'Failed to initiate connection'

        // If workspace initialization failed, retry once after a short delay
        if (response.status === 500 && errorMessage.includes('initialize workspace')) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          const retryResponse = await fetch(oauthEndpoint, fetchOptions)
          if (!retryResponse.ok) {
            const retryErrorData = await retryResponse.json().catch(() => ({}))
            throw new Error(retryErrorData.error || 'Failed to initiate connection after retry')
          }
          const { redirectUrl: retryRedirectUrl } = await retryResponse.json()
          window.location.href = retryRedirectUrl
          return
        }

        throw new Error(errorMessage)
      }

      const { redirectUrl } = await response.json()

      // Set timeout warning (show warning 30s before timeout)
      const timeoutMs = TIMEOUTS[platform]
      setTimeout(() => {
        if (connectingPlatform === platform) {
          setTimeoutWarnings(prev => new Set(prev).add(platform))
        }
      }, timeoutMs - 30000)

      // Set timeout to clear loading state
      const timeoutId = setTimeout(() => {
        if (connectingPlatform === platform) {
          setConnectingPlatform(null)
          setErrors(prev => ({
            ...prev,
            [platform]: 'Connection timed out. Please try again.',
          }))
        }
      }, timeoutMs) as any

      // Store timeout ID for cleanup
      (window as any)[`timeout_${platform}`] = timeoutId

      // Redirect to OAuth
      window.location.href = redirectUrl
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        [platform]: error instanceof Error ? error.message : 'Connection failed',
      }))
      setConnectingPlatform(null)
    }
  }

  const handleDisconnect = async (platform: Platform) => {
    try {
      const response = await fetch(`/api/credentials/${platform}/disconnect`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = errorData?.details || errorData?.error || 'Failed to disconnect'
        throw new Error(errorMessage)
      }

      loadConnectionStatus()
      setErrors(prev => ({ ...prev, [platform]: undefined }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
      setErrors(prev => ({
        ...prev,
        [platform]: errorMessage,
      }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Connected Accounts</h2>
        <p className="text-gray-600 mt-1">Manage your social media integrations</p>
      </div>
      <div className="bg-white p-8 rounded-xl shadow-md max-w-3xl mx-auto border border-gray-200">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 flex gap-3">
          <Settings className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-indigo-800">
            <p className="font-semibold mb-1">Production-Ready Integration</p>
            <p>
              Connect your social media accounts securely. Your credentials are encrypted and
              stored on our servers. Never stored in your browser.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-600 mr-2" />
            <span className="text-gray-600">Loading connection status...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {PLATFORMS.map(({ id, name, icon: Icon }) => {
              const isConnected = connectedAccounts[id]
              const isConnecting = connectingPlatform === id
              const error = errors[id]
              const info = statusInfo[id]
              const hasTimeout = timeoutWarnings.has(id)

              return (
                <div key={id} className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1">
                      <Icon className="w-8 h-8 text-gray-700" />
                      <div className="flex-1">
                        <span className="text-lg font-medium text-gray-900 block">
                          {name}
                        </span>
                        {isConnected && info?.username && (
                          <div className="text-sm text-gray-600">
                            <span>@{info.username}</span>
                            {info.isExpired && (
                              <span className="ml-2 text-red-600 font-semibold">
                                Token Expired
                              </span>
                            )}
                            {info.isExpiringSoon && !info.isExpired && (
                              <span className="ml-2 text-orange-600 font-semibold">
                                Expiring Soon
                              </span>
                            )}
                          </div>
                        )}
                        {isConnected && info?.expiresAt && (
                          <span className="text-xs text-gray-500">
                            Expires: {typeof info.expiresAt === 'number' ? new Date(info.expiresAt * 1000).toLocaleDateString() : info.expiresAt}
                          </span>
                        )}
                      </div>
                    </div>

                    {isConnecting ? (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="font-medium text-sm">Connecting...</span>
                      </div>
                    ) : isConnected ? (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-5 h-5 mr-2" />
                          <span className="font-medium text-sm">Connected</span>
                        </div>
                        <button
                          onClick={() => handleDisconnect(id)}
                          className="px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnect(id)}
                        className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white flex items-center transition-colors shadow-md"
                      >
                        <Link className="w-4 h-4 mr-2" />
                        Connect
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="px-4 pb-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    </div>
                  )}

                  {hasTimeout && (
                    <div className="px-4 pb-4">
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex gap-2">
                        <Clock className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-orange-800">
                          Connection is taking longer than expected. This window will close in 30
                          seconds.
                        </p>
                      </div>
                    </div>
                  )}

                  {isConnected && info?.isExpired && (
                    <div className="px-4 pb-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                          <p className="font-semibold">Token Expired</p>
                          <p>Please reconnect to refresh your credentials.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>Security:</strong> Your API credentials are encrypted using AES-256 encryption
            and stored securely on our servers. We never store them in your browser.
          </p>
        </div>
      </div>
    </div>
  )
}

function detectPlatformFromError(errorCode: string): Platform | null {
  if (errorCode.includes('twitter')) return 'twitter'
  if (errorCode.includes('linkedin')) return 'linkedin'
  if (errorCode.includes('facebook')) return 'facebook'
  if (errorCode.includes('instagram')) return 'instagram'
  return null
}

function mapErrorCode(errorCode: string): string {
  const messages: Record<string, string> = {
    oauth_unauthorized: 'Not authenticated. Please log in.',
    no_workspace: 'Workspace is being initialized. Please try again in a moment.',
    NO_WORKSPACE: 'Workspace is being initialized. Please try again in a moment.',
    WORKSPACE_INIT_ERROR: 'Workspace initialization failed. Please refresh the page and try again.',
    user_denied: 'You denied the connection request.',
    missing_params: 'OAuth parameters missing. Please try again.',
    csrf_check_failed: 'Security verification failed. Please try again.',
    missing_verifier: 'Security token missing. Please restart connection.',
    callback_error: 'Connection callback failed. Please try again.',
    token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
    get_pages_failed: 'Failed to retrieve your pages. Please try again.',
    no_pages_found: 'No pages found. Please create a page and try again.',
    get_account_failed: 'Failed to retrieve your account. Please try again.',
    no_account_found: 'No account found. Please try again.',
    save_failed: 'Failed to save credentials. Please try again.',
    config_missing: 'Platform is not configured. Please contact support.',
    insufficient_permissions: 'Access denied. Only workspace admins can connect social media accounts.',
  }

  // Also check if error message contains workspace-related keywords
  if (errorCode.toLowerCase().includes('workspace not found') ||
    errorCode.toLowerCase().includes('workspace error') ||
    errorCode.toLowerCase().includes('initialize workspace')) {
    return 'Workspace is being initialized. Please try again in a moment.'
  }

  return messages[errorCode] || errorCode || 'Connection failed. Please try again.'
}

export default ConnectedAccountsView
