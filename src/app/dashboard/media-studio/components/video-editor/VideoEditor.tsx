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

  const tabs = [
    { id: 'merge' as const, label: 'Merge', icon: Merge, color: 'teal' },
    { id: 'trim' as const, label: 'Trim', icon: Scissors, color: 'teal' },
    { id: 'speed' as const, label: 'Speed', icon: Gauge, color: 'blue' },
    { id: 'text' as const, label: 'Text', icon: Type, color: 'purple' },
    { id: 'audio' as const, label: 'Audio', icon: Music, color: 'purple' },
    { id: 'resize' as const, label: 'Resize', icon: Crop, color: 'blue' },
    { id: 'image' as const, label: 'Image', icon: ImageIcon, color: 'teal' },
  ];

  return (
    <div className="space-y-2">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        {/* Tab Navigation - Compact Style */}
        <div className="bg-card border rounded-md p-0.5 shadow-sm">
          <TabsList className="grid w-full grid-cols-7 bg-transparent gap-0.5 h-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`
                    relative flex items-center justify-center gap-1 h-7 px-1.5 rounded 
                    text-[10px] sm:text-[11px] font-medium transition-all duration-200
                    data-[state=inactive]:hover:bg-muted/60
                    group
                  `}
                  style={isActive ? {
                    background: tab.color === 'teal'
                      ? 'var(--ms-gradient-primary)'
                      : tab.color === 'blue'
                        ? 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)'
                        : 'var(--ms-gradient-accent)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)'
                  } : undefined}
                >
                  <tab.icon
                    className={`w-3 h-3 transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}
                    style={!isActive ? {
                      color: tab.color === 'teal'
                        ? 'var(--ms-primary)'
                        : tab.color === 'blue'
                          ? '#0ea5e9'
                          : 'var(--ms-accent)'
                    } : undefined}
                  />
                  <span className="hidden sm:inline">{tab.label}</span>

                  {/* Animated underline for inactive tabs on hover */}
                  {!isActive && (
                    <span
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0.5 rounded-full transition-all duration-300 group-hover:w-5"
                      style={{
                        background: tab.color === 'teal'
                          ? 'var(--ms-primary)'
                          : tab.color === 'blue'
                            ? '#0ea5e9'
                            : 'var(--ms-accent)'
                      }}
                    />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="merge" className="mt-2">
          <VideoMerger
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onMergeComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="trim" className="mt-2">
          <VideoTrimmer
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onTrimComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="speed" className="mt-2">
          <SpeedController
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onSpeedComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="text" className="mt-2">
          <TextOverlay
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onTextComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="audio" className="mt-2">
          <AudioMixer
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onProcessComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="resize" className="mt-2">
          <VideoResizer
            libraryVideos={libraryVideos}
            isLoadingLibrary={isLoadingLibrary}
            onResizeComplete={handleProcessComplete}
          />
        </TabsContent>

        <TabsContent value="image" className="mt-2">
          <ImageResizer
            onResizeComplete={handleProcessComplete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
