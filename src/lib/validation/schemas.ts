/**
 * COMPREHENSIVE ZODB VALIDATION SCHEMAS
 * All API inputs are validated against these schemas
 * Ensures type safety and data integrity
 */

import { z } from 'zod'

// ============================================================================
// COMMON/SHARED SCHEMAS
// ============================================================================

export const UUIDSchema = z.string().uuid('Invalid UUID format')
export const EmailSchema = z.string().email('Invalid email address')
export const DateSchema = z.string().datetime('Invalid date format')
export const PositiveIntSchema = z.number().int().positive('Must be a positive integer')

export const PlatformTypeSchema = z.enum([
  'twitter',
  'linkedin',
  'facebook',
  'instagram',
  'tiktok',
  'youtube'
])

export const UserRoleSchema = z.enum(['admin', 'editor', 'viewer'])

export const PostStatusSchema = z.enum([
  'ready_to_publish',
  'scheduled',
  'published',
  'failed'
])

export const MediaTypeSchema = z.enum(['image', 'video'])

export const MediaSourceSchema = z.enum(['uploaded', 'ai-generated'])

// ============================================================================
// WORKSPACE SCHEMAS
// ============================================================================

export const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, 'Workspace name is required')
    .max(255, 'Workspace name must be 255 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  logo_url: z.string().url('Invalid logo URL').optional(),
  max_users: z.number().int().min(1).default(10)
})

export const UpdateWorkspaceSchema = CreateWorkspaceSchema.partial()

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const CreateUserSchema = z.object({
  email: EmailSchema,
  full_name: z.string().max(255).optional(),
  avatar_url: z.string().url().optional(),
  phone: z.string().max(20).optional(),
  role: UserRoleSchema.default('viewer')
})

export const UpdateUserSchema = z.object({
  full_name: z.string().max(255).optional(),
  avatar_url: z.string().url().optional(),
  phone: z.string().max(20).optional(),
  role: UserRoleSchema.optional()
})

