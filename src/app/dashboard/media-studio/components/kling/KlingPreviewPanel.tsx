'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
    Video,
    Plus,
    Play,
    Download,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    Volume2,
    Expand,
} from 'lucide-react';
import type { GeneratedKlingVideo } from '../../types/mediaStudio.types';

// ============================================================================
// Helper Components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'succeed':
            return (
                <Badge variant="default" className="bg-emerald-500">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Complete
                </Badge>
            );
        case 'processing':
        case 'submitted':
            return (
                <Badge variant="secondary">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Processing
                </Badge>
            );
        case 'failed':
            return (
                <Badge variant="destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    Failed
                </Badge>
            );
        default:
            return (
                <Badge variant="outline">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending
                </Badge>
            );
    }
}

function GenerationModeLabel({ mode }: { mode?: string }) {
    const labels: Record<string, { label: string; color: string }> = {
        text: { label: 'Text', color: 'bg-blue-500' },
        image: { label: 'Image', color: 'bg-emerald-500' },
        motion: { label: 'Motion', color: 'bg-purple-500' },
    };

    const config = labels[mode || 'text'] || labels.text;

    return (
        <Badge variant="secondary" className={`text-[10px] ${config.color} text-white`}>
            {config.label}
        </Badge>
    );
}

// ============================================================================
// Types
// ============================================================================

