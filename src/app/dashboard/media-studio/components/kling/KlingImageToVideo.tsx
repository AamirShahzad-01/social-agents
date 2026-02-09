'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, ImageIcon, Upload, X, RefreshCw, ChevronLeft } from 'lucide-react';
import {
    KLING_MODEL_OPTIONS,
    KLING_ASPECT_RATIO_OPTIONS,
    KLING_DURATION_OPTIONS,
    type KlingModel,
    type KlingAspectRatio,
    type KlingDuration,
    type GeneratedKlingVideo,
    type GeneratedImage,
} from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface LibraryImage {
    id: string;
    url: string;
    prompt?: string;
    thumbnail_url?: string;
}

interface KlingImageToVideoProps {
    onGenerationStarted: (video: GeneratedKlingVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
    recentImages: GeneratedImage[];
    workspaceId?: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function KlingImageToVideo({
    onGenerationStarted,
    onError,
    isGenerating,
    recentImages,
    workspaceId,
}: KlingImageToVideoProps) {
    // State
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('blur, distort, low quality, watermark');
    const [model, setModel] = useState<KlingModel>('kling-v2-6-pro');
    const [aspectRatio, setAspectRatio] = useState<KlingAspectRatio>('16:9');
    const [duration, setDuration] = useState<KlingDuration>('5');
    const [generateAudio, setGenerateAudio] = useState(true);

    // Start Image state
    const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
    const [startImageSource, setStartImageSource] = useState<'upload' | 'library' | null>(null);
    const [showStartLibraryPicker, setShowStartLibraryPicker] = useState(false);

    // End Image state (optional)
    const [endImageUrl, setEndImageUrl] = useState<string | null>(null);
    const [endImageSource, setEndImageSource] = useState<'upload' | 'library' | null>(null);
    const [showEndLibraryPicker, setShowEndLibraryPicker] = useState(false);

    // Library state
    const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

    const startFileInputRef = useRef<HTMLInputElement>(null);
    const endFileInputRef = useRef<HTMLInputElement>(null);

    // Fetch library images
    const fetchLibraryImages = useCallback(async () => {
        if (!workspaceId) return;

        setIsLoadingLibrary(true);
        try {
            const response = await fetch(`/api/media-studio/library?workspace_id=${workspaceId}&type=image&limit=30`);
            const data = await response.json();
            if (data.items) {
                setLibraryImages(data.items);
            }
        } catch (err) {
            console.error('Failed to fetch library:', err);
        } finally {
            setIsLoadingLibrary(false);
        }
    }, [workspaceId]);

    // Load library when picker is opened
    useEffect(() => {
        if (showStartLibraryPicker || showEndLibraryPicker) {
            fetchLibraryImages();
        }
    }, [showStartLibraryPicker, showEndLibraryPicker, fetchLibraryImages]);

    // Handle file upload
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, isStart: boolean) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            onError('Please upload a JPEG, PNG, or WebP image');
            return;
        }

        // Validate file size (20MB max)
        if (file.size > 20 * 1024 * 1024) {
            onError('Image must be under 20MB');
            return;
        }

