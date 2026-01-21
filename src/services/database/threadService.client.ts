/**
 * Thread Service - Client Side
 * Manages Content Strategist conversation threads
 * Stores chat history in database with full CRUD operations
 * This version uses the browser client for client-side components
 */

import { createClient } from '@/lib/supabase/client'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ContentThread {
  id: string
  workspace_id: string
  title: string
  created_by: string
  created_at: string
  updated_at: string
  lang_thread_id: string
  deleted_at?: string | null
  metadata?: {
    preview?: string
    messageCount?: number
    lastMessageAt?: string
  }
}

export class ThreadService {
  /**
   * Create a new conversation thread with LangGraph thread ID
   * Uses upsert behavior to handle duplicate lang_thread_id gracefully
   */
  static async createThread(
    title: string,
    workspaceId: string,
    userId: string,
    langThreadId: string
  ): Promise<ContentThread> {
    try {
      const supabase = createClient()

      // First, check if a thread with this lang_thread_id already exists
      const { data: existingThread } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('lang_thread_id', langThreadId)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .maybeSingle()

      // If thread exists, return it (prevents duplicate key error)
      if (existingThread) {
        return existingThread as ContentThread
      }

      // Create new thread
      const { data, error } = await (supabase
        .from('content_threads') as any)
        .insert({
          id: crypto.randomUUID(),
          workspace_id: workspaceId,
          title,
          created_by: userId,
          lang_thread_id: langThreadId,
          metadata: {
            preview: title,
            messageCount: 0,
            lastMessageAt: new Date().toISOString()
          }
        })
        .select()
        .single()

      if (error) {
        // Handle race condition - if another request created the thread, fetch it
        if (error.code === '23505') {
          const { data: raceThread } = await (supabase
            .from('content_threads') as any)
            .select('*')
            .eq('lang_thread_id', langThreadId)
            .eq('workspace_id', workspaceId)
            .maybeSingle()

          if (raceThread) {
            return raceThread as ContentThread
          }
        }
        throw error
      }

      return data as ContentThread
    } catch (error) {
      throw error
    }
  }

  /**
   * Update thread metadata (title, preview, message count)
   */
  static async updateThreadMetadata(
    threadId: string,
    workspaceId: string,
    metadata: {
      title?: string
      preview?: string
      messageCount?: number
      lastMessageAt?: string
    }
  ): Promise<void> {
    try {
      const supabase = createClient()

      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (metadata.title) {
        updateData.title = metadata.title
      }

      if (metadata.preview || metadata.messageCount || metadata.lastMessageAt) {
        // Get current metadata first
        const { data: thread } = await (supabase
          .from('content_threads') as any)
          .select('metadata')
          .eq('id', threadId)
          .single()

        updateData.metadata = {
          ...(thread?.metadata || {}),
          ...metadata
        }
      }

      const { error } = await (supabase
        .from('content_threads') as any)
        .update(updateData)
        .eq('id', threadId)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    } catch (error) {
      throw error
    }
  }

