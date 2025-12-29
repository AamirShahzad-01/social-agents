'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  Image as ImageIcon,
  Play,
  Download,
  Loader2,
  Sparkles,
  RefreshCw,
  X,
  ChevronDown,
  ChevronLeft,
  Settings,
  Upload,
  Clock,
  Check,
  Film,
  Wand2,
  FileVideo,
  Info,
  FolderOpen,
  Clapperboard,
  Timer,
  Ratio,
  AlertCircle,
} from 'lucide-react';
import type { GeneratedVideo, GeneratedImage, VideoGenerationConfig } from '../types/mediaStudio.types';
import { useMediaLibrary } from '../hooks/useMediaLibrary';
import { AI_MODELS, DEFAULT_AI_MODEL_ID, getModelDisplayName } from '@/constants/aiModels';
import { useVideoGeneration } from '@/contexts/VideoGenerationContext';

interface VideoGeneratorProps {
  onVideoStarted: (video: GeneratedVideo) => void;
  onVideoUpdate: (videoId: string, updates: Partial<GeneratedVideo>) => void;
  recentVideos: GeneratedVideo[];
  recentImages: GeneratedImage[];
}

// ============================================================================
// SORA MODEL CONFIGURATIONS - Per OpenAI Video Generation API Docs
// ============================================================================

type SoraModel = 'sora-2' | 'sora-2-pro';

interface ModelConfig {
  value: SoraModel;
  label: string;
  description: string;
  estimatedTime: string;
}

const SORA_MODELS: ModelConfig[] = [
  {
    value: 'sora-2',
    label: 'Sora 2',
    description: 'Fast, flexible video generation',
    estimatedTime: '1-3 minutes',
  },
  {
    value: 'sora-2-pro',
    label: 'Sora 2 Pro',
    description: 'Higher quality production output',
    estimatedTime: '3-5 minutes',
  },
];

// Size options per OpenAI docs
const SIZE_OPTIONS = [
  { value: '1280x720', label: 'HD 16:9 (1280×720)', aspect: '16:9', description: 'Standard HD landscape' },
  { value: '1920x1080', label: 'Full HD 16:9 (1920×1080)', aspect: '16:9', description: 'Full HD landscape' },
  { value: '1024x576', label: 'Wide 16:9 (1024×576)', aspect: '16:9', description: 'Compact landscape' },
  { value: '720x1280', label: 'HD 9:16 (720×1280)', aspect: '9:16', description: 'Standard HD portrait' },
  { value: '1080x1920', label: 'Full HD 9:16 (1080×1920)', aspect: '9:16', description: 'Full HD portrait' },
  { value: '480x480', label: 'Square (480×480)', aspect: '1:1', description: 'Square format' },
];

// Duration options per OpenAI docs
const DURATION_OPTIONS = [
  { value: 5, label: '5 seconds', description: 'Quick clip' },
  { value: 8, label: '8 seconds', description: 'Standard length' },
  { value: 10, label: '10 seconds', description: 'Extended clip' },
  { value: 15, label: '15 seconds', description: 'Long form' },
  { value: 16, label: '16 seconds', description: 'YouTube Short max' },
  { value: 20, label: '20 seconds', description: 'Maximum length' },
];

// Standard platform presets - using existing dimensions only
const PLATFORM_PRESETS = [
  { id: 'instagram', name: 'Instagram', size: '1080x1920', seconds: 15, model: 'sora-2' },
  { id: 'facebook', name: 'Facebook', size: '1080x1920', seconds: 15, model: 'sora-2' },
  { id: 'twitter', name: 'Twitter', size: '1280x720', seconds: 8, model: 'sora-2' },
  { id: 'linkedin', name: 'LinkedIn', size: '1280x720', seconds: 10, model: 'sora-2' },
  { id: 'youtube_short', name: 'y-short', size: '1080x1920', seconds: 16, model: 'sora-2-pro' },
  { id: 'tiktok', name: 'TikTok', size: '1080x1920', seconds: 15, model: 'sora-2' },
];

type GenerationMode = 'text' | 'image' | 'remix';

// ============================================================================
// COMPONENT
// ============================================================================