        // Convert to data URL
        const reader = new FileReader();
        reader.onload = (event) => {
            const url = event.target?.result as string;
            if (isStart) {
                setStartImageUrl(url);
                setStartImageSource('upload');
            } else {
                setEndImageUrl(url);
                setEndImageSource('upload');
            }
        };
        reader.readAsDataURL(file);
    }, [onError]);

    // Handle library image selection
    const handleSelectLibraryImage = useCallback((url: string, isStart: boolean) => {
        if (isStart) {
            setStartImageUrl(url);
            setStartImageSource('library');
            setShowStartLibraryPicker(false);
        } else {
            setEndImageUrl(url);
            setEndImageSource('library');
            setShowEndLibraryPicker(false);
        }
    }, []);

    // Clear image
    const handleClearImage = useCallback((isStart: boolean) => {
        if (isStart) {
            setStartImageUrl(null);
            setStartImageSource(null);
            if (startFileInputRef.current) startFileInputRef.current.value = '';
        } else {
            setEndImageUrl(null);
            setEndImageSource(null);
            if (endFileInputRef.current) endFileInputRef.current.value = '';
        }
    }, []);

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            onError('Please enter a prompt');
            return;
        }

        if (!startImageUrl) {
            onError('Please provide a start image');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/image-to-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    start_image_url: startImageUrl,
                    end_image_url: endImageUrl || undefined,
                    model,
                    aspect_ratio: aspectRatio,
                    duration,
                    negative_prompt: negativePrompt || undefined,
                    enable_audio: generateAudio,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start video generation');
            }

            // Create video object for tracking
            const video: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: prompt.trim(),
                config: {
                    prompt: prompt.trim(),
                    model,
                    aspectRatio,
                    duration,
                    negativePrompt: negativePrompt || undefined,
                    generateAudio,
                    startImageUrl: startImageUrl,
                    endImageUrl: endImageUrl || undefined,
                    generation_mode: 'image',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: generateAudio,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-image');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to generate video');
        }
    }, [prompt, startImageUrl, endImageUrl, model, aspectRatio, duration, negativePrompt, generateAudio, onGenerationStarted, onError]);

    // Inline Image Picker Component (matches Veo style)
    const renderImagePicker = (isStart: boolean) => {
        const imageUrl = isStart ? startImageUrl : endImageUrl;
        const imageSource = isStart ? startImageSource : endImageSource;
        const showPicker = isStart ? showStartLibraryPicker : showEndLibraryPicker;
        const setShowPicker = isStart ? setShowStartLibraryPicker : setShowEndLibraryPicker;
        const fileInputRef = isStart ? startFileInputRef : endFileInputRef;
        const label = isStart ? 'Start Image (First Frame)' : 'End Image (Last Frame)';
        const optional = !isStart;

        return (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium">{label}</Label>
                    {optional && <span className="text-[9px] text-muted-foreground">(optional)</span>}
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileUpload(e, isStart)}
                    className="hidden"
                    disabled={isGenerating}
                />

                {/* Show selected image or picker */}
                {imageUrl ? (
                    <div className="space-y-1.5">
                        <div className="relative aspect-video bg-muted rounded overflow-hidden border">
                            <img src={imageUrl} alt="Selected" className="w-full h-full object-contain" />
                            <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/50 text-white px-1 py-0.5 rounded">
                                {imageSource === 'upload' ? 'Uploaded' : 'Library'}
                            </span>
                            <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-0.5 right-0.5 h-5 w-5"
                                onClick={() => handleClearImage(isStart)}
                                disabled={isGenerating}
                            >
                                <X className="w-2.5 h-2.5" />
                            </Button>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-6 text-[10px]"
                            onClick={() => setShowPicker(true)}
                            disabled={isGenerating}
                        >
                            <RefreshCw className="w-2.5 h-2.5 mr-1" />
                            Change
                        </Button>
                    </div>
                ) : showPicker ? (
                    /* Library Picker View */
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPicker(false)}
                                className="h-5 px-1 text-[10px]"
                            >
                                <ChevronLeft className="w-2.5 h-2.5" />
                                Back
                            </Button>
                            <span className="text-[10px] font-medium">Library</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchLibraryImages}
                                className="h-5 px-1"
                            >
                                <RefreshCw className={`w-2.5 h-2.5 ${isLoadingLibrary ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>

                        {isLoadingLibrary ? (
                            <div className="flex items-center justify-center py-3">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : libraryImages.length > 0 ? (
                            <div className="grid grid-cols-4 gap-1 max-h-[120px] overflow-y-auto">
                                {libraryImages.map((item) => (
                                    <button
                                        key={item.id}
                                        className="aspect-video bg-muted rounded overflow-hidden transition-all hover:ring-1 hover:ring-emerald-500"
                                        onClick={() => handleSelectLibraryImage(item.url, isStart)}
                                    >
                                        <img src={item.url} alt={item.prompt || 'Library image'} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-3 text-muted-foreground">
                                <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-50" />
                                <p className="text-[10px]">No images</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Initial Selection */
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            className="flex-1 h-8 border-dashed flex flex-col items-center justify-center gap-0"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isGenerating}
                        >
                            <Upload className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Upload</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1 h-8 border-dashed flex flex-col items-center justify-center gap-0"
                            onClick={() => setShowPicker(true)}
                            disabled={isGenerating}
                        >
                            <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Library</span>
                        </Button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {/* Start Image Picker */}
            {renderImagePicker(true)}

            {/* End Image Picker (Optional) */}
            {renderImagePicker(false)}

            {/* Prompt */}
            <div className="space-y-1">
                <Label htmlFor="prompt" className="text-[11px] font-medium">Animation Prompt</Label>
                <Textarea
                    id="prompt"
                    placeholder="Describe how the image should animate..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-[48px] resize-none text-xs"
                />
            </div>

            {/* Model and Aspect Ratio */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-xs font-medium">Model</Label>
                    <Select
                        value={model}
                        onValueChange={(v: string) => setModel(v as KlingModel)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_MODEL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1">
                    <Label className="text-xs font-medium">Aspect Ratio</Label>
                    <Select
                        value={aspectRatio}
                        onValueChange={(v: string) => setAspectRatio(v as KlingAspectRatio)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_ASPECT_RATIO_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Duration and Audio */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-xs font-medium">Duration</Label>
                    <Select
                        value={duration}
                        onValueChange={(v: string) => setDuration(v as KlingDuration)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_DURATION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1">
                    <Label className="text-xs font-medium">Audio</Label>
                    <div className="flex items-center gap-2 h-8 px-2 border rounded-md bg-background">
                        <Switch
                            checked={generateAudio}
                            onCheckedChange={setGenerateAudio}
                            disabled={isGenerating}
                        />
                        <span className="text-xs text-muted-foreground">
                            {generateAudio ? 'On' : 'Off'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || !startImageUrl}
                className="w-full h-9 text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        Animate Image
                    </>
                )}
            </Button>
        </div>
    );
}

export default KlingImageToVideo;
