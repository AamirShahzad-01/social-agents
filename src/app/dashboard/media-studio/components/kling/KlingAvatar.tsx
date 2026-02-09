'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Loader2,
    Sparkles,
    Image as ImageIcon,
    Music,
    Upload,
    ChevronLeft,
    RefreshCw,
    X,
    User,
} from 'lucide-react';
import type { GeneratedKlingVideo } from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface KlingAvatarProps {
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

export function KlingAvatar({
    onGenerationStarted,
    onError,
    isGenerating,
}: KlingAvatarProps) {
    // Image state
    const [imageUrl, setImageUrl] = useState('');
    const [imageSource, setImageSource] = useState<'upload' | 'library' | 'url'>('upload');
    const [showImagePicker, setShowImagePicker] = useState(false);
    const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
    const [isLoadingImageLibrary, setIsLoadingImageLibrary] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Audio state
    const [audioUrl, setAudioUrl] = useState('');
    const [isUploadingAudio, setIsUploadingAudio] = useState(false);
    const [audioFileName, setAudioFileName] = useState('');
    const audioInputRef = useRef<HTMLInputElement>(null);

    // Config state
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState<'std' | 'pro'>('std');
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');

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
        const file = e.target.files?.[0];
        if (!file) return;

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
            setImageUrl(data.secure_url || data.url);
            setImageSource('upload');
        } catch (error) {
            onError('Failed to upload image');
        } finally {
            setIsUploadingImage(false);
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

        // Validate file size (20MB max for avatar)
        if (file.size > 20 * 1024 * 1024) {
            onError('Audio must be under 20MB');
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

    // Handle library image selection
    const handleSelectLibraryImage = (url: string) => {
        setImageUrl(url);
        setImageSource('library');
        setShowImagePicker(false);
    };

    // Handle clear
    const handleClearImage = () => {
        setImageUrl('');
        setImageSource('upload');
    };

    const handleClearAudio = () => {
        setAudioUrl('');
        setAudioFileName('');
    };

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (!imageUrl.trim()) {
            onError('Please provide a portrait image');
            return;
        }

        if (!audioUrl.trim()) {
            onError('Please provide an audio file');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_url: imageUrl.trim(),
                    audio_url: audioUrl.trim(),
                    prompt: prompt.trim() || undefined,
                    mode,
                    aspect_ratio: aspectRatio,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start avatar generation');
            }

            // Create video object for tracking
            const video: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: prompt.trim() || `Avatar: ${audioFileName || 'audio'}`,
                config: {
                    prompt: prompt.trim() || 'Avatar generation',
                    model: mode === 'pro' ? 'kling-v2-6-pro' : 'kling-v2-6-standard',
                    aspectRatio,
                    duration: '5',
                    generation_mode: 'avatar',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: true,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-avatar');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to start avatar generation');
        }
    }, [imageUrl, audioUrl, prompt, mode, aspectRatio, audioFileName, onGenerationStarted, onError]);

    return (
        <div className="space-y-4">
            {/* Portrait Image Selection */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Portrait Image
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(front-facing, clear face)</span>
                </Label>

                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isGenerating || isUploadingImage}
                />

                {!showImagePicker ? (
                    imageUrl ? (
                        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border">
                            <img
                                src={imageUrl}
                                alt="Avatar portrait"
                                className="w-full h-full object-contain"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowImagePicker(true)}
                                    className="h-6 text-[10px]"
                                >
                                    Change
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleClearImage}
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
                                onClick={() => imageInputRef.current?.click()}
                                disabled={isGenerating || isUploadingImage}
                            >
                                {isUploadingImage ? (
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
                                    setShowImagePicker(true);
                                    fetchLibraryImages();
                                }}
                                disabled={isGenerating}
                            >
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">Library</span>
                            </Button>
                        </div>
                    )
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
                                <div className="grid grid-cols-3 gap-1">
                                    {libraryImages.map((item) => (
                                        <button
                                            key={item.id}
                                            className="aspect-square bg-muted rounded overflow-hidden transition-all hover:ring-1 hover:ring-emerald-500 relative"
                                            onClick={() => handleSelectLibraryImage(item.url)}
                                        >
                                            <img src={item.thumbnail_url || item.url} alt={item.prompt || 'Image'} className="w-full h-full object-cover" />
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
            </div>

            {/* Audio Selection */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Audio / Speech
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(MP3/WAV/M4A, max 20MB)</span>
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
                            <p className="text-[10px] text-muted-foreground">Ready to animate</p>
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

            {/* Prompt (Optional) */}
            <div className="space-y-1.5">
                <Label className="text-[11px] font-medium">
                    Scene Prompt
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(optional)</span>
                </Label>
                <Textarea
                    placeholder="Describe the scene, style, or avatar behavior..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="h-16 text-xs resize-none"
                    disabled={isGenerating}
                />
            </div>

            {/* Mode & Aspect Ratio */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium">Quality</Label>
                    <div className="flex gap-1">
                        <Button
                            variant={mode === 'std' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setMode('std')}
                            className="flex-1 h-7 text-[10px]"
                            disabled={isGenerating}
                        >
                            Standard
                        </Button>
                        <Button
                            variant={mode === 'pro' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setMode('pro')}
                            className="flex-1 h-7 text-[10px]"
                            disabled={isGenerating}
                        >
                            Pro
                        </Button>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium">Aspect</Label>
                    <div className="flex gap-1">
                        {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                            <Button
                                key={ratio}
                                variant={aspectRatio === ratio ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setAspectRatio(ratio)}
                                className="flex-1 h-7 text-[10px]"
                                disabled={isGenerating}
                            >
                                {ratio}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    🎭 <strong>Avatar:</strong> Creates AI talking head video with lip-sync from your portrait + audio.
                    Pricing: {mode === 'std' ? '0.4' : '0.8'} credits/sec.
                </p>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !imageUrl.trim() || !audioUrl.trim()}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <User className="w-4 h-4 mr-2" />
                        Generate Avatar Video
                    </>
                )}
            </Button>
        </div>
    );
}

export default KlingAvatar;
