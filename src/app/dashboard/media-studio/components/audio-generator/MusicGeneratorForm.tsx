'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
    Music,
    Loader2,
    Sparkles,
    AlertCircle,
    Clock,
} from 'lucide-react';
import { validation, parseAudioError, formatErrorMessage, createTimeoutController } from './utils/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

interface MusicGeneratorFormProps {
    onAudioGenerated: (audioBase64: string, prompt: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MusicGeneratorForm({ onAudioGenerated }: MusicGeneratorFormProps) {
    const [prompt, setPrompt] = useState('');
    const [durationSeconds, setDurationSeconds] = useState(30);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Generate music
    const handleGenerate = useCallback(async () => {
        setError(null);

        // Validation
        const promptValidation = validation.text(prompt, 10);
        if (!promptValidation.valid) {
            setError(promptValidation.error);
            return;
        }

        setIsGenerating(true);

        try {
            const { controller, timeoutId } = createTimeoutController(120000); // 2min for music

            const response = await fetch('/api/ai/media/audio/music', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    durationMs: durationSeconds * 1000,
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
                throw new Error(data.error || 'Failed to generate music');
            }

            onAudioGenerated(data.audioBase64, prompt);
            setError(null);
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, durationSeconds, onAudioGenerated]);

    // Format duration display
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    return (
        <div className="space-y-6">

            {/* Prompt Input */}
            <div className="space-y-3">
                <label className="text-sm font-medium">Describe Your Music</label>
                <Textarea
                    placeholder="Create an intense, fast-paced electronic track for a high-adrenaline video game scene. Use driving synth arpeggios, punchy drums, and aggressive rhythmic textures. Tempo: 130-150 BPM..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[140px] resize-none"
                    maxLength={2000}
                />
                <p className="text-xs text-muted-foreground">
                    Tip: Include genre, mood, tempo (BPM), instruments, and style for best results.
                </p>
            </div>

            {/* Duration Slider */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Duration
                    </label>
                    <span className="text-sm font-medium text-purple-600">
                        {formatDuration(durationSeconds)}
                    </span>
                </div>
                <Slider
                    value={[durationSeconds]}
                    onValueChange={([v]) => setDurationSeconds(v)}
                    min={10}
                    max={300}
                    step={5}
                    className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>10 seconds</span>
                    <span>5 minutes</span>
                </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
                <label className="text-xs font-medium">Quick Presets</label>
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { label: 'Upbeat Pop', prompt: 'Upbeat pop track with catchy melodies, bright synths, and energetic drums. 120 BPM.' },
                        { label: 'Chill Lo-Fi', prompt: 'Relaxing lo-fi hip hop beat with mellow piano, vinyl crackle, and soft drums. 85 BPM.' },
                        { label: 'Cinematic Epic', prompt: 'Epic cinematic orchestral piece with sweeping strings, powerful brass, and dramatic percussion.' },
                        { label: 'Ambient', prompt: 'Atmospheric ambient soundscape with evolving pads, subtle textures, and peaceful atmosphere.' },
                    ].map((preset) => (
                        <button
                            key={preset.label}
                            onClick={() => setPrompt(preset.prompt)}
                            className="px-2.5 py-1 text-xs rounded-full border border-purple-500/30 text-purple-600 hover:bg-purple-500/10 transition-colors"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Composing Music...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Music
                    </>
                )}
            </Button>
        </div>
    );
}

export default MusicGeneratorForm;
