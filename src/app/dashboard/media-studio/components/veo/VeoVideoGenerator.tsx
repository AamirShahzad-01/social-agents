'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  Sparkles,
  Image as ImageIcon,
  RefreshCw,
  Film,
  Images,
  Layers,
  Volume2,
} from 'lucide-react';
import { VeoTextToVideo } from './VeoTextToVideo';
import { VeoImageToVideo } from './VeoImageToVideo';
import { VeoVideoExtension } from './VeoVideoExtension';
import { VeoFrameSpecific } from './VeoFrameSpecific';
import { VeoReferenceImages } from './VeoReferenceImages';
import { VeoPreviewPanel } from './VeoPreviewPanel';
import type { GeneratedVeoVideo, GeneratedImage } from '../../types/mediaStudio.types';
import { useMediaLibrary } from '../../hooks/useMediaLibrary';
import { useVideoGeneration } from '@/contexts/VideoGenerationContext';

// ============================================================================
// Types
// ============================================================================

export type VeoMode = 'text' | 'image' | 'extend' | 'frame-specific' | 'reference';

interface VeoVideoGeneratorProps {
  onVideoStarted: (video: GeneratedVeoVideo) => void;
  onVideoUpdate: (videoId: string, updates: Partial<GeneratedVeoVideo>) => void;
  recentVideos: GeneratedVeoVideo[];
  recentImages: GeneratedImage[];
}

// ============================================================================
// Mode Configuration
// ============================================================================

const VEO_MODES: { id: VeoMode; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'text', label: 'Text', icon: <Sparkles className="w-4 h-4" />, description: 'From prompt' },
  { id: 'image', label: 'Image', icon: <ImageIcon className="w-4 h-4" />, description: 'First frame' },
  { id: 'extend', label: 'Extend', icon: <RefreshCw className="w-4 h-4" />, description: '+7 seconds' },
  { id: 'frame-specific', label: 'Frames', icon: <Layers className="w-4 h-4" />, description: 'Start & end' },
  { id: 'reference', label: 'Reference', icon: <Images className="w-4 h-4" />, description: '1-3 images' },
];

// ============================================================================
// Component
// ============================================================================

