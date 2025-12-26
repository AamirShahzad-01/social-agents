'use client'

import React, { useState } from 'react'
import { X, Mail, Link as LinkIcon, Copy, Check, Loader2 } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationContext'
import { createInvite } from '@/lib/python-backend/api/workspace'
import { RoleBadge } from '@/components/ui/RoleBadge'

type UserRole = 'admin' | 'editor' | 'viewer'

interface InviteMemberModalProps {
  onClose: () => void
  onSuccess: () => void
}

/**
 * Invite Member Modal
 * Modal dialog for inviting members via email or shareable link
 * Features:
 * - Email-specific invitations
 * - Shareable links
 * - Role selection with visual badges
 * - Expiration settings
 */
export default function InviteMemberModal({
  onClose,
  onSuccess,
}: InviteMemberModalProps) {
  const { addNotification } = useNotifications()
  
  // Email invitation state
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('editor')
  const [expiresInDays, setExpiresInDays] = useState<number | null>(7)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Shareable link state
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<'email' | 'link'>('email')

  /**
   * Close modal and reset all state
   */
  const handleClose = () => {
    setEmail('')
    setRole('editor')
    setExpiresInDays(7)
    setGeneratedLink(null)
    setLinkCopied(false)
    setActiveTab('email')
    setIsSubmitting(false)
    onClose()
  }

  /**
   * Send email invitation
   */
  const handleEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      addNotification('error', 'Email Required', 'Please enter an email address')
      return
    }

    if (!email.includes('@')) {
      addNotification('error', 'Invalid Email', 'Please enter a valid email address')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await createInvite({
        email,
        role,
        expiresInDays: expiresInDays || undefined,
      })

      addNotification('post_published', 'Invitation Sent', `Invitation sent to ${email}`)
      setGeneratedLink(result.inviteUrl)
      onSuccess()

      // Reset email form
      setEmail('')
    } catch (error: any) {
      addNotification('error', 'Invitation Failed', error.message || 'Failed to send invitation')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Generate shareable link
   */
  const handleGenerateLink = async () => {
    setIsSubmitting(true)

    try {
      const result = await createInvite({
        role,
        expiresInDays: expiresInDays || undefined,
      })

      setGeneratedLink(result.inviteUrl)
      addNotification('post_published', 'Link Generated', 'Invite link generated successfully')
      onSuccess()
    } catch (error: any) {
      addNotification('error', 'Generation Failed', error.message || 'Failed to generate link')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Copy link to clipboard
   */
  const handleCopyLink = async () => {
    if (!generatedLink) return

    try {
      await navigator.clipboard.writeText(generatedLink)
      setLinkCopied(true)
      addNotification('post_published', 'Copied', 'Link copied to clipboard')

      setTimeout(() => setLinkCopied(false), 2000)
    } catch (error) {
      addNotification('error', 'Copy Failed', 'Failed to copy link to clipboard')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Invite Team Members
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'email'
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Mail className="w-5 h-5" />
            Email Invitation
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'link'
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <LinkIcon className="w-5 h-5" />
            Shareable Link
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'email' ? (
            // EMAIL TAB
            <form onSubmit={handleEmailInvite} className="space-y-6">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={isSubmitting}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  An invitation email will be sent to this address with a secure link
                </p>
              </div>

              {/* Role Selection */}
              <RoleSelector selectedRole={role} onRoleChange={setRole} />

              {/* Expiration */}
              <ExpirationSelector
                expiresInDays={expiresInDays}
                onExpirationChange={setExpiresInDays}
              />

              {/* Generated Link Display */}
              {generatedLink && (
                <GeneratedLinkDisplay
                  link={generatedLink}
                  onCopy={handleCopyLink}
                  copied={linkCopied}
                />
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    Send Invitation
                  </>
                )}
              </button>
            </form>
          ) : (
            // LINK TAB
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Generate a shareable link that anyone can use to join your workspace.
                  No email required!
                </p>
              </div>

              <RoleSelector selectedRole={role} onRoleChange={setRole} />
              <ExpirationSelector expiresInDays={expiresInDays} onExpirationChange={setExpiresInDays} />

              {generatedLink ? (
                <GeneratedLinkDisplay link={generatedLink} onCopy={handleCopyLink} copied={linkCopied} />
              ) : (
                <button
                  onClick={handleGenerateLink}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-5 h-5" />
                      Generate Invite Link
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Role Selector Component
 */
interface RoleSelectorProps {
  selectedRole: UserRole
  onRoleChange: (role: UserRole) => void
}

const RoleSelector: React.FC<RoleSelectorProps> = ({
  selectedRole,
  onRoleChange,
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
      Role <span className="text-red-500">*</span>
    </label>
    <div className="grid grid-cols-3 gap-3">
      {(['admin', 'editor', 'viewer'] as UserRole[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRoleChange(r)
          }}
          className={`p-3 border-2 rounded-lg transition-all cursor-pointer ${
            selectedRole === r
              ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-600/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <div className="pointer-events-none flex flex-col items-center">
            <RoleBadge role={r} size="sm" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              {r === 'admin' && 'Full control'}
              {r === 'editor' && 'Create & edit'}
              {r === 'viewer' && 'View only'}
            </p>
          </div>
        </button>
      ))}
    </div>
  </div>
)

/**
 * Expiration Selector Component
 */
interface ExpirationSelectorProps {
  expiresInDays: number | null
  onExpirationChange: (days: number | null) => void
}

const ExpirationSelector: React.FC<ExpirationSelectorProps> = ({
  expiresInDays,
  onExpirationChange,
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
      Link Expiration
    </label>
    <select
      value={expiresInDays?.toString() || 'never'}
      onChange={(e) =>
        onExpirationChange(e.target.value === 'never' ? null : parseInt(e.target.value))
      }
      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    >
      <option value="1">24 hours</option>
      <option value="7">7 days</option>
      <option value="30">30 days</option>
      <option value="never">Never expires</option>
    </select>
  </div>
)

/**
 * Generated Link Display Component
 */
interface GeneratedLinkDisplayProps {
  link: string
  onCopy: () => void
  copied: boolean
}

const GeneratedLinkDisplay: React.FC<GeneratedLinkDisplayProps> = ({
  link,
  onCopy,
  copied,
}) => (
  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
    <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
      Invitation link generated:
    </p>
    <div className="flex gap-2">
      <input
        type="text"
        value={link}
        readOnly
        className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded text-sm font-mono text-gray-900 dark:text-gray-100"
      />
      <button
        type="button"
        onClick={onCopy}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy
          </>
        )}
      </button>
    </div>
  </div>
)
