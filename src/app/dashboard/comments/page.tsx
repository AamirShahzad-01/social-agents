'use client';

/**
 * Comments Dashboard Page
 * AI-powered comment management with direct reply/delete from UI
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  RefreshCw,
  Bot,
  Send,
  Trash2,
  Instagram,
  Facebook,
  Youtube,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  BookOpen,
  Plus,
  Settings,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

// ============================================================================
// Types
// ============================================================================

interface PendingComment {
  id: string;
  comment_id: string;
  post_id: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  username: string;
  original_comment: string;
  summary: string;
  status: 'pending';
  created_at: string;
}

interface Stats {
  pending: number;
  total: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// Platform Icon Component
// ============================================================================

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'instagram') {
    return <Instagram className="h-3.5 w-3.5 text-pink-500" />;
  }
  if (platform === 'youtube') {
    return <Youtube className="h-3.5 w-3.5 text-red-600" />;
  }
  return <Facebook className="h-3.5 w-3.5 text-blue-600" />;
}

// ============================================================================
// Platform URL Helper
// ============================================================================

function getPlatformUrl(platform: string, postId: string): string {
  if (platform === 'youtube') {
    return `https://www.youtube.com/watch?v=${postId}`;
  }
  if (platform === 'instagram') {
    return `https://www.instagram.com/p/${postId}`;
  }
  if (platform === 'facebook') {
    return `https://www.facebook.com/${postId}`;
  }
  return '#';
}

// ============================================================================
// Main Component
// ============================================================================

export default function CommentsPage() {
  const [comments, setComments] = useState<PendingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  // No filter needed - only pending comments are stored
  const [stats, setStats] = useState<Stats>({ pending: 0, total: 0 });
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const actionButtonBase =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed active:scale-[0.98]';
  const replyButtonStyles = `${actionButtonBase} bg-blue-50 dark:bg-blue-950/50 text-blue-500 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-300 focus-visible:ring-blue-200 border border-blue-100 dark:border-blue-800`;
  const deleteButtonStyles = `${actionButtonBase} bg-red-50 dark:bg-red-950/50 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-300 focus-visible:ring-red-200 border border-red-100 dark:border-red-800`;
  const neutralButtonStyles = `${actionButtonBase} bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:ring-gray-200 border border-gray-100 dark:border-gray-700`;

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch('/api/comments/pending');
      const data = await res.json();
      if (data.success) {
        setComments(data.comments || []);
        setStats(data.stats || { pending: 0, total: 0 });
      }
    } catch (error) {
      toast.error('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Run the AI agent manually
  const runAgent = async () => {
    setRunningAgent(true);
    try {
      const res = await fetch('/api/cron/process-comments', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `✅ Processed! ${data.totalAutoReplied || 0} auto-replied, ${data.totalEscalated || 0} need your attention`,
          { duration: 5000 }
        );
        fetchComments();
      } else {
        toast.error(data.error || 'Failed to process comments');
      }
    } catch (error) {
      toast.error('Failed to run comment agent');
    } finally {
      setRunningAgent(false);
    }
  };

  // Send reply to a comment
  const sendReply = async (comment: PendingComment) => {
    if (!replyText.trim()) {
      toast.error('Please enter a reply');
      return;
    }

    setSendingReply(true);
    try {
      const res = await fetch('/api/comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment.comment_id,
          pendingId: comment.id,
          message: replyText.trim(),
          platform: comment.platform,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Reply sent successfully!');
        setReplyingTo(null);
        setReplyText('');
        fetchComments();
      } else {
        toast.error(data.error || 'Failed to send reply');
      }
    } catch (error) {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  // Delete a comment from the platform
  const deleteComment = async (comment: PendingComment) => {
    if (!confirm('Delete this comment from ' + comment.platform + '?')) return;

    try {
      const res = await fetch('/api/comments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment.comment_id,
          pendingId: comment.id,
          platform: comment.platform,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.hidden ? 'Comment hidden' : 'Comment deleted');
        fetchComments();
      } else {
        toast.error(data.error || 'Failed to delete comment');
      }
    } catch (error) {
      toast.error('Failed to delete comment');
    }
  };

  // Dismiss a comment (remove from list without action)
  const dismissComment = async (id: string) => {
    try {
      await fetch(`/api/comments/pending/${id}`, { method: 'DELETE' });
      toast.success('Comment dismissed');
      fetchComments();
    } catch (error) {
      toast.error('Failed to dismiss comment');
    }
  };

  // Delete all pending comments
  const deleteAllComments = async () => {
    if (!confirm('Clear all pending comments? This cannot be undone.')) return;

    setDeletingAll(true);
    try {
      const res = await fetch('/api/comments/pending/bulk-delete', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Deleted ${data.deleted || 0} comments`);
        fetchComments();
      } else {
        toast.error(data.error || 'Failed to delete comments');
      }
    } catch (error) {
      toast.error('Failed to delete comments');
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-canva-gradient">
      <div className="w-full px-4 py-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg border border-primary/20">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              Inbox
              {stats.pending > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full border border-primary/20">
                  {stats.pending} pending
                </span>
              )}
            </h1>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Comments that need your expertise • AI handles the rest automatically
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowKnowledgeModal(true)}
              className="group flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-all hover:shadow hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Manage Knowledge Base"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Knowledge</span>
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <span className="text-xs font-medium text-foreground">
            {stats.pending} comment{stats.pending !== 1 ? 's' : ''} need{stats.pending === 1 ? 's' : ''} your reply
          </span>
          <button
            onClick={() => fetchComments()}
            className="ml-auto p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-primary/10 transition-all border border-transparent hover:border-primary/20"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Comments List */}
        <div className={comments.length === 0 ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-2.5 bg-primary/10 rounded-full mb-2.5">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Loading comments...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 border border-border/50 rounded-lg bg-card/60 backdrop-blur-sm shadow-sm">
              <div className="w-10 h-10 mx-auto mb-2.5 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20">
                <CheckCircle className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-medium text-sm text-foreground">All caught up!</h3>
              <p className="text-muted-foreground mt-1 max-w-xs mx-auto text-xs">
                No comments need your attention. The AI is handling the rest automatically.
              </p>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="border border-border/40 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:border-border/60 bg-card group"
              >
                {/* Comment Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-background rounded-md border border-border">
                      <PlatformIcon platform={comment.platform} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs text-foreground">{comment.username.startsWith('@') ? comment.username : `@${comment.username}`}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(comment.created_at)}
                        </span>
                      </div>
                      {comment.post_id && (
                        <a
                          href={getPlatformUrl(comment.platform, comment.post_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:text-primary/80 hover:underline font-medium"
                        >
                          View {comment.platform === 'youtube' ? 'Video' : 'Post'}
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-md flex items-center gap-1 border border-primary/20 font-medium">
                    <Clock className="h-2.5 w-2.5" />
                    Needs Reply
                  </span>
                </div>

                {/* AI Summary - Why this needs attention */}
                {comment.summary && (
                  <div className="px-3 py-2 border-b border-border/30 bg-primary/5">
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-md bg-secondary/10 border border-secondary/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-3 w-3 text-secondary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-secondary uppercase tracking-wider">AI Analysis</p>
                        <p className="text-xs text-foreground mt-0.5 leading-relaxed">{comment.summary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Original Comment */}
                <div className="px-3 py-2 bg-card">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Original Comment</p>
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed text-xs">
                    {comment.original_comment}
                  </p>
                </div>

                {/* Actions */}
                <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
                  {replyingTo === comment.id ? (
                    <div className="space-y-2.5">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        className="w-full px-3 py-2 border border-border rounded-lg resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-card shadow-sm text-xs text-foreground placeholder:text-muted-foreground"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => sendReply(comment)}
                          disabled={!replyText.trim() || sendingReply}
                          className={`${replyButtonStyles} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {sendingReply ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Send
                        </button>
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyText('');
                          }}
                          className={neutralButtonStyles}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setReplyingTo(comment.id)}
                        className={replyButtonStyles}
                      >
                        <Send className="h-3 w-3" />
                        Reply
                      </button>
                      <button
                        onClick={() => deleteComment(comment)}
                        className={deleteButtonStyles}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                      <button
                        onClick={() => dismissComment(comment.id)}
                        className={neutralButtonStyles}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Knowledge Base Modal */}
        {showKnowledgeModal && (
          <KnowledgeBaseModal onClose={() => setShowKnowledgeModal(false)} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Knowledge Base Modal Component
// ============================================================================

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  question: string | null;
  answer: string;
  is_active: boolean;
}

function KnowledgeBaseModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState({
    category: 'faq',
    title: '',
    question: '',
    answer: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/comments/knowledge');
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries || []);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const addEntry = async () => {
    if (!newEntry.title || !newEntry.answer) {
      toast.error('Title and answer are required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/comments/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Knowledge added!');
        setNewEntry({ category: 'faq', title: '', question: '', answer: '' });
        setShowAddForm(false);
        fetchEntries();
      } else {
        toast.error(data.error || 'Failed to add knowledge');
      }
    } catch (error) {
      toast.error('Failed to add knowledge');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this knowledge entry?')) return;

    try {
      const res = await fetch(`/api/comments/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Deleted');
        fetchEntries();
      }
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const categories = [
    { value: 'faq', label: 'FAQ' },
    { value: 'pricing', label: 'Pricing' },
    { value: 'shipping', label: 'Shipping' },
    { value: 'returns', label: 'Returns' },
    { value: 'product', label: 'Product Info' },
    { value: 'policy', label: 'Policies' },
    { value: 'support', label: 'Support' },
    { value: 'hours', label: 'Business Hours' },
    { value: 'contact', label: 'Contact Info' },
    { value: 'general', label: 'General' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-xl max-h-[75vh] flex flex-col border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <div className="p-1.5 bg-primary/10 rounded-md border border-primary/20">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
              </div>
              Knowledge Base
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Add info so the AI can answer common questions automatically
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-all border border-transparent hover:border-border"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Add New Button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Knowledge Entry
            </button>
          )}

          {/* Add Form */}
          {showAddForm && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold mb-1 block text-foreground uppercase tracking-wide">Category</label>
                  <select
                    value={newEntry.category}
                    onChange={(e) => setNewEntry({ ...newEntry, category: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md bg-card text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold mb-1 block text-foreground uppercase tracking-wide">Title *</label>
                  <input
                    type="text"
                    value={newEntry.title}
                    onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                    placeholder="e.g., Return Policy"
                    className="w-full px-2 py-1.5 border border-border rounded-md bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1 block text-foreground uppercase tracking-wide">Common Question</label>
                <input
                  type="text"
                  value={newEntry.question}
                  onChange={(e) => setNewEntry({ ...newEntry, question: e.target.value })}
                  placeholder="e.g., What is your return policy?"
                  className="w-full px-2 py-1.5 border border-border rounded-md bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1 block text-foreground uppercase tracking-wide">Answer *</label>
                <textarea
                  value={newEntry.answer}
                  onChange={(e) => setNewEntry({ ...newEntry, answer: e.target.value })}
                  placeholder="The answer the AI should give..."
                  className="w-full px-2 py-1.5 border border-border rounded-md bg-card h-20 resize-none text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addEntry}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow text-xs font-medium"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save Entry'}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-600 dark:hover:text-gray-300 transition-all text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Entries List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="p-2 bg-primary/10 rounded-full mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
              <p className="text-[10px] text-muted-foreground">Loading entries...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 border border-border rounded-lg bg-muted/20">
              <div className="w-10 h-10 mx-auto mb-2 bg-muted rounded-full flex items-center justify-center border border-border">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="font-medium text-xs text-foreground">No knowledge entries yet</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Add FAQs, policies, and product info so the AI can answer automatically.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-border rounded-lg p-3 bg-card shadow-sm hover:shadow transition-shadow duration-200 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium capitalize border border-primary/20">
                          {entry.category}
                        </span>
                        <span className="font-medium text-xs text-foreground">{entry.title}</span>
                      </div>
                      {entry.question && (
                        <p className="text-[10px] text-muted-foreground mb-0.5">
                          <span className="font-medium">Q:</span> {entry.question}
                        </p>
                      )}
                      <p className="text-[10px] text-foreground/80 line-clamp-2 leading-relaxed">{entry.answer}</p>
                    </div>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-destructive/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
