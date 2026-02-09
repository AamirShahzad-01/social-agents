'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Loader2,
    Sparkles,
    Image as ImageIcon,
    Upload,
    ChevronLeft,
    RefreshCw,
    X,
    Plus,
    GripVertical,
} from 'lucide-react';
import {
    KLING_MODEL_OPTIONS,
    KLING_ASPECT_RATIO_OPTIONS,
    KLING_DURATION_OPTIONS,
    type KlingModel,
    type KlingAspectRatio,
    type KlingDuration,
    type GeneratedKlingVideo,
} from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface KlingMultiImageProps {
    onGenerationStarted: (video: GeneratedKlingVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
}

interface LibraryImage {
    id: string;
    url: string;
    thumbnail_url?: string;
    prompt?: string;
}

// ============================================================================
// Component
// ============================================================================

export function KlingMultiImage({
    onGenerationStarted,
    onError,
    isGenerating,
}: KlingMultiImageProps) {
    // Image state
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [showImagePicker, setShowImagePicker] = useState(false);
    const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
    const [isLoadingImageLibrary, setIsLoadingImageLibrary] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Generation settings
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState<KlingModel>('kling-v2-6-pro');
    const [aspectRatio, setAspectRatio] = useState<KlingAspectRatio>('16:9');
    const [duration, setDuration] = useState<KlingDuration>('5');
    const [negativePrompt, setNegativePrompt] = useState('blur, distort, low quality');

    // Fetch library images
    const fetchLibraryImages = useCallback(async () => {
        setIsLoadingImageLibrary(true);
        try {
            const response = await fetch('/api/ai/media/library?type=image');
            if (response.ok) {
                const data = await response.json();
                setLibraryImages(data.items || []);
            }
        } catch (error) {
            console.error('Failed to fetch library images:', error);
        } finally {
            setIsLoadingImageLibrary(false);
        }
    }, []);

    // Handle image upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            onError('Please select an image file');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            onError('Image must be under 10MB');
            return;
        }

        // Check max images
        if (imageUrls.length >= 8) {
            onError('Maximum 8 images allowed');
            return;
        }

        setIsUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'image');

            const response = await fetch('/api/upload/media', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            setImageUrls(prev => [...prev, data.secure_url || data.url]);
        } catch (error) {
            onError('Failed to upload image');
        } finally {
            setIsUploadingImage(false);
            // Reset input
            if (imageInputRef.current) {
                imageInputRef.current.value = '';
            }
        }
    };

    // Handle library image selection
    const handleSelectLibraryImage = (url: string) => {
        if (imageUrls.length >= 8) {
            onError('Maximum 8 images allowed');
            return;
        }
        if (!imageUrls.includes(url)) {
            setImageUrls(prev => [...prev, url]);
        }
        setShowImagePicker(false);
    };

    // Handle remove image
    const handleRemoveImage = (index: number) => {
        setImageUrls(prev => prev.filter((_, i) => i !== index));
    };

    // Handle move image
    const handleMoveImage = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= imageUrls.length) return;
        const newUrls = [...imageUrls];
        const [removed] = newUrls.splice(fromIndex, 1);
        newUrls.splice(toIndex, 0, removed);
        setImageUrls(newUrls);
    };

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (imageUrls.length < 2) {
            onError('Please add at least 2 images');
            return;
        }

        if (!prompt.trim()) {
            onError('Please enter a prompt');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/multi-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    images: imageUrls,
                    prompt: prompt.trim(),
                    model,
                    duration,
                    aspect_ratio: aspectRatio,
                    negative_prompt: negativePrompt || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start generation');
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
                    generation_mode: 'multi-image',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: false,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-multi-image');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to generate video');
        }
    }, [imageUrls, prompt, model, aspectRatio, duration, negativePrompt, onGenerationStarted, onError]);

    return (
        <div className="space-y-4">
            {/* Image Selection */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Images
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(2-8 images, drag to reorder)</span>
                </Label>

                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isGenerating || isUploadingImage}
                />

                {/* Selected Images */}
                {imageUrls.length > 0 && (
                    <div className="grid grid-cols-4 gap-1 mb-2">
                        {imageUrls.map((url, index) => (
                            <div
                                key={`${url}-${index}`}
                                className="relative aspect-square bg-muted rounded overflow-hidden group border"
                            >
                                <img
                                    src={url}
                                    alt={`Image ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />
                                {/* Order number */}
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-black/70 rounded text-white text-[9px] flex items-center justify-center font-bold">
                                    {index + 1}
                                </div>
                                {/* Hover controls */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                                    {index > 0 && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleMoveImage(index, index - 1)}
                                            className="h-5 w-5 p-0 text-[9px]"
                                        >
                                            ←
                                        </Button>
                                    )}
                                    {index < imageUrls.length - 1 && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleMoveImage(index, index + 1)}
                                            className="h-5 w-5 p-0 text-[9px]"
                                        >
                                            →
                                        </Button>
                                    )}
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRemoveImage(index)}
                                        className="h-5 w-5 p-0"
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!showImagePicker ? (
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            className="flex-1 h-10 border-dashed flex items-center justify-center gap-1"
                            onClick={() => imageInputRef.current?.click()}
                            disabled={isGenerating || isUploadingImage || imageUrls.length >= 8}
                        >
                            {isUploadingImage ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <>
                                    <Upload className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">Upload</span>
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1 h-10 border-dashed flex items-center justify-center gap-1"
                            onClick={() => {
                                setShowImagePicker(true);
                                fetchLibraryImages();
                            }}
                            disabled={isGenerating || imageUrls.length >= 8}
                        >
                            <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Library</span>
                        </Button>
                    </div>
                ) : (
                    /* Image Library Picker */
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowImagePicker(false)}
                                className="h-5 px-1 text-[10px]"
                            >
                                <ChevronLeft className="w-2.5 h-2.5" />
                                Back
                            </Button>
                            <span className="text-[10px] font-medium">Image Library</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchLibraryImages}
                                className="h-5 px-1"
                            >
                                <RefreshCw className={`w-2.5 h-2.5 ${isLoadingImageLibrary ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>

                        {isLoadingImageLibrary ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : libraryImages.length > 0 ? (
                            <ScrollArea className="h-[120px]">
                                <div className="grid grid-cols-4 gap-1">
                                    {libraryImages.map((item) => (
                                        <button
                                            key={item.id}
                                            className={`aspect-square bg-muted rounded overflow-hidden transition-all hover:ring-1 hover:ring-emerald-500 relative ${imageUrls.includes(item.url) ? 'ring-2 ring-emerald-500' : ''}`}
                                            onClick={() => handleSelectLibraryImage(item.url)}
                                        >
                                            {item.thumbnail_url || item.url ? (
                                                <img src={item.thumbnail_url || item.url} alt={item.prompt || 'Image'} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="text-center py-4 text-muted-foreground">
                                <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                <p className="text-[10px]">No images in library</p>
                            </div>
                        )}
                    </div>
                )}

                <p className="text-[9px] text-muted-foreground">
                    Selected: {imageUrls.length}/8 images
                </p>
            </div>

            {/* Prompt */}
            <div className="space-y-1">
                <Label htmlFor="prompt" className="text-[11px] font-medium">Transition Prompt</Label>
                <Textarea
                    id="prompt"
                    placeholder="Describe how images should transition and animate..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-[48px] resize-none text-xs"
                />
            </div>

            {/* Model and Aspect Ratio */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-[11px] font-medium">Model</Label>
                    <Select
                        value={model}
                        onValueChange={(v: string) => setModel(v as KlingModel)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-7 text-[10px]">
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
                    <Label className="text-[11px] font-medium">Aspect Ratio</Label>
                    <Select
                        value={aspectRatio}
                        onValueChange={(v: string) => setAspectRatio(v as KlingAspectRatio)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-7 text-[10px]">
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

            {/* Duration */}
            <div className="space-y-1">
                <Label className="text-[11px] font-medium">Duration</Label>
                <Select
                    value={duration}
                    onValueChange={(v: string) => setDuration(v as KlingDuration)}
                    disabled={isGenerating}
                >
                    <SelectTrigger className="h-7 text-[10px]">
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

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || imageUrls.length < 2 || !prompt.trim()}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Video
                    </>
                )}
            </Button>
        </div>
    );
}

export default KlingMultiImage;
