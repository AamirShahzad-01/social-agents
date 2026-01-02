'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  CheckCircle,
  Link,
  AlertCircle,
  Settings,
  Loader2,
  Clock,
  AlertTriangle,
  Palette,
  Megaphone,
  ExternalLink,
} from 'lucide-react'
import { PLATFORMS } from '@/constants'
import type { Platform } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase/client'
import { credentialsService } from '@/services/credentialsService'
import { extractConnectedSummary } from '@/types/credentials'

// Format date to readable format
const formatDate = (dateString: string | number) => {
  const date = typeof dateString === 'number'
    ? new Date(dateString * 1000)
    : new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const AccountSettingsTab: React.FC = () => {
  const { user, userRole, loading: authLoading } = useAuth()
  const [connectedAccounts, setConnectedAccounts] = useState<Record<Platform, boolean>>({
    twitter: false,
    linkedin: false,
    facebook: false,
    instagram: false,
    tiktok: false,
    youtube: false,
  })

  // Canva connection state (separate from social platforms)
  const [canvaConnected, setCanvaConnected] = useState(false)
  const [canvaConnecting, setCanvaConnecting] = useState(false)
  const [canvaError, setCanvaError] = useState<string | null>(null)
  const [canvaLoading, setCanvaLoading] = useState(true)

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
  const oauthCallbackHandled = useRef(false)
  const effectRan = useRef(false)
  const renderCount = useRef(0)

  // Legacy query parameter support for older OAuth callbacks
  const LEGACY_SUCCESS_PARAMS: Record<string, Platform> = {
    facebook_connected: 'facebook',
    twitter_connected: 'twitter',
    linkedin_connected: 'linkedin',
    instagram_connected: 'instagram',
    tiktok_connected: 'tiktok',
    youtube_connected: 'youtube',
  }

  // Adaptive timeouts per platform
  const TIMEOUTS = {
    twitter: 45000, // 45 seconds
    linkedin: 60000, // 60 seconds
    facebook: 90000, // 90 seconds
    instagram: 90000, // 90 seconds
    tiktok: 60000, // 60 seconds
    youtube: 60000, // 60 seconds
  }

  // Load connection status using centralized credentials service
  const loadConnectionStatus = async () => {
    if (!user) return

    try {
      setIsLoading(true)
      const data = await credentialsService.getStatus()
      setStatusInfo(data)
      setConnectedAccounts(extractConnectedSummary(data))
    } catch (error: any) {
      console.error('Failed to load connection status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Check Canva connection status
  const checkCanvaConnection = async () => {
    if (!user?.id) {
      setCanvaLoading(false)
      return
    }
    setCanvaLoading(true)
    try {
      const response = await fetch(`/api/canva/auth/status?user_id=${user.id}`)
      if (response.ok) {
        const data = await response.json()
        setCanvaConnected(data.connected && !data.isExpired)
      } else {
        const data = await response.json()
        setCanvaConnected(!data.needsAuth)
      }
    } catch {
      setCanvaConnected(false)
    } finally {
      setCanvaLoading(false)
    }
  }

  // Handle Canva connect
  const handleCanvaConnect = async () => {
    if (!user?.id) {
      setCanvaError('Please log in to connect Canva')
      return
    }
    setCanvaConnecting(true)
    setCanvaError(null)
    try {
      const response = await fetch(`/api/canva/auth?user_id=${user.id}`)
      const data = await response.json()

      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setCanvaError(data.error || 'Failed to initiate Canva connection')
        setCanvaConnecting(false)
      }
    } catch (error) {
      setCanvaError('Failed to connect to Canva')
      setCanvaConnecting(false)
    }
  }

  // Handle Canva disconnect
  const handleCanvaDisconnect = async () => {
    if (!user?.id) {
      setCanvaError('Please log in to disconnect Canva')
      return
    }
    try {
      const response = await fetch(`/api/canva/disconnect?user_id=${user.id}`, { method: 'POST' })
      if (response.ok) {
        setCanvaConnected(false)
        setCanvaError(null)
      } else {
        setCanvaError('Failed to disconnect Canva')
      }
    } catch (error) {
      setCanvaError('Failed to disconnect Canva')
    }
  }

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  useEffect(() => {
    // Only run the effect if we're not in a loading/unauthorized state
    // This prevents the effect from running when the component will return early
    if (authLoading || userRole !== 'admin') {
      return
    }

    // Check for OAuth callbacks FIRST to determine if we should skip guards
    const urlParams = new URLSearchParams(window.location.search)
    let successPlatform = urlParams.get('oauth_success') as Platform | null
    let errorCode = urlParams.get('oauth_error')

    // Track render count to detect infinite loops
    renderCount.current += 1
    if (renderCount.current > 10) {
      return
    }

    // Strict guard - prevent rapid re-executions
    // BUT: Skip guards if we have OAuth callback parameters (need to process them)
    const hasOAuthCallback = !!(successPlatform || errorCode)

    if (!hasOAuthCallback) {
      const now = Date.now()
      const lastRunKey = 'account_settings_last_run'
      const lastRun = sessionStorage.getItem(lastRunKey)

      // If ran within last 500ms, skip (prevents rapid re-executions)
      // Very short window to prevent infinite loops but allow legitimate navigation
      if (lastRun && (now - parseInt(lastRun)) < 500) {
        return
      }

      // Mark as ran immediately, before any async operations
      sessionStorage.setItem(lastRunKey, now.toString())
    }


    // Support legacy `?platform_connected=true` query params from older callbacks
    if (!successPlatform) {
      for (const [param, platform] of Object.entries(LEGACY_SUCCESS_PARAMS)) {
        if (urlParams.get(param) === 'true') {
          successPlatform = platform
          break
        }
      }
    }

    // Support legacy `?error=...` params
    if (!errorCode) {
      const legacyError = urlParams.get('error')
      if (legacyError) {
        errorCode = legacyError
      }
    }

    // Mark guards as passed for OAuth callbacks
    if (hasOAuthCallback) {
      const now = Date.now()
      effectRan.current = true
      sessionStorage.setItem('account_settings_last_run', now.toString())
    }

    // If no OAuth callback params, just load status normally
    if (!successPlatform && !errorCode) {
      loadConnectionStatus()
      checkCanvaConnection() // Also check Canva connection
      return
    }

    // For OAuth callbacks, check if we've already processed this specific callback
    // Use a combination of the URL params as a unique key
    const callbackKey = `${successPlatform || ''}_${errorCode || ''}`
    const lastProcessedKey = sessionStorage.getItem('last_oauth_callback')

    // If we've already processed this exact callback, just load status and return
    if (lastProcessedKey === callbackKey) {
      loadConnectionStatus()
      return
    }

    // Mark this callback as processed
    sessionStorage.setItem('last_oauth_callback', callbackKey)

    // If there's an error, handle it but still check if connection succeeded
    if (errorCode) {
      // Error - show to user

      // Try to detect platform from URL or error code
      let platform = detectPlatformFromError(errorCode)

      // If we can't detect from error code, check if there's a platform in the URL path
      if (!platform) {
        // Check if this was a callback from a specific platform
        const pathMatch = window.location.pathname.match(/\/settings/)
        if (pathMatch) {
          // For generic errors without platform info, check session storage for which platform was being connected
          const attemptedPlatform = sessionStorage.getItem('attempted_oauth_platform')
          if (attemptedPlatform && ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube'].includes(attemptedPlatform)) {
            platform = attemptedPlatform as Platform
          }
        }
      }

      // For CSRF errors, still check if connection was successful
      // Sometimes the connection succeeds but CSRF check fails due to timing/state issues
      if (errorCode === 'csrf_check_failed' && platform) {
        // Don't set error yet - check status first
        setConnectingPlatform(null)
        // Clean up URL immediately
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=accounts')

        // Clear loading immediately so page can render
        setIsLoading(false)

        // Load status with multiple retries to check if connection succeeded
        const checkConnectionWithRetries = async () => {
          const maxRetries = 3
          const retryDelays = [1000, 2000, 3000] // Total 6 seconds of checking

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
              await new Promise(resolve => setTimeout(resolve, retryDelays[attempt - 1]))
            }

            try {
              if (!user) return
              const status = await credentialsService.getStatus()
              const platformConnected = status[platform]?.isConnected

              if (platformConnected) {
                // Platform is connected! Clear any errors and update state
                setStatusInfo(status)
                setConnectedAccounts(extractConnectedSummary(status))
                setErrors(prev => ({
                  ...prev,
                  [platform]: undefined,
                }))
                return // Success, exit retry loop
              }
            } catch (err) {
              console.error('Failed to check connection status:', err)
            }
          }

          // After all retries, if still not connected, show error
          const errorMessage = mapErrorCode(errorCode)
          setErrors(prev => ({
            ...prev,
            [platform]: errorMessage,
          }))
        }

        // Run the check with retries
        checkConnectionWithRetries()
        return
      }

      // For other errors, show immediately
      if (platform) {
        const errorMessage = mapErrorCode(errorCode)
        setErrors(prev => ({
          ...prev,
          [platform]: errorMessage,
        }))
      } else {
        // Set a generic error if we can't detect platform
        setErrors(prev => ({
          ...prev,
          twitter: mapErrorCode(errorCode),
        }))
      }
      setConnectingPlatform(null)
      // Clean up URL immediately
      window.history.replaceState({}, document.title, window.location.pathname + '?tab=accounts')
      // Clear loading immediately so page can render
      setIsLoading(false)
      // Load status in background without showing loading state
      const loadStatusSilently = async () => {
        try {
          if (!user) return
          const data = await credentialsService.getStatus()
          setStatusInfo(data)
          setConnectedAccounts(extractConnectedSummary(data))
        } catch (err) {
          console.error('Failed to load status silently:', err)
        }
      }
      // Load in background without affecting loading state
      loadStatusSilently()
      return
    }

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
            const platformConnected = data[successPlatform]?.isConnected

            if (platformConnected) {
              // Found credentials! Update state and we're done
              setStatusInfo(data)
              setConnectedAccounts(extractConnectedSummary(data))
              setConnectingPlatform(null)
              break // Exit retry loop
            } else if (attempt === maxRetries - 1) {
              // Last attempt failed - show what we got
              setStatusInfo(data)
              setConnectedAccounts(extractConnectedSummary(data))
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
      window.history.replaceState({}, document.title, window.location.pathname + '?tab=accounts')
      return
    }

    // This should not be reached if we have success/error, but just in case
    if (!oauthCallbackHandled.current) {
      loadConnectionStatus()
    }

    // Cleanup function - reset ref on unmount (though it shouldn't matter)
    return () => {
      // Don't reset effectRan - we want it to persist
      // This cleanup is just for safety
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userRole]) // Include dependencies to re-run when auth state changes

  // CONDITIONAL RETURNS AFTER ALL HOOKS
  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500 mr-2" />
        <span className="text-gray-500">Loading settings...</span>
      </div>
    )
  }

  // Check role - only admins can manage account settings
  if (userRole !== 'admin') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-800">
          <p className="font-semibold">Access Denied</p>
          <p>Only workspace admins can manage account connections.</p>
        </div>
      </div>
    )
  }

  const handleConnect = async (platform: Platform) => {
    setErrors(prev => ({ ...prev, [platform]: undefined }))
    setConnectingPlatform(platform)
    setTimeoutWarnings(new Set())

    // Store which platform is being attempted so we can track errors
    sessionStorage.setItem('attempted_oauth_platform', platform)

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
        const errorData = await response.json()
        throw new Error(errorData.error || errorData.detail || 'Failed to initiate connection')
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
    <div>
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Connected Accounts</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-3">
        <Settings className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Production-Ready Integration</p>
          <p>
            Connect your social media accounts securely. Your credentials are encrypted and
            stored on our servers. Never stored in your browser.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500 mr-2" />
          <span className="text-gray-500">Loading connection status...</span>
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
              <div key={id} className="bg-gray-50 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4 flex-1">
                    <Icon className="w-8 h-8 text-gray-700" />
                    <div className="flex-1">
                      <span className="text-lg font-medium text-gray-900 block">
                        {name}
                      </span>
                      {isConnected && info?.username && (
                        <div className="text-sm text-gray-500">
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
                      {isConnected && info?.connectedAt && (
                        <span className="text-xs text-gray-500 block">
                          Connected: {formatDate(info.connectedAt)}
                        </span>
                      )}
                      {isConnected && info?.expiresAt && (
                        <span className="text-xs text-gray-500">
                          Expires: {formatDate(info.expiresAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {isConnecting ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-semibold text-sm">Connecting...</span>
                    </div>
                  ) : isConnected ? (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center text-green-600">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        <span className="font-semibold text-sm">Connected</span>
                      </div>
                      <button
                        onClick={() => handleDisconnect(id)}
                        className="px-4 py-2 text-sm font-medium bg-gray-500 hover:bg-gray-600 rounded-md text-white transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConnect(id)}
                      className="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-gray-800 rounded-md text-white flex items-center transition-colors"
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

                {/* LinkedIn Company Page Toggle */}
                {id === 'linkedin' && isConnected && info?.organizationId && (
                  <div className="px-4 pb-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-blue-900">Post Destination</p>
                          <p className="text-xs text-blue-700 mt-1">
                            {info.postToPage
                              ? `Posting to: ${info.organizationName || 'Company Page'}`
                              : `Posting to: ${info.profileName || 'Personal Profile'}`
                            }
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/linkedin/toggle-post-target', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ postToPage: !info.postToPage }),
                              })
                              if (response.ok) {
                                loadConnectionStatus()
                              }
                            } catch (err) {
                            }
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${info.postToPage
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-white text-blue-600 border border-blue-300 hover:bg-blue-50'
                            }`}
                        >
                          {info.postToPage ? 'Switch to Personal' : 'Switch to Company Page'}
                        </button>
                      </div>
                      {info.organizationName && (
                        <p className="text-xs text-blue-600 mt-2">
                          Company Page: {info.organizationName}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Facebook Meta Ads Info with Business Portfolio Selector */}
                {id === 'facebook' && isConnected && (
                  <FacebookMetaAdsSection
                    info={info}
                    onBusinessChange={loadConnectionStatus}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Canva Integration Section */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-xl font-bold mb-4 text-gray-900">Design Tools</h3>
        <p className="text-sm text-gray-600 mb-4">
          Connect design tools to create and edit media directly in your workspace.
        </p>

        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <span className="text-lg font-medium text-gray-900 block">
                  Canva
                </span>
                <span className="text-sm text-gray-500">
                  Edit media with Canva's design tools
                </span>
              </div>
            </div>

            {canvaLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Checking...</span>
              </div>
            ) : canvaConnecting ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-semibold text-sm">Connecting...</span>
              </div>
            ) : canvaConnected ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center text-green-600">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span className="font-semibold text-sm">Connected</span>
                </div>
                <button
                  onClick={handleCanvaDisconnect}
                  className="px-4 py-2 text-sm font-medium bg-gray-500 hover:bg-gray-600 rounded-md text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleCanvaConnect}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-md text-white flex items-center transition-colors"
              >
                <Link className="w-4 h-4 mr-2" />
                Connect
              </button>
            )}
          </div>

          {canvaError && (
            <div className="px-4 pb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{canvaError}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          <strong>Security:</strong> Your API credentials are encrypted using AES-256 encryption
          and stored securely on yor servers. We never store them in your browser.
        </p>
      </div>
    </div>
  )
}

// Facebook Meta Ads Section with Business Portfolio Selector
function FacebookMetaAdsSection({ info, onBusinessChange }: { info: any; onBusinessChange: () => void }) {
  const [availableBusinesses, setAvailableBusinesses] = React.useState<any[]>([])
  const [activeBusiness, setActiveBusiness] = React.useState<any>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSwitching, setIsSwitching] = React.useState(false)
  const [showSelector, setShowSelector] = React.useState(false)

  React.useEffect(() => {
    fetchBusinesses()
  }, [])

  const fetchBusinesses = async () => {
    try {
      const response = await fetch('/api/v1/meta-ads/switch-business')
      if (response.ok) {
        const data = await response.json()
        setAvailableBusinesses(data.availableBusinesses || [])
        setActiveBusiness(data.activeBusiness)
      }
    } catch (error) {
    } finally {
      setIsLoading(false)
    }
  }

  const handleSwitchBusiness = async (businessId: string, adAccountId?: string) => {
    setIsSwitching(true)
    try {
      const response = await fetch('/api/v1/meta-ads/switch-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, adAccountId }),
      })

      if (response.ok) {
        const data = await response.json()
        setActiveBusiness({
          id: data.business.id,
          name: data.business.name,
          adAccount: data.adAccount,
        })
        setShowSelector(false)
        onBusinessChange()
      }
    } catch (error) {
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div className="px-4 pb-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Megaphone className="w-4 h-4 text-blue-600" />
          <p className="text-sm font-semibold text-blue-900">Meta Ads</p>
        </div>

        {info?.pageName && (
          <p className="text-xs text-blue-700 mb-1">
            Page: {info.pageName}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading business info...
          </div>
        ) : activeBusiness?.adAccount?.id ? (
          <div className="space-y-2">
            {/* Active Business & Ad Account */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-700">
                  <CheckCircle className="w-3 h-3 inline mr-1" />
                  Ad Account: {activeBusiness.adAccount.name || activeBusiness.adAccount.id}
                </p>
                {activeBusiness.name && (
                  <p className="text-xs text-blue-600">
                    Business: {activeBusiness.name}
                  </p>
                )}
              </div>
              <a
                href="/dashboard/meta-ads"
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Ads Manager
              </a>
            </div>

            {/* Business Selector Toggle */}
            {availableBusinesses.length > 1 && (
              <div className="pt-2 border-t border-blue-200">
                <button
                  onClick={() => setShowSelector(!showSelector)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" />
                  {showSelector ? 'Hide' : 'Switch'} Business Portfolio ({availableBusinesses.length} available)
                </button>

                {showSelector && (
                  <div className="mt-2 space-y-2">
                    {availableBusinesses.map((business) => (
                      <div
                        key={business.id}
                        className={`p-2 rounded border ${business.id === activeBusiness?.id
                          ? 'border-blue-400 bg-blue-100'
                          : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-900">
                              {business.name}
                              {business.id === activeBusiness?.id && (
                                <span className="ml-1 text-green-600">(Active)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {business.adAccounts.length} ad account(s)
                            </p>
                          </div>
                          {business.id !== activeBusiness?.id && (
                            <button
                              onClick={() => handleSwitchBusiness(business.id)}
                              disabled={isSwitching}
                              className="px-2 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                            >
                              {isSwitching ? 'Switching...' : 'Use This'}
                            </button>
                          )}
                        </div>

                        {/* Show ad accounts for this business */}
                        {business.adAccounts.length > 1 && business.id === activeBusiness?.id && (
                          <div className="mt-2 pl-2 border-l-2 border-blue-200">
                            <p className="text-xs text-gray-500 mb-1">Ad Accounts:</p>
                            {business.adAccounts.map((acc: any) => (
                              <div
                                key={acc.id}
                                className={`text-xs py-1 flex items-center justify-between ${acc.id === activeBusiness?.adAccount?.id ? 'text-green-700 font-medium' : 'text-gray-600'
                                  }`}
                              >
                                <span>
                                  {acc.name}
                                  {acc.id === activeBusiness?.adAccount?.id && ' ✓'}
                                </span>
                                {acc.id !== activeBusiness?.adAccount?.id && (
                                  <button
                                    onClick={() => handleSwitchBusiness(business.id, acc.id)}
                                    disabled={isSwitching}
                                    className="text-blue-600 hover:underline"
                                  >
                                    Switch
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-600">
            No Business Portfolio ad account found. Reconnect with ads_management permission to run ads.
          </p>
        )}
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
    oauth_error: 'OAuth error during connection. Please try again.',
    insufficient_permissions: 'Only workspace admins can connect accounts. Contact your admin.',
    no_workspace: 'Workspace error. Please refresh and try again.',
    user_denied: 'You denied the connection request. Please try again if you want to connect.',
    missing_params: 'OAuth parameters missing. Please try again.',
    csrf_check_failed: 'Security verification failed. Please try again.',
    missing_verifier: 'Security token missing. Please restart connection.',
    callback_error: 'Connection callback failed. Please try again.',
    facebook_callback_error: 'Facebook connection callback failed. Please try again.',
    token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
    invalid_scopes: 'Permission scope error. The app may need App Review approval from the platform. Please contact support.',
    facebook_invalid_scopes: 'Facebook permission scope error. The app may need App Review approval. Please contact support.',
    get_pages_failed: 'Failed to retrieve your pages. Ensure you manage at least one Facebook page and try again.',
    facebook_get_pages_failed: 'Failed to retrieve your Facebook pages. Ensure you manage at least one Facebook page and try again.',
    no_pages_found: 'You don\'t manage any Facebook pages. Create or request to manage a page, then try again.',
    facebook_no_pages_found: 'You don\'t manage any Facebook pages. Create a page or request to manage an existing page, then try again.',
    get_account_failed: 'Failed to retrieve your account. Please try again.',
    no_account_found: 'No account found. Please try again.',
    save_failed: 'Failed to save credentials. Please try again.',
    facebook_save_failed: 'Failed to save your Facebook credentials. Please try again.',
    config_missing: 'Platform is not configured. Please contact support.',
  }
  return messages[errorCode] || 'Connection failed. Please try again.'
}

export default AccountSettingsTab
