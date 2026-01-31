'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  Video,
  Music,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Wand2,
  Check,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { VideoItem, AudioItem } from './types';
import { AudioLibrary } from './AudioLibrary';

interface AudioMixerProps {
  libraryVideos: VideoItem[];
  isLoadingLibrary: boolean;
  onProcessComplete: (videoUrl: string) => void;
}

export function AudioMixer({ libraryVideos, isLoadingLibrary, onProcessComplete }: AudioMixerProps) {
  const { workspaceId } = useAuth();
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<AudioItem | null>(null);
  const [muteOriginal, setMuteOriginal] = useState(true);
  const [originalVolume, setOriginalVolume] = useState(100);
  const [musicVolume, setMusicVolume] = useState(80);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const handleProcess = async () => {
    if (!selectedVideo) {
      toast.error('Please select a video first');
      return;
    }

    if (!selectedAudio) {
      toast.error('Please select new audio to add');
      return;
    }

    if (!workspaceId) {
      toast.error('No workspace selected');
      return;
    }

    setIsProcessing(true);
    const loadingToast = toast.loading('Processing audio...');

    try {
      const response = await fetch('/api/media-studio/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          videoUrl: selectedVideo.url,
          muteOriginal,
          backgroundMusicUrl: selectedAudio?.url,
          backgroundMusicName: selectedAudio?.name,
          originalVolume: muteOriginal ? 0 : originalVolume,
          musicVolume: selectedAudio ? musicVolume : 0,
        }),
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        const data = await response.json();
        toast.success('Audio processed successfully!');

        // Reset state
        setSelectedVideo(null);
        setSelectedAudio(null);
        setMuteOriginal(false);
        setOriginalVolume(100);
        setMusicVolume(80);

        onProcessComplete(data.url);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to process audio');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePreview = () => {
    if (videoPreviewRef.current) {
      if (isPreviewPlaying) {
        videoPreviewRef.current.pause();
      } else {
        videoPreviewRef.current.play();
      }
      setIsPreviewPlaying(!isPreviewPlaying);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-1">
      {/* Left: Video Selection */}
      <Card className="flex flex-col h-full overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1 px-2.5">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Video className="w-5 h-5 text-white" />
            Select Video
          </CardTitle>
          <CardDescription className="text-teal-50">
            Choose a video and add new audio
          </CardDescription>
        </CardHeader>
        <CardContent className="p-1.5">
          {isLoadingLibrary ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : libraryVideos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No videos in library</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {libraryVideos.map((item) => {
                const isSelected = selectedVideo?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200 shadow-sm ${isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/50 scale-[0.98]'
                      : 'border-transparent hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md'
                      }`}
                    onClick={() => setSelectedVideo(isSelected ? null : item)}
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
                            (e.target as HTMLVideoElement).currentTime = 0.5;
                          }}
                        />
                      )}

                      {/* Duration badge */}
                      {(item.duration || 0) > 0 && (
                        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono backdrop-blur-sm">
                          {Math.floor((item.duration || 0) / 60)}:{((item.duration || 0) % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    {/* Overlay Actions */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-all bg-black/40 ${isSelected ? 'opacity-100 backdrop-blur-[1px]' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                      {isSelected ? (
                        <Badge className="bg-indigo-500 hover:bg-indigo-600 px-3 py-1">
                          <Check className="w-3 h-3 mr-1.5" />
                          Selected
                        </Badge>
                      ) : (
                        <div className="bg-white/90 text-zinc-900 px-3 py-1 rounded-full text-xs font-medium shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform flex items-center gap-1.5">
                          <Plus className="w-3 h-3" />
                          Select
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Middle: Audio Controls */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1 px-2.5">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Volume2 className="w-5 h-5 text-white" />
            Audio Settings
          </CardTitle>
          <CardDescription className="text-teal-50">
            Configure audio mixing options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-1.5">
          {/* Video Preview */}
          {selectedVideo && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Preview</label>
              <div className="relative rounded-md overflow-hidden bg-black">
                <video
                  ref={videoPreviewRef}
                  src={selectedVideo.url}
                  className="w-full aspect-video object-cover"
                  muted={muteOriginal}
                  onEnded={() => setIsPreviewPlaying(false)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 left-2"
                  onClick={togglePreview}
                >
                  {isPreviewPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Mute Original Audio */}
          <div className="flex items-center justify-between p-1.5 bg-muted rounded-md">
            <div className="flex items-center gap-2">
              <VolumeX className="w-4 h-4" />
              <span className="text-sm font-medium">Replace Original Audio</span>
            </div>
            <Switch
              checked={muteOriginal}
              onCheckedChange={setMuteOriginal}
            />
          </div>

          {/* Original Volume Slider */}
          {!muteOriginal && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Original Volume</label>
                <span className="text-sm text-muted-foreground">{originalVolume}%</span>
              </div>
              <Slider
                value={[originalVolume]}
                onValueChange={([v]) => setOriginalVolume(v)}
                min={0}
                max={100}
                step={5}
              />
            </div>
          )}

          {/* Music Volume Slider */}
          {selectedAudio && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Music Volume
                </label>
                <span className="text-sm text-muted-foreground">{musicVolume}%</span>
              </div>
              <Slider
                value={[musicVolume]}
                onValueChange={([v]) => setMusicVolume(v)}
                min={0}
                max={100}
                step={5}
              />
            </div>
          )}

          {/* Process Button */}
          <Button
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            onClick={handleProcess}
            disabled={!selectedVideo || isProcessing || (!muteOriginal && !selectedAudio)}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Process Video
              </>
            )}
          </Button>

          {!selectedVideo && (
            <p className="text-xs text-muted-foreground text-center">
              Select a video to get started
            </p>
          )}
        </CardContent>
      </Card>

      {/* Right: Audio Library */}
      <AudioLibrary
        selectedAudio={selectedAudio}
        onSelectAudio={setSelectedAudio}
      />
    </div>
  );
}