  /**
   * Get all active threads in a workspace
   */
  static async getAllThreads(
    workspaceId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ items: ContentThread[]; total: number }> {
    try {
      const supabase = createClient()

      // Get total count
      const { count } = await (supabase
        .from('content_threads') as any)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)

      // Get paginated results
      const { data, error } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      return {
        items: (data || []) as ContentThread[],
        total: count || 0,
      }
    } catch (error) {
      return { items: [], total: 0 }
    }
  }

  /**
   * Get thread by ID
   */
  static async getThreadById(
    id: string,
    workspaceId: string
  ): Promise<ContentThread | null> {
    try {
      const supabase = createClient()

      const { data, error } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .single()

      if (error) throw error

      return (data as ContentThread) || null
    } catch (error) {
      return null
    }
  }

  /**
   * Search threads by title
   */
  static async searchThreads(
    workspaceId: string,
    query: string,
    limit: number = 50
  ): Promise<ContentThread[]> {
    try {
      const supabase = createClient()

      const { data, error } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .ilike('title', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      return (data || []) as ContentThread[]
    } catch (error) {
      return []
    }
  }

  /**
   * Update thread title
   */
  static async updateThreadTitle(
    id: string,
    workspaceId: string,
    title: string
  ): Promise<void> {
    try {
      const supabase = createClient()

      const { error } = await (supabase
        .from('content_threads') as any)
        .update({
          title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    } catch (error) {
      throw error
    }
  }

  /**
   * Fetch conversation messages from LangGraph checkpoints
   */
  static async getThreadMessages(langThreadId: string): Promise<ChatMessage[]> {
    try {
      // Use centralized backend URL config for proper normalization
      const { PYTHON_BACKEND_URL } = await import('@/lib/python-backend/config')
      const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/content/strategist/history?threadId=${langThreadId}`)

      if (!response.ok) {
        if (response.status === 404) {
          // Thread not found in checkpoints, return empty array
          return []
        }
        throw new Error('Failed to fetch thread messages')
      }

      const { messages } = await response.json()
      return messages || []
    } catch (error) {
      throw error
    }
  }

  /**
   * Soft delete thread and delete LangGraph checkpoints
   */
  static async deleteThread(id: string, workspaceId: string): Promise<void> {
    try {
      const supabase = createClient()

      // First, get the lang_thread_id to delete checkpoints
      const { data: thread } = await (supabase
        .from('content_threads') as any)
        .select('lang_thread_id')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single()

      // Delete LangGraph checkpoints from the backend
      if (thread?.lang_thread_id) {
        try {
          const { PYTHON_BACKEND_URL } = await import('@/lib/python-backend/config')
          await fetch(`${PYTHON_BACKEND_URL}/api/v1/deep-agents/threads/${thread.lang_thread_id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId }),
          })
        } catch (e) {
          // Log but don't fail - checkpoints may already be deleted or using in-memory
          console.warn('Failed to delete LangGraph checkpoints:', e)
        }
      }

      // Hard delete the thread metadata
      const { error } = await (supabase
        .from('content_threads') as any)
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    } catch (error) {
      throw error
    }
  }

  /**
   * Restore a deleted thread
   */
  static async restoreThread(id: string, workspaceId: string): Promise<void> {
    try {
      const supabase = createClient()

      const { error } = await (supabase
        .from('content_threads') as any)
        .update({
          deleted_at: null,
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    } catch (error) {
      throw error
    }
  }

  /**
   * Get recently used threads
   */
  static async getRecentThreads(
    workspaceId: string,
    limit: number = 10
  ): Promise<ContentThread[]> {
    try {
      const supabase = createClient()

      const { data, error } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      return (data || []) as ContentThread[]
    } catch (error) {
      return []
    }
  }

  /**
   * Get threads by user
   */
  static async getThreadsByUser(
    workspaceId: string,
    userId: string,
    limit: number = 50
  ): Promise<ContentThread[]> {
    try {
      const supabase = createClient()

      const { data, error } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('created_by', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      return (data || []) as ContentThread[]
    } catch (error) {
      return []
    }
  }

  /**
   * Get thread statistics
   */
  static async getThreadStats(workspaceId: string): Promise<{
    totalThreads: number
    totalMessages: number
    avgMessagesPerThread: number
    recentActivity: string | null
  }> {
    try {
      const supabase = createClient()

      const { data, error } = await (supabase
        .from('content_threads') as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)

      if (error) throw error

      const threads = data || []
      let totalMessages = 0

      threads.forEach((thread: any) => {
        totalMessages += (thread.messages || []).length
      })

      const avgMessages = threads.length > 0 ? totalMessages / threads.length : 0

      return {
        totalThreads: threads.length,
        totalMessages,
        avgMessagesPerThread: Math.round(avgMessages * 100) / 100,
        recentActivity: threads[0]?.updated_at || null,
      }
    } catch (error) {
      return {
        totalThreads: 0,
        totalMessages: 0,
        avgMessagesPerThread: 0,
        recentActivity: null,
      }
    }
  }

  /**
   * Clear old threads (optional cleanup)
   */
  static async clearOldThreads(
    workspaceId: string,
    daysOld: number = 30
  ): Promise<number> {
    try {
      const supabase = createClient()

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const { data, error } = await (supabase
        .from('content_threads') as any)
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .lt('updated_at', cutoffDate.toISOString())

      if (error) throw error

      return data?.length || 0
    } catch (error) {
      return 0
    }
  }
}
