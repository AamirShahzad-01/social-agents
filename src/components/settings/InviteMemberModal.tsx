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

      if (result.emailSent === false) {
        addNotification(
          'error',
          'Email Failed',
          'Invite created but email could not be sent. You can copy the invite link.'
        )
      } else {
        addNotification('post_published', 'Invitation Sent', `Invitation sent to ${email}`)
      }

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
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-gradient-to-r from-card to-muted/30">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Invite Team Members
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-teal-600 transition-all hover:scale-110"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-border bg-muted/20">
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 px-6 py-4 font-semibold transition-all flex items-center justify-center gap-2 ${activeTab === 'email'
              ? 'text-teal-600 border-b-2 border-teal-600 bg-card'
              : 'text-muted-foreground hover:text-teal-500 hover:bg-muted/50'
              }`}
          >
            <Mail className="w-5 h-5" />
            Email Invitation
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 px-6 py-4 font-semibold transition-all flex items-center justify-center gap-2 ${activeTab === 'link'
              ? 'text-teal-600 border-b-2 border-teal-600 bg-card'
              : 'text-muted-foreground hover:text-teal-500 hover:bg-muted/50'
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
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all hover:border-teal-400"
                  disabled={isSubmitting}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1.5">
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
                className="w-full px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 transition-all font-semibold disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30"
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
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-4">
                <p className="text-sm text-teal-700 font-medium">
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
                  className="w-full px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 transition-all font-semibold disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30"
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
    <label className="block text-sm font-semibold text-foreground mb-2">
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
          className={`p-4 border-2 rounded-xl transition-all cursor-pointer ${selectedRole === r
            ? 'border-teal-600 bg-gradient-to-br from-teal-50 to-cyan-50 ring-2 ring-teal-600/30 shadow-md'
            : 'border-border hover:border-teal-400 hover:bg-muted/50'
            }`}
        >
          <div className="pointer-events-none flex flex-col items-center">
            <RoleBadge role={r} size="sm" />
            <p className="text-xs text-muted-foreground mt-2 text-center font-medium">
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
    <label className="block text-sm font-semibold text-foreground mb-2">
      Link Expiration
    </label>
    <select
      value={expiresInDays?.toString() || 'never'}
      onChange={(e) =>
        onExpirationChange(e.target.value === 'never' ? null : parseInt(e.target.value))
      }
      className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all hover:border-teal-400"
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
  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 shadow-sm">
    <p className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
      <Check className="w-4 h-4" />
      Invitation link generated:
    </p>
    <div className="flex gap-2">
      <input
        type="text"
        value={link}
        readOnly
        className="flex-1 px-3 py-2.5 bg-white border border-green-300 rounded-xl text-sm font-mono text-foreground focus:outline-none"
      />
      <button
        type="button"
        onClick={onCopy}
        className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all flex items-center gap-2 shadow-md font-semibold hover:scale-105"
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
