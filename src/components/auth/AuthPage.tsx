'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket, Eye, EyeOff, Mail } from 'lucide-react'
import toast from 'react-hot-toast'

interface AuthPageProps {
  inviteToken?: string | null
}

export default function AuthPage({ inviteToken }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(!inviteToken ? 'login' : 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { signIn, signUp, resetPassword } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message)
          toast.error(error.message)
        } else {
          toast.success('Welcome back!')
          // Immediate redirect after successful login
          if (inviteToken) {
            router.push(`/invite/${inviteToken}`)
          } else {
            router.push('/dashboard')
          }
        }
      } else if (mode === 'signup') {
        if (!fullName.trim()) {
          setError('Please enter your full name')
          setLoading(false)
          return
        }

        const { error } = await signUp(email, password, fullName)
        if (error) {
          setError(error.message)
          toast.error(error.message)
        } else {
          toast.success('Account created! Please sign in.')
          setMode('login')
          setPassword('')
          setFullName('')
        }
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(email)
        if (error) {
          setError(error.message)
          toast.error(error.message)
        } else {
          toast.success('Password reset email sent!')
          setMode('login')
        }
      }
    } catch (err) {
      setError('An unexpected error occurred')
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#0f1729] relative overflow-hidden">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/LangChain.mp4" type="video/mp4" />
      </video>

      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10">
        <div className="flex flex-col justify-center p-12 w-full">
          <div className="absolute top-8 left-12 flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg">
              <Rocket className="w-6 h-6 text-slate-900" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Social Agent</span>
          </div>

          <div>
            <div className="text-8xl text-white leading-[1.1] tracking-tight font-serif">
              Multi Agents System for <br />
              Social Media <br />
              Marketing
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-lg">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="bg-white p-2 rounded-lg">
                <Rocket className="w-6 h-6 text-slate-900" />
              </div>
              <span className="text-2xl font-bold text-white">Social Agent</span>
            </div>
          </div>

          {/* Auth Card */}
          <div className="bg-[#1c1e26] rounded-2xl shadow-2xl p-10 border border-slate-700/50 min-h-[520px] flex flex-col justify-center">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white text-center">
                {mode === 'login' && 'Log In'}
                {mode === 'signup' && 'Sign Up'}
                {mode === 'forgot' && 'Reset Password'}
              </h2>
              {mode === 'forgot' && (
                <p className="text-gray-400 text-center mt-2 text-sm">
                  Enter your email and we'll send you a reset link
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-white placeholder-gray-500"
                    required
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-white placeholder-gray-500 text-base"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="w-full px-4 py-3 pr-12 bg-slate-800/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-white placeholder-gray-500 text-base"
                      required
                      disabled={loading}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-lg font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mt-6"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {mode === 'login' && 'Signing in...'}
                    {mode === 'signup' && 'Creating account...'}
                    {mode === 'forgot' && 'Sending email...'}
                  </>
                ) : (
                  <>
                    {mode === 'login' && 'Continue'}
                    {mode === 'signup' && 'Create Account'}
                    {mode === 'forgot' && 'Send Reset Link'}
                  </>
                )}
              </button>
            </form>

            {/* Mode Toggle */}
            <div className="mt-6 text-center space-y-2">
              {mode === 'login' && (
                <>
                  <button
                    onClick={() => { setMode('signup'); setError(null) }}
                    disabled={loading}
                    className="text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
                  >
                    Don't have an account? Sign up
                  </button>
                  <br />
                  <button
                    onClick={() => { setMode('forgot'); setError(null) }}
                    disabled={loading}
                    className="text-sm text-teal-500 hover:text-teal-400 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <button
                  onClick={() => { setMode('login'); setError(null) }}
                  disabled={loading}
                  className="text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
                >
                  Already have an account? Log in
                </button>
              )}
              {mode === 'forgot' && (
                <button
                  onClick={() => { setMode('login'); setError(null) }}
                  disabled={loading}
                  className="text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
                >
                  Back to login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
