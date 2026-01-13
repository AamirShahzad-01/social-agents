'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Music,
    Mic,
    MessageSquare,
    Wand2,
    AudioLines,
    Sparkles,
    Download,
    Volume2,
    Loader2,
    Play,
    Pause,
    RefreshCw,
} from 'lucide-react';
import { TextToSpeechForm } from './TextToSpeechForm';
import { MusicGeneratorForm } from './MusicGeneratorForm';
import { SoundEffectsForm } from './SoundEffectsForm';
import { DialogGeneratorForm } from './DialogGeneratorForm';
import { VoiceDesignForm } from './VoiceDesignForm';
import { VoiceCloningForm } from './VoiceCloningForm';
import { useMediaLibrary } from '../../hooks/useMediaLibrary';
import { MediaItem } from '../../types/mediaStudio.types';
import { AudioNameDialog } from './AudioNameDialog';
import { AudioWaveform } from '@/components/ui/audio-waveform';
import { get } from '@/lib/python-backend/client';

// ============================================================================
// TYPES
// ============================================================================

export type AudioTab = 'tts' | 'music' | 'sfx' | 'dialog' | 'voice-design' | 'voice-cloning';

interface Voice {
    voice_id: string;
    name: string;
    category?: string;
    description?: string;
    labels?: Record<string, string>;
    preview_url?: string;
}



// ============================================================================
// TAB CONFIG
// ============================================================================

