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
import { Loader2, ImageIcon, Upload, X, Video, Move3D, RefreshCw, ChevronLeft } from 'lucide-react';
import {
    KLING_MODEL_OPTIONS,
    KLING_ORIENTATION_OPTIONS,
    type KlingModel,
    type KlingOrientation,
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

interface LibraryVideo {
    id: string;
    url: string;
    prompt?: string;
    thumbnail_url?: string;
}

interface KlingMotionControlProps {
    onGenerationStarted: (video: GeneratedKlingVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
    recentImages: GeneratedImage[];
    workspaceId?: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function KlingMotionControl({
    onGenerationStarted,
    onError,
    isGenerating,
    recentImages,
    workspaceId,
}: KlingMotionControlProps) {
    // State
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('blur, distort, low quality');
    const [model, setModel] = useState<KlingModel>('kling-v2-6-pro');
    const [orientation, setOrientation] = useState<KlingOrientation>('video');
    const [keepOriginalSound, setKeepOriginalSound] = useState(false);

    // Character Image state
    const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
    const [imageSource, setImageSource] = useState<'upload' | 'library' | null>(null);
    const [showImagePicker, setShowImagePicker] = useState(false);

    // Motion Video state
    const [motionVideoUrl, setMotionVideoUrl] = useState<string | null>(null);
    const [videoSource, setVideoSource] = useState<'upload' | 'library' | null>(null);
    const [showVideoPicker, setShowVideoPicker] = useState(false);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);

    // Library state
    const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
    const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
    const [isLoadingVideoLibrary, setIsLoadingVideoLibrary] = useState(false);

    const imageFileInputRef = useRef<HTMLInputElement>(null);
    const videoFileInputRef = useRef<HTMLInputElement>(null);

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

    // Fetch library videos
    const fetchLibraryVideos = useCallback(async () => {
        if (!workspaceId) return;

        setIsLoadingVideoLibrary(true);
        try {
            const response = await fetch(`/api/media-studio/library?workspace_id=${workspaceId}&type=video&limit=30`);
            const data = await response.json();
            if (data.items) {
                setLibraryVideos(data.items);
            }
        } catch (err) {
            console.error('Failed to fetch video library:', err);
        } finally {
            setIsLoadingVideoLibrary(false);
        }
    }, [workspaceId]);

    // Load library when picker is opened
    useEffect(() => {
        if (showImagePicker) {
            fetchLibraryImages();
        }
    }, [showImagePicker, fetchLibraryImages]);

    // Load video library when picker is opened
    useEffect(() => {
        if (showVideoPicker) {
            fetchLibraryVideos();
        }
    }, [showVideoPicker, fetchLibraryVideos]);

    // Handle image file upload
    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
            setReferenceImageUrl(event.target?.result as string);
            setImageSource('upload');
        };
        reader.readAsDataURL(file);
    }, [onError]);

    // Handle video file upload
    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
        if (!validTypes.includes(file.type)) {
            onError('Please upload an MP4, MOV, or WebM video');
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
            formData.append('upload_preset', 'ml_default');
            formData.append('resource_type', 'video');

            const response = await fetch('/api/upload/cloudinary', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            setMotionVideoUrl(data.secure_url || data.url);
            setVideoSource('upload');
        } catch (error) {
            console.error('Upload error:', error);
            onError('Failed to upload video');
        } finally {
            setIsUploadingVideo(false);
        }
    };

    // Handle library image selection
    const handleSelectLibraryImage = useCallback((url: string) => {
        setReferenceImageUrl(url);
        setImageSource('library');
        setShowImagePicker(false);
    }, []);

    // Handle library video selection
    const handleSelectLibraryVideo = useCallback((url: string) => {
        setMotionVideoUrl(url);
        setVideoSource('library');
        setShowVideoPicker(false);
    }, []);

    // Clear image
    const handleClearImage = useCallback(() => {
        setReferenceImageUrl(null);
        setImageSource(null);
        if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }, []);

    // Clear video
    const handleClearVideo = useCallback(() => {
        setMotionVideoUrl(null);
        setVideoSource(null);
        if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    }, []);

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (!referenceImageUrl) {
            onError('Please provide a character image');
            return;
        }

        if (!motionVideoUrl) {
            onError('Please provide a motion reference video');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/motion-control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim() || undefined,
                    reference_image_url: referenceImageUrl,
                    motion_reference_video_url: motionVideoUrl,
                    model,
                    character_orientation: orientation,
                    keep_original_sound: keepOriginalSound,
                    negative_prompt: negativePrompt || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start motion control generation');
            }

            // Create video object for tracking
            const video: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: prompt.trim() || 'Motion transfer',
                config: {
                    prompt: prompt.trim() || 'Motion transfer',
                    model,
                    aspectRatio: '16:9',
                    duration: orientation === 'video' ? '10' : '5',
                    negativePrompt: negativePrompt || undefined,
                    referenceImageUrl: referenceImageUrl,
                    motionReferenceVideoUrl: motionVideoUrl,
                    characterOrientation: orientation,
                    keepOriginalSound,
                    generation_mode: 'motion',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: !keepOriginalSound,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-motion');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to generate video');
        }
    }, [prompt, referenceImageUrl, motionVideoUrl, model, orientation, keepOriginalSound, negativePrompt, onGenerationStarted, onError]);

    return (
        <div className="space-y-3">
            {/* Hidden file inputs */}
            <input
                type="file"
                ref={imageFileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
            />
            <input
                type="file"
                ref={videoFileInputRef}
                onChange={handleVideoUpload}
                accept="video/*"
                className="hidden"
            />

            {/* Info Banner */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Move3D className="w-3 h-3" />
                    <strong>Motion Control:</strong> Transfer actions from video to character.
                </p>
            </div>

            {/* Character Image Picker - Compact inline */}
            <div className="space-y-1.5 p-2 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium">Character Image</Label>
                    <span className="text-[9px] text-muted-foreground">Full body</span>
                </div>

                {/* Show selected image or picker */}
                {referenceImageUrl ? (
                    <div className="space-y-1.5">
                        <div className="relative aspect-video bg-muted rounded overflow-hidden border">
                            <img src={referenceImageUrl} alt="Character" className="w-full h-full object-contain" />
                            <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/50 text-white px-1 py-0.5 rounded">
                                {imageSource === 'upload' ? 'Uploaded' : 'Library'}
                            </span>
                            <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-0.5 right-0.5 h-5 w-5"
                                onClick={handleClearImage}
                                disabled={isGenerating}
                            >
                                <X className="w-2.5 h-2.5" />
                            </Button>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-6 text-[10px]"
                            onClick={() => setShowImagePicker(true)}
                            disabled={isGenerating}
                        >
                            <RefreshCw className="w-2.5 h-2.5 mr-1" />
                            Change
                        </Button>
                    </div>
                ) : showImagePicker ? (
                    /* Library Picker View */
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
                                        onClick={() => handleSelectLibraryImage(item.url)}
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
                            onClick={() => imageFileInputRef.current?.click()}
                            disabled={isGenerating}
                        >
                            <Upload className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Upload</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1 h-8 border-dashed flex flex-col items-center justify-center gap-0"
                            onClick={() => setShowImagePicker(true)}
                            disabled={isGenerating}
                        >
                            <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Library</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Motion Reference Video - Inline style */}
            <div className="space-y-1.5 p-2 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium">Motion Video</Label>
                    <span className="text-[9px] text-muted-foreground">MP4/MOV</span>
                </div>

                {motionVideoUrl ? (
                    <div className="space-y-1.5">
                        <div className="relative aspect-video bg-muted rounded overflow-hidden border flex items-center justify-center">
                            <Video className="w-6 h-6 text-muted-foreground" />
                            <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/50 text-white px-1 py-0.5 rounded">
                                {videoSource === 'upload' ? 'Uploaded' : 'Library'}
                            </span>
                            <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-0.5 right-0.5 h-5 w-5"
                                onClick={handleClearVideo}
                                disabled={isGenerating}
                            >
                                <X className="w-2.5 h-2.5" />
                            </Button>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-6 text-[10px]"
                            onClick={() => setShowVideoPicker(true)}
                            disabled={isGenerating}
                        >
                            <RefreshCw className="w-2.5 h-2.5 mr-1" />
                            Change
                        </Button>
                    </div>
                ) : showVideoPicker ? (
                    /* Video Library Picker View */
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
                            <span className="text-[10px] font-medium">Library</span>
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
                            <div className="flex items-center justify-center py-3">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : libraryVideos.length > 0 ? (
                            <div className="grid grid-cols-3 gap-1 max-h-[120px] overflow-y-auto">
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
                                                <Video className="w-3 h-3 text-muted-foreground" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-3 text-muted-foreground">
                                <Video className="w-5 h-5 mx-auto mb-1 opacity-50" />
                                <p className="text-[10px]">No videos</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Initial Selection - Upload or Library */
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            className="flex-1 h-8 border-dashed flex flex-col items-center justify-center gap-0"
                            onClick={() => videoFileInputRef.current?.click()}
                            disabled={isGenerating || isUploadingVideo}
                        >
                            {isUploadingVideo ? (
                                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                            ) : (
                                <>
                                    <Upload className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[9px] text-muted-foreground">Upload</span>
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1 h-8 border-dashed flex flex-col items-center justify-center gap-0"
                            onClick={() => setShowVideoPicker(true)}
                            disabled={isGenerating}
                        >
                            <Video className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Library</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Optional Prompt */}
            <div className="space-y-1">
                <Label htmlFor="prompt" className="text-[11px] font-medium">
                    Scene Prompt
                    <span className="text-muted-foreground ml-1 font-normal text-[9px]">(optional)</span>
                </Label>
                <Textarea
                    id="prompt"
                    placeholder="Describe background, lighting, style..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-[48px] resize-none text-xs"
                />
            </div>

            {/* Model and Orientation */}
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
                    <Label className="text-xs font-medium">Orientation</Label>
                    <Select
                        value={orientation}
                        onValueChange={(v: string) => setOrientation(v as KlingOrientation)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_ORIENTATION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Audio Option */}
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                <div>
                    <Label className="text-xs font-medium">Keep Original Audio</Label>
                    <p className="text-[10px] text-muted-foreground">Retain audio from reference</p>
                </div>
                <Switch
                    checked={keepOriginalSound}
                    onCheckedChange={setKeepOriginalSound}
                    disabled={isGenerating}
                />
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !referenceImageUrl || !motionVideoUrl}
                className="w-full h-9 text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Move3D className="w-3.5 h-3.5 mr-1.5" />
                        Transfer Motion
                    </>
                )}
            </Button>
        </div>
    );
}

export default KlingMotionControl;
