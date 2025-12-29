'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
    Volume2,
    Loader2,
    Search,
    Sparkles,
    ChevronDown,
    Settings,
    RefreshCw,
    AlertCircle,
} from 'lucide-react';
import { validation, parseAudioError, formatErrorMessage, createTimeoutController } from './utils/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

interface Voice {
    voice_id: string;
    name: string;
    category?: string;
    description?: string;
    labels?: Record<string, string>;
    preview_url?: string;
}

interface TextToSpeechFormProps {
    voices: Voice[];
    isLoadingVoices: boolean;
    onRefreshVoices: () => void;
    onAudioGenerated: (audioBase64: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TTS_MODELS = [
    { id: 'eleven_v3', name: 'Eleven V3 (Alpha)', description: 'Most expressive' },
    { id: 'eleven_multilingual_v2', name: 'Multilingual V2', description: '70+ languages' },
    { id: 'eleven_turbo_v2_5', name: 'Turbo V2.5', description: 'Fast, balanced' },
    { id: 'eleven_flash_v2_5', name: 'Flash V2.5', description: 'Ultra-low latency' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function TextToSpeechForm({
    voices,
    isLoadingVoices,
    onRefreshVoices,
    onAudioGenerated
}: TextToSpeechFormProps) {
    // State
    const [text, setText] = useState('');
    const [selectedVoiceId, setSelectedVoiceId] = useState('');
    const [modelId, setModelId] = useState('eleven_multilingual_v2');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [voiceSearch, setVoiceSearch] = useState('');
    const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);

    // Voice Settings
    const [speed, setSpeed] = useState(1.0);
    const [stability, setStability] = useState(0.5);
    const [similarity, setSimilarity] = useState(0.75);
    const [style, setStyle] = useState(0);

    // Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter voices by search
    const filteredVoices = voices.filter(v =>
        v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
        v.category?.toLowerCase().includes(voiceSearch.toLowerCase())
    );

    // Get selected voice
    const selectedVoice = voices.find(v => v.voice_id === selectedVoiceId);

    // Generate speech
    const handleGenerate = useCallback(async () => {
        // Clear previous errors
        setError(null);

        // Validation
        const textValidation = validation.text(text);
        if (!textValidation.valid) {
            setError(textValidation.error);
            return;
        }

        const voiceValidation = validation.voiceSelected(selectedVoiceId);
        if (!voiceValidation.valid) {
            setError(voiceValidation.error);
            return;
        }

        setIsGenerating(true);

        try {
            const { controller, timeoutId } = createTimeoutController(60000); // 60s timeout

            const response = await fetch('/api/ai/media/audio/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voiceId: selectedVoiceId,
                    modelId,
                    speed,
                    voiceSettings: {
                        stability,
                        similarity_boost: similarity,
                        style,
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: `Server error (${response.status})` }));
                throw new Error(data.error || `Server returned ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to generate speech');
            }

            onAudioGenerated(data.audioBase64);
            setError(null);
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsGenerating(false);
        }
    }, [text, selectedVoiceId, modelId, speed, stability, similarity, style, onAudioGenerated]);

    return (
        <div className="space-y-5">
            {/* Voice Selection */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Voice</label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRefreshVoices}
                        disabled={isLoadingVoices}
                        className="h-7 px-2 text-xs"
                    >
                        <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingVoices ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                        className="w-full flex items-center justify-between h-12 px-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-purple-500 flex items-center justify-center">
                                <Volume2 className="w-4 h-4 text-white" />
                            </div>
                            <div className="text-left">
                                <p className="font-medium text-xs">
                                    {selectedVoice?.name || 'Select a voice'}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    {selectedVoice?.category || 'Choose from available voices'}
                                </p>
                            </div>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Voice Dropdown */}
                    {showVoiceDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-hidden">
                            {/* Search */}
                            <div className="p-2 border-b">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search voices..."
                                        value={voiceSearch}
                                        onChange={(e) => setVoiceSearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
                                    />
                                </div>
                            </div>

                            {/* Voice List */}
                            <div className="max-h-[220px] overflow-y-auto p-2">
                                {isLoadingVoices ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : filteredVoices.length > 0 ? (
                                    <div className="space-y-1">
                                        {filteredVoices.map((voice) => (
                                            <button
                                                key={voice.voice_id}
                                                onClick={() => {
                                                    setSelectedVoiceId(voice.voice_id);
                                                    setShowVoiceDropdown(false);
                                                    setVoiceSearch('');
                                                }}
                                                className={`w-full flex items-center gap-3 p-2 rounded-md transition-colors ${selectedVoiceId === voice.voice_id
                                                    ? 'bg-teal-500/10 text-teal-600'
                                                    : 'hover:bg-muted'
                                                    }`}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500/20 to-purple-500/20 flex items-center justify-center">
                                                    <Volume2 className="w-4 h-4" />
                                                </div>
                                                <div className="text-left flex-1">
                                                    <p className="text-sm font-medium">{voice.name}</p>
                                                    <p className="text-xs text-muted-foreground">{voice.category}</p>
                                                </div>
                                                {voice.labels?.accent && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        {voice.labels.accent}
                                                    </Badge>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No voices found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Model Selection - Enterprise Standard */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Model</label>
                <div className="grid grid-cols-2 gap-2">
                    {TTS_MODELS.map((model) => (
                        <button
                            key={model.id}
                            onClick={() => setModelId(model.id)}
                            className={`h-auto py-2.5 px-3 rounded-lg border text-left transition-all ${modelId === model.id
                                ? 'border-teal-500 bg-teal-500/5 shadow-sm'
                                : 'border-border hover:border-teal-500/50'
                                }`}
                        >
                            <p className="text-xs font-medium">{model.name}</p>
                            <p className="text-[10px] text-muted-foreground">{model.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Text Input - Enterprise Standard */}
            <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <label className="text-[13px] font-medium text-foreground">Text</label>
                    <span className="text-[11px] text-muted-foreground">{text.length} / 5,000</span>
                </div>
                <Textarea
                    placeholder="Enter the text you want to convert to speech..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[180px] resize-none text-[14px] leading-relaxed p-3.5 rounded-lg"
                    maxLength={5000}
                />
            </div>

            {/* Advanced Settings Toggle */}
            <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => setShowAdvanced(!showAdvanced)}
            >
                <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Voice Settings
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </Button>

            {/* Advanced Settings Panel */}
            {showAdvanced && (
                <div className="space-y-5 p-4 border rounded-lg bg-muted/30">
                    {/* Speed */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Speed</label>
                            <span className="text-sm text-muted-foreground">{speed.toFixed(1)}x</span>
                        </div>
                        <Slider
                            value={[speed]}
                            onValueChange={([v]) => setSpeed(v)}
                            min={0.7}
                            max={1.2}
                            step={0.1}
                            className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                            Adjust the speaking rate. 1.0 is normal speed.
                        </p>
                    </div>

                    {/* Stability (Tone) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Stability / Tone</label>
                            <span className="text-sm text-muted-foreground">{Math.round(stability * 100)}%</span>
                        </div>
                        <Slider
                            value={[stability]}
                            onValueChange={([v]) => setStability(v)}
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                            Higher = more consistent, lower = more expressive variation.
                        </p>
                    </div>

                    {/* Similarity */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Similarity / Clarity</label>
                            <span className="text-sm text-muted-foreground">{Math.round(similarity * 100)}%</span>
                        </div>
                        <Slider
                            value={[similarity]}
                            onValueChange={([v]) => setSimilarity(v)}
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                            How closely to match the original voice. Higher = more similar.
                        </p>
                    </div>

                    {/* Style Exaggeration */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Style Exaggeration</label>
                            <span className="text-sm text-muted-foreground">{Math.round(style * 100)}%</span>
                        </div>
                        <Slider
                            value={[style]}
                            onValueChange={([v]) => setStyle(v)}
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                            Amplify the voice's unique style. Use sparingly for best results.
                        </p>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-500/10 text-red-600 text-[13px]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Generate Button - Enterprise Standard */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !text.trim() || !selectedVoiceId}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 rounded-lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Speech...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Speech
                    </>
                )}
            </Button>
        </div>
    );
}

export default TextToSpeechForm;
