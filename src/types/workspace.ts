/**
 * Workspace Type Definitions
 * Comprehensive TypeScript types for workspace management, members, and invitations
 * Ensures type safety throughout the workspace management system
 */

// ============================================
// WORKSPACE TYPES
// ============================================

/**
 * Main Workspace interface
 * Represents a workspace - the container for users and their content
 */
export interface Workspace {
  id: string
  name: string
  max_users: number
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

/**
 * Input type for updating workspace settings
 * All fields are optional to allow partial updates
 */
export interface UpdateWorkspaceInput {
  name?: string
  max_users?: number
  settings?: Record<string, any>
}

// ============================================
// MEMBER & ROLE TYPES
// ============================================

/**
 * User roles with hierarchical permissions
 * - admin: Full control, can manage members and settings
 * - editor: Can create and edit content, manage accounts
 * - viewer: Read-only access to workspace data
 */
export type UserRole = 'admin' | 'editor' | 'viewer'

/**
 * Role permissions mapping
 * Defines what each role can do
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    // Admin-only permissions
    'manage_members',
    'change_roles',
    'update_workspace',
    'view_workspace',
    'delete_members',
    'delete_posts',
    'delete_media',
    'manage_credentials',
    // Inherited from editor
    'create_posts',
    'edit_posts',
    'upload_media',
    // Inherited from viewer
    'view_posts',
    'view_media',
  ],
  editor: [
    // Editor permissions
    'create_posts',
    'edit_posts',
    'upload_media',
    // Inherited from viewer
    'view_posts',
    'view_media',
  ],
  viewer: [
    // Viewer permissions (read-only)
    'view_posts',
    'view_media',
  ],
}

/**
 * Workspace member information
 * Represents a user in a workspace with their role and joining date
 */
export interface WorkspaceMember {
  id: string // User ID
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  created_at: string // When they joined workspace
  workspace_id: string
}

/**
 * Input for changing a member's role
 */
export interface UpdateMemberRoleInput {
  userId: string
  newRole: UserRole
}

// ============================================
// INVITATION TYPES
// ============================================

/**
 * Workspace invitation record
 * Tracks sent invitations (both email and shareable links)
 */
export interface WorkspaceInvite {
  id: string
  workspace_id: string
  email: string | null // NULL for shareable links
  role: UserRole
  token: string // Unique cryptographic token
  expires_at: string | null // NULL = never expires
  invited_by: string // User ID who created invite
  status?: 'pending' | 'accepted' | 'revoked' | 'expired' | string
  created_at: string
  updated_at?: string
  used_at: string | null // NULL = not used yet
  used_by: string | null // User ID who accepted
}

/**
 * Input for creating a new invitation
 * Supports both email-specific and shareable link invitations
 */
export interface CreateInviteInput {
  email?: string // Optional: for email-specific invites
  role: UserRole // Required: role for the invitee
  expiresInDays?: number // Optional: 1, 7, 30, or null (never)
}

/**
 * Response from creating an invitation
 * Includes both the invite record and the shareable URL
 */
export interface CreateInviteResponse {
  invite: WorkspaceInvite
  inviteUrl: string
}

/**
 * Input for accepting an invitation
 */
export interface AcceptInviteInput {
  token: string
}

// ============================================
// ACTIVITY LOG TYPES
// ============================================

/**
 * Activity log entry from audit trail
 * Documents all actions taken in the workspace
 */
export interface ActivityLogEntry {
  id: string
  workspace_id: string
  user_id: string
  user_email: string // Denormalized for display
  user_name: string | null
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, any>
  created_at: string
}

/**
 * Filters for querying activity log
 * All fields are optional for flexible querying
 */
export interface ActivityLogFilters {
  userId?: string // Filter by specific user
  action?: string // Filter by action type
  startDate?: string // Filter by date range (ISO string)
  endDate?: string
  limit?: number // Pagination: how many to return (default 50)
  offset?: number // Pagination: starting position (default 0)
}

/**
 * Paginated activity log response
 * Includes data and pagination metadata
 */
export interface PaginatedActivityLog {
  data: ActivityLogEntry[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Generic API response wrapper
 * Used for single-item endpoints
 */
export interface ApiResponse<T> {
  data?: T
  error?: string
}

/**
 * Paginated API response wrapper
 * Used for list endpoints
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/**
 * Generic success response
 * Used for action endpoints (DELETE, etc.)
 */
export interface SuccessResponse {
  success: boolean
}

// ============================================
// UI/COMPONENT TYPES
// ============================================

/**
 * Configuration for role display
 * Used by UI components for rendering
 */
export interface RoleConfig {
  label: string
  color: string
  icon: React.ElementType
  permissions: string[]
  description: string
}

/**
 * Member action event
 * Emitted when user performs action on member
 */
export interface MemberActionEvent {
  type: 'remove' | 'role_change'
  memberId: string
  newRole?: UserRole
}

/**
 * Invite action event
 * Emitted when user performs action on invitation
 */
export interface InviteActionEvent {
  type: 'revoke' | 'resend'
  inviteId: string
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Form validation error
 * Returned by validation functions
 */
export interface ValidationError {
  field: string
  message: string
}

/**
 * Loading state for async operations
 */
export interface AsyncState {
  isLoading: boolean
  error: string | null
  success: boolean
}
