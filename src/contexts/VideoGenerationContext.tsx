'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

type VideoProvider = 'sora' | 'veo' | 'kling';

interface VideoJob {
    id: string;
    prompt: string;
    model: string;
    provider: VideoProvider;
    status: 'queued' | 'in_progress' | 'processing' | 'pending' | 'completed' | 'failed';
    progress: number;
    url?: string;
    createdAt: number;
    error?: string;
    // Veo-specific
    operationName?: string;
    veoVideoId?: string;
    // Kling-specific
    coverUrl?: string;
}

interface VideoGenerationContextType {
    activeJobs: VideoJob[];
    completedJobs: VideoJob[];
    startSoraPolling: (videoId: string, prompt: string, model: string) => void;
    startVeoPolling: (operationId: string, operationName: string, prompt: string, model: string) => void;
    startKlingPolling: (taskId: string, prompt: string, model: string) => void;
    getJobStatus: (jobId: string) => VideoJob | undefined;
    clearCompletedJob: (jobId: string) => void;
    isAnyJobProcessing: boolean;
    // Kling-specific job data
    coverUrl?: string;
}

const VideoGenerationContext = createContext<VideoGenerationContextType | undefined>(undefined);

// ============================================================================
// Custom Hook
// ============================================================================

export function useVideoGeneration() {
    const context = useContext(VideoGenerationContext);
    if (!context) {
        throw new Error('useVideoGeneration must be used within VideoGenerationProvider');
    }
    return context;
}

// ============================================================================
// Constants (per official Google Veo 3.1 docs)
// ============================================================================

const MAX_POLLS_SORA = 96;      // 8 minutes at 5s intervals
const MAX_POLLS_VEO = 48;       // 8 minutes at 10s intervals (docs recommend 10s)
const MAX_POLLS_KLING = 60;     // 10 minutes at 10s intervals
const SORA_POLL_INTERVAL = 5000;
const VEO_POLL_INTERVAL = 10000; // Google docs: "checks the job status every 10 seconds"
const KLING_POLL_INTERVAL = 10000; // Kling API polling interval

// ============================================================================
// Provider Component
// ============================================================================

interface VideoGenerationProviderProps {
    children: ReactNode;
}