interface KlingPreviewPanelProps {
    currentVideo: GeneratedKlingVideo | null;
    isGenerating: boolean;
    recentVideos: GeneratedKlingVideo[];
    onSelectVideo: (video: GeneratedKlingVideo) => void;
    onNewVideo: () => void;
    onExtendVideo?: (videoId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function KlingPreviewPanel({
    currentVideo,
    isGenerating,
    recentVideos,
    onSelectVideo,
    onNewVideo,
    onExtendVideo,
}: KlingPreviewPanelProps) {
    const handleDownload = async (video: GeneratedKlingVideo) => {
        if (!video.url) return;

        try {
            const response = await fetch(video.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kling-video-${video.id}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download video:', error);
        }
    };

    return (
        <Card className="overflow-hidden flex flex-col h-[650px] lg:col-span-2">
            <CardHeader style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(6, 182, 212, 0.05) 100%)', borderBottom: '1px solid var(--ms-border)' }}>
                <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' }}>
                            <Video className="w-4 h-4 text-white" />
                        </div>
                        <span className="ms-heading-md">Preview</span>
                    </span>
                    {currentVideo && (
                        <Button variant="outline" size="sm" onClick={onNewVideo}>
                            <Plus className="w-4 h-4 mr-1" />
                            New
                        </Button>
                    )}
                </CardTitle>
                <CardDescription className="ms-body-sm">
                    {isGenerating ? 'Generating video...' : 'Video preview and generation progress'}
                </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden pt-6">
                {/* Main Preview Area */}
                <div className="flex-shrink-0">
                    {currentVideo ? (
                        <div className="space-y-3">
                            {/* Video Player or Loading State */}
                            <div className="relative aspect-[1/1] bg-gradient-to-br from-muted to-muted/50 rounded-xl overflow-hidden border-2 border-dashed border-muted-foreground/20">
                                {currentVideo.status === 'succeed' && currentVideo.url ? (
                                    <video
                                        src={currentVideo.url}
                                        controls
                                        className="w-full h-full object-contain bg-black"
                                        poster={currentVideo.coverUrl || currentVideo.thumbnailUrl}
                                    />
                                ) : currentVideo.status === 'failed' ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive">
                                        <XCircle className="w-12 h-12 mb-2" />
                                        <p className="text-sm">Generation failed</p>
                                        {currentVideo.error && (
                                            <p className="text-xs mt-1 text-muted-foreground">{currentVideo.error}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
                                        {(currentVideo.coverUrl || currentVideo.thumbnailUrl) && (
                                            <img
                                                src={currentVideo.coverUrl || currentVideo.thumbnailUrl}
                                                alt="Preview"
                                                className="absolute inset-0 w-full h-full object-cover opacity-30"
                                            />
                                        )}
                                        <div className="relative mb-4">
                                            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 blur-xl opacity-50 animate-pulse" />
                                            <Loader2 className="w-16 h-16 animate-spin text-emerald-500 relative" />
                                        </div>
                                        <p className="text-sm text-muted-foreground font-medium">
                                            {currentVideo.status === 'submitted' ? 'Starting...' : 'Processing video...'}
                                        </p>
                                        <p className="text-xs text-muted-foreground/60 mt-1">
                                            This may take 1-5 minutes
                                        </p>
                                        {currentVideo.progress !== undefined && currentVideo.progress > 0 && (
                                            <Progress value={currentVideo.progress} className="w-48 mt-3" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Video Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StatusBadge status={currentVideo.status} />
                                    <GenerationModeLabel mode={currentVideo.config.generation_mode} />
                                    {currentVideo.hasAudio && (
                                        <Badge variant="outline" className="text-xs">
                                            <Volume2 className="w-3 h-3 mr-1" />
                                            Audio
                                        </Badge>
                                    )}
                                </div>

                                <p className="text-sm line-clamp-2">{currentVideo.prompt}</p>

                                <div className="flex gap-2 text-xs text-muted-foreground">
                                    <span>{currentVideo.config.aspectRatio}</span>
                                    <span>•</span>
                                    <span>{currentVideo.config.duration}s</span>
                                    <span>•</span>
                                    <span>{currentVideo.config.model}</span>
                                </div>

                                {/* Actions */}
                                {currentVideo.status === 'succeed' && currentVideo.url && (
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDownload(currentVideo)}
                                        >
                                            <Download className="w-4 h-4 mr-1" />
                                            Download
                                        </Button>
                                        {onExtendVideo && currentVideo.videoId && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onExtendVideo(currentVideo.videoId!)}
                                                title="Extend video by 4-5 seconds"
                                            >
                                                <Expand className="w-4 h-4 mr-1" />
                                                Extend
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="aspect-[1/1] bg-gradient-to-br from-muted to-muted/50 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/20">
                            <div className="p-6 rounded-full bg-gradient-to-br from-muted-foreground/5 to-muted-foreground/10 mb-4">
                                <Video className="w-12 h-12 text-muted-foreground/40" />
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">
                                No video generated yet
                            </p>
                            <p className="text-xs text-muted-foreground/60 mt-1 text-center px-8">
                                Write a prompt and click generate to create your first video
                            </p>
                        </div>
                    )}
                </div>

                {/* Recent Videos */}
                <div className="flex-1 min-h-0 space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent Videos
                    </h4>
                    <ScrollArea className="h-[calc(100%-2rem)]">
                        <div className="space-y-2 pr-4">
                            {recentVideos.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                    No recent videos yet
                                </p>
                            ) : (
                                recentVideos.map((video) => (
                                    <button
                                        key={video.id}
                                        onClick={() => onSelectVideo(video)}
                                        className={`w-full flex items-start gap-3 p-2 rounded-lg border transition-all text-left ${currentVideo?.id === video.id
                                            ? 'border-emerald-500 bg-emerald-500/10'
                                            : 'border-border hover:border-emerald-500/50'
                                            }`}
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0 relative">
                                            {video.coverUrl || video.thumbnailUrl || video.url ? (
                                                <>
                                                    {video.url && video.status === 'succeed' ? (
                                                        <video
                                                            src={video.url}
                                                            className="w-full h-full object-cover"
                                                            muted
                                                        />
                                                    ) : (video.coverUrl || video.thumbnailUrl) ? (
                                                        <img
                                                            src={video.coverUrl || video.thumbnailUrl}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : null}
                                                    {video.status === 'succeed' && (
                                                        <Play className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" />
                                                    )}
                                                </>
                                            ) : (
                                                <Video className="absolute inset-0 m-auto w-4 h-4 text-muted-foreground" />
                                            )}
                                            {(video.status === 'processing' || video.status === 'submitted') && (
                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs line-clamp-1">{video.prompt}</p>
                                            <div className="flex items-center gap-1 mt-1">
                                                <GenerationModeLabel mode={video.config.generation_mode} />
                                                <span className="text-[10px] text-muted-foreground">
                                                    {video.config.duration}s
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>
    );
}

export default KlingPreviewPanel;
