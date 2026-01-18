'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Clock, Upload, Wand2, ArrowUpCircle, X } from 'lucide-react';
import type { GeneratedRunwayVideo, RunwayRatio } from '../../types/mediaStudio.types';
import { RUNWAY_RATIO_OPTIONS } from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface RunwayVideoToVideoProps {
    onGenerationStarted: (video: GeneratedRunwayVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
    recentVideos: GeneratedRunwayVideo[];
    workspaceId?: string;
    isUpscaleMode?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function RunwayVideoToVideo({
    onGenerationStarted,
    onError,
    isGenerating,
    recentVideos,
    isUpscaleMode = false,
}: RunwayVideoToVideoProps) {
    // State
    const [prompt, setPrompt] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [videoPreview, setVideoPreview] = useState<string | null>(null);
    const [referenceImageUrl, setReferenceImageUrl] = useState('');
    const [ratio, setRatio] = useState<RunwayRatio>('1280:720');
    const [seed, setSeed] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Handle video file upload
    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                setVideoUrl(dataUrl);
                setVideoPreview(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    // Handle reference image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                setReferenceImageUrl(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    // Select video from recent
    const handleSelectFromRecent = (url: string) => {
        if (url) {
            setVideoUrl(url);
            setVideoPreview(url);
        }
    };

    // Clear video
    const clearVideo = () => {
        setVideoUrl('');
        setVideoPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Handle generate
    const handleGenerate = async () => {
        if (!videoUrl) {
            onError('Please upload or select a video');
            return;
        }
        if (!isUpscaleMode && !prompt.trim()) {
            onError('Please enter a prompt');
            return;
        }

        try {
            const endpoint = isUpscaleMode
                ? '/api/ai/media/runway/upscale'
                : '/api/ai/media/runway/video-to-video';

            const body = isUpscaleMode
                ? {
                    model: 'upscale_v1',  // Required by Runway API
                    videoUri: videoUrl
                }
                : {
                    prompt: prompt.trim(),
                    videoUri: videoUrl,
                    model: 'gen4_aleph',
                    ratio,
                    seed: seed ? parseInt(seed) : undefined,
                    referenceImageUri: referenceImageUrl || undefined,
                };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start video generation');
            }

            const video: GeneratedRunwayVideo = {
                id: data.taskId,
                prompt: isUpscaleMode ? 'Video upscale' : prompt.trim(),
                status: 'PENDING',
                progress: 0,
                createdAt: Date.now(),
                taskId: data.taskId,
                config: {
                    prompt: isUpscaleMode ? 'upscale' : prompt.trim(),
                    model: isUpscaleMode ? 'upscale_v1' : 'gen4_aleph',
                    ratio,
                    duration: 10,
                    videoUri: videoUrl,
                    referenceImageUri: referenceImageUrl || undefined,
                    seed: seed ? parseInt(seed) : undefined,
                    generation_mode: isUpscaleMode ? 'upscale' : 'video',
                },
            };

            onGenerationStarted(video, isUpscaleMode ? 'runway-upscale' : 'runway-video-to-video');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to process video');
        }
    };

    const completedVideos = recentVideos.filter(v => v.status === 'SUCCEEDED' && v.url);

    return (
        <div className="space-y-5">
            {/* Video Upload */}
            <div className="space-y-2.5">
                <label className="text-[13px] font-medium text-foreground">
                    {isUpscaleMode ? 'Video to Upscale' : 'Source Video'}
                </label>

                {videoPreview ? (
                    <div className="relative">
                        <video
                            src={videoPreview}
                            className="w-full h-40 object-cover rounded-lg border border-[var(--ms-border)]"
                            controls
                        />
                        <button
                            onClick={clearVideo}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-[var(--ms-border)] rounded-lg p-6 text-center cursor-pointer hover:border-cyan-500/50 transition-colors"
                    >
                        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-[13px] text-muted-foreground">Click to upload video</p>
                        <p className="text-[11px] text-muted-foreground mt-1">MP4, WebM up to 100MB</p>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    className="hidden"
                />

                {/* Recent Videos */}
                {completedVideos.length > 0 && !videoPreview && (
                    <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">Or select from recent videos:</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {completedVideos.slice(0, 4).map((vid) => (
                                <button
                                    key={vid.id}
                                    onClick={() => vid.url && handleSelectFromRecent(vid.url)}
                                    className="flex-shrink-0 w-24 h-16 rounded-md overflow-hidden border-2 border-transparent hover:border-cyan-500 transition-colors bg-muted"
                                >
                                    <video src={vid.url} className="w-full h-full object-cover" muted />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Prompt (not for upscale) */}
            {!isUpscaleMode && (
                <div className="space-y-2">
                    <label className="text-[13px] font-medium text-foreground">
                        Transformation Prompt
                    </label>
                    <Textarea
                        placeholder="Describe how to transform the video (e.g., 'Make it look like a watercolor painting with soft brush strokes')"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isGenerating}
                        className="min-h-[140px] resize-none text-[14px] leading-relaxed p-3.5 rounded-lg"
                        maxLength={1000}
                    />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Describe the visual transformation you want</span>
                        <span>{prompt.length}/1000</span>
                    </div>
                </div>
            )}

            {/* Reference Image (for style transfer) */}
            {!isUpscaleMode && (
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <label className="text-[13px] font-medium text-foreground">Reference Image (Optional)</label>
                        {referenceImageUrl && (
                            <button
                                onClick={() => setReferenceImageUrl('')}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                            >
                                Remove
                            </button>
                        )}
                    </div>

                    {referenceImageUrl ? (
                        <img
                            src={referenceImageUrl}
                            alt="Reference"
                            className="w-20 h-20 object-cover rounded-md border border-[var(--ms-border)]"
                        />
                    ) : (
                        <button
                            onClick={() => imageInputRef.current?.click()}
                            disabled={isGenerating}
                            className="w-full h-16 border border-dashed border-[var(--ms-border)] rounded-lg flex items-center justify-center gap-2 text-[12px] text-muted-foreground hover:border-cyan-500/50 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Add style reference
                        </button>
                    )}
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                    />
                </div>
            )}

            {/* Settings Row (for style transfer) */}
            {!isUpscaleMode && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <label className="text-[13px] font-medium text-foreground">Output Ratio</label>
                        <Select value={ratio} onValueChange={(v) => setRatio(v as RunwayRatio)} disabled={isGenerating}>
                            <SelectTrigger className="h-9 text-[13px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RUNWAY_RATIO_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                                        {opt.aspect}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[13px] font-medium text-foreground">Seed</label>
                        <Input
                            type="number"
                            placeholder="Random"
                            value={seed}
                            onChange={(e) => setSeed(e.target.value)}
                            disabled={isGenerating}
                            className="h-9 text-[13px]"
                        />
                    </div>
                </div>
            )}

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !videoUrl || (!isUpscaleMode && !prompt.trim())}
                className="w-full h-11 text-[13px] font-medium"
                style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }}
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {isUpscaleMode ? 'Upscaling...' : 'Transforming...'}
                    </>
                ) : (
                    <>
                        {isUpscaleMode ? (
                            <ArrowUpCircle className="w-4 h-4 mr-2" />
                        ) : (
                            <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        {isUpscaleMode ? 'Upscale Video' : 'Transform Video'}
                    </>
                )}
            </Button>

            {/* Estimated Time */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Estimated time: {isUpscaleMode ? '1-2' : '2-3'} minutes</span>
            </div>
        </div>
    );
}

export default RunwayVideoToVideo;
