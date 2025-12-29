'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
    AudioLines,
    Loader2,
    Sparkles,
    AlertCircle,
    Clock,
    Repeat,
    Wand2,
} from 'lucide-react';
import { validation, parseAudioError, formatErrorMessage, createTimeoutController } from './utils/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

interface SoundEffectsFormProps {
    onAudioGenerated: (audioBase64: string, prompt: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SoundEffectsForm({ onAudioGenerated }: SoundEffectsFormProps) {
    const [prompt, setPrompt] = useState('');
    const [durationSeconds, setDurationSeconds] = useState(5);
    const [loop, setLoop] = useState(false);
    const [promptInfluence, setPromptInfluence] = useState(0.3);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Generate sound effect
    const handleGenerate = useCallback(async () => {
        setError(null);

        // Validation
        const promptValidation = validation.text(prompt, 3);
        if (!promptValidation.valid) {
            setError(promptValidation.error);
            return;
        }

        setIsGenerating(true);

        try {
            const { controller, timeoutId } = createTimeoutController(90000); // 90s timeout

            const response = await fetch('/api/ai/media/audio/sound-effects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    durationSeconds,
                    loop,
                    promptInfluence,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: `Server error (${response.status})` }));
                throw new Error(data.error || 'Failed to generate sound effect');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to generate sound effect');
            }

            onAudioGenerated(data.audioBase64, prompt);
            setError(null);
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, durationSeconds, loop, promptInfluence, onAudioGenerated]);

    return (
        <div className="space-y-6">

            {/* Prompt Input */}
            <div className="space-y-3">
                <label className="text-sm font-medium">Describe Your Sound Effect</label>
                <Textarea
                    placeholder="Type to describe a sound effect... like footsteps, applause, or a car horn."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[100px] resize-none"
                    maxLength={1000}
                />
            </div>

            {/* Quick Examples */}
            <div className="space-y-2">
                <label className="text-xs font-medium">Examples</label>
                <div className="flex flex-wrap gap-1.5">
                    {[
                        'Thunderstorm with rain',
                        'Footsteps on gravel',
                        'Door creaking open',
                        'Crowd cheering',
                        'Spaceship engine hum',
                        'Glass breaking',
                    ].map((example) => (
                        <button
                            key={example}
                            onClick={() => setPrompt(example)}
                            className="px-2.5 py-1 text-xs rounded-full border border-orange-500/30 text-orange-600 hover:bg-orange-500/10 transition-colors"
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>

            {/* Duration Slider */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Duration
                    </label>
                    <span className="text-sm font-medium text-orange-600">{durationSeconds}s</span>
                </div>
                <Slider
                    value={[durationSeconds]}
                    onValueChange={([v]) => setDurationSeconds(v)}
                    min={0.5}
                    max={30}
                    step={0.5}
                    className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.5s</span>
                    <span>30s</span>
                </div>
            </div>

            {/* Loop Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                    <Repeat className={`w-5 h-5 ${loop ? 'text-orange-500' : 'text-muted-foreground'}`} />
                    <div>
                        <p className="font-medium text-sm">Seamless Loop</p>
                        <p className="text-xs text-muted-foreground">
                            Create audio that loops perfectly
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={loop}
                    onClick={() => setLoop(!loop)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${loop ? 'bg-orange-500' : 'bg-muted'
                        }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${loop ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>

            {/* Prompt Influence Slider */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Wand2 className="w-4 h-4" />
                        Creativity
                    </label>
                    <span className="text-sm text-muted-foreground">
                        {promptInfluence < 0.3 ? 'Creative' : promptInfluence > 0.7 ? 'Literal' : 'Balanced'}
                    </span>
                </div>
                <Slider
                    value={[promptInfluence]}
                    onValueChange={([v]) => setPromptInfluence(v)}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                    Lower = more creative variations, Higher = follow prompt more closely.
                </p>
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
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Effect...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Sound Effect
                    </>
                )}
            </Button>
        </div>
    );
}

export default SoundEffectsForm;
