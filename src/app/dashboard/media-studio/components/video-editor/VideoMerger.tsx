'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Video,
  Film,
  Plus,
  Trash2,
  Merge,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Clock,
  Settings2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { VideoItem } from './types';

interface VideoMergerProps {
  libraryVideos: VideoItem[];
  isLoadingLibrary: boolean;
  onMergeComplete: (videoUrl: string) => void;
}

const MAX_DURATION_SECONDS = 300; // 5 minutes

export function VideoMerger({ libraryVideos, isLoadingLibrary, onMergeComplete }: VideoMergerProps) {
  const { workspaceId } = useAuth();
  const [mergeQueue, setMergeQueue] = useState<VideoItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeTitle, setMergeTitle] = useState('');

  // Configuration
  const [quality, setQuality] = useState<'draft' | 'high'>('high');
  const [resolution, setResolution] = useState<'original' | '720p'>('original');

  const totalDuration = useMemo(() => {
    return mergeQueue.reduce((acc, item) => acc + (item.duration || 0), 0);
  }, [mergeQueue]);

  const isDurationLimitExceeded = totalDuration > MAX_DURATION_SECONDS;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addToQueue = (item: VideoItem) => {
    if (mergeQueue.find(v => v.id === item.id)) {
      toast.error('Video already in queue');
      return;
    }

    // Check duration limit before adding (optional, but good UX)
    const newTotal = totalDuration + (item.duration || 0);
    if (newTotal > MAX_DURATION_SECONDS) {
      toast((t) => (
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
          <div>
            <p className="font-semibold">Duration Limit Warning</p>
            <p className="text-sm">Adding this video will exceed the 5-minute limit. You won't be able to merge.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => toast.dismiss(t.id)}>Dismiss</Button>
          </div>
        </div>
      ));
    }

    setMergeQueue(prev => [...prev, item]);
    toast.success('Video added to merge queue', { position: 'bottom-center' });
  };

  const removeFromQueue = (itemId: string) => {
    setMergeQueue(prev => prev.filter(v => v.id !== itemId));
  };

  const moveInQueue = (index: number, direction: 'up' | 'down') => {
    const newQueue = [...mergeQueue];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newQueue.length) return;
    [newQueue[index], newQueue[newIndex]] = [newQueue[newIndex], newQueue[index]];
    setMergeQueue(newQueue);
  };

  const clearQueue = () => {
    setMergeQueue([]);
    setMergeTitle('');
  };

  const handleMerge = async () => {
    if (mergeQueue.length < 2) {
      toast.error('Add at least 2 videos to merge');
      return;
    }

    if (isDurationLimitExceeded) {
      toast.error(`Total duration exceeds 5 minutes limit (${formatDuration(totalDuration)})`);
      return;
    }

    if (!workspaceId) {
      toast.error('No workspace selected');
      return;
    }

    setIsMerging(true);
    // Rough estimate: 20s overhead + 0.5x realtime for high quality
    const estimatedTime = Math.max(30, Math.ceil(totalDuration * 1.5));

    const loadingToast = toast.loading(
      `Merging videos... This may take ~${formatDuration(estimatedTime)} (don't close this tab)`,
      { duration: Infinity }
    );

    try {
      const response = await fetch('/api/media-studio/merge-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          videoUrls: mergeQueue.map(v => v.url),
          title: mergeTitle || `Merged video (${mergeQueue.length} clips)`,
          config: {
            quality,
            resolution
          }
        }),
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        const data = await response.json();
        toast.success('Videos merged successfully!');
        clearQueue();
        onMergeComplete(data.url);
      } else {
        const error = await response.json();
        const errorMessage =
          error?.detail?.error ||
          error?.detail ||
          error?.error ||
          'Failed to merge videos';
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Failed to merge videos. Please try again with fewer clips or clearer quality.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-1 h-[calc(100vh-200px)] min-h-[560px]">
      {/* Left: Video Library Selection */}
      <Card className="flex flex-col h-full overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1 px-2.5">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Video className="w-5 h-5 text-white" />
            Library
          </CardTitle>
          <CardDescription className="text-teal-50">
            Select clips to merge (Max 5 mins total)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {isLoadingLibrary ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p>Loading library...</p>
            </div>
          ) : libraryVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3 text-center p-8">
              <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2">
                <Video className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="font-medium text-foreground">No videos yet</h3>
              <p className="text-sm max-w-[250px]">
                Create your first video using the AI Video Generator to start merging clips.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {libraryVideos.map((item) => {
                const isInQueue = mergeQueue.some(v => v.id === item.id);
                return (
                  <div
                    key={item.id}
                    className={`relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200 shadow-sm ${isInQueue
                      ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/50 scale-[0.98]'
                      : 'border-transparent hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md'
                      }`}
                    onClick={() => !isInQueue && addToQueue(item)}
                  >
                    <div className="aspect-video bg-zinc-900 relative">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.prompt || 'Video'}
                          className="w-full h-full object-cover block"
                        />
                      ) : (
                        <video
                          src={item.url}
                          className="w-full h-full object-cover block"
                          muted
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            // optional: could capture duration here if missing
                            (e.target as HTMLVideoElement).currentTime = 0.5;
                          }}
                        />
                      )}
                      {/* Duration badge */}
                      {item.duration && (
                        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono backdrop-blur-sm">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>

                    {/* Overlay Actions */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-all bg-black/40 ${isInQueue ? 'opacity-100 backdrop-blur-[1px]' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                      {isInQueue ? (
                        <Badge className="bg-indigo-500 hover:bg-indigo-600 px-3 py-1">
                          <Check className="w-3 h-3 mr-1.5" />
                          Selected
                        </Badge>
                      ) : (
                        <Button size="sm" variant="secondary" className="shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform">
                          <Plus className="w-4 h-4 mr-1.5" />
                          Add to Queue
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Merge Queue & Settings */}
      <Card className="flex flex-col h-full border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1.5 px-2.5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Film className="w-5 h-5 text-white" />
              Merge Studio
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={isDurationLimitExceeded ? "destructive" : "secondary"} className={`gap-1.5 ${isDurationLimitExceeded ? '' : 'bg-white/20 text-white border-white/30'}`}>
                <Clock className="w-3 h-3" />
                {formatDuration(totalDuration)} / 5:00
              </Badge>
              <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                {mergeQueue.length} clips
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {mergeQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 border-2 border-dashed rounded-xl m-0.5">
                <Film className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">Your timeline is empty</p>
                <p className="text-xs">Add clips from the library to start editing</p>
              </div>
            ) : (
              mergeQueue.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 p-1 bg-card rounded-lg border shadow-sm group hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors"
                >
                  {/* Order controls */}
                  <div className="flex flex-col items-center gap-0.5 text-zinc-400">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => moveInQueue(index, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <span className="text-[10px] font-mono font-bold">{index + 1}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => moveInQueue(index, 'down')}
                      disabled={index === mergeQueue.length - 1}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Thumbnail */}
                  <div className="w-24 h-14 rounded-md overflow-hidden bg-black flex-shrink-0 relative border border-zinc-200 dark:border-zinc-800">
                    {item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover block" />
                    ) : (
                      <video src={item.url} className="w-full h-full object-cover block" muted />
                    )}
                    <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1">
                      {item.duration ? formatDuration(item.duration) : '--:--'}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground/90">
                      {item.prompt || `Video ${index + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Remove button */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    onClick={() => removeFromQueue(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t bg-background/50 backdrop-blur-sm space-y-1">
            {isDurationLimitExceeded && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                <AlertTriangle className="w-4 h-4" />
                Exceeds 5 minute limit. Please remove some clips.
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={clearQueue}
                disabled={isMerging || mergeQueue.length === 0}
                className="flex-1"
              >
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
              <Button
                onClick={handleMerge}
                disabled={isMerging || mergeQueue.length < 2 || isDurationLimitExceeded}
                className="flex-[2] bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white shadow-lg shadow-teal-500/20 transition-all hover:scale-[1.02]"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <Merge className="w-4 h-4 mr-2" />
                    Merge {mergeQueue.length} Videos
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
