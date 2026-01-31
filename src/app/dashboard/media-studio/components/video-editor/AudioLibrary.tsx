'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Music,
  Upload,
  Play,
  Pause,
  Trash2,
  Plus,
  Check,
  AudioLines,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { AudioItem } from './types';
import { MediaItem } from '../../types/mediaStudio.types';

interface AudioLibraryProps {
  selectedAudio: AudioItem | null;
  onSelectAudio: (audio: AudioItem | null) => void;
}

export function AudioLibrary({ selectedAudio, onSelectAudio }: AudioLibraryProps) {
  const { workspaceId } = useAuth();
  const [audioItems, setAudioItems] = useState<AudioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (workspaceId) {
      fetchAudioItems();
    }
  }, [workspaceId]);

  const fetchAudioItems = async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/media-studio/library?workspace_id=${workspaceId}&type=audio&limit=50`
      );
      if (response.ok) {
        const data = await response.json();
        // Map MediaItem to AudioItem
        const items = (data.items || []).map((item: any) => ({
          id: item.id,
          url: item.url,
          type: 'audio',
          name: item.prompt || 'Untitled Audio',
          duration: item.duration,
          created_at: item.created_at || item.createdAt,
          source: item.source
        }));
        setAudioItems(items);
      }
    } catch (error) {
      console.error('Failed to fetch audio items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration || duration <= 0) return null;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/m4a', 'audio/aac'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|aac)$/i)) {
      toast.error('Please select a valid audio file (MP3, WAV, M4A, AAC)');
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Audio file must be less than 50MB');
      return;
    }

    setIsUploading(true);
    const loadingToast = toast.loading('Uploading audio...');

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to media library
      const response = await fetch('/api/media-studio/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          mediaItem: {
            type: 'audio',
            source: 'uploaded',
            url: base64,
            prompt: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for name
            model: 'upload',
            tags: ['audio', 'music', 'uploaded'],
          },
        }),
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        toast.success('Audio uploaded successfully!');
        await fetchAudioItems();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to upload audio');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Failed to upload audio');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePlayPause = (audio: AudioItem) => {
    if (playingId === audio.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = audio.url;
        audioRef.current.play();
        setPlayingId(audio.id);
      }
    }
  };

  const handleDelete = async (audioId: string) => {
    if (!confirm('Delete this audio file?')) return;

    try {
      const response = await fetch(
        `/api/media-studio/library?workspace_id=${workspaceId}&media_id=${audioId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        toast.success('Audio deleted');
        if (selectedAudio?.id === audioId) {
          onSelectAudio(null);
        }
        await fetchAudioItems();
      } else {
        toast.error('Failed to delete audio');
      }
    } catch (error) {
      toast.error('Failed to delete audio');
    }
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Music className="w-5 h-5 text-white" />
              Audio Library
            </CardTitle>
            <CardDescription className="text-teal-50">
              Upload or select background music
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-white/20 border-white/30 text-white hover:bg-white/30 hover:text-white"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Upload className="w-4 h-4 mr-1" />
                Upload
              </>
            )}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac"
          className="hidden"
          onChange={handleFileSelect}
        />
      </CardHeader>
      <CardContent>
        <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : audioItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <Music className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No audio files yet</p>
            <p className="text-xs">Upload MP3, WAV, or M4A files</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-transparent hover:scrollbar-thumb-purple-400">
            {audioItems.map((audio) => {
              const isSelected = selectedAudio?.id === audio.id;
              const isPlaying = playingId === audio.id;
              const durationLabel = formatDuration(audio.duration);

              return (
                <div
                  key={audio.id}
                  className={`group relative rounded-lg border transition-all shadow-sm hover:shadow-md cursor-pointer ${isSelected
                    ? 'border-teal-500 ring-1 ring-teal-200/80 bg-blue-100 dark:bg-blue-100'
                    : 'border-slate-300 dark:border-slate-700 hover:border-teal-300 bg-blue-50 dark:bg-blue-50'
                    }`}
                  onClick={() => onSelectAudio(isSelected ? null : audio)}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Play button with audio icon */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-11 h-11 rounded-lg flex items-center justify-center transition-colors ${isPlaying
                        ? 'bg-teal-500 text-white'
                        : 'bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40'
                        }`}>
                        {audio.source === 'uploaded'
                          ? <Music className={`w-5 h-5 ${isPlaying ? 'text-white' : 'text-teal-600'}`} />
                          : <AudioLines className={`w-5 h-5 ${isPlaying ? 'text-white' : 'text-emerald-600'}`} />
                        }
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute -bottom-1 -right-1 h-6 w-6 p-0 rounded-full shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPause(audio);
                        }}
                      >
                        {isPlaying ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </Button>
                    </div>

                    {/* Audio Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-900">
                          {audio.name || 'Untitled Audio'}
                        </p>
                        {durationLabel && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/80 text-slate-700 border border-slate-200">
                            {durationLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                        <span>{new Date(audio.created_at).toLocaleDateString()}</span>
                        {audio.source && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${audio.source === 'uploaded'
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            }`}>
                            {audio.source === 'uploaded' ? 'Uploaded' : 'Generated'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Selected indicator & Delete */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSelected && (
                        <Badge className="bg-rose-500">
                          <Check className="w-3 h-3" />
                        </Badge>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(audio.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