export function VeoVideoGenerator({
  onVideoStarted,
  onVideoUpdate,
  recentVideos,
  recentImages,
}: VeoVideoGeneratorProps) {
  const { saveGeneratedMedia, createHistoryEntry, markGenerationFailed, isEnabled: canSaveToDb, workspaceId } = useMediaLibrary();

  // Global video generation context for persistent polling across pages
  const { startVeoPolling } = useVideoGeneration();

  // State
  const [mode, setMode] = useState<VeoMode>('text');
  const [currentVideo, setCurrentVideo] = useState<GeneratedVeoVideo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number>(0);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use ref to track currentVideo for callbacks (avoids stale closure)
  const currentVideoRef = useRef<GeneratedVeoVideo | null>(null);

  // Keep ref in sync with state
  React.useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  // Get extendable videos (Veo videos with extension_count < 20)
  const extendableVideos = recentVideos.filter(
    v => v.status === 'completed' &&
      v.veoVideoId &&
      (v.extensionCount === undefined || v.extensionCount < 20)
  );

  // Poll video status
  const pollVideoStatus = useCallback(async (operationId: string, operationName: string) => {
    try {
      const response = await fetch('/api/ai/media/veo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, operationName }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.done) {
          if (data.status === 'completed' && data.video) {
            // Download and save to Supabase
            const downloadResponse = await fetch('/api/ai/media/veo/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                veoVideoId: data.video.veoVideoId,
                operationId,
                uploadToSupabase: true,
              }),
            });
            const downloadData = await downloadResponse.json();
            const videoUrl = downloadData.url || data.video.url;

            onVideoUpdate(operationId, {
              status: 'completed',
              url: videoUrl,
              progress: 100,
              veoVideoId: data.video.veoVideoId,
            });

            setCurrentVideo(prev => prev ? {
              ...prev,
              status: 'completed',
              url: videoUrl,
              progress: 100,
              veoVideoId: data.video.veoVideoId,
            } : null);

            // Save to database - use ref to get current value (avoids stale closure)
            const videoToSave = currentVideoRef.current;
            if (canSaveToDb && videoUrl && videoToSave) {
              const genTime = generationStartTime > 0 ? Date.now() - generationStartTime : undefined;

              // Calculate total duration - for extensions, use total_duration from config
              const totalDuration = videoToSave.config.total_duration || videoToSave.config.duration || 8;
              // For extensions, extensionCount is already the new count
              const extensionCount = videoToSave.extensionCount || 0;
              // Can extend if under 20 extensions
              const isExtendable = extensionCount < 20;

              try {
                console.log('Saving Veo video to database...', { url: videoUrl.substring(0, 50) + '...' });
                const result = await saveGeneratedMedia({
                  type: 'video',
                  source: `veo-${mode}` as any,
                  url: videoUrl,
                  prompt: videoToSave.prompt,
                  model: videoToSave.config.model,
                  config: {
                    ...videoToSave.config,
                    veo_video_id: data.video.veoVideoId,
                    veo_operation_id: operationId,
                    extension_count: extensionCount,
                    is_extendable: isExtendable,
                    total_duration: totalDuration,
                    parent_video_id: videoToSave.config.parent_video_id,
                  },
                }, currentHistoryId, genTime);
                console.log('Veo video saved to database:', result);
              } catch (err) {
                console.error('Failed to save Veo video to database:', err);
              }
            }

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsGenerating(false);
            setCurrentHistoryId(null);
          } else if (data.status === 'failed') {
            onVideoUpdate(operationId, { status: 'failed', progress: 0 });
            setError(data.error || 'Video generation failed. Please try again.');

            if (currentHistoryId) {
              await markGenerationFailed(currentHistoryId, data.error || 'Video generation failed');
            }

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsGenerating(false);
            setCurrentHistoryId(null);
          }
        } else {
          // Still processing
          onVideoUpdate(operationId, {
            status: 'processing',
            progress: data.progress,
          });
          setCurrentVideo(prev => prev ? {
            ...prev,
            status: 'processing',
            progress: data.progress,
          } : null);
        }
      }
    } catch (err) {
    }
  }, [onVideoUpdate, canSaveToDb, currentHistoryId, generationStartTime, markGenerationFailed, mode, saveGeneratedMedia]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Handle generation started from child components
  const handleGenerationStarted = useCallback(async (
    video: GeneratedVeoVideo,
    historyAction: string
  ) => {
    setIsGenerating(true);
    setError(null);
    setGenerationStartTime(Date.now());
    setCurrentVideo(video);
    onVideoStarted(video);

    // Create history entry
    const historyId = canSaveToDb ? await createHistoryEntry({
      type: 'video',
      action: historyAction as any,
      prompt: video.prompt,
      model: video.config.model,
      config: video.config,
    }) : null;
    setCurrentHistoryId(historyId);

    // Start global polling (persists across page navigation)
    if (video.operationId && video.operationName) {
      startVeoPolling(video.operationId, video.operationName, video.prompt, video.config.model);
    }

    // Also start local polling for immediate UI updates
    if (video.operationId && video.operationName) {
      pollIntervalRef.current = setInterval(() => {
        pollVideoStatus(video.operationId!, video.operationName!);
      }, 10000);
    }
  }, [canSaveToDb, createHistoryEntry, onVideoStarted, pollVideoStatus, startVeoPolling]);

  // Handle generation error from child components
  const handleGenerationError = useCallback(async (errorMsg: string) => {
    setError(errorMsg);
    setIsGenerating(false);

    if (currentHistoryId) {
      await markGenerationFailed(currentHistoryId, errorMsg);
    }
    setCurrentHistoryId(null);
  }, [currentHistoryId, markGenerationFailed]);

  // Handle video selection for extension
  const handleSelectVideoForExtend = useCallback((video: GeneratedVeoVideo) => {
    setMode('extend');
  }, []);

  // Handle new video
  const handleNewVideo = useCallback(() => {
    setCurrentVideo(null);
    setIsGenerating(false);
    setError(null);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Configuration Panel */}
      <Card className="border rounded-xl lg:col-span-3">
        <CardHeader className="p-5 pb-4">
          <CardTitle className="flex items-center gap-3 text-[15px]">
            <div className="p-2.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' }}>
              <Video className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="font-semibold">Google Veo 3.1</span>
          </CardTitle>
          <CardDescription className="text-[13px] flex items-center gap-2 mt-1">
            AI Video Generation with Native Audio
            <Badge variant="secondary" className="text-[10px] flex items-center gap-1 h-5 px-2">
              <Volume2 className="w-3 h-3" />
              Audio
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-5">
          {/* Generation Mode Tabs - Enterprise Standard */}
          <div className="space-y-2.5">
            <label className="text-[13px] font-medium text-foreground">Generation Mode</label>
            <div className="grid grid-cols-5 gap-1.5">
              {VEO_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  disabled={isGenerating}
                  className={`h-11 px-1.5 rounded-lg border text-center transition-all ${mode === m.id
                    ? 'border-purple-500 bg-purple-500/10 dark:bg-purple-500/20 ring-1 ring-purple-500 shadow-sm'
                    : 'border-[var(--ms-border)] hover:border-purple-500/50'
                    } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex justify-center mb-0.5">{m.icon}</div>
                  <div className="font-medium text-[10px] text-foreground leading-tight">{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode-specific content */}
          {mode === 'text' && (
            <VeoTextToVideo
              onGenerationStarted={handleGenerationStarted}
              onError={handleGenerationError}
              isGenerating={isGenerating}
            />
          )}

          {mode === 'image' && (
            <VeoImageToVideo
              onGenerationStarted={handleGenerationStarted}
              onError={handleGenerationError}
              isGenerating={isGenerating}
              recentImages={recentImages}
              workspaceId={workspaceId}
            />
          )}

          {mode === 'extend' && (
            <VeoVideoExtension
              onGenerationStarted={handleGenerationStarted}
              onError={handleGenerationError}
              isGenerating={isGenerating}
              extendableVideos={extendableVideos}
            />
          )}

          {mode === 'frame-specific' && (
            <VeoFrameSpecific
              onGenerationStarted={handleGenerationStarted}
              onError={handleGenerationError}
              isGenerating={isGenerating}
              recentImages={recentImages}
              workspaceId={workspaceId}
            />
          )}

          {mode === 'reference' && (
            <VeoReferenceImages
              onGenerationStarted={handleGenerationStarted}
              onError={handleGenerationError}
              isGenerating={isGenerating}
              recentImages={recentImages}
              workspaceId={workspaceId}
            />
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <VeoPreviewPanel
        currentVideo={currentVideo}
        isGenerating={isGenerating}
        recentVideos={recentVideos}
        onSelectVideo={setCurrentVideo}
        onExtendVideo={handleSelectVideoForExtend}
        onNewVideo={handleNewVideo}
      />
    </div>
  );
}

export default VeoVideoGenerator;

