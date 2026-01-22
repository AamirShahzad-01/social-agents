'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Post, Platform } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { publishingService } from '@/services/publishingService';
import { postsApi } from '@/lib/python-backend';
import { credentialsService } from '@/services/credentialsService';
import { extractConnectedSummary } from '@/types/credentials';

interface DashboardContextType {
    posts: Post[];
    loading: boolean;
    initialLoading: boolean;
    connectedAccounts: Record<Platform, boolean>;
    isApiKeyReady: boolean;
    addPost: (post: Post) => Promise<void>;
    addMultiplePosts: (posts: Post[]) => Promise<void>;
    updatePost: (post: Post) => Promise<void>;
    deletePost: (postId: string, postTitle?: string) => Promise<void>;
    publishPost: (post: Post) => Promise<void>;
    refreshData: () => Promise<void>;
    checkAndSetApiKey: () => Promise<void>;
    handleSelectKey: () => Promise<void>;
    resetApiKeyStatus: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
    const { user, workspaceId } = useAuth();
    const { addNotification } = useNotifications();

    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false); // For manual refresh loading indicator
    const [initialLoading, setInitialLoading] = useState(true); // For initial data load
    const dataLoadedRef = useRef(false);
    const currentWorkspaceRef = useRef<string | null>(null);

    const [connectedAccounts, setConnectedAccounts] = useState<Record<Platform, boolean>>({
        twitter: false,
        linkedin: false,
        facebook: false,
        instagram: false,
        tiktok: false,
        youtube: false
    });

    const [isApiKeyReady, setIsApiKeyReady] = useState(false);

    // --- Data Loading ---

    const loadData = useCallback(async (force = false) => {
        if (!user || !workspaceId) {
            // Don't keep showing loading if there's no user/workspace
            setInitialLoading(false);
            return;
        }

        // Only load data once per workspace unless forced
        if (!force && dataLoadedRef.current && currentWorkspaceRef.current === workspaceId) {
            return;
        }

        try {
            // Show loading spinner on manual refresh
            if (force) {
                setLoading(true);
            }

            // Load posts and credentials status in parallel using Python backend
            const [postsData, accountsStatus] = await Promise.all([
                postsApi.getPosts(user.id, workspaceId),
                credentialsService.getStatusSafe()
            ]);

            // Map connection status to account summary using centralized helper
            const accountsSummary = extractConnectedSummary(accountsStatus);

            setPosts(Array.isArray(postsData) ? (postsData as unknown as Post[]) : []);
            setConnectedAccounts(accountsSummary);

            dataLoadedRef.current = true;
            currentWorkspaceRef.current = workspaceId;
        } catch (error: any) {
            console.error('Failed to load dashboard data:', error);
            addNotification('error', 'Load Error', error.message || 'Failed to load dashboard data');
        } finally {
            setInitialLoading(false);
            if (force) {
                setLoading(false);
            }
        }
    }, [user, workspaceId, addNotification]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // --- API Key Management ---

    const checkAndSetApiKey = useCallback(async () => {
        if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
            setIsApiKeyReady(true);
        } else {
            setIsApiKeyReady(false);
        }
    }, []);

    useEffect(() => {
        checkAndSetApiKey();
    }, [checkAndSetApiKey]);

    const handleSelectKey = useCallback(async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            setIsApiKeyReady(true);
        }
    }, []);

    // --- Post Actions ---

    const addPost = useCallback(async (post: Post) => {
        setPosts((prev) => [post, ...prev]);

        if (user && workspaceId) {
            try {
                // Use Python backend API
                await postsApi.createPost(user.id, {
                    workspaceId,
                    post: {
                        topic: post.topic,
                        platforms: post.platforms,
                        content: post.content as any,
                        scheduledAt: post.scheduledAt,
                        status: post.status,
                    }
                });

                addNotification('post_scheduled', 'New Post Created', `Post "${post.topic}" ready for publishing.`, post.id);
            } catch (error: any) {
                console.error('Failed to create post:', error);
                addNotification('error', 'Save Error', error.message || 'Failed to save post');
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
            }
        }
    }, [user, workspaceId, addNotification]);

    const addMultiplePosts = useCallback(async (newPosts: Post[]) => {
        // Optimistically add posts to UI
        setPosts((prev) => [...newPosts, ...prev]);

        if (user && workspaceId) {
            try {
                // Use Promise.all for parallel requests using Python backend
                const results = await Promise.allSettled(
                    newPosts.map(post =>
                        postsApi.createPost(user.id, {
                            workspaceId,
                            post: {
                                topic: post.topic,
                                platforms: post.platforms,
                                content: post.content as any,
                                scheduledAt: post.scheduledAt,
                                status: post.status,
                            }
                        })
                    )
                );

                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;

                if (failed > 0) {
                    addNotification('error', 'Partial Save', `${succeeded} posts saved, ${failed} failed.`);
                } else {
                    addNotification('post_scheduled', 'Posts Created', `${newPosts.length} posts ready for publishing.`);
                }
            } catch (error: any) {
                console.error('Failed to create posts:', error);
                addNotification('error', 'Save Error', error.message || 'Failed to save posts');
            }
        }
    }, [user, workspaceId, addNotification]);

    const updatePost = useCallback(async (updatedPost: Post) => {
        setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));

        if (user && workspaceId) {
            try {
                // Use Python backend API
                await postsApi.updatePost(user.id, updatedPost.id, {
                    workspaceId,
                    post: {
                        topic: updatedPost.topic,
                        platforms: updatedPost.platforms,
                        content: updatedPost.content as any,
                        scheduledAt: updatedPost.scheduledAt,
                        status: updatedPost.status,
                    }
                });

                addNotification('post_scheduled', 'Post Updated', `"${updatedPost.topic}" updated.`);
            } catch (error: any) {
                console.error('Failed to update post:', error);
                addNotification('error', 'Update Error', error.message || 'Failed to save changes');
            }
        }
    }, [user, workspaceId, addNotification]);

    const deletePost = useCallback(async (postId: string, postTitle?: string) => {
        setPosts((prev) => prev.filter((p) => p.id !== postId));

        if (user && workspaceId) {
            try {
                // Use Python backend API
                await postsApi.deletePost(user.id, postId, workspaceId);

                addNotification('post_scheduled', 'Post Deleted', 'Post removed.');
            } catch (error: any) {
                console.error('Failed to delete post:', error);
                addNotification('error', 'Delete Error', error.message || 'Failed to delete post');
            }
        }
    }, [user, workspaceId, addNotification]);

    const publishPost = useCallback(async (post: Post) => {
        try {
            const validation = publishingService.validatePostForPublishing(post);
            if (!validation.valid) {
                addNotification('error', 'Validation Error', validation.errors?.join(', ') || 'Validation failed');
                return;
            }

            const results = await publishingService.publishPost(post);
            const successCount = results.filter((r) => r.success).length;
            const failedResults = results.filter((r) => !r.success);

            // Log detailed results for debugging

            // Only proceed if at least one platform succeeded
            if (successCount === 0) {
                const errorMessages = failedResults.map(r => `${r.platform}: ${r.error}`).join(', ');
                addNotification('error', 'Publishing Failed', errorMessages || 'Failed to publish to any platform');
                return; // Don't delete the post if all platforms failed
            }

            // Activity is automatically logged by the Python backend when posts are published

            // Only delete post if at least one platform succeeded
            await deletePost(post.id, post.topic);

            // Refresh posts list after successful publish and delete
            await loadData(true);

            addNotification('post_published', 'Post Published', `Posted to ${successCount}/${results.length} platforms`, post.id);
        } catch (error) {
            addNotification('error', 'Publishing Error', 'Failed to publish post');
        }
    }, [user, workspaceId, deletePost, addNotification, loadData]);

    // --- Polling Logic (Video & Schedule) ---

    const postsRef = useRef(posts);
    useEffect(() => {
        postsRef.current = posts;
    }, [posts]);

    const pollVideoStatuses = useCallback(() => {
        const videoPosts = postsRef.current.filter(
            p => p.isGeneratingVideo &&
                p.videoOperation?.id &&
                p.videoOperation?.status !== 'completed' &&
                p.videoOperation?.status !== 'failed'
        );

        if (videoPosts.length === 0) return;

        Promise.allSettled(
            videoPosts.map(post =>
                fetch('/api/ai/media/video/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoId: post.videoOperation.id }),
                }).then(res => res.json().then(data => ({ post, data })))
            )
        ).then(results => {
            results.forEach(async (result) => {
                if (result.status === 'rejected') return;

                const { post, data } = result.value;
                const updatedVideo = data.data.video;

                if (updatedVideo.status === 'completed') {
                    try {
                        const fetchResponse = await fetch('/api/ai/media/video/fetch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ videoId: updatedVideo.id }),
                        });
                        const { data: videoData } = await fetchResponse.json();
                        const videoUrl = videoData.videoData;

                        setPosts(prev => prev.map(p => p.id === post.id ? {
                            ...p,
                            generatedVideoUrl: videoUrl,
                            isGeneratingVideo: false,
                            videoGenerationStatus: 'Completed!',
                            videoOperation: updatedVideo
                        } : p));

                        addNotification('video_complete', 'Video Ready', `Video for "${post.topic}" is ready!`, post.id);
                    } catch (error) {
                        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isGeneratingVideo: false, videoGenerationStatus: 'Failed.' } : p));
                    }
                } else if (updatedVideo.status === 'failed') {
                    setPosts(prev => prev.map(p => p.id === post.id ? {
                        ...p,
                        isGeneratingVideo: false,
                        videoGenerationStatus: `Failed: ${updatedVideo.error?.message || 'Error'}`,
                        videoOperation: updatedVideo
                    } : p));
                } else {
                    setPosts(prev => prev.map(p => p.id === post.id ? {
                        ...p,
                        videoGenerationStatus: `Processing... ${updatedVideo.progress || 0}%`,
                        videoOperation: updatedVideo
                    } : p));
                }
            });
        });
    }, []);

    // Note: Scheduled post publishing is handled server-side by an external cron trigger.
    // In this codebase the canonical endpoint is the Python backend:
    //   GET /api/v1/cron/publish-scheduled (called by cron-job.org)
    // See docs/SCHEDULED_PUBLISHING.md for end-to-end flow.

    // Track which failed posts we've already notified about
    const notifiedFailedPostsRef = useRef<Set<string>>(new Set());

    // Check for newly failed posts and show notifications
    const checkForFailedPosts = useCallback(() => {
        const failedPosts = postsRef.current.filter(
            (post) => post.status === 'failed' && !notifiedFailedPostsRef.current.has(post.id)
        );

        for (const post of failedPosts) {
            // Get error message from post
            const publishLog = (post.content as any)?._publishLog;
            const errorMessage = publishLog?.error || (post as any).publish_error || 'Unknown error';

            addNotification(
                'post_failed',
                'Scheduled Post Failed',
                `"${post.topic?.substring(0, 50)}${post.topic?.length > 50 ? '...' : ''}" failed to publish: ${errorMessage}`,
                post.id
            );

            // Mark as notified
            notifiedFailedPostsRef.current.add(post.id);
        }
    }, [addNotification]);

    // Poll for post status changes (failed posts, deleted/published posts)
    const pollPostStatuses = useCallback(async () => {
        if (!workspaceId || !user) return;

        try {
            // Use Python backend API
            const freshPosts = await postsApi.getPosts(user.id, workspaceId) as unknown as Post[];

            // Check for status changes and deletions
            const currentPostsMap = new Map(postsRef.current.map(p => [p.id, p]));
            const freshPostIds = new Set(freshPosts.map((p: Post) => p.id));

            // Check for deleted posts (scheduled posts that were published and deleted)
            for (const currentPost of postsRef.current) {
                if (currentPost.status === 'scheduled' && !freshPostIds.has(currentPost.id)) {
                    // Post was deleted, likely because it was published
                    addNotification(
                        'post_published',
                        'Scheduled Post Published!',
                        `"${currentPost.topic?.substring(0, 50)}" was published successfully`,
                        currentPost.id
                    );
                }
            }

            // Check for status changes in existing posts
            for (const freshPost of freshPosts) {
                const currentPost = currentPostsMap.get(freshPost.id);

                if (currentPost) {
                    // Check if post just failed
                    if (currentPost.status === 'scheduled' && freshPost.status === 'failed') {
                        const publishLog = (freshPost.content as any)?._publishLog;
                        const errorMessage = publishLog?.error || (freshPost as any).publish_error || 'Unknown error';

                        addNotification(
                            'post_failed',
                            'Scheduled Post Failed',
                            `"${freshPost.topic?.substring(0, 50)}" failed: ${errorMessage}`,
                            freshPost.id
                        );
                        notifiedFailedPostsRef.current.add(freshPost.id);
                    }
                }
            }

            // Update posts state
            setPosts(freshPosts);
        } catch (error) {
            console.error('Failed to poll post statuses:', error);
        }
    }, [user, workspaceId, addNotification]);

    useEffect(() => {
        if (!user || !workspaceId || !dataLoadedRef.current) return;

        // Poll for video generation status
        const videoPollInterval = setInterval(pollVideoStatuses, 15000);

        // Poll for post status changes (scheduled -> published/failed) every 15 minutes
        const postStatusInterval = setInterval(pollPostStatuses, 15 * 60 * 1000);

        // Initial check for failed posts
        checkForFailedPosts();

        return () => {
            clearInterval(videoPollInterval);
            clearInterval(postStatusInterval);
        };
    }, [user, workspaceId, pollVideoStatuses, pollPostStatuses, checkForFailedPosts]);

    const value = useMemo(() => ({
        posts,
        loading,
        initialLoading,
        connectedAccounts,
        isApiKeyReady,
        addPost,
        addMultiplePosts,
        updatePost,
        deletePost,
        publishPost,
        refreshData: () => loadData(true),
        checkAndSetApiKey,
        handleSelectKey,
        resetApiKeyStatus: () => setIsApiKeyReady(false)
    }), [
        posts, loading, initialLoading, connectedAccounts, isApiKeyReady,
        addPost, addMultiplePosts, updatePost, deletePost, publishPost,
        loadData, checkAndSetApiKey, handleSelectKey
    ]);

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard() {
    const context = useContext(DashboardContext);
    if (context === undefined) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
}
