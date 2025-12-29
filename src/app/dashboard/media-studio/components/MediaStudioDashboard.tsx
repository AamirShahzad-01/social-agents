'use client';

import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Image as ImageIcon,
  Video,
  Edit3,
  Sparkles,
  Zap,
  Layers,
  AudioLines,
} from 'lucide-react';
import { ImageGenerator } from './ImageGenerator';
import { VideoGeneratorWithVeo } from './VideoGeneratorWithVeo';
import { ImageEditor } from './ImageEditor';
import { AudioGenerator } from './audio-generator';
import { useAuth } from '@/contexts/AuthContext';
import type { MediaStudioTab, GeneratedImage, GeneratedVideo, GeneratedVeoVideo } from '../types/mediaStudio.types';

interface MediaStudioState {
  recentImages: GeneratedImage[];
  recentVideos: GeneratedVideo[];
  recentVeoVideos: GeneratedVeoVideo[];
  isGenerating: boolean;
}

export function MediaStudioDashboard() {
  const { workspaceId } = useAuth();
  const [activeTab, setActiveTab] = useState<MediaStudioTab>('generate-image');
  const [state, setState] = useState<MediaStudioState>({
    recentImages: [],
    recentVideos: [],
    recentVeoVideos: [],
    isGenerating: false,
  });

  // Handle image generation complete
  const handleImageGenerated = useCallback((image: GeneratedImage) => {
    setState(prev => ({
      ...prev,
      recentImages: [image, ...prev.recentImages].slice(0, 50),
      isGenerating: false,
    }));
  }, []);

  // Handle video generation started (Sora)
  const handleVideoStarted = useCallback((video: GeneratedVideo | GeneratedVeoVideo) => {
    // Check if it's a Veo video
    if ('hasAudio' in video) {
      setState(prev => ({
        ...prev,
        recentVeoVideos: [video as GeneratedVeoVideo, ...prev.recentVeoVideos].slice(0, 50),
        isGenerating: true,
      }));
    } else {
      setState(prev => ({
        ...prev,
        recentVideos: [video as GeneratedVideo, ...prev.recentVideos].slice(0, 50),
        isGenerating: true,
      }));
    }
  }, []);

  // Handle video status update (Sora & Veo)
  const handleVideoUpdate = useCallback((videoId: string, updates: Partial<GeneratedVideo | GeneratedVeoVideo>) => {
    setState(prev => {
      // Check if it's in Veo videos
      const isVeoVideo = prev.recentVeoVideos.some(v => v.id === videoId);

      if (isVeoVideo) {
        return {
          ...prev,
          recentVeoVideos: prev.recentVeoVideos.map(v =>
            v.id === videoId ? { ...v, ...updates } as GeneratedVeoVideo : v
          ),
          isGenerating: updates.status === 'processing' || updates.status === 'pending',
        };
      } else {
        return {
          ...prev,
          recentVideos: prev.recentVideos.map(v =>
            v.id === videoId ? { ...v, ...updates } as GeneratedVideo : v
          ),
          isGenerating: updates.status === 'processing' || updates.status === 'queued',
        };
      }
    });
  }, []);

  const tabs = [
    {
      id: 'generate-image' as const,
      label: 'Generate Image',
      shortLabel: 'Image',
      icon: ImageIcon,
      color: 'teal',
    },
    {
      id: 'edit-image' as const,
      label: 'Edit Image',
      shortLabel: 'Edit',
      icon: Edit3,
      color: 'blue',
    },
    {
      id: 'generate-video' as const,
      label: 'Generate Video',
      shortLabel: 'Video',
      icon: Video,
      color: 'teal',
    },
    {
      id: 'generate-audio' as const,
      label: 'Generate Audio',
      shortLabel: 'Audio',
      icon: AudioLines,
      color: 'purple',
    },
  ];

  const currentTab = tabs.find(t => t.id === activeTab);

  return (
    <div className="flex flex-col h-full">

      {/* Main Content */}
      <div className="flex-1 pt-2 px-6 pb-6" style={{ background: 'var(--ms-gradient-subtle)' }}>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as MediaStudioTab)}
          className="flex-1 flex flex-col"
        >
          {/* Tab Navigation - Enterprise Standard */}
          <div className="bg-card border rounded-lg p-1 shadow-sm mb-4">
            <TabsList className="grid w-full grid-cols-4 bg-transparent gap-1 h-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={`
                      relative flex items-center justify-center gap-2 h-8 px-4 rounded-md 
                      text-[12px] font-medium transition-all duration-200
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
                      className={`w-4 h-4 transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}
                      style={!isActive ? {
                        color: tab.color === 'teal'
                          ? 'var(--ms-primary)'
                          : tab.color === 'blue'
                            ? '#0ea5e9'
                            : 'var(--ms-accent)'
                      } : undefined}
                    />
                    <span className="hidden lg:inline">{tab.label}</span>
                    <span className="lg:hidden">{tab.shortLabel}</span>

                    {/* Animated underline for inactive tabs on hover */}
                    {!isActive && (
                      <span
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 rounded-full transition-all duration-300 group-hover:w-8"
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


          {/* Generate Image Tab */}
          <TabsContent value="generate-image" className="flex-1 mt-0 focus-visible:outline-none focus-visible:ring-0">
            <ImageGenerator
              onImageGenerated={handleImageGenerated}
              recentImages={state.recentImages}
            />
          </TabsContent>

          {/* Edit Image Tab */}
          <TabsContent value="edit-image" className="flex-1 mt-0 focus-visible:outline-none focus-visible:ring-0">
            <ImageEditor
              onImageGenerated={handleImageGenerated}
              recentImages={state.recentImages}
            />
          </TabsContent>

          {/* Generate Video Tab - Now with GPT/Veo selector */}
          <TabsContent value="generate-video" className="flex-1 mt-0 focus-visible:outline-none focus-visible:ring-0">
            <VideoGeneratorWithVeo
              onVideoStarted={handleVideoStarted}
              onVideoUpdate={handleVideoUpdate}
              recentVideos={state.recentVideos}
              recentVeoVideos={state.recentVeoVideos}
              recentImages={state.recentImages}
            />
          </TabsContent>

          {/* Generate Audio Tab */}
          <TabsContent value="generate-audio" className="flex-1 mt-0 focus-visible:outline-none focus-visible:ring-0">
            <AudioGenerator />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
