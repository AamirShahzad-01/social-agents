'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Loader2,
    Sparkles,
    Video,
    Upload,
    ChevronLeft,
    RefreshCw,
    X,
    Expand,
    Clock,
} from 'lucide-react';
import type { GeneratedKlingVideo } from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface KlingVideoExtendProps {
    onGenerationStarted: (video: GeneratedKlingVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
    recentVideos?: GeneratedKlingVideo[];
}

interface LibraryVideo {
    id: string;
    url: string;
    thumbnail_url?: string;
    prompt?: string;
    video_id?: string;
}

// ============================================================================
// Component
// ============================================================================

export function KlingVideoExtend({
    onGenerationStarted,
    onError,
    isGenerating,
    recentVideos = [],
}: KlingVideoExtendProps) {
    // Video state
    const [selectedVideoId, setSelectedVideoId] = useState('');
    const [selectedVideoPrompt, setSelectedVideoPrompt] = useState('');
    const [showVideoPicker, setShowVideoPicker] = useState(false);
    const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

    // Extension prompt
    const [prompt, setPrompt] = useState('');

    // Filter recent Kling videos that can be extended (completed with videoId)
    const extendableVideos = recentVideos.filter(
        (v) => v.status === 'succeed' && v.videoId
    );

    // Fetch library videos
    const fetchLibraryVideos = useCallback(async () => {
        setIsLoadingLibrary(true);
        try {
            const response = await fetch('/api/ai/media/library?type=video&source=kling');
            if (response.ok) {
                const data = await response.json();
                setLibraryVideos(data.items || []);
            }
        } catch (error) {
            console.error('Failed to fetch library videos:', error);
        } finally {
            setIsLoadingLibrary(false);
        }
    }, []);

    // Handle video selection from recent
    const handleSelectRecentVideo = (video: GeneratedKlingVideo) => {
        if (video.videoId) {
            setSelectedVideoId(video.videoId);
            setSelectedVideoPrompt(video.prompt || 'Video');
        }
    };

    // Handle clear
    const handleClearVideo = () => {
        setSelectedVideoId('');
        setSelectedVideoPrompt('');
    };

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (!selectedVideoId.trim()) {
            onError('Please select a video to extend');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/video-extend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: selectedVideoId.trim(),
                    prompt: prompt.trim() || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start video extension');
            }

            // Create video object for tracking
            const video: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: prompt.trim() || `Extended: ${selectedVideoPrompt}`,
                config: {
                    prompt: prompt.trim() || 'Video extension',
                    model: 'kling-v2-6-pro',
                    aspectRatio: '16:9',
                    duration: '5',
                    generation_mode: 'text',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: true,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-extend');

            // Clear selection after starting
            setSelectedVideoId('');
            setSelectedVideoPrompt('');
            setPrompt('');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to start video extension');
        }
    }, [selectedVideoId, selectedVideoPrompt, prompt, onGenerationStarted, onError]);

    return (
        <div className="space-y-4">
            {/* Video Selection */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Select Video to Extend
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(from Kling generations)</span>
                </Label>

                {selectedVideoId ? (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
                        <div className="w-10 h-10 rounded bg-emerald-500/20 flex items-center justify-center">
                            <Video className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{selectedVideoPrompt}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{selectedVideoId.slice(0, 20)}...</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearVideo}
                            className="h-7 w-7 p-0"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {/* Recent Kling Videos */}
                        {extendableVideos.length > 0 ? (
                            <div className="space-y-1.5">
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Recent Kling Videos
                                </p>
                                <ScrollArea className="h-[140px]">
                                    <div className="grid grid-cols-2 gap-2">
                                        {extendableVideos.map((video) => (
                                            <button
                                                key={video.id}
                                                onClick={() => handleSelectRecentVideo(video)}
                                                disabled={isGenerating}
                                                className="text-left p-2 rounded-lg border bg-card hover:border-emerald-500/50 transition-all group"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                        {video.coverUrl || video.thumbnailUrl ? (
                                                            <img
                                                                src={video.coverUrl || video.thumbnailUrl}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <Video className="w-5 h-5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-medium line-clamp-2">{video.prompt}</p>
                                                        <p className="text-[9px] text-muted-foreground">
                                                            {video.config.duration}s • {video.config.aspectRatio}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        ) : (
                            <div className="py-8 text-center border-2 border-dashed rounded-lg">
                                <Video className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground">No videos available to extend</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">
                                    Generate a video first using Text, Image, or Motion modes
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Continuation Prompt (Optional) */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Continuation Prompt
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(optional)</span>
                </Label>
                <Textarea
                    placeholder="Describe how the video should continue..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="h-20 text-xs resize-none"
                    disabled={isGenerating}
                />
            </div>

            {/* Info */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    ⏱️ <strong>Extend:</strong> Adds 4-5 seconds to your video. You can extend up to 3 minutes total.
                </p>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedVideoId.trim()}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Extending...
                    </>
                ) : (
                    <>
                        <Expand className="w-4 h-4 mr-2" />
                        Extend Video (+4-5s)
                    </>
                )}
            </Button>
        </div>
    );
}

export default KlingVideoExtend;
