/**
 * Workspace API
 * 
 * API client for workspace management including CRUD operations,
 * team member management, and invitations.
 */

import { get, post, patch, del } from '../client'
import { ENDPOINTS } from '../config'
import type {
  Workspace,
  UpdateWorkspaceRequest,
  WorkspaceMember,
  WorkspaceInvite,
  CreateInviteRequest,
  AcceptInviteRequest,
  InviteDetailsResponse,
  ActivityOptions,
  PaginatedActivityLog,
  WorkspaceInfo,
} from '../types'

// =============================================================================
// WORKSPACE CRUD
// =============================================================================

/**
 * Get current workspace
 * 
 * Retrieves the workspace associated with the authenticated user.
 * 
 * @param workspaceId - Workspace ID
 * @returns Promise resolving to workspace data
 */
export async function getWorkspace(): Promise<Workspace> {
  const result = await get<{ data: Workspace }>(ENDPOINTS.workspace.base)
  if (!result?.data) {
    throw new Error('No workspace data received')
  }
  return result.data
}

/**
 * Update workspace
 * 
 * Updates workspace settings like name and slug.
 * 
 * @param workspaceId - Workspace ID
 * @param updates - Fields to update
 * @returns Promise resolving to updated workspace
 */
export async function updateWorkspace(
  updates: UpdateWorkspaceRequest
): Promise<Workspace> {
  const payload: Record<string, unknown> = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.description !== undefined) payload.description = updates.description
  if (updates.maxMembers !== undefined) payload.maxMembers = updates.maxMembers

  const result = await patch<{ data: Workspace }>(
    ENDPOINTS.workspace.base,
    payload
  )

  if (!result?.data) {
    throw new Error('Failed to update workspace')
  }

  return result.data
}

/**
 * Delete workspace
 * 
 * Permanently deletes a workspace and all associated data.
 * Requires admin role.
 * 
 * @param workspaceId - Workspace ID
 * @returns Promise resolving when deletion is complete
 */
export async function deleteWorkspace(): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(ENDPOINTS.workspace.base)
}

// =============================================================================
// MEMBERS
// =============================================================================

/**
 * Get workspace members
 * 
 * Retrieves all members of the workspace.
 * 
 * @param workspaceId - Workspace ID
 * @returns Promise resolving to list of members
 */
export async function getMembers(): Promise<WorkspaceMember[]> {
  const result = await get<{ data: WorkspaceMember[] }>(
    ENDPOINTS.workspace.members
  )
  return result.data || []
}

/**
 * Remove a member from workspace
 * 
 * Removes a team member from the workspace.
 * Requires admin role.
 * 
 * @param workspaceId - Workspace ID
 * @param memberId - Member ID to remove
 * @returns Promise resolving when removal is complete
 */
export async function removeMember(
  memberId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`${ENDPOINTS.workspace.members}/${memberId}`)
}

/**
 * Update member role (admin only)
 */
export async function updateMemberRole(
  memberId: string,
  role: WorkspaceMember['role']
): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(
    `${ENDPOINTS.workspace.members}/${memberId}/role`,
    { role }
  )
}

// =============================================================================
// INVITATIONS
// =============================================================================

/**
 * Get pending invitations
 * 
 * Retrieves all pending invitations for the workspace.
 * 
 * @param workspaceId - Workspace ID
 * @returns Promise resolving to list of invitations
 */
export async function getInvites(): Promise<WorkspaceInvite[]> {
  const result = await get<{ data: WorkspaceInvite[] }>(
    ENDPOINTS.workspace.invites
  )
  return result.data || []
}

/**
 * Create a new invitation
 * 
 * Invites a user to join the workspace by email.
 * 
 * @param workspaceId - Workspace ID
 * @param invite - Invitation details
 * @returns Promise resolving to created invitation
 */
export async function createInvite(
  invite: CreateInviteRequest
): Promise<{ invite: WorkspaceInvite; inviteUrl: string }> {
  const result = await post<{
    data?: { invite: WorkspaceInvite; inviteUrl: string }
  }>(ENDPOINTS.workspace.invites, {
    email: invite.email,
    role: invite.role,
    expiresInDays: invite.expiresInDays ?? 7,
  })

  if (!result.data) {
    throw new Error('Failed to create invitation')
  }

  return result.data
}

/**
 * Delete an invitation
 * 
 * Cancels a pending invitation.
 * 
 * @param workspaceId - Workspace ID
 * @param inviteId - Invitation ID to delete
 * @returns Promise resolving when deletion is complete
 */
export async function deleteInvite(inviteId: string): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(ENDPOINTS.workspace.invites, {
    params: { inviteId },
  })
}

/**
 * Accept an invitation
 * 
 * Accepts a workspace invitation using the provided token.
 * 
 * @param token - Invitation token
 * @returns Promise resolving when invitation is accepted
 */
export async function acceptInvite(
  token: string
): Promise<{ success: boolean; workspaceId: string }> {
  const request: AcceptInviteRequest = { token }
  return post<{ success: boolean; workspaceId: string }>(
    ENDPOINTS.workspace.acceptInvite,
    request
  )
}

/**
 * Get invitation details by token
 * 
 * Validates an invitation token and retrieves invitation details.
 * 
 * @param token - Invitation token
 * @returns Promise resolving to invitation details
 */
export async function getInviteDetails(token: string): Promise<InviteDetailsResponse> {
  return get<InviteDetailsResponse>(ENDPOINTS.workspace.inviteDetails(token))
}

// =============================================================================
// ACTIVITY
// =============================================================================

/**
 * Get workspace activity log
 * 
 * Retrieves recent activity in the workspace.
 * 
 * @param workspaceId - Workspace ID
 * @param options - Optional filters and pagination
 * @returns Promise resolving to activity entries
 */
export async function getActivity(
  options?: ActivityOptions
): Promise<PaginatedActivityLog> {
  const result = await get<PaginatedActivityLog>(
    ENDPOINTS.workspace.activity,
    {
      params: {
        userId: options?.userId,
        action: options?.action,
        startDate: options?.startDate,
        endDate: options?.endDate,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      },
    }
  )
  return result
}

// =============================================================================
// WORKSPACE INFO
// =============================================================================

/**
 * Get complete workspace info
 * 
 * Retrieves comprehensive workspace information including
 * settings and members.
 * 
 * @param workspaceId - Workspace ID
 * @returns Promise resolving to workspace info
 */
export async function getWorkspaceInfo(): Promise<WorkspaceInfo> {
  return get<WorkspaceInfo>(ENDPOINTS.workspace.info)
}