const AUDIO_TABS: { id: AudioTab; label: string; icon: React.ElementType; description: string; gradient: string }[] = [
    {
        id: 'tts',
        label: 'Text to Speech',
        icon: Volume2,
        description: 'Convert text to lifelike speech',
        gradient: 'from-teal-500 to-teal-600'
    },
    {
        id: 'music',
        label: 'Music',
        icon: Music,
        description: 'Generate original music tracks',
        gradient: 'from-purple-500 to-purple-600'
    },
    {
        id: 'sfx',
        label: 'Sound Effects',
        icon: AudioLines,
        description: 'Create custom sound effects',
        gradient: 'from-orange-500 to-orange-600'
    },
    {
        id: 'dialog',
        label: 'Dialog',
        icon: MessageSquare,
        description: 'Multi-speaker conversations',
        gradient: 'from-blue-500 to-blue-600'
    },
    {
        id: 'voice-design',
        label: 'Voice Design',
        icon: Wand2,
        description: 'Create custom AI voices',
        gradient: 'from-pink-500 to-pink-600'
    },
    {
        id: 'voice-cloning',
        label: 'Voice Cloning',
        icon: Mic,
        description: 'Clone voices from audio',
        gradient: 'from-indigo-500 to-indigo-600'
    },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function AudioGenerator() {
    const { saveGeneratedMedia, workspaceId } = useMediaLibrary();
    const [activeTab, setActiveTab] = useState<AudioTab>('tts');
    const [voices, setVoices] = useState<Voice[]>([]);
    const [isLoadingVoices, setIsLoadingVoices] = useState(false);
    const [libraryAudio, setLibraryAudio] = useState<MediaItem[]>([]);
    const [currentAudio, setCurrentAudio] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    // Dialog and saving state
    const [isSaving, setIsSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pendingAudio, setPendingAudio] = useState<{ audioBase64: string, type: AudioTab, prompt?: string } | null>(null);

    // Fetch library audio
    const fetchLibraryAudio = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const data = await get<{ items: any[] }>(
                `/media-studio/library?workspace_id=${workspaceId}&type=audio&limit=20`
            );
            if (data.items) {
                // Map snake_case backend response to camelCase frontend types
                const mappedItems: MediaItem[] = data.items.map((item) => ({
                    id: item.id,
                    type: item.type,
                    url: item.url,
                    thumbnailUrl: item.thumbnail_url,
                    prompt: item.prompt,
                    config: item.config,
                    createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
                    isFavorite: item.is_favorite,
                    tags: item.tags,
                    folder: item.folder,
                }));
                setLibraryAudio(mappedItems);
            }
        } catch (error) {
            console.error('Failed to fetch audio history', error);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchLibraryAudio();
    }, [fetchLibraryAudio]);

    // Fetch available voices on mount
    const fetchVoices = useCallback(async () => {
        setIsLoadingVoices(true);
        try {
            const response = await fetch('/api/ai/media/audio/voices');
            const data = await response.json();
            if (data.success && data.voices) {
                setVoices(data.voices);
            }
        } catch (error) {
            console.error('Failed to fetch voices:', error);
        } finally {
            setIsLoadingVoices(false);
        }
    }, []);

    useEffect(() => {
        fetchVoices();
    }, [fetchVoices]);

    // Handle audio generation result - Open Dialog
    const handleAudioGenerated = useCallback((audioBase64: string, type: AudioTab, prompt?: string) => {
        const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;
        setCurrentAudio(audioUrl);
        setPendingAudio({ audioBase64, type, prompt });
        setDialogOpen(true);
    }, []);

    // Handle actual saving after name confirmation
    const handleSaveAudio = useCallback(async (name: string) => {
        if (!pendingAudio) return;

        const { audioBase64, type, prompt: originalPrompt } = pendingAudio;
        const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

        setIsSaving(true);
        try {
            const mediaId = await saveGeneratedMedia({
                type: 'audio',
                source: 'generated',
                url: audioUrl,
                prompt: name, // Use user-provided name as prompt/title
                model: 'eleven_turbo_v2_5',
                config: {
                    audioTab: type,
                    originalPrompt: originalPrompt // Store original prompt in config
                },
                tags: ['audio', type]
            });

            if (mediaId) {
                // Update local state immediately for instant feedback
                const newAudio: MediaItem = {
                    id: mediaId,
                    type: 'audio',
                    url: audioUrl,
                    prompt: name,
                    config: {
                        audioTab: type,
                    },
                    createdAt: Date.now(),
                };

                setLibraryAudio(prev => [newAudio, ...prev]);
                setPendingAudio(null);
                setDialogOpen(false);
            }
        } catch (err) {
            console.error('Failed to save audio:', err);
        } finally {
            setIsSaving(false);
        }
    }, [pendingAudio, saveGeneratedMedia, workspaceId]);

    // Play/Pause audio
    const togglePlayback = useCallback(() => {
        if (!audioRef.current || !currentAudio) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying, currentAudio]);

    // Handle audio end
    const handleAudioEnd = useCallback(() => {
        setIsPlaying(false);
    }, []);

    // Download audio
    const handleDownload = useCallback((audioUrl: string, filename: string) => {
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = filename;
        a.click();
    }, []);

    const currentTabConfig = AUDIO_TABS.find(t => t.id === activeTab)!;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Panel - Forms */}
            <div className="lg:col-span-2">
                <Card className="h-full border rounded-xl">
                    <CardHeader className="p-5 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    className="p-2.5 rounded-lg"
                                    style={{ background: `linear-gradient(135deg, var(--ms-primary) 0%, var(--ms-primary-dark) 100%)` }}
                                >
                                    <Sparkles className="w-[18px] h-[18px] text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-[15px] font-semibold">Audio Generator</CardTitle>
                                    <CardDescription className="text-[13px] mt-0.5">
                                        ElevenLabs V3 • Professional Audio Studio
                                    </CardDescription>
                                </div>
                            </div>
                            <Badge variant="secondary" className="text-[11px] bg-gradient-to-r from-teal-500/10 to-purple-500/10 text-teal-600 h-6 px-2.5">
                                <AudioLines className="w-3.5 h-3.5 mr-1" />
                                ElevenLabs
                            </Badge>
                        </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-5">
                        {/* Tab Navigation - Enterprise Standard */}
                        <div className="flex flex-wrap gap-1 p-1 bg-muted/50 rounded-lg">
                            {AUDIO_TABS.map((tab) => {
                                const isActive = activeTab === tab.id;
                                const Icon = tab.icon;

                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            flex items-center gap-2 h-8 px-3 rounded-md transition-all duration-200 text-xs font-medium
                                            ${isActive
                                                ? 'bg-gradient-to-r from-teal-500 to-teal-600 shadow-sm text-white'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-gray-800/50'
                                            }
                                        `}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isActive ? 'bg-white/20 text-white' : 'bg-muted'
                                                }`}
                                        >
                                            <Icon className={`w-3 h-3 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
                                        </div>
                                        <span className="hidden sm:inline">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[400px]">
                            {activeTab === 'tts' && (
                                <TextToSpeechForm
                                    voices={voices}
                                    isLoadingVoices={isLoadingVoices}
                                    onRefreshVoices={fetchVoices}
                                    onAudioGenerated={(audio) => handleAudioGenerated(audio, 'tts')}
                                />
                            )}
                            {activeTab === 'music' && (
                                <MusicGeneratorForm
                                    onAudioGenerated={(audio, prompt) => handleAudioGenerated(audio, 'music', prompt)}
                                />
                            )}
                            {activeTab === 'sfx' && (
                                <SoundEffectsForm
                                    onAudioGenerated={(audio, prompt) => handleAudioGenerated(audio, 'sfx', prompt)}
                                />
                            )}
                            {activeTab === 'dialog' && (
                                <DialogGeneratorForm
                                    voices={voices}
                                    isLoadingVoices={isLoadingVoices}
                                    onAudioGenerated={(audio) => handleAudioGenerated(audio, 'dialog')}
                                />
                            )}
                            {activeTab === 'voice-design' && (
                                <VoiceDesignForm
                                    onVoiceCreated={fetchVoices}
                                />
                            )}
                            {activeTab === 'voice-cloning' && (
                                <VoiceCloningForm
                                    onVoiceCreated={fetchVoices}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Side Panel - Audio Player & History */}
            <div className="space-y-5">
                {/* Audio Player */}
                <Card className="border rounded-xl">
                    <CardHeader className="p-4 pb-3">
                        <CardTitle className="text-[13px] font-medium flex items-center gap-2">
                            <Volume2 className="w-[18px] h-[18px] text-teal-500" />
                            Audio Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        {currentAudio ? (
                            <div className="space-y-4">
                                {/* Waveform Placeholder */}
                                <div className="h-28 bg-gradient-to-r from-teal-500/10 via-purple-500/10 to-teal-500/10 rounded-xl flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute inset-0 flex items-center justify-center p-4">
                                        <AudioWaveform isPlaying={isPlaying} />
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center justify-center gap-3">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-12 w-12 rounded-full"
                                        onClick={togglePlayback}
                                    >
                                        {isPlaying ? (
                                            <Pause className="w-5 h-5" />
                                        ) : (
                                            <Play className="w-5 h-5 ml-0.5" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => currentAudio && handleDownload(currentAudio, `audio_${Date.now()}.mp3`)}
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                        Download
                                    </Button>
                                </div>

                                {/* Hidden Audio Element */}
                                <audio
                                    ref={audioRef}
                                    src={currentAudio}
                                    onEnded={handleAudioEnd}
                                    className="hidden"
                                />
                            </div>
                        ) : (
                            <div className="h-36 flex flex-col items-center justify-center text-muted-foreground">
                                <AudioLines className="w-10 h-10 mb-2.5 opacity-50" />
                                <p className="text-[13px]">Generate audio to preview</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Audio History */}
                <Card className="border rounded-xl">
                    <CardHeader className="p-4 pb-3">
                        <CardTitle className="text-[13px] font-medium flex items-center gap-2">
                            <RefreshCw className="w-[18px] h-[18px] text-purple-500" />
                            Recent Generations
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        {libraryAudio.length > 0 ? (
                            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-teal-300 scrollbar-track-transparent hover:scrollbar-thumb-teal-400">
                                {libraryAudio.map((audio) => {
                                    // Extract tab type from config or default to generic
                                    const audioTab = (audio.config as any)?.audioTab as AudioTab;
                                    const tabConfig = AUDIO_TABS.find(t => t.id === audioTab);
                                    const Icon = tabConfig?.icon || AudioLines;

                                    return (
                                        <button
                                            key={audio.id}
                                            onClick={() => setCurrentAudio(audio.url)}
                                            className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all hover:bg-muted/50 ${currentAudio === audio.url ? 'border-teal-500 bg-teal-500/5' : 'border-transparent'
                                                }`}
                                        >
                                            <div className={`w-8 h-8 rounded-md flex items-center justify-center bg-gradient-to-br ${tabConfig?.gradient || 'from-gray-500 to-gray-600'}`}>
                                                <Icon className="w-4 h-4 text-white" />
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                                <p className="text-xs font-medium truncate">
                                                    {audio.prompt || tabConfig?.label || 'Audio'}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {new Date(audio.createdAt).toLocaleTimeString()}
                                                </p>
                                            </div>
                                            <Play className="w-3.5 h-3.5 text-muted-foreground" />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-28 flex flex-col items-center justify-center text-muted-foreground">
                                <Music className="w-7 h-7 mb-2 opacity-50" />
                                <p className="text-[12px]">No audio generated yet</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <AudioNameDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSaveAudio}
                isSaving={isSaving}
                defaultName={pendingAudio?.prompt || `Generated ${pendingAudio?.type || 'Audio'}`}
            />
        </div >
    );
}

export default AudioGenerator;
