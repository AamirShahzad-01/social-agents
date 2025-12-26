'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { Plus, Trash2, Mail, Link as LinkIcon, Copy, Check } from 'lucide-react'
import { getMembers, getInvites, removeMember, updateMemberRole, deleteInvite } from '@/lib/python-backend/api/workspace'
import type { WorkspaceMember, WorkspaceInvite } from '@/lib/python-backend/types'
import MemberCard from './MemberCard'
import InviteMemberModal from './InviteMemberModal'
import { RoleBadge } from '../ui/RoleBadge'

export default function MembersTab() {
  const { user, workspaceId, userRole } = useAuth()
  const { addNotification } = useNotifications()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const isAdmin = userRole === 'admin'

  // Copy invite link to clipboard
  const handleCopyLink = async (invite: WorkspaceInvite) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const inviteUrl = `${baseUrl}/invite/${invite.token}`

    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedInviteId(invite.id)
      addNotification('post_published', 'Copied', 'Link copied to clipboard!')
      setTimeout(() => setCopiedInviteId(null), 2000)
    } catch (error) {
      addNotification('error', 'Copy Failed', 'Failed to copy link')
    }
  }

  // Load members and pending invites
  useEffect(() => {
    if (!workspaceId) return

    const loadData = async () => {
      try {
        setLoading(true)

        // Load workspace members via Python backend
        const membersData = await getMembers()
        setMembers(membersData)

        // Load pending invites (only if admin)
        if (isAdmin) {
          try {
            const invitesData = await getInvites()
            setPendingInvites(invitesData)
          } catch (e) {
            // User may not have admin access
            console.warn('Could not load invites:', e)
          }
        }
      } catch (error: any) {
        addNotification('error', 'Load Failed', error.message || 'Failed to load workspace members')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [workspaceId, isAdmin, addNotification])

  const handleRemoveMember = async (memberId: string) => {
    if (!workspaceId) return

    const confirmed = confirm('Are you sure you want to remove this member?')
    if (!confirmed) return

    try {
      await removeMember(memberId)
      setMembers(members.filter(m => m.id !== memberId))
      addNotification('post_published', 'Success', 'Member removed successfully')
    } catch (error: any) {
      addNotification('error', 'Failed', error.message || 'Failed to remove member')
    }
  }

  const handleRoleChange = async (memberId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    if (!workspaceId) return

    try {
      await updateMemberRole(memberId, newRole)
      setMembers(members.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      addNotification('post_published', 'Role Updated', 'Member role updated successfully')
    } catch (error: any) {
      addNotification('error', 'Update Failed', error.message || 'Failed to update member role')
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!workspaceId) return

    const confirmed = confirm('Are you sure you want to revoke this invitation?')
    if (!confirmed) return

    try {
      await deleteInvite(inviteId)
      setPendingInvites(pendingInvites.filter(i => i.id !== inviteId))
      addNotification('post_published', 'Revoked', 'Invitation revoked successfully')
    } catch (error: any) {
      addNotification('error', 'Revoke Failed', error.message || 'Failed to revoke invitation')
    }
  }

  const handleInviteSuccess = async () => {
    // Refresh pending invites
    if (isAdmin) {
      try {
        const invitesData = await getInvites()
        setPendingInvites(invitesData)
      } catch (error) {
        // Silently fail - just won't refresh
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading members...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Current Members Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Workspace Members</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
            >
              <Plus size={18} />
              Invite Member
            </button>
          )}
        </div>

        <div className="space-y-3">
          {members.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400">No members yet</p>
            </div>
          ) : (
            members.map(member => (
              <MemberCard
                key={member.id}
                member={member}
                currentUserId={user?.id || ''}
                isAdmin={isAdmin}
                canRemove={isAdmin && member.id !== user?.id}
                isRemoving={false}
                onRemove={() => handleRemoveMember(member.id)}
                onRoleChange={(newRole) => handleRoleChange(member.id, newRole)}
              />
            ))
          )}
        </div>
      </div>

      {/* Pending Invitations Section */}
      {isAdmin && pendingInvites.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Pending Invitations</h2>
          <div className="space-y-3">
            {pendingInvites.map(invite => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    {invite.email ? (
                      <Mail size={20} className="text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <LinkIcon size={20} className="text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {invite.email || 'Shareable Link'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {invite.email ? 'Email invitation' : 'Anyone with link can join'}
                    </p>
                  </div>
                  <RoleBadge role={invite.role} size="sm" />
                </div>

                <div className="flex items-center gap-2">
                  {invite.expires_at && new Date(invite.expires_at).getTime() < new Date().getTime() && (
                    <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                      Expired
                    </span>
                  )}
                  <button
                    onClick={() => handleCopyLink(invite)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Copy invite link"
                  >
                    {copiedInviteId === invite.id ? (
                      <Check size={18} className="text-green-600" />
                    ) : (
                      <Copy size={18} className="text-blue-600" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRevokeInvite(invite.id)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Revoke invitation"
                  >
                    <Trash2 size={18} className="text-red-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <InviteMemberModal
          onClose={() => setIsInviteModalOpen(false)}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  )
}
