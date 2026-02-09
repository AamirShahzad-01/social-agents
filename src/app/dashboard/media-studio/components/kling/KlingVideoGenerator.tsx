'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Video,
    Sparkles,
    Image as ImageIcon,
    Move3D,
    Volume2,
    Mic,
    Images,
    Expand,
} from 'lucide-react';
import { KlingTextToVideo } from './KlingTextToVideo';
import { KlingImageToVideo } from './KlingImageToVideo';
import { KlingMotionControl } from './KlingMotionControl';
import { KlingLipSync } from './KlingLipSync';
import { KlingMultiImage } from './KlingMultiImage';
import { KlingAvatar } from './KlingAvatar';
import { KlingVideoExtend } from './KlingVideoExtend';
import { KlingPreviewPanel } from './KlingPreviewPanel';
import type { GeneratedKlingVideo, GeneratedImage } from '../../types/mediaStudio.types';
import { useMediaLibrary } from '../../hooks/useMediaLibrary';
import { useVideoGeneration } from '@/contexts/VideoGenerationContext';

// ============================================================================
// Types
// ============================================================================

export type KlingMode = 'text' | 'image' | 'motion' | 'lipsync' | 'multi-image' | 'avatar' | 'extend';

interface KlingVideoGeneratorProps {
    onVideoStarted: (video: GeneratedKlingVideo) => void;
    onVideoUpdate: (videoId: string, updates: Partial<GeneratedKlingVideo>) => void;
    recentVideos: GeneratedKlingVideo[];
    recentImages: GeneratedImage[];
}

// ============================================================================
// Mode Configuration
// ============================================================================

const KLING_MODES: { id: KlingMode; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'text', label: 'Text', icon: <Sparkles className="w-3 h-3" />, description: 'From prompt' },
    { id: 'image', label: 'Image', icon: <ImageIcon className="w-3 h-3" />, description: 'Animate' },
    { id: 'multi-image', label: 'Multi', icon: <Images className="w-3 h-3" />, description: 'Images' },
    { id: 'motion', label: 'Motion', icon: <Move3D className="w-3 h-3" />, description: 'Transfer' },
    { id: 'extend', label: 'Extend', icon: <Expand className="w-3 h-3" />, description: '+4-5 sec' },
    { id: 'lipsync', label: 'Lip-Sync', icon: <Mic className="w-3 h-3" />, description: 'Audio sync' },
    { id: 'avatar', label: 'Avatar', icon: <Video className="w-3 h-3" />, description: 'Talking head' },
];

// ============================================================================
// Component
// ============================================================================

