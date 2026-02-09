'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Loader2,
    Sparkles,
    Video,
    Music,
    Upload,
    ChevronLeft,
    RefreshCw,
    X,
    AlertCircle,
} from 'lucide-react';
import type { GeneratedKlingVideo } from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface KlingLipSyncProps {
    onGenerationStarted: (video: GeneratedKlingVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
}

interface LibraryVideo {
    id: string;
    url: string;
    thumbnail_url?: string;
    prompt?: string;
}

// ============================================================================
// Component
// ============================================================================

export function KlingLipSync({
    onGenerationStarted,
    onError,
    isGenerating,
}: KlingLipSyncProps) {
    // Video state
    const [videoUrl, setVideoUrl] = useState('');
    const [videoSource, setVideoSource] = useState<'upload' | 'library' | 'url'>('upload');
    const [showVideoPicker, setShowVideoPicker] = useState(false);
    const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
    const [isLoadingVideoLibrary, setIsLoadingVideoLibrary] = useState(false);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // Audio state
    const [audioUrl, setAudioUrl] = useState('');
    const [isUploadingAudio, setIsUploadingAudio] = useState(false);
    const [audioFileName, setAudioFileName] = useState('');
    const audioInputRef = useRef<HTMLInputElement>(null);

    // Fetch library videos
    const fetchLibraryVideos = useCallback(async () => {
        setIsLoadingVideoLibrary(true);
        try {
            const response = await fetch('/api/ai/media/library?type=video');
            if (response.ok) {
                const data = await response.json();
                setLibraryVideos(data.items || []);
            }
        } catch (error) {
            console.error('Failed to fetch library videos:', error);
        } finally {
            setIsLoadingVideoLibrary(false);
        }
    }, []);

    // Handle video upload
    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('video/')) {
            onError('Please select a video file');
            return;
        }

        // Validate file size (100MB max)
        if (file.size > 100 * 1024 * 1024) {
            onError('Video must be under 100MB');
            return;
        }

        setIsUploadingVideo(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'video');

            const response = await fetch('/api/upload/media', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            setVideoUrl(data.secure_url || data.url);
            setVideoSource('upload');
        } catch (error) {
            onError('Failed to upload video');
        } finally {
            setIsUploadingVideo(false);
        }
    };

    // Handle audio upload
    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type (MP3, WAV, M4A, AAC)
        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a'];
        if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|aac)$/i)) {
            onError('Please select MP3, WAV, M4A, or AAC audio');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            onError('Audio must be under 5MB');
            return;
        }

        setIsUploadingAudio(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'audio');

            const response = await fetch('/api/upload/media', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            setAudioUrl(data.secure_url || data.url);
            setAudioFileName(file.name);
        } catch (error) {
            onError('Failed to upload audio');
        } finally {
            setIsUploadingAudio(false);
        }
    };

    // Handle library video selection
    const handleSelectLibraryVideo = (url: string) => {
        setVideoUrl(url);
        setVideoSource('library');
        setShowVideoPicker(false);
    };

    // Handle clear
    const handleClearVideo = () => {
        setVideoUrl('');
        setVideoSource('upload');
    };

    const handleClearAudio = () => {
        setAudioUrl('');
        setAudioFileName('');
    };

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (!videoUrl.trim()) {
            onError('Please provide a video');
            return;
        }

        if (!audioUrl.trim()) {
            onError('Please provide an audio file');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/lip-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_url: videoUrl.trim(),
                    audio_url: audioUrl.trim(),
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start lip-sync');
            }

            // Create video object for tracking
            const video: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: `Lip-sync: ${audioFileName || 'audio'}`,
                config: {
                    prompt: 'Lip-sync generation',
                    model: 'kling-v2-6-pro',
                    aspectRatio: '16:9',
                    duration: '5',
                    generation_mode: 'lipsync',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: true,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-lipsync');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to start lip-sync');
        }
    }, [videoUrl, audioUrl, audioFileName, onGenerationStarted, onError]);

    return (
        <div className="space-y-4">
            {/* Video Selection */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Video
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(2-60s, max 100MB)</span>
                </Label>

                <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoUpload}
                    disabled={isGenerating || isUploadingVideo}
                />

                {!showVideoPicker ? (
                    videoUrl ? (
                        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border">
                            <video
                                src={videoUrl}
                                className="w-full h-full object-cover"
                                muted
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowVideoPicker(true)}
                                    className="h-6 text-[10px]"
                                >
                                    Change
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleClearVideo}
                                    className="h-6 w-6 p-0"
                                >
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-1">
                            <Button
                                variant="outline"
                                className="flex-1 h-16 border-dashed flex flex-col items-center justify-center gap-0.5"
                                onClick={() => videoInputRef.current?.click()}
                                disabled={isGenerating || isUploadingVideo}
                            >
                                {isUploadingVideo ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Upload className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground">Upload</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1 h-16 border-dashed flex flex-col items-center justify-center gap-0.5"
                                onClick={() => {
                                    setShowVideoPicker(true);
                                    fetchLibraryVideos();
                                }}
                                disabled={isGenerating}
                            >
                                <Video className="w-4 h-4 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">Library</span>
                            </Button>
                        </div>
                    )
                ) : (
                    /* Video Library Picker */
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowVideoPicker(false)}
                                className="h-5 px-1 text-[10px]"
                            >
                                <ChevronLeft className="w-2.5 h-2.5" />
                                Back
                            </Button>
                            <span className="text-[10px] font-medium">Video Library</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchLibraryVideos}
                                className="h-5 px-1"
                            >
                                <RefreshCw className={`w-2.5 h-2.5 ${isLoadingVideoLibrary ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>

                        {isLoadingVideoLibrary ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : libraryVideos.length > 0 ? (
                            <ScrollArea className="h-[120px]">
                                <div className="grid grid-cols-3 gap-1">
                                    {libraryVideos.map((item) => (
                                        <button
                                            key={item.id}
                                            className="aspect-video bg-muted rounded overflow-hidden transition-all hover:ring-1 hover:ring-emerald-500 relative"
                                            onClick={() => handleSelectLibraryVideo(item.url)}
                                        >
                                            {item.thumbnail_url ? (
                                                <img src={item.thumbnail_url} alt={item.prompt || 'Video'} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Video className="w-4 h-4 text-muted-foreground" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="text-center py-4 text-muted-foreground">
                                <Video className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                <p className="text-[10px]">No videos in library</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Audio Selection */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Audio
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(MP3/WAV/M4A, max 5MB)</span>
                </Label>

                <input
                    ref={audioInputRef}
                    type="file"
                    accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/wav,audio/mp4,audio/aac"
                    className="hidden"
                    onChange={handleAudioUpload}
                    disabled={isGenerating || isUploadingAudio}
                />

                {audioUrl ? (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center">
                            <Music className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{audioFileName || 'Audio file'}</p>
                            <p className="text-[10px] text-muted-foreground">Ready to sync</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearAudio}
                            className="h-6 w-6 p-0"
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        className="w-full h-12 border-dashed flex items-center justify-center gap-2"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={isGenerating || isUploadingAudio}
                    >
                        {isUploadingAudio ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Music className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Upload Audio</span>
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Info */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    💡 <strong>Tip:</strong> For best results, use videos with clear frontal face visibility and high-quality audio.
                </p>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !videoUrl.trim() || !audioUrl.trim()}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Lip-Sync
                    </>
                )}
            </Button>
        </div>
    );
}

export default KlingLipSync;
