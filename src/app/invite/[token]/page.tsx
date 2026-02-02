'use client'

// Force dynamic rendering to prevent SSG during build
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AlertCircle, CheckCircle, Loader2, LogIn, Users, Shield, Rocket } from 'lucide-react'
import Link from 'next/link'
import {
  getInviteDetails as getInviteDetailsApi,
  acceptInvite as acceptInviteApi,
} from '@/lib/python-backend/api/workspace'

interface InviteData {
  workspace_id: string
  workspace_name?: string
  email?: string | null
  role: string
  expires_at?: string | null
  is_expired: boolean
  time_remaining?: number
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  // Get token from params (Next.js 15+ async params)
  useEffect(() => {
    const getToken = async () => {
      const resolvedParams = await params
      setToken(resolvedParams.token)
    }
    getToken()
  }, [params])

  // Validate invite token
  useEffect(() => {
    const validateInvite = async () => {
      try {
        setIsLoading(true)

        // Use the Python backend API client
        const result = await getInviteDetailsApi(token!)

        // Transform data to match expected format
        const data: InviteData = {
          workspace_id: result.data.workspace_id,
          workspace_name: result.data.workspace_name,
          email: result.data.email,
          role: result.data.role,
          expires_at: result.data.expires_at,
          is_expired: !result.isValid
        }

        setInviteData(data)

        // Check if already expired
        if (!result.isValid) {
          setError('This invitation has expired or is invalid')
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to validate invitation'
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    if (token) {
      validateInvite()
    }
  }, [token])

  // Handle accept invitation
  const handleAcceptInvite = async () => {
    try {
      setIsAccepting(true)
      setError(null)

      // Use the Python backend API client
      await acceptInviteApi(token!)

      setSuccess(true)

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/')
      }, 2000)
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to accept invitation'
      setError(errorMessage)
    } finally {
      setIsAccepting(false)
    }
  }

  // Show invitation details to everyone (logged in or not)
  // Only require login when they click "Accept"
  const authUrl = `/login?invite=${token}`

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-teal-400 mx-auto mb-4" />
          <p className="text-gray-400">Loading invitation...</p>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#1c1e26] rounded-2xl shadow-2xl p-8 border border-slate-700/50 text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Welcome!
            </h2>
            <p className="text-gray-400 mb-6">
              You've joined the workspace successfully
            </p>
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Redirecting to dashboard...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#1c1e26] rounded-2xl shadow-2xl p-8 border border-slate-700/50">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Invitation Error
            </h2>
            <p className="text-gray-400 text-center mb-6">{error}</p>
            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Main invite acceptance screen - shown to everyone
  return (
    <div className="min-h-screen bg-[#0f1729] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="bg-white p-2 rounded-lg">
            <Rocket className="w-6 h-6 text-slate-900" />
          </div>
          <span className="text-2xl font-bold text-white">Social Agent</span>
        </div>

        {/* Card */}
        <div className="bg-[#1c1e26] rounded-2xl shadow-2xl p-8 border border-slate-700/50">
          <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-teal-400" />
          </div>

          <h2 className="text-2xl font-bold text-white text-center mb-2">You're Invited!</h2>
          <p className="text-gray-400 text-center mb-6">Join the workspace to collaborate</p>

          {inviteData && (
            <>
              {/* Workspace Details */}
              <div className="bg-slate-800/50 rounded-xl p-4 mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Workspace</span>
                  <span className="text-white font-medium">
                    {inviteData.workspace_name || 'Your workspace'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Your Role</span>
                  <span className="px-3 py-1 bg-teal-500/20 text-teal-400 rounded-full text-sm font-medium capitalize">
                    {inviteData.role}
                  </span>
                </div>

                {inviteData.expires_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Expires</span>
                    <span className="text-gray-300 text-sm">
                      {new Date(inviteData.expires_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Show user info if logged in */}
              {user && (
                <div className="bg-slate-800/30 rounded-lg p-3 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-500/20 rounded-full flex items-center justify-center">
                    <span className="text-teal-400 font-medium">
                      {user.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Joining as</p>
                    <p className="text-white text-sm truncate max-w-[200px]">{user.email}</p>
                  </div>
                </div>
              )}

              {/* Accept Button - different behavior based on login status */}
              {user ? (
                <button
                  onClick={handleAcceptInvite}
                  disabled={isAccepting}
                  className="w-full px-6 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Accept & Join Workspace
                    </>
                  )}
                </button>
              ) : (
                <Link
                  href={authUrl}
                  className="w-full px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Sign Up to Accept Invitation
                </Link>
              )}

              {/* Footer text */}
              <p className="text-center text-sm text-gray-500 mt-6">
                {user ? (
                  <>
                    Not you?{' '}
                    <Link href="/" className="text-teal-400 hover:text-teal-300 font-medium">
                      Switch account
                    </Link>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <Link href={authUrl} className="text-teal-400 hover:text-teal-300 font-medium">
                      Sign in instead
                    </Link>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