export function KlingVideoGenerator({
    onVideoStarted,
    onVideoUpdate,
    recentVideos,
    recentImages,
}: KlingVideoGeneratorProps) {
    const { saveGeneratedMedia, createHistoryEntry, markGenerationFailed, isEnabled: canSaveToDb, workspaceId } = useMediaLibrary();

    // Global video generation context - SINGLE source of truth for polling
    const { startKlingPolling, getJobStatus, activeJobs, completedJobs } = useVideoGeneration();

    // State
    const [mode, setMode] = useState<KlingMode>('text');
    const [currentVideo, setCurrentVideo] = useState<GeneratedKlingVideo | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
    const [generationStartTime, setGenerationStartTime] = useState<number>(0);

    // Refs for tracking state in callbacks
    const currentVideoRef = useRef<GeneratedKlingVideo | null>(null);
    const savedOperationsRef = useRef<Set<string>>(new Set());

    // Keep ref in sync with state
    useEffect(() => {
        currentVideoRef.current = currentVideo;
    }, [currentVideo]);

    // ============================================================================
    // Subscribe to VideoGenerationContext job updates
    // This is the ONLY place where we handle video completion
    // ============================================================================
    useEffect(() => {
        const video = currentVideoRef.current;
        if (!video?.taskId) return;

        const job = getJobStatus(video.taskId);
        if (!job) return;

        // Handle completed job
        if (job.status === 'completed' && job.url) {
            // Prevent duplicate saves using ref
            if (savedOperationsRef.current.has(video.taskId)) {
                return;
            }
            savedOperationsRef.current.add(video.taskId);

            // Update local state
            setCurrentVideo(prev => prev ? {
                ...prev,
                status: 'succeed',
                url: job.url,
                coverUrl: job.coverUrl,
                progress: 100,
            } : null);

            // Notify parent component
            onVideoUpdate(video.taskId, {
                status: 'succeed',
                url: job.url,
                coverUrl: job.coverUrl,
                progress: 100,
            });

            // Save to database (single save per operation)
            if (canSaveToDb && job.url) {
                const genTime = generationStartTime > 0 ? Date.now() - generationStartTime : undefined;

                saveGeneratedMedia({
                    type: 'video',
                    source: `kling-${mode}` as any,
                    url: job.url,
                    prompt: video.prompt,
                    model: video.config.model,
                    config: {
                        ...video.config,
                        kling_task_id: video.taskId,
                    },
                }, currentHistoryId, genTime).then(() => {
                    console.log('[KlingVideoGenerator] Saved to database successfully');
                }).catch(err => {
                    console.error('[KlingVideoGenerator] Failed to save to database:', err);
                });
            }

            setIsGenerating(false);
            setCurrentHistoryId(null);
        }
        // Handle failed job
        else if (job.status === 'failed') {
            setError(job.error || 'Video generation failed');
            setIsGenerating(false);

            if (currentHistoryId) {
                markGenerationFailed(currentHistoryId, job.error || 'Generation failed');
            }
            setCurrentHistoryId(null);

            onVideoUpdate(video.taskId, { status: 'failed', progress: 0 });
        }
        // Handle processing job - update progress
        else if (job.status === 'processing' || job.status === 'in_progress' || job.status === 'pending') {
            setCurrentVideo(prev => prev ? {
                ...prev,
                status: 'processing',
                progress: job.progress
            } : null);
            onVideoUpdate(video.taskId, { status: 'processing', progress: job.progress });
        }
    }, [activeJobs, completedJobs, getJobStatus, onVideoUpdate, canSaveToDb, currentHistoryId, generationStartTime, markGenerationFailed, mode, saveGeneratedMedia]);

    // ============================================================================
    // Handle generation started from child components
    // ============================================================================
    const handleGenerationStarted = useCallback(async (
        video: GeneratedKlingVideo,
        historyAction: string
    ) => {
        setIsGenerating(true);
        setError(null);
        setGenerationStartTime(Date.now());
        setCurrentVideo(video);
        onVideoStarted(video);

        // Clear saved state for this operation (allows retry)
        if (video.taskId) {
            savedOperationsRef.current.delete(video.taskId);
        }

        // Create history entry
        const historyId = canSaveToDb ? await createHistoryEntry({
            type: 'video',
            action: historyAction as any,
            prompt: video.prompt,
            model: video.config.model,
            config: video.config,
        }) : null;
        setCurrentHistoryId(historyId);

        // Start global polling via VideoGenerationContext
        if (video.taskId) {
            startKlingPolling(video.taskId, video.prompt, video.config.model);
        }
    }, [canSaveToDb, createHistoryEntry, onVideoStarted, startKlingPolling]);

    // ============================================================================
    // Handle generation error from child components
    // ============================================================================
    const handleGenerationError = useCallback(async (errorMsg: string) => {
        setError(errorMsg);
        setIsGenerating(false);

        if (currentHistoryId) {
            await markGenerationFailed(currentHistoryId, errorMsg);
        }
        setCurrentHistoryId(null);
    }, [currentHistoryId, markGenerationFailed]);

    // ============================================================================
    // Handle new video
    // ============================================================================
    const handleNewVideo = useCallback(() => {
        setCurrentVideo(null);
        setIsGenerating(false);
        setError(null);
    }, []);

    // ============================================================================
    // Handle video extension
    // ============================================================================
    const handleExtendVideo = useCallback(async (videoId: string) => {
        if (isGenerating) return;

        setIsGenerating(true);
        setError(null);

        try {
            const response = await fetch('/api/ai/media/kling/video-extend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: videoId,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start video extension');
            }

            // Create video object for tracking
            const extendedVideo: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: `Extended from ${videoId}`,
                config: {
                    prompt: 'Video extension',
                    model: currentVideo?.config.model || 'kling-v2-6-pro',
                    aspectRatio: currentVideo?.config.aspectRatio || '16:9',
                    duration: '5',
                    generation_mode: 'text',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: currentVideo?.hasAudio || false,
                taskId: data.task_id,
            };

            // Notify parent and start polling
            onVideoStarted(extendedVideo);
            setCurrentVideo(extendedVideo);

            if (data.task_id) {
                startKlingPolling(data.task_id, `Extension of ${videoId}`, extendedVideo.config.model);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to extend video');
            setIsGenerating(false);
        }
    }, [isGenerating, currentVideo, onVideoStarted, startKlingPolling]);

    // ============================================================================
    // Render
    // ============================================================================
    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Configuration Panel */}
            <Card className="border rounded-xl lg:col-span-3">
                <CardHeader className="p-5 pb-4">
                    <CardTitle className="flex items-center gap-3 text-[15px]">
                        <div className="p-2.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00a080 100%)' }}>
                            <Video className="w-[18px] h-[18px] text-white" />
                        </div>
                        <span className="font-semibold">Kling AI v2.6</span>
                    </CardTitle>
                    <CardDescription className="text-[13px] flex items-center gap-2 mt-1">
                        AI Video Generation with Native Audio
                        <Badge variant="secondary" className="text-[10px] flex items-center gap-1 h-5 px-2">
                            <Volume2 className="w-3 h-3" />
                            Audio
                        </Badge>
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-5">
                    {/* Generation Mode Tabs - Compact */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Mode</label>
                        <div className="grid grid-cols-7 gap-1">
                            {KLING_MODES.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMode(m.id)}
                                    disabled={isGenerating}
                                    className={`h-9 px-1 rounded-md border text-center transition-all ${mode === m.id
                                        ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20 ring-1 ring-emerald-500'
                                        : 'border-[var(--ms-border)] hover:border-emerald-500/50'
                                        } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div className="flex items-center justify-center gap-0.5">
                                        {m.icon}
                                        <span className="font-medium text-[9px] text-foreground">{m.label}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mode-specific content */}
                    {mode === 'text' && (
                        <KlingTextToVideo
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                        />
                    )}

                    {mode === 'image' && (
                        <KlingImageToVideo
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                            recentImages={recentImages}
                            workspaceId={workspaceId}
                        />
                    )}

                    {mode === 'motion' && (
                        <KlingMotionControl
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                            recentImages={recentImages}
                            workspaceId={workspaceId}
                        />
                    )}

                    {mode === 'lipsync' && (
                        <KlingLipSync
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                        />
                    )}

                    {mode === 'multi-image' && (
                        <KlingMultiImage
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                        />
                    )}

                    {mode === 'avatar' && (
                        <KlingAvatar
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                        />
                    )}

                    {mode === 'extend' && (
                        <KlingVideoExtend
                            onGenerationStarted={handleGenerationStarted}
                            onError={handleGenerationError}
                            isGenerating={isGenerating}
                            recentVideos={recentVideos}
                        />
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Preview Panel */}
            <KlingPreviewPanel
                currentVideo={currentVideo}
                isGenerating={isGenerating}
                recentVideos={recentVideos}
                onSelectVideo={setCurrentVideo}
                onNewVideo={handleNewVideo}
                onExtendVideo={handleExtendVideo}
            />
        </div>
    );
}

export default KlingVideoGenerator;
