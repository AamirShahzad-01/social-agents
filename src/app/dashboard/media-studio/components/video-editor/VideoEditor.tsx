'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Film,
  Music,
  Merge,
  Crop,
  Image as ImageIcon,
  Scissors,
  Gauge,
  Type,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { VideoItem } from './types';
import { VideoMerger } from './VideoMerger';
import { AudioMixer } from './AudioMixer';
import { VideoResizer } from './VideoResizer';
import { ImageResizer } from './ImageResizer';
import { VideoTrimmer } from './VideoTrimmer';
import { SpeedController } from './SpeedController';
import { TextOverlay } from './TextOverlay';

interface VideoEditorProps {
  onVideoProcessed?: (videoUrl: string) => void;
}

type TabValue = 'merge' | 'trim' | 'speed' | 'text' | 'audio' | 'resize' | 'image';

export function VideoEditor({ onVideoProcessed }: VideoEditorProps) {
  const { workspaceId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabValue>('merge');
  const [libraryVideos, setLibraryVideos] = useState<VideoItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);

  useEffect(() => {
    if (workspaceId) {
      fetchLibraryVideos();
    }
  }, [workspaceId]);

  const fetchLibraryVideos = async () => {
    if (!workspaceId) return;
    setIsLoadingLibrary(true);
    try {
      const response = await fetch(
        `/api/media-studio/library?workspace_id=${workspaceId}&type=video&limit=50`
      );
      if (response.ok) {
        const data = await response.json();
        const items = data.items || [];

        // Map database MediaItem to VideoItem, ensuring duration is available
        const videoItems: VideoItem[] = items.map((item: any) => ({
          ...item,
          // Extract duration from metadata if available at top level or nested
          duration: item.duration || item.metadata?.duration || item.metadata?.video?.duration || 0
        }));

        setLibraryVideos(videoItems);
      }
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleProcessComplete = async (videoUrl: string) => {
    // Refresh library to show new video
    await fetchLibraryVideos();

    // Notify parent
    if (onVideoProcessed) {
      onVideoProcessed(videoUrl);
    }
  };

  return (
    <div className="space-y-3">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <div className="bg-card border rounded-lg p-1 shadow-sm">
          <TabsList className="grid w-full grid-cols-7 bg-transparent gap-1 h-auto">
            <TabsTrigger value="merge" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <Merge className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Merge</span>
            </TabsTrigger>
            <TabsTrigger value="trim" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <Scissors className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Trim</span>
            </TabsTrigger>
            <TabsTrigger value="speed" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <Gauge className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Speed</span>
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <Type className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Text</span>
            </TabsTrigger>
            <TabsTrigger value="audio" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <Music className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Audio</span>
            </TabsTrigger>
            <TabsTrigger value="resize" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <Crop className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Resize</span>
            </TabsTrigger>
            <TabsTrigger value="image" className="gap-1.5 text-[11px] sm:text-[12px] h-8 rounded-md data-[state=active]:shadow-sm">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Image</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="merge" className="mt-4">
          <VideoMerger
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onMergeComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="trim" className="mt-4">
          <VideoTrimmer
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onTrimComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="speed" className="mt-4">
          <SpeedController
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onSpeedComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="text" className="mt-4">
          <TextOverlay
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onTextComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="audio" className="mt-4">
          <AudioMixer
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onProcessComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="resize" className="mt-4">
          <VideoResizer
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onResizeComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="image" className="mt-4">
          <ImageResizer
            onResizeComplete={handleProcessComplete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

