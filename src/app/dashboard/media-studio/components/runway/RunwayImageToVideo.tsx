'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Clock, Upload, ImageIcon, X } from 'lucide-react';
import type { GeneratedRunwayVideo, GeneratedImage, RunwayRatio, RunwayDuration } from '../../types/mediaStudio.types';
import { RUNWAY_RATIO_OPTIONS, RUNWAY_DURATION_OPTIONS } from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface RunwayImageToVideoProps {
    onGenerationStarted: (video: GeneratedRunwayVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
    recentImages: GeneratedImage[];
    workspaceId?: string;
}

// ============================================================================
// Component
// ============================================================================

export function RunwayImageToVideo({
    onGenerationStarted,
    onError,
    isGenerating,
    recentImages,
}: RunwayImageToVideoProps) {
    // State
    const [prompt, setPrompt] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [ratio, setRatio] = useState<RunwayRatio>('1280:720');
    const [duration, setDuration] = useState<RunwayDuration>(10);
    const [seed, setSeed] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                setImageUrl(dataUrl);
                setImagePreview(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    // Handle library image selection
    const handleSelectFromLibrary = (url: string) => {
        setImageUrl(url);
        setImagePreview(url);
    };

    // Clear image
    const clearImage = () => {
        setImageUrl('');
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Handle generate
    const handleGenerate = async () => {
        if (!prompt.trim()) {
            onError('Please enter a prompt');
            return;
        }
        if (!imageUrl) {
            onError('Please upload or select an image');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/runway/image-to-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    // Use official API array format (promptImages)
                    promptImages: [{ uri: imageUrl, position: 'first' }],
                    model: 'gen4_turbo',
                    ratio,
                    duration,
                    seed: seed ? parseInt(seed) : undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start video generation');
            }

            const video: GeneratedRunwayVideo = {
                id: data.taskId,
                prompt: prompt.trim(),
                status: 'PENDING',
                progress: 0,
                createdAt: Date.now(),
                taskId: data.taskId,
                config: {
                    prompt: prompt.trim(),
                    model: 'gen4_turbo',
                    ratio,
                    duration,
                    promptImages: [{ uri: imageUrl, position: 'first' }],
                    seed: seed ? parseInt(seed) : undefined,
                    generation_mode: 'image',
                },
            };

            onGenerationStarted(video, 'runway-image-to-video');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to generate video');
        }
    };

    return (
        <div className="space-y-5">
            {/* Image Upload */}
            <div className="space-y-2.5">
                <label className="text-[13px] font-medium text-foreground">First Frame Image</label>

                {imagePreview ? (
                    <div className="relative">
                        <img
                            src={imagePreview}
                            alt="Selected image"
                            className="w-full h-40 object-cover rounded-lg border border-[var(--ms-border)]"
                        />
                        <button
                            onClick={clearImage}
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
                        <p className="text-[13px] text-muted-foreground">Click to upload or drag and drop</p>
                        <p className="text-[11px] text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                />

                {/* Recent Images */}
                {recentImages.length > 0 && !imagePreview && (
                    <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">Or select from recent images:</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {recentImages.slice(0, 6).map((img) => (
                                <button
                                    key={img.id}
                                    onClick={() => handleSelectFromLibrary(img.url)}
                                    className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 border-transparent hover:border-cyan-500 transition-colors"
                                >
                                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Prompt */}
            <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground">
                    Animation Prompt
                </label>
                <Textarea
                    placeholder="Describe how the image should animate (e.g., 'Camera slowly pans right as the subject turns and smiles')"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-[140px] resize-none text-[14px] leading-relaxed p-3.5 rounded-lg"
                    maxLength={1000}
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Describe motion, camera movement, and action</span>
                    <span>{prompt.length}/1000</span>
                </div>
            </div>

            {/* Settings Row */}
            <div className="grid grid-cols-3 gap-3">
                {/* Ratio */}
                <div className="space-y-2">
                    <label className="text-[13px] font-medium text-foreground">Ratio</label>
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

                {/* Duration */}
                <div className="space-y-2">
                    <label className="text-[13px] font-medium text-foreground">Duration</label>
                    <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v) as RunwayDuration)} disabled={isGenerating}>
                        <SelectTrigger className="h-9 text-[13px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {RUNWAY_DURATION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value.toString()} className="text-[13px]">
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Seed */}
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

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || !imageUrl}
                className="w-full h-11 text-[13px] font-medium"
                style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }}
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Animating...
                    </>
                ) : (
                    <>
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Animate Image
                    </>
                )}
            </Button>

            {/* Estimated Time */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Estimated time: 1-2 minutes</span>
            </div>
        </div>
    );
}

export default RunwayImageToVideo;