export function VideoGenerator({ onVideoStarted, onVideoUpdate, recentVideos, recentImages }: VideoGeneratorProps) {
  // Media Library hook for saving to database
  const { saveGeneratedMedia, createHistoryEntry, markGenerationFailed, isEnabled: canSaveToDb, workspaceId } = useMediaLibrary();

  // Global video generation context for persistent polling across pages
  const { startSoraPolling, activeJobs, getJobStatus } = useVideoGeneration();

  // State
  const [mode, setMode] = useState<GenerationMode>('text');
  const [model, setModel] = useState<SoraModel>('sora-2');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1280x720');
  const [seconds, setSeconds] = useState(8);

  // Image-to-video state
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Library picker state
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryImages, setLibraryImages] = useState<any[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Library videos for remix (from database)
  const [libraryVideos, setLibraryVideos] = useState<GeneratedVideo[]>([]);
  const [isLoadingLibraryVideos, setIsLoadingLibraryVideos] = useState(false);

  // Remix state
  const [selectedVideoForRemix, setSelectedVideoForRemix] = useState<GeneratedVideo | null>(null);
  const [remixPrompt, setRemixPrompt] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<GeneratedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number>(0);

  // Prompt improvement state
  const [showImprovementModal, setShowImprovementModal] = useState(false);
  const [improvementInstructions, setImprovementInstructions] = useState('');
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
  const [improvementError, setImprovementError] = useState<string | null>(null);
  const [selectedAIModelId, setSelectedAIModelId] = useState(DEFAULT_AI_MODEL_ID);
  const [showAIModelDropdown, setShowAIModelDropdown] = useState(false);

  // Convert technical errors to user-friendly messages
  const getUserFriendlyError = (error: unknown): string => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('API_KEY') || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return 'API key not configured. Please check your settings.';
    }
    if (errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('quota') || errorMessage.includes('insufficient')) {
      return 'Rate limit or quota exceeded. Add credits or try a different model.';
    }
    if (errorMessage.includes('model') && (errorMessage.includes('not found') || errorMessage.includes('does not exist'))) {
      return 'Selected model is unavailable. Try a different model.';
    }
    if (errorMessage.includes('MODULE_NOT_FOUND') || errorMessage.includes('Cannot find module')) {
      return 'Service temporarily unavailable. Please try again.';
    }
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      return 'Connection error. Please check your internet.';
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return 'Request timed out. Please try again.';
    }
    return 'Failed to improve prompt. Please try again.';
  };

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = SORA_MODELS.find(m => m.value === model)!;
  const selectedSize = SIZE_OPTIONS.find(s => s.value === size);

  // Handle file upload for image-to-video
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPEG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setUploadedImage(imageUrl);
      setSelectedImageUrl(imageUrl);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // Fetch library images
  const fetchLibraryImages = useCallback(async () => {
    if (!workspaceId) return;

    setIsLoadingLibrary(true);
    try {
      const response = await fetch(`/api/media-studio/library?workspace_id=${workspaceId}&type=image&limit=20`);
      const data = await response.json();
      if (data.items) {
        setLibraryImages(data.items);
      }
    } catch (err) {
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [workspaceId]);

  // Load library when picker is opened
  useEffect(() => {
    if (showLibraryPicker) {
      fetchLibraryImages();
    }
  }, [showLibraryPicker, fetchLibraryImages]);

  // Fetch library videos for remix
  const fetchLibraryVideos = useCallback(async () => {
    if (!workspaceId) return;

    setIsLoadingLibraryVideos(true);
    try {
      const response = await fetch(`/api/media-studio/library?workspace_id=${workspaceId}&type=video&limit=50`);
      const data = await response.json();
      if (data.items) {
        // Filter to only Sora-generated videos
        const soraVideos = data.items.filter((item: any) =>
          item.source?.startsWith('sora-') || item.model?.startsWith('sora-')
        ).map((item: any) => ({
          id: item.id,
          url: item.url,
          prompt: item.prompt,
          config: item.config || {},
          status: 'completed' as const,
          createdAt: new Date(item.created_at).getTime(),
          thumbnailUrl: item.thumbnail_url,
        }));
        setLibraryVideos(soraVideos);
      }
    } catch (err) {
      console.error('Failed to fetch library videos:', err);
    } finally {
      setIsLoadingLibraryVideos(false);
    }
  }, [workspaceId]);

  // Load library videos when remix mode is active
  useEffect(() => {
    if (mode === 'remix') {
      fetchLibraryVideos();
    }
  }, [mode, fetchLibraryVideos]);

  // Handle selecting image from library
  const handleLibrarySelect = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setUploadedImage(imageUrl);
    setShowLibraryPicker(false);
    setError(null);
  };

  // Poll count ref for timeout protection (max 96 polls = 8 minutes)
  const pollCountRef = useRef<number>(0);
  const MAX_POLLS = 96;

  // Poll video status
  const pollVideoStatus = useCallback(async (videoId: string) => {
    try {
      // Timeout protection
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        console.error('Video generation timeout - max polls exceeded');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setError('Video generation timed out. Please try again.');
        setIsGenerating(false);
        return;
      }

      const response = await fetch('/api/ai/media/sora/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });

      if (!response.ok) {
        console.error('Status check failed:', response.status);
        return; // Continue polling on network errors
      }

      const data = await response.json();

      if (data.success && data.data?.video) {
        const video = data.data.video;

        if (video.status === 'completed') {
          // Fetch the video content
          const fetchResponse = await fetch('/api/ai/media/sora/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId }),
          });

          if (!fetchResponse.ok) {
            throw new Error('Failed to fetch video content');
          }

          const fetchData = await fetchResponse.json();

          if (!fetchData.success) {
            throw new Error(fetchData.error || 'Failed to download video');
          }

          const videoUrl = fetchData.data?.videoData;

          onVideoUpdate(videoId, {
            status: 'completed',
            url: videoUrl,
            progress: 100,
          });

          setCurrentVideo(prev => prev ? {
            ...prev,
            status: 'completed',
            url: videoUrl,
            progress: 100,
          } : null);

          // Clear polling
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          pollCountRef.current = 0;
          setIsGenerating(false);

        } else if (video.status === 'failed') {
          const errorMsg = video.error || 'Video generation failed';
          onVideoUpdate(videoId, { status: 'failed', progress: 0 });
          setError(errorMsg);

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          pollCountRef.current = 0;
          setIsGenerating(false);

        } else {
          // Still processing (queued or in_progress)
          const progress = video.progress || 0;
          onVideoUpdate(videoId, {
            status: video.status,
            progress,
          });
          setCurrentVideo(prev => prev ? {
            ...prev,
            status: video.status,
            progress,
          } : null);
        }
      } else if (data.error) {
        console.error('Status response error:', data.error);
      }
    } catch (err) {
      console.error('Poll video status error:', err);
      // Don't stop polling on transient errors, let timeout handle it
    }
  }, [onVideoUpdate]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Save completed video to database when status changes to completed
  useEffect(() => {
    const saveCompletedVideo = async () => {
      if (
        currentVideo?.status === 'completed' &&
        currentVideo?.url &&
        canSaveToDb &&
        currentHistoryId
      ) {
        const genTime = generationStartTime > 0 ? Date.now() - generationStartTime : undefined;
        try {
          await saveGeneratedMedia({
            type: 'video',
            source: mode === 'image' ? 'image-to-video' : mode === 'remix' ? 'remix' : 'generated',
            url: currentVideo.url,
            prompt: currentVideo.prompt,
            model,
            config: { size, seconds, mode },
          }, currentHistoryId, genTime);
        } catch (err) {
          console.error('Failed to save video to database:', err);
        }
        setCurrentHistoryId(null);
      }
    };

    saveCompletedVideo();
  }, [currentVideo?.status, currentVideo?.url]);

  // Mark failed generations in history
  useEffect(() => {
    const markFailed = async () => {
      if (currentVideo?.status === 'failed' && currentHistoryId) {
        try {
          await markGenerationFailed(currentHistoryId, 'Video generation failed');
        } catch (err) {
          console.error('Failed to mark generation as failed:', err);
        }
        setCurrentHistoryId(null);
      }
    };

    markFailed();
  }, [currentVideo?.status]);

  // Handle improve prompt click
  const handleImprovePrompt = () => {
    const currentPrompt = mode === 'remix' ? remixPrompt : prompt;
    if (!currentPrompt.trim()) {
      setImprovementError('Please enter a prompt first');
      setTimeout(() => setImprovementError(null), 3000);
      return;
    }
    setShowImprovementModal(true);
    setImprovementError(null);
  };

  // Submit improvement request
  const handleSubmitImprovement = async () => {
    const currentPrompt = mode === 'remix' ? remixPrompt : prompt;
    if (!currentPrompt.trim()) return;

    setIsImprovingPrompt(true);
    setImprovementError(null);
    setShowImprovementModal(false);

    try {
      // Determine media sub-type based on mode
      let mediaSubType: string;
      if (mode === 'image') mediaSubType = 'image-to-video';
      else if (mode === 'remix') mediaSubType = 'text-to-video'; // Remix is still text-based
      else mediaSubType = 'text-to-video';

      const response = await fetch('/api/ai/media/prompt/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPrompt: currentPrompt,
          mediaType: mode === 'remix' ? 'video-editing' : 'video-generation',
          mediaSubType: mediaSubType,
          provider: 'openai',
          model: model,
          userInstructions: improvementInstructions || undefined,
          modelId: selectedAIModelId,
          context: {
            aspectRatio: size,
            duration: seconds,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to improve prompt');
      }

      // Update the appropriate prompt
      if (mode === 'remix') {
        setRemixPrompt(data.improvedPrompt);
      } else {
        setPrompt(data.improvedPrompt);
      }
      setImprovementInstructions('');

    } catch (error) {
      console.error('Prompt improvement error:', error);
      setImprovementError(getUserFriendlyError(error));
      setTimeout(() => setImprovementError(null), 5000);
    } finally {
      setIsImprovingPrompt(false);
    }
  };

  // Generate video
  const handleGenerate = useCallback(async () => {
    // Validation
    if (mode === 'remix') {
      if (!selectedVideoForRemix) {
        setError('Please select a video to remix');
        return;
      }
      if (!remixPrompt.trim()) {
        setError('Please enter a remix prompt describing the changes');
        return;
      }
    } else {
      if (!prompt.trim()) {
        setError('Please enter a video prompt');
        return;
      }
      if (mode === 'image' && !selectedImageUrl) {
        setError('Please select or upload an image for the first frame');
        return;
      }
    }

    setIsGenerating(true);
    setError(null);
    setGenerationStartTime(Date.now());

    // Create history entry for tracking
    const actionType = mode === 'remix' ? 'remix' : mode === 'image' ? 'image-to-video' : 'generate';
    const historyId = canSaveToDb ? await createHistoryEntry({
      type: 'video',
      action: actionType as any,
      prompt: mode === 'remix' ? remixPrompt : prompt,
      model,
      config: { size, seconds, mode },
      inputMediaUrls: mode === 'image' && selectedImageUrl ? [selectedImageUrl] : undefined,
    }) : null;
    setCurrentHistoryId(historyId);

    try {
      let endpoint: string;
      let requestBody: any;

      if (mode === 'remix') {
        // Video Remix - POST /api/ai/media/sora/remix
        endpoint = '/api/ai/media/sora/remix';
        requestBody = {
          previousVideoId: selectedVideoForRemix!.id,
          prompt: remixPrompt,
        };
      } else if (mode === 'image') {
        // Image-to-Video - POST /api/ai/media/sora/image-to-video
        endpoint = '/api/ai/media/sora/image-to-video';
        requestBody = {
          imageUrl: selectedImageUrl,
          prompt,
          model,
          size,
          seconds: String(seconds),
        };
      } else {
        // Text-to-Video - POST /api/ai/media/sora/generate
        endpoint = '/api/ai/media/sora/generate';
        requestBody = {
          prompt,
          model,
          size,
          seconds: String(seconds),
        };
      }


      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to start video generation');
      }

      const generatedVideo: GeneratedVideo = {
        id: data.videoId,
        prompt: mode === 'remix' ? remixPrompt : prompt,
        config: { prompt, model, size, seconds } as VideoGenerationConfig,
        status: 'queued',
        progress: 0,
        createdAt: Date.now(),
      };

      setCurrentVideo(generatedVideo);
      onVideoStarted(generatedVideo);

      // Start global polling (persists across page navigation)
      startSoraPolling(data.videoId, mode === 'remix' ? remixPrompt : prompt, model);

      // Also start local polling for immediate UI updates
      pollCountRef.current = 0;
      pollIntervalRef.current = setInterval(() => {
        pollVideoStatus(data.videoId);
      }, 5000);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMsg);
      setIsGenerating(false);

      // Mark generation as failed
      if (historyId) {
        await markGenerationFailed(historyId, errorMsg);
      }
      setCurrentHistoryId(null);
    }
  }, [mode, prompt, model, size, seconds, selectedImageUrl, selectedVideoForRemix, remixPrompt, onVideoStarted, pollVideoStatus, canSaveToDb, createHistoryEntry, markGenerationFailed]);

  // Apply preset
  const applyPreset = (presetId: string) => {
    const preset = PLATFORM_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setModel(preset.model as SoraModel);
      setSize(preset.size);
      setSeconds(preset.seconds);
    }
  };

  // Download video
  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `sora_${model}_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
    }
  };

  const completedVideos = recentVideos.filter(v => v.status === 'completed' && v.url);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-2 rounded-md" style={{ background: 'var(--ms-gradient-primary)' }}>
              <Video className="w-4 h-4 text-white" />
            </div>
            <span>Generate Video</span>
          </CardTitle>
          <CardDescription className="text-sm">
            OpenAI Sora - Text-to-Video, Image-to-Video, Video Remix
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Generation Mode - Compact */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Generation Mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setMode('text')}
                className={`
                  h-16 rounded-md border text-center transition-all duration-200 group
                  ${mode === 'text'
                    ? 'border-transparent shadow-sm'
                    : 'border-[var(--ms-border)] hover:border-[var(--ms-primary)] bg-card'
                  }
                `}
                style={mode === 'text' ? {
                  background: 'var(--ms-gradient-primary)',
                  boxShadow: '0 2px 6px rgba(13, 148, 136, 0.2)'
                } : undefined}
              >
                <Clapperboard className={`w-4 h-4 mx-auto mb-1 ${mode === 'text' ? 'text-white' : 'text-[var(--ms-primary)]'}`} />
                <div className={`text-sm font-medium ${mode === 'text' ? 'text-white' : 'text-foreground'}`}>Text</div>
              </button>
              <button
                onClick={() => setMode('image')}
                className={`
                  h-16 rounded-md border text-center transition-all duration-200 group
                  ${mode === 'image'
                    ? 'border-transparent shadow-sm'
                    : 'border-[var(--ms-border)] hover:border-[var(--ms-accent)] bg-card'
                  }
                `}
                style={mode === 'image' ? {
                  background: 'var(--ms-gradient-accent)',
                  boxShadow: '0 2px 6px rgba(245, 158, 11, 0.2)'
                } : undefined}
              >
                <Film className={`w-4 h-4 mx-auto mb-1 ${mode === 'image' ? 'text-white' : 'text-[var(--ms-accent)]'}`} />
                <div className={`text-sm font-medium ${mode === 'image' ? 'text-[var(--ms-accent-foreground)]' : 'text-foreground'}`}>Image</div>
              </button>
              <button
                onClick={() => setMode('remix')}
                className={`
                  h-16 rounded-md border text-center transition-all duration-200 group
                  ${mode === 'remix'
                    ? 'border-transparent shadow-sm'
                    : 'border-[var(--ms-border)] hover:border-[var(--ms-secondary)] bg-card'
                  }
                `}
                style={mode === 'remix' ? {
                  background: 'linear-gradient(135deg, var(--ms-secondary) 0%, var(--ms-secondary-dark) 100%)',
                  boxShadow: '0 2px 6px rgba(100, 116, 139, 0.2)'
                } : undefined}
              >
                <Wand2 className={`w-4 h-4 mx-auto mb-1 ${mode === 'remix' ? 'text-white' : 'text-[var(--ms-secondary)]'}`} />
                <div className={`text-sm font-medium ${mode === 'remix' ? 'text-white' : 'text-foreground'}`}>Remix</div>
              </button>
            </div>
          </div>

          {/* IMAGE MODE: Reference Image Selection */}
          {mode === 'image' && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <label className="text-sm font-medium flex items-center gap-2">
                Reference Image (First Frame)
                <Badge variant="secondary" className="text-xs">Required</Badge>
              </label>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Show selected image or picker */}
              {uploadedImage ? (
                <div className="space-y-2">
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border">
                    <img src={uploadedImage} alt="Selected" className="w-full h-full object-contain" />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setUploadedImage(null);
                        setSelectedImageUrl(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Will be used as first frame</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowLibraryPicker(true)}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Change Image
                  </Button>
                </div>
              ) : showLibraryPicker ? (
                /* Library Picker View */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowLibraryPicker(false)}
                      className="h-8 px-2"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                    <span className="text-sm font-medium">Select from Library</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchLibraryImages}
                      className="h-8 px-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingLibrary ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>

                  {isLoadingLibrary ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : libraryImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 max-h-[250px] overflow-y-auto">
                      {libraryImages.map((item) => (
                        <button
                          key={item.id}
                          className="aspect-video bg-muted rounded-md overflow-hidden transition-all hover:ring-2 hover:ring-primary"
                          onClick={() => handleLibrarySelect(item.url)}
                        >
                          <img src={item.url} alt={item.prompt || 'Library image'} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No images in library</p>
                      <p className="text-xs">Generate some images first</p>
                    </div>
                  )}

                  {/* Upload option */}
                  <div className="pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload from Computer
                    </Button>
                  </div>
                </div>
              ) : (
                /* Initial Selection Options */
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full h-16 border-dashed"
                    onClick={() => setShowLibraryPicker(true)}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <FolderOpen className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm font-medium">Select from Library</span>
                    </div>
                  </Button>

                  {/* Recent images quick access */}
                  {recentImages.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Recent images:</label>
                      <div className="grid grid-cols-4 gap-2">
                        {recentImages.slice(0, 4).map((img) => (
                          <button
                            key={img.id}
                            className="aspect-video bg-muted rounded-md overflow-hidden transition-all hover:ring-2 hover:ring-primary"
                            onClick={() => handleLibrarySelect(img.url)}
                          >
                            <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* REMIX MODE: Video Selection + Prompt */}
          {mode === 'remix' && (
            <div className="space-y-4">
              {/* API Limitation Note */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Note:</strong> Video Remix only works with videos generated by OpenAI Sora.
                    External video uploads are not supported by the API. Generate a video first, then remix it.
                  </span>
                </p>
              </div>

              {/* Video Selection */}
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    Select Video to Remix
                    <Badge variant="secondary" className="text-xs">Required</Badge>
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchLibraryVideos}
                    disabled={isLoadingLibraryVideos}
                    className="h-7 px-2"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingLibraryVideos ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                {/* Combine recent completed videos with library videos (deduplicated) */}
                {(() => {
                  const allVideos = [
                    ...completedVideos,
                    ...libraryVideos.filter(lv => !completedVideos.some(cv => cv.id === lv.id))
                  ];

                  if (isLoadingLibraryVideos && allVideos.length === 0) {
                    return (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    );
                  }

                  if (allVideos.length > 0) {
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto">
                          {allVideos.map((video) => (
                            <button
                              key={video.id}
                              className={`aspect-video bg-muted rounded-md overflow-hidden relative transition-all ${selectedVideoForRemix?.id === video.id
                                ? 'ring-2 ring-primary'
                                : 'hover:ring-2 hover:ring-muted-foreground/50'
                                }`}
                              onClick={() => setSelectedVideoForRemix(video)}
                            >
                              {video.url && (
                                <video src={video.url} className="w-full h-full object-cover" muted />
                              )}
                              {selectedVideoForRemix?.id === video.id && (
                                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                  <Check className="w-8 h-8 text-primary" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />
                          {libraryVideos.length} from library, {completedVideos.length} recent
                        </p>
                      </>
                    );
                  }

                  return (
                    <div className="p-6 border-2 border-dashed rounded-lg text-center">
                      <Film className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">
                        No Sora videos available yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Generate a video using Text or Image mode first, then come back to remix it
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Remix Prompt - Always visible */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  Remix Instructions
                  <Badge variant="secondary" className="text-xs">Required</Badge>
                </label>
                <Textarea
                  placeholder="Describe the specific change you want (e.g., 'Shift the color palette to teal and rust with warm backlight' or 'Change the weather to heavy snow')"
                  value={remixPrompt}
                  onChange={(e) => setRemixPrompt(e.target.value)}
                  className="min-h-[100px] resize-none"
                  disabled={!selectedVideoForRemix}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Best for single, well-defined changes - e.g., color shift, weather, lighting
                </p>
              </div>
            </div>
          )}

          {/* Prompt Input (Text and Image modes) */}
          {mode !== 'remix' && (
            <div className="space-y-2">
              <label className="ms-label">
                {mode === 'image' ? 'Animation Prompt' : 'Video Prompt'}
              </label>
              <Textarea
                placeholder={
                  mode === 'image'
                    ? "Describe how the image should animate (e.g., 'Camera slowly pans right as the subject turns and smiles')"
                    : "Describe your video in detail: subjects, camera movement, lighting, style, mood..."
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] resize-none"
              />
              <div className="flex items-center justify-start gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleImprovePrompt}
                  disabled={isImprovingPrompt || !prompt.trim()}
                  className="h-7 text-xs font-medium bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600 border-0"
                >
                  {isImprovingPrompt ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                      Improving...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1.5" />
                      Improve Prompt
                    </>
                  )}
                </Button>
                {improvementError && (
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {improvementError}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Platform Presets */}
          {mode !== 'remix' && (
            <div className="space-y-3">
              <label className="ms-label">Platform Presets</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_PRESETS.map((preset) => {
                  const isSelected = size === preset.size && seconds === preset.seconds && model === preset.model;

                  return (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`
                        px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200
                        ${isSelected
                          ? 'border-[var(--ms-primary)] bg-[var(--ms-primary)] text-white'
                          : 'border-[var(--ms-border)] hover:border-[var(--ms-primary)]/50 hover:bg-muted/50 text-foreground'
                        }
                      `}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model Selection */}
          {mode !== 'remix' && (
            <div className="space-y-2">
              <label className="ms-label">Sora Model</label>
              <div className="grid grid-cols-2 gap-2">
                {SORA_MODELS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setModel(m.value)}
                    className={`p-3 rounded-lg border-2 text-left transition-all duration-200 ${model === m.value
                      ? 'border-[var(--ms-primary)] bg-[var(--ms-primary)]/10 dark:bg-[var(--ms-primary)]/20'
                      : 'border-[var(--ms-border)] hover:border-[var(--ms-primary)]/50'
                      }`}
                  >
                    <div className="font-medium text-sm text-foreground">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size & Duration */}
          {mode !== 'remix' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="ms-label">Resolution</label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                >
                  {SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {selectedSize && (
                  <p className="text-xs text-muted-foreground">{selectedSize.description}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="ms-label">Duration</label>
                <select
                  value={seconds}
                  onChange={(e) => setSeconds(parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              (mode === 'remix' ? (!selectedVideoForRemix || !remixPrompt.trim()) : !prompt.trim()) ||
              (mode === 'image' && !selectedImageUrl)
            }
            className="w-full text-white border-0 transition-all duration-200"
            style={{
              background: 'var(--ms-gradient-primary)',
              boxShadow: '0 4px 16px rgba(13, 148, 136, 0.3)'
            }}
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating with {selectedModel.label}...
              </>
            ) : (
              <>
                <Clapperboard className="w-4 h-4 mr-2" />
                {mode === 'remix' ? 'Remix Video' : `Generate ${seconds}s Video`}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="overflow-hidden">
        <CardHeader style={{ background: 'var(--ms-gradient-subtle)', borderBottom: '1px solid var(--ms-border)' }}>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg" style={{ background: 'var(--ms-gradient-primary)' }}>
              <Play className="w-4 h-4 text-white" />
            </div>
            <span className="ms-heading-md">Preview</span>
          </CardTitle>
          <CardDescription className="ms-body-sm">
            Video preview and generation progress
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Main Preview */}
          <div className="aspect-video bg-gradient-to-br from-muted to-muted/50 rounded-xl overflow-hidden mb-4 relative border-2 border-dashed border-[var(--ms-border)]">
            {isGenerating && currentVideo ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6" style={{ background: 'var(--ms-gradient-subtle)' }}>
                {/* Cinematic Loading Animation */}
                <div className="relative mb-8">
                  <div
                    className="absolute inset-0 rounded-full blur-xl opacity-40 animate-pulse"
                    style={{ background: 'var(--ms-primary)' }}
                  />
                  <div className="relative w-20 h-20 rounded-full border-4 border-[var(--ms-border)] flex items-center justify-center">
                    <div
                      className="absolute inset-1 rounded-full border-4 border-transparent border-t-[var(--ms-primary)] animate-spin"
                    />
                    <Clapperboard className="w-8 h-8" style={{ color: 'var(--ms-primary)' }} />
                  </div>
                </div>

                <p className="ms-heading-sm mb-2">
                  {currentVideo.status === 'queued' ? 'In Queue...' : 'Rendering Video'}
                </p>
                <p className="ms-caption mb-6">
                  {currentVideo.status === 'queued'
                    ? 'Your video will start processing soon'
                    : 'AI is generating your video frame by frame'}
                </p>

                {/* Cinematic Progress Bar */}
                {currentVideo.progress !== undefined && (
                  <div className="w-full max-w-sm">
                    <div className="ms-progress-cinematic">
                      <div
                        className="ms-progress-cinematic-bar"
                        style={{ width: `${Math.max(currentVideo.progress, 3)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="ms-body-sm font-semibold" style={{ color: 'var(--ms-primary)' }}>
                        {currentVideo.progress}%
                      </span>
                      <span className="ms-caption flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" style={{ color: 'var(--ms-accent)' }} />
                        Est. {selectedModel.estimatedTime}
                      </span>
                    </div>

                    {/* Timeline Preview */}
                    <div className="ms-timeline mt-4">
                      {Array.from({ length: Math.ceil(seconds / 2) }).map((_, i) => (
                        <div
                          key={i}
                          className={`ms-timeline-segment ${(currentVideo.progress || 0) > (i / Math.ceil(seconds / 2)) * 100 ? 'active' : ''}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="ms-caption">0s</span>
                      <span className="ms-caption">{seconds}s</span>
                    </div>
                  </div>
                )}
              </div>
            ) : currentVideo?.url ? (
              <video
                src={currentVideo.url}
                controls
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="p-6 rounded-full bg-gradient-to-br from-muted-foreground/5 to-muted-foreground/10 mb-4">
                  <FileVideo className="w-12 h-12 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No video generated yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 text-center px-8">
                  Write a prompt and click generate to create your first video
                </p>
              </div>
            )}
          </div>

          {/* Video Actions */}
          {currentVideo?.url && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <Button variant="outline" onClick={() => handleDownload(currentVideo.url!)}>
                <Download className="w-4 h-4 mr-2" />
                Download MP4
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedVideoForRemix(currentVideo);
                  setMode('remix');
                }}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Remix This
              </Button>
              <Button
                variant="outline"
                className="col-span-2"
                onClick={() => {
                  setCurrentVideo(null);
                  setIsGenerating(false);
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                New Video
              </Button>
            </div>
          )}

          {/* Recent Videos */}
          {recentVideos.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Recent Videos</label>
              <div className="grid grid-cols-2 gap-2">
                {recentVideos.slice(0, 4).map((video) => (
                  <div
                    key={video.id}
                    className="aspect-video bg-muted rounded-md overflow-hidden relative group cursor-pointer"
                    onClick={() => {
                      if (video.url) {
                        setCurrentVideo(video);
                      }
                    }}
                  >
                    {video.url ? (
                      <video
                        src={video.url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => {
                          const vid = e.target as HTMLVideoElement;
                          if (vid.readyState >= 2 && vid.src) {
                            vid.play().catch(() => { });
                          }
                        }}
                        onMouseLeave={(e) => {
                          const target = e.target as HTMLVideoElement;
                          target.pause();
                          target.currentTime = 0;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    )}
                    <Badge
                      variant={video.status === 'completed' ? 'default' : 'secondary'}
                      className="absolute bottom-2 right-2 text-xs"
                    >
                      {video.status}
                    </Badge>
                    {video.status === 'completed' && video.url && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-8 h-8 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Prompt Improvement Modal */}
      {showImprovementModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setShowImprovementModal(false)}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border border-border overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Improve Prompt with AI</h3>
                  <p className="text-xs text-muted-foreground">Get cinematic video generation prompt</p>
                </div>
              </div>
              <button
                onClick={() => setShowImprovementModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  What would you like to improve? <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Textarea
                  value={improvementInstructions}
                  onChange={(e) => setImprovementInstructions(e.target.value)}
                  placeholder="Example: Add camera movements, enhance cinematography, include transitions, add pacing details..."
                  rows={7}
                  className="resize-none min-h-[160px]"
                />
              </div>

              {/* Quick Suggestions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Quick suggestions:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Luxury Commercial', instruction: 'Make it luxury brand style: slow-motion hero shots, dramatic rim lighting, shallow depth of field, elegant camera movements.' },
                    { label: 'Cinematography', instruction: 'Add professional cinematography: specific lens (50mm, 85mm), film grain, color grading with warm highlights and teal shadows.' },
                    { label: 'Product Hero', instruction: 'Create product hero shot: dramatic lighting, turntable rotation or slow reveal, macro details of craftsmanship.' },
                    { label: 'Audio & Sound', instruction: 'Add native audio: ambient sounds (city, nature, crowd), dialogue in "quotes", music mood (upbeat, orchestral, minimal). Include footsteps, fabric rustle, product sounds.' },
                    { label: 'Dialogue & Voice', instruction: 'Add dialogue or voiceover: put spoken words in "quotes". Include voice tone (warm, professional, energetic) and any background sounds.' },
                    { label: 'Fashion Film', instruction: 'Fashion film style: model walking confidently, fabric movement, tracking shots, shallow focus on clothing details.' }
                  ].map((suggestion) => (
                    <button
                      key={suggestion.label}
                      onClick={() => setImprovementInstructions(prev => prev ? `${prev}\n\n${suggestion.instruction}` : suggestion.instruction)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors border border-border"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Model Selection */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">AI Model</label>
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setShowAIModelDropdown(!showAIModelDropdown)}
                    className="px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 transition-colors bg-muted/50 text-foreground flex items-center gap-2 text-xs"
                  >
                    <span>{getModelDisplayName(selectedAIModelId)}</span>
                    <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showAIModelDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showAIModelDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto whitespace-nowrap">
                      {AI_MODELS.map((aiModel) => (
                        <button
                          key={aiModel.id}
                          type="button"
                          onClick={() => {
                            setSelectedAIModelId(aiModel.id);
                            setShowAIModelDropdown(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left hover:bg-muted transition-colors flex items-center gap-2 text-xs ${selectedAIModelId === aiModel.id ? 'bg-primary/10' : ''
                            }`}
                        >
                          <span className="text-foreground">{aiModel.name} <span className="text-muted-foreground">({aiModel.providerLabel})</span></span>
                          {selectedAIModelId === aiModel.id && (
                            <Check className="w-3 h-3 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  💡 <strong>Tip:</strong> Sora generates video with native audio. Add dialogue in "quotes", ambient sounds, and music mood for professional results.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-border bg-muted/30">
              <Button
                onClick={() => {
                  setShowImprovementModal(false);
                  setImprovementInstructions('');
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitImprovement}
                disabled={isImprovingPrompt}
                className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isImprovingPrompt ? 'Improving...' : 'Improve Prompt'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
