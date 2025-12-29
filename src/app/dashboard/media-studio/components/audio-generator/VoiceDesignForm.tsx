'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Wand2,
    Loader2,
    Sparkles,
    AlertCircle,
    Play,
    Save,
    Check,
    Volume2,
} from 'lucide-react';
import { validation, parseAudioError, formatErrorMessage, createTimeoutController } from './utils/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

interface VoiceDesignFormProps {
    onVoiceCreated: () => void;
}

interface VoicePreview {
    generatedVoiceId: string;
    audioBase64: string;
}

// ============================================================================
// STYLE PRESETS
// ============================================================================

const STYLE_PRESETS = [
    { id: 'little-mouse', label: '🐭 Little Mouse', prompt: 'A tiny, squeaky mouse with a high-pitched, adorable voice' },
    { id: 'angry-pirate', label: '🏴‍☠️ Angry Pirate', prompt: 'A gruff, angry pirate captain with a deep, raspy voice' },
    { id: 'new-york', label: '🗽 New York accent', prompt: 'A confident New Yorker with a distinctive Brooklyn accent' },
    { id: 'evil-villain', label: '😈 Evil Villain', prompt: 'A sinister villain with a deep, menacing tone' },
    { id: 'wise-wizard', label: '🧙 Wise Wizard', prompt: 'An ancient, wise wizard with a calm, mystical voice' },
    { id: 'cheerful-child', label: '👧 Cheerful Child', prompt: 'A happy, energetic child with an innocent, playful voice' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function VoiceDesignForm({ onVoiceCreated }: VoiceDesignFormProps) {
    const [voiceDescription, setVoiceDescription] = useState('');
    const [previewText, setPreviewText] = useState(
        "Don't even start with that techno voodoo nonsense... hey! Gimme that lighter. You know I've been yelling at my toaster since '92, and NOW you're telling me that voices..."
    );
    const [previews, setPreviews] = useState<VoicePreview[]>([]);
    const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
    const [voiceName, setVoiceName] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    // Apply style preset
    const applyPreset = (prompt: string) => {
        setVoiceDescription(prompt);
    };

    // Generate previews
    const handleGeneratePreviews = useCallback(async () => {
        setError(null);

        // Validation
        const descValidation = validation.voiceDescription(voiceDescription);
        if (!descValidation.valid) {
            setError(descValidation.error);
            return;
        }

        const textValidation = validation.text(previewText, 100);
        if (!textValidation.valid) {
            setError(textValidation.error);
            return;
        }

        setIsGenerating(true);
        setPreviews([]);
        setSelectedPreviewId(null);

        try {
            const { controller, timeoutId } = createTimeoutController(90000); // 90s timeout

            const response = await fetch('/api/ai/media/audio/voice-design', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'design',
                    voiceDescription,
                    text: previewText,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: `Server error (${response.status})` }));
                throw new Error(data.error || 'Failed to generate voice previews');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to generate voice previews');
            }

            if (!data.previews || data.previews.length === 0) {
                throw new Error('No voice previews generated. Try a different description.');
            }

            setPreviews(data.previews);
            setError(null);
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsGenerating(false);
        }
    }, [voiceDescription, previewText]);

    // Play preview
    const playPreview = (preview: VoicePreview) => {
        if (audioRef.current) {
            audioRef.current.pause();
        }

        const audio = new Audio(`data:audio/mpeg;base64,${preview.audioBase64}`);
        audioRef.current = audio;

        audio.onended = () => setPlayingPreviewId(null);
        audio.play();
        setPlayingPreviewId(preview.generatedVoiceId);
    };

    // Save voice to library
    const handleSaveVoice = useCallback(async () => {
        setError(null);

        // Validation
        if (!selectedPreviewId) {
            setError('🎤 Please select one of the voice previews above');
            return;
        }

        const nameValidation = validation.name(voiceName);
        if (!nameValidation.valid) {
            setError(nameValidation.error);
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch('/api/ai/media/audio/voice-design', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save',
                    generatedVoiceId: selectedPreviewId,
                    name: voiceName,
                    description: voiceDescription,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: `Server error (${response.status})` }));
                throw new Error(data.error || 'Failed to save voice');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to save voice');
            }

            setSuccess(`✅ Voice "${voiceName}" saved successfully!`);
            setTimeout(() => setSuccess(null), 3000);

            // Reset form
            setVoiceDescription('');
            setPreviews([]);
            setSelectedPreviewId(null);
            setVoiceName('');
            setError(null);

            onVoiceCreated();
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsSaving(false);
        }
    }, [selectedPreviewId, voiceName, voiceDescription, onVoiceCreated]);

    return (
        <div className="space-y-6">

            {/* Voice Description */}
            <div className="space-y-3">
                <label className="text-sm font-medium">Voice Description</label>
                <Textarea
                    placeholder="A woman in her 30s with a relaxing and calm voice, yet confident and assured. She should have a soothing tone that inspires trust while maintaining a strong presence."
                    value={voiceDescription}
                    onChange={(e) => setVoiceDescription(e.target.value)}
                    className="min-h-[100px] resize-none"
                    maxLength={1000}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Describe age, gender, accent, tone, and personality</span>
                    <span>{voiceDescription.length}/1000</span>
                </div>
            </div>

            {/* Style Presets */}
            <div className="space-y-2">
                <label className="text-xs font-medium">Style Presets</label>
                <div className="flex flex-wrap gap-1.5">
                    {STYLE_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            onClick={() => applyPreset(preset.prompt)}
                            className="px-2.5 py-1 text-xs rounded-full border border-pink-500/30 text-pink-600 hover:bg-pink-500/10 transition-colors"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview Text */}
            <div className="space-y-3">
                <label className="text-sm font-medium">Preview Text</label>
                <Textarea
                    placeholder="Enter sample text for the voice to speak..."
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    className="min-h-[100px] resize-none"
                    maxLength={1000}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Min 100 characters for best results</span>
                    <span>{previewText.length}/1000</span>
                </div>
            </div>

            {/* Generate Previews Button */}
            <Button
                onClick={handleGeneratePreviews}
                disabled={isGenerating || voiceDescription.length < 20 || previewText.length < 100}
                className="w-full h-11 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Previews...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Voice Previews
                    </>
                )}
            </Button>

            {/* Previews */}
            {previews.length > 0 && (
                <div className="space-y-4">
                    <label className="text-sm font-medium">Select Your Favorite</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {previews.map((preview, index) => (
                            <button
                                key={preview.generatedVoiceId}
                                onClick={() => setSelectedPreviewId(preview.generatedVoiceId)}
                                className={`p-4 border rounded-lg text-left transition-all ${selectedPreviewId === preview.generatedVoiceId
                                    ? 'border-pink-500 bg-pink-500/5 ring-2 ring-pink-500/20'
                                    : 'hover:border-pink-500/50'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                                            <Volume2 className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="font-medium">Preview {index + 1}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            playPreview(preview);
                                        }}
                                    >
                                        <Play className={`w-4 h-4 ${playingPreviewId === preview.generatedVoiceId ? 'text-pink-500' : ''}`} />
                                    </Button>
                                </div>
                                {selectedPreviewId === preview.generatedVoiceId && (
                                    <Badge className="mt-2 bg-pink-500">
                                        <Check className="w-3 h-3 mr-1" />
                                        Selected
                                    </Badge>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Save Voice */}
            {selectedPreviewId && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium">Save to Voice Library</h4>
                    <input
                        type="text"
                        placeholder="Voice name..."
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-background"
                        maxLength={100}
                    />
                    <Button
                        onClick={handleSaveVoice}
                        disabled={isSaving || !voiceName.trim()}
                        className="w-full bg-gradient-to-r from-pink-500 to-rose-500"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Voice
                            </>
                        )}
                    </Button>
                </div>
            )}

            {/* Error/Success Messages */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    {success}
                </div>
            )}
        </div>
    );
}

export default VoiceDesignForm;