export const UpdateUserRoleSchema = z.object({
  role: UserRoleSchema
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>

// ============================================================================
// WORKSPACE INVITE SCHEMAS
// ============================================================================

export const CreateWorkspaceInviteSchema = z.object({
  email: EmailSchema.optional(),
  role: UserRoleSchema.default('viewer')
})

export const AcceptWorkspaceInviteSchema = z.object({
  token: z.string().min(1, 'Invalid invite token')
})

export type CreateWorkspaceInviteInput = z.infer<typeof CreateWorkspaceInviteSchema>
export type AcceptWorkspaceInviteInput = z.infer<typeof AcceptWorkspaceInviteSchema>

// ============================================================================
// SOCIAL ACCOUNT SCHEMAS
// ============================================================================

export const ConnectSocialAccountSchema = z.object({
  platform: PlatformTypeSchema,
  code: z.string().min(1, 'Authorization code is required'),
  code_verifier: z.string().optional()
})

export const DisconnectSocialAccountSchema = z.object({
  platform: PlatformTypeSchema
})

export type ConnectSocialAccountInput = z.infer<typeof ConnectSocialAccountSchema>
export type DisconnectSocialAccountInput = z.infer<typeof DisconnectSocialAccountSchema>

// ============================================================================
// POST SCHEMAS
// ============================================================================

export const PostContentSchema = z.object({
  text_content: z.string().max(10000, 'Content is too long').optional(),
  description: z.string().max(500).optional(),
  hashtags: z
    .array(z.string().regex(/^#/, 'Hashtags must start with #'))
    .default([]),
  mentions: z.array(z.string().regex(/@/, 'Mentions must start with @')).default([]),
  call_to_action: z.string().max(255).optional()
})

export const CreatePostSchema = z.object({
  title: z.string().max(255).optional(),
  topic: z.string().max(255).optional(),
  content: PostContentSchema,
  platforms: z.array(PlatformTypeSchema).min(1, 'At least one platform is required'),
  scheduled_at: DateSchema.optional(),
  status: PostStatusSchema.default('ready_to_publish')
})

export const UpdatePostSchema = z.object({
  title: z.string().max(255).optional(),
  topic: z.string().max(255).optional(),
  content: PostContentSchema.optional(),
  platforms: z.array(PlatformTypeSchema).optional(),
  scheduled_at: DateSchema.optional(),
  status: PostStatusSchema.optional()
})

export const PublishPostSchema = z.object({
  platforms: z.array(PlatformTypeSchema).min(1, 'At least one platform is required'),
  scheduled_at: DateSchema.optional()
})

export const SchedulePostSchema = z.object({
  scheduled_at: DateSchema
})

export type PostContentInput = z.infer<typeof PostContentSchema>
export type CreatePostInput = z.infer<typeof CreatePostSchema>
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>
export type PublishPostInput = z.infer<typeof PublishPostSchema>
export type SchedulePostInput = z.infer<typeof SchedulePostSchema>

// ============================================================================
// MEDIA ASSET SCHEMAS
// ============================================================================

export const CreateMediaAssetSchema = z.object({
  name: z.string().min(1, 'Media name is required').max(255),
  description: z.string().max(500).optional(),
  type: MediaTypeSchema,
  source: MediaSourceSchema.default('uploaded'),
  file_url: z.string().url('Invalid file URL'),
  thumbnail_url: z.string().url('Invalid thumbnail URL').optional(),
  file_size: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration_seconds: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  alt_text: z.string().max(255).optional()
})

export const UpdateMediaAssetSchema = CreateMediaAssetSchema.partial()

export type CreateMediaAssetInput = z.infer<typeof CreateMediaAssetSchema>
export type UpdateMediaAssetInput = z.infer<typeof UpdateMediaAssetSchema>

// ============================================================================
// POST-MEDIA RELATIONSHIP SCHEMAS
// ============================================================================

export const AttachMediaToPostSchema = z.object({
  media_asset_id: UUIDSchema,
  position_order: z.number().int().min(0).default(0),
  usage_caption: z.string().max(255).optional()
})

export const DetachMediaFromPostSchema = z.object({
  media_asset_id: UUIDSchema
})

export type AttachMediaToPostInput = z.infer<typeof AttachMediaToPostSchema>
export type DetachMediaFromPostInput = z.infer<typeof DetachMediaFromPostSchema>

// ============================================================================
// AI CONTENT GENERATION SCHEMAS
// ============================================================================

export const GenerateAIContentSchema = z.object({
  topic: z.string().min(5, 'Topic must be at least 5 characters').max(500),
  platforms: z.array(PlatformTypeSchema).min(1, 'At least one platform is required'),
  tone: z
    .enum(['professional', 'casual', 'humorous', 'inspirational', 'urgent', 'friendly'])
    .default('professional'),
  content_type: z
    .enum(['engaging', 'educational', 'promotional', 'storytelling'])
    .default('engaging'),
  hashtags_count: z.number().int().min(0).max(30).default(5),
  include_cta: z.boolean().default(true)
})

export const RefineAIContentSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  instruction: z.string().min(5, 'Instruction must be at least 5 characters').max(500)
})

export type GenerateAIContentInput = z.infer<typeof GenerateAIContentSchema>
export type RefineAIContentInput = z.infer<typeof RefineAIContentSchema>

// ============================================================================
// ANALYTICS SCHEMAS
// ============================================================================

export const FetchAnalyticsSchema = z.object({
  platforms: z.array(PlatformTypeSchema).min(1).optional(),
  start_date: DateSchema.optional(),
  end_date: DateSchema.optional()
})

export type FetchAnalyticsInput = z.infer<typeof FetchAnalyticsSchema>

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional()
})

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20)
})

export type PaginationInput = z.infer<typeof PaginationSchema>
export type CursorPaginationInput = z.infer<typeof CursorPaginationSchema>

// ============================================================================
// SEARCH & FILTER SCHEMAS
// ============================================================================

export const PostSearchSchema = z.object({
  q: z.string().optional(),
  status: PostStatusSchema.optional(),
  platform: PlatformTypeSchema.optional(),
  start_date: DateSchema.optional(),
  end_date: DateSchema.optional(),
  sort_by: z.enum(['created_at', 'scheduled_at', 'engagement_score']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  ...CursorPaginationSchema.shape
})

export type PostSearchInput = z.infer<typeof PostSearchSchema>

// ============================================================================
// ERROR RESPONSE SCHEMAS (for documentation)
// ============================================================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.record(z.string(), z.any()).optional()
})

export const ValidationErrorSchema = z.object({
  error: z.literal('Validation Error'),
  code: z.literal('VALIDATION_ERROR'),
  details: z.record(z.string(), z.array(z.string()))
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type ValidationError = z.infer<typeof ValidationErrorSchema>

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safe parse wrapper with error formatting
 */
export function parseAndValidate<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean
  data?: T
  errors?: Record<string, string[]>
} {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string[]> = {}
      error.issues.forEach((err) => {
        const path = err.path.join('.')
        if (!errors[path]) {
          errors[path] = []
        }
        errors[path].push(err.message)
      })
      return { success: false, errors }
    }
    return { success: false, errors: { general: ['Unknown validation error'] } }
  }
}

/**
 * Safe parse that returns null on validation error
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  try {
    return schema.parse(data)
  } catch {
    return null
  }
}