export function VideoGenerationProvider({ children }: VideoGenerationProviderProps) {
    const [jobs, setJobs] = useState<Map<string, VideoJob>>(new Map());
    const pollIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    const pollCountsRef = useRef<Map<string, number>>(new Map());

    // CRITICAL: Deduplication guards to prevent duplicate downloads
    // This prevents the issue where multiple poll cycles trigger multiple downloads
    const downloadingRef = useRef<Set<string>>(new Set());
    const completedDownloadsRef = useRef<Set<string>>(new Set());

    // ========================================================================
    // Helper: Stop polling for a job
    // ========================================================================
    const stopPolling = useCallback((jobId: string) => {
        const interval = pollIntervalsRef.current.get(jobId);
        if (interval) {
            clearInterval(interval);
            pollIntervalsRef.current.delete(jobId);
        }
        pollCountsRef.current.delete(jobId);
    }, []);

    // ========================================================================
    // Helper: Update job state
    // ========================================================================
    const updateJob = useCallback((jobId: string, updates: Partial<VideoJob>) => {
        setJobs(prev => {
            const newMap = new Map(prev);
            const job = newMap.get(jobId);
            if (job) {
                newMap.set(jobId, { ...job, ...updates });
            }
            return newMap;
        });
    }, []);

    // ========================================================================
    // Helper: Mark job as failed with timeout
    // ========================================================================
    const markJobTimedOut = useCallback((jobId: string) => {
        updateJob(jobId, { status: 'failed', error: 'Generation timed out after 8 minutes' });
        stopPolling(jobId);
    }, [updateJob, stopPolling]);

    // ========================================================================
    // Poll Sora job status
    // ========================================================================
    const pollSoraJob = useCallback(async (videoId: string) => {
        const currentCount = pollCountsRef.current.get(videoId) || 0;
        pollCountsRef.current.set(videoId, currentCount + 1);

        if (currentCount >= MAX_POLLS_SORA) {
            markJobTimedOut(videoId);
            return;
        }

        try {
            const response = await fetch('/api/ai/media/sora/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId }),
            });

            if (!response.ok) return;
            const data = await response.json();

            if (data.success && data.data?.video) {
                const video = data.data.video;

                if (video.status === 'completed') {
                    // Fetch the video data
                    const fetchResponse = await fetch('/api/ai/media/sora/fetch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ videoId }),
                    });

                    if (fetchResponse.ok) {
                        const fetchData = await fetchResponse.json();
                        if (fetchData.success) {
                            updateJob(videoId, {
                                status: 'completed',
                                progress: 100,
                                url: fetchData.data?.videoData,
                            });
                        }
                    }
                    stopPolling(videoId);
                } else if (video.status === 'failed') {
                    updateJob(videoId, {
                        status: 'failed',
                        progress: 0,
                        error: video.error || 'Generation failed',
                    });
                    stopPolling(videoId);
                } else {
                    // Still processing
                    updateJob(videoId, {
                        status: video.status,
                        progress: video.progress || 0,
                    });
                }
            }
        } catch (err) {
            console.error('[VideoGenerationContext] Sora poll error:', err);
        }
    }, [markJobTimedOut, updateJob, stopPolling]);

    // ========================================================================
    // Poll Veo job status (per official Google Veo 3.1 docs)
    // ========================================================================
    const pollVeoJob = useCallback(async (operationId: string, operationName: string) => {
        const currentCount = pollCountsRef.current.get(operationId) || 0;
        pollCountsRef.current.set(operationId, currentCount + 1);

        // Check timeout
        if (currentCount >= MAX_POLLS_VEO) {
            markJobTimedOut(operationId);
            return;
        }

        // Skip if already downloading or completed (deduplication guard)
        if (downloadingRef.current.has(operationId) || completedDownloadsRef.current.has(operationId)) {
            return;
        }

        try {
            const response = await fetch('/api/ai/media/veo/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId, operationName }),
            });

            if (!response.ok) return;
            const data = await response.json();

            if (!data.success) return;

            if (data.done) {
                if (data.status === 'completed' && data.video) {
                    // ============================================================
                    // CRITICAL: Deduplication check before download
                    // This is the single point where downloads are triggered
                    // ============================================================
                    if (downloadingRef.current.has(operationId) || completedDownloadsRef.current.has(operationId)) {
                        console.log(`[VideoGenerationContext] Skipping duplicate download for ${operationId}`);
                        return;
                    }

                    // Mark as downloading to prevent concurrent downloads
                    downloadingRef.current.add(operationId);

                    try {
                        console.log(`[VideoGenerationContext] Starting download for ${operationId}`);

                        const downloadResponse = await fetch('/api/ai/media/veo/download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                veoVideoId: data.video.veoVideoId,
                                operationId,
                                uploadToSupabase: true,
                            }),
                        });

                        const downloadData = await downloadResponse.json();
                        const videoUrl = downloadData.url || data.video.url;

                        // Mark as completed to prevent future duplicate downloads
                        completedDownloadsRef.current.add(operationId);
                        downloadingRef.current.delete(operationId);

                        console.log(`[VideoGenerationContext] Download complete for ${operationId}: ${videoUrl?.substring(0, 60)}...`);

                        // Update job state
                        updateJob(operationId, {
                            status: 'completed',
                            progress: 100,
                            url: videoUrl,
                            veoVideoId: data.video.veoVideoId,
                        });

                        stopPolling(operationId);
                    } catch (downloadError) {
                        console.error('[VideoGenerationContext] Download error:', downloadError);
                        downloadingRef.current.delete(operationId);
                        updateJob(operationId, {
                            status: 'failed',
                            error: 'Failed to download video',
                        });
                        stopPolling(operationId);
                    }
                } else if (data.status === 'failed') {
                    updateJob(operationId, {
                        status: 'failed',
                        progress: 0,
                        error: data.error || 'Generation failed',
                    });
                    stopPolling(operationId);
                }
            } else {
                // Still processing - update progress
                updateJob(operationId, {
                    status: 'processing',
                    progress: data.progress || 50, // Veo doesn't provide granular progress
                });
            }
        } catch (err) {
            console.error('[VideoGenerationContext] Veo poll error:', err);
        }
    }, [markJobTimedOut, updateJob, stopPolling]);

    // ========================================================================
    // Start Sora polling
    // ========================================================================
    const startSoraPolling = useCallback((videoId: string, prompt: string, model: string) => {
        // Prevent duplicate polling for same job
        if (pollIntervalsRef.current.has(videoId)) {
            console.log(`[VideoGenerationContext] Already polling Sora job ${videoId}`);
            return;
        }

        const job: VideoJob = {
            id: videoId,
            prompt,
            model,
            provider: 'sora',
            status: 'queued',
            progress: 0,
            createdAt: Date.now(),
        };

        setJobs(prev => new Map(prev).set(videoId, job));
        pollCountsRef.current.set(videoId, 0);

        // Start polling interval
        const interval = setInterval(() => pollSoraJob(videoId), SORA_POLL_INTERVAL);
        pollIntervalsRef.current.set(videoId, interval);

        // Poll immediately
        pollSoraJob(videoId);
    }, [pollSoraJob]);

    // ========================================================================
    // Start Veo polling (per official Google Veo 3.1 docs)
    // ========================================================================
    const startVeoPolling = useCallback((operationId: string, operationName: string, prompt: string, model: string) => {
        // Prevent duplicate polling for same job
        if (pollIntervalsRef.current.has(operationId)) {
            console.log(`[VideoGenerationContext] Already polling Veo job ${operationId}`);
            return;
        }

        // Clear any previous completion state for this operation (for retries)
        completedDownloadsRef.current.delete(operationId);
        downloadingRef.current.delete(operationId);

        const job: VideoJob = {
            id: operationId,
            prompt,
            model,
            provider: 'veo',
            status: 'pending',
            progress: 0,
            createdAt: Date.now(),
            operationName,
        };

        setJobs(prev => new Map(prev).set(operationId, job));
        pollCountsRef.current.set(operationId, 0);

        // Start polling interval (Google docs: every 10 seconds)
        const interval = setInterval(() => pollVeoJob(operationId, operationName), VEO_POLL_INTERVAL);
        pollIntervalsRef.current.set(operationId, interval);

        // Poll immediately for faster response
        pollVeoJob(operationId, operationName);
    }, [pollVeoJob]);

    // ========================================================================
    // Poll Kling job status
    // ========================================================================
    const pollKlingJob = useCallback(async (taskId: string) => {
        const currentCount = pollCountsRef.current.get(taskId) || 0;
        pollCountsRef.current.set(taskId, currentCount + 1);

        // Check timeout
        if (currentCount >= MAX_POLLS_KLING) {
            markJobTimedOut(taskId);
            return;
        }

        // Skip if already downloading or completed (deduplication guard)
        if (downloadingRef.current.has(taskId) || completedDownloadsRef.current.has(taskId)) {
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_id: taskId }),
            });

            if (!response.ok) return;
            const data = await response.json();

            if (!data.success) return;

            // Kling status: submitted, processing, succeed, failed
            if (data.status === 'succeed' && data.videos && data.videos.length > 0) {
                // CRITICAL: Deduplication check before marking complete
                if (downloadingRef.current.has(taskId) || completedDownloadsRef.current.has(taskId)) {
                    console.log(`[VideoGenerationContext] Skipping duplicate Kling completion for ${taskId}`);
                    return;
                }

                completedDownloadsRef.current.add(taskId);

                const video = data.videos[0];
                console.log(`[VideoGenerationContext] Kling job complete for ${taskId}: ${video.url?.substring(0, 60)}...`);

                updateJob(taskId, {
                    status: 'completed',
                    progress: 100,
                    url: video.url,
                    coverUrl: video.cover_url,
                });

                stopPolling(taskId);
            } else if (data.status === 'failed') {
                updateJob(taskId, {
                    status: 'failed',
                    progress: 0,
                    error: data.message || 'Generation failed',
                });
                stopPolling(taskId);
            } else {
                // Still processing - update progress
                updateJob(taskId, {
                    status: 'processing',
                    progress: 50, // Kling doesn't provide granular progress
                });
            }
        } catch (err) {
            console.error('[VideoGenerationContext] Kling poll error:', err);
        }
    }, [markJobTimedOut, updateJob, stopPolling]);

    // ========================================================================
    // Start Kling polling
    // ========================================================================
    const startKlingPolling = useCallback((taskId: string, prompt: string, model: string) => {
        // Prevent duplicate polling for same job
        if (pollIntervalsRef.current.has(taskId)) {
            console.log(`[VideoGenerationContext] Already polling Kling job ${taskId}`);
            return;
        }

        // Clear any previous completion state for this task (for retries)
        completedDownloadsRef.current.delete(taskId);
        downloadingRef.current.delete(taskId);

        const job: VideoJob = {
            id: taskId,
            prompt,
            model,
            provider: 'kling',
            status: 'pending',
            progress: 0,
            createdAt: Date.now(),
        };

        setJobs(prev => new Map(prev).set(taskId, job));
        pollCountsRef.current.set(taskId, 0);

        // Start polling interval
        const interval = setInterval(() => pollKlingJob(taskId), KLING_POLL_INTERVAL);
        pollIntervalsRef.current.set(taskId, interval);

        // Poll immediately for faster response
        pollKlingJob(taskId);
    }, [pollKlingJob]);

    // ========================================================================
    // Get job status
    // ========================================================================
    const getJobStatus = useCallback((jobId: string) => jobs.get(jobId), [jobs]);

    // ========================================================================
    // Clear completed job
    // ========================================================================
    const clearCompletedJob = useCallback((jobId: string) => {
        setJobs(prev => {
            const newMap = new Map(prev);
            newMap.delete(jobId);
            return newMap;
        });
        // Also clear from completion tracking
        completedDownloadsRef.current.delete(jobId);
    }, []);

    // ========================================================================
    // Cleanup on unmount
    // ========================================================================
    useEffect(() => {
        return () => {
            pollIntervalsRef.current.forEach(interval => clearInterval(interval));
            pollIntervalsRef.current.clear();
            pollCountsRef.current.clear();
            downloadingRef.current.clear();
            completedDownloadsRef.current.clear();
        };
    }, []);

    // ========================================================================
    // Derived state
    // ========================================================================
    const activeJobs = Array.from(jobs.values()).filter(j =>
        j.status === 'queued' || j.status === 'in_progress' || j.status === 'processing' || j.status === 'pending'
    );
    const completedJobs = Array.from(jobs.values()).filter(j =>
        j.status === 'completed' || j.status === 'failed'
    );
    const isAnyJobProcessing = activeJobs.length > 0;

    // ========================================================================
    // Provider
    // ========================================================================
    return (
        <VideoGenerationContext.Provider value={{
            activeJobs,
            completedJobs,
            startSoraPolling,
            startVeoPolling,
            startKlingPolling,
            getJobStatus,
            clearCompletedJob,
            isAnyJobProcessing,
        }}>
            {children}
        </VideoGenerationContext.Provider>
    );
}
