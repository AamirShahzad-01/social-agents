'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, AlertCircle, X, ChevronDown, Check } from 'lucide-react';
import { AI_MODELS, DEFAULT_AI_MODEL_ID, getModelDisplayName } from '@/constants/aiModels';
import {
    KLING_MODEL_OPTIONS,
    KLING_ASPECT_RATIO_OPTIONS,
    KLING_DURATION_OPTIONS,
    type KlingModel,
    type KlingAspectRatio,
    type KlingDuration,
    type GeneratedKlingVideo,
} from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface KlingTextToVideoProps {
    onGenerationStarted: (video: GeneratedKlingVideo, historyAction: string) => void;
    onError: (error: string) => void;
    isGenerating: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function KlingTextToVideo({
    onGenerationStarted,
    onError,
    isGenerating,
}: KlingTextToVideoProps) {
    // State
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('blur, distort, low quality, watermark');
    const [model, setModel] = useState<KlingModel>('kling-v2-6-pro');
    const [aspectRatio, setAspectRatio] = useState<KlingAspectRatio>('16:9');
    const [duration, setDuration] = useState<KlingDuration>('5');
    const [generateAudio, setGenerateAudio] = useState(true);
    const [cfgScale, setCfgScale] = useState(0.5);

    // Prompt improvement state
    const [showImprovementModal, setShowImprovementModal] = useState(false);
    const [improvementInstructions, setImprovementInstructions] = useState('');
    const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
    const [improvementError, setImprovementError] = useState<string | null>(null);
    const [selectedAIModelId, setSelectedAIModelId] = useState(DEFAULT_AI_MODEL_ID);
    const [showAIModelDropdown, setShowAIModelDropdown] = useState(false);

    // Convert technical errors to user-friendly messages
    const getUserFriendlyError = (error: unknown): string => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('API_KEY') || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            return 'API key not configured. Please check your settings.';
        }
        if (errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('quota') || errorMessage.includes('insufficient')) {
            return 'Rate limit or quota exceeded. Add credits or try a different model.';
        }
        if (errorMessage.includes('model') && (errorMessage.includes('not found') || errorMessage.includes('does not exist'))) {
            return 'Selected model is unavailable. Try a different model.';
        }
        return 'Failed to improve prompt. Please try again.';
    };

    // Handle improve prompt click
    const handleImprovePrompt = () => {
        if (!prompt.trim()) {
            setImprovementError('Please enter a prompt first');
            setTimeout(() => setImprovementError(null), 3000);
            return;
        }
        setShowImprovementModal(true);
        setImprovementError(null);
    };

    // Submit improvement request
    const handleSubmitImprovement = async () => {
        if (!prompt.trim()) return;

        setIsImprovingPrompt(true);
        setImprovementError(null);
        setShowImprovementModal(false);

        try {
            const response = await fetch('/api/ai/media/prompt/improve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalPrompt: prompt,
                    mediaType: 'video-generation',
                    mediaSubType: 'text-to-video',
                    provider: 'kling',
                    model: model,
                    userInstructions: improvementInstructions || undefined,
                    modelId: selectedAIModelId,
                    context: {
                        aspectRatio: aspectRatio,
                        duration: duration,
                        generateAudio: generateAudio,
                    },
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to improve prompt');
            }

            // Update prompt with improved version
            setPrompt(data.improvedPrompt);
            setImprovementInstructions('');

        } catch (error) {
            console.error('Prompt improvement error:', error);
            setImprovementError(getUserFriendlyError(error));
            setTimeout(() => setImprovementError(null), 5000);
        } finally {
            setIsImprovingPrompt(false);
        }
    };

    // Handle generation
    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            onError('Please enter a prompt');
            return;
        }

        try {
            const response = await fetch('/api/ai/media/kling/text-to-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    model,
                    aspect_ratio: aspectRatio,
                    duration,
                    negative_prompt: negativePrompt || undefined,
                    cfg_scale: cfgScale,
                    enable_audio: generateAudio,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to start video generation');
            }

            // Create video object for tracking
            const video: GeneratedKlingVideo = {
                id: data.task_id,
                prompt: prompt.trim(),
                config: {
                    prompt: prompt.trim(),
                    model,
                    aspectRatio,
                    duration,
                    negativePrompt: negativePrompt || undefined,
                    cfgScale,
                    generateAudio,
                    generation_mode: 'text',
                },
                status: 'submitted',
                progress: 0,
                createdAt: Date.now(),
                hasAudio: generateAudio,
                taskId: data.task_id,
            };

            onGenerationStarted(video, 'kling-text');
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to generate video');
        }
    }, [prompt, model, aspectRatio, duration, negativePrompt, cfgScale, generateAudio, onGenerationStarted, onError]);

    return (
        <div className="space-y-5">
            {/* Prompt - Enterprise Standard */}
            <div className="space-y-2.5">
                <Label htmlFor="prompt" className="text-[13px] font-medium">
                    Prompt
                    <span className="text-muted-foreground ml-1.5 font-normal text-[11px]">
                        (max 2500 chars)
                    </span>
                </Label>
                <Textarea
                    id="prompt"
                    placeholder='Describe your video... Use "quotes" for dialogue. Include sound descriptions for native audio.'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-[160px] resize-none text-[14px] leading-relaxed p-3.5 rounded-lg"
                />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleImprovePrompt}
                            disabled={isImprovingPrompt || !prompt.trim() || isGenerating}
                            className="h-9 px-4 text-[13px] font-medium bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-700 hover:to-teal-600 border-0 rounded-lg"
                        >
                            {isImprovingPrompt ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                    Improving...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                                    Improve Prompt
                                </>
                            )}
                        </Button>
                        {improvementError && (
                            <span className="text-[11px] text-red-500 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {improvementError}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        💡 Tip: Kling v2.6 supports native audio in English & Chinese
                    </p>
                </div>
            </div>

            {/* Model Selection - Enterprise Standard */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Model</Label>
                    <Select
                        value={model}
                        onValueChange={(v: string) => setModel(v as KlingModel)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 rounded-md text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_MODEL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex flex-col">
                                        <span className="text-xs">{opt.label}</span>
                                        <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Aspect Ratio</Label>
                    <Select
                        value={aspectRatio}
                        onValueChange={(v: string) => setAspectRatio(v as KlingAspectRatio)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 rounded-md text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_ASPECT_RATIO_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Duration and Audio */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Duration</Label>
                    <Select
                        value={duration}
                        onValueChange={(v: string) => setDuration(v as KlingDuration)}
                        disabled={isGenerating}
                    >
                        <SelectTrigger className="h-8 rounded-md text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {KLING_DURATION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Native Audio</Label>
                    <div className="flex items-center gap-2 h-8">
                        <Switch
                            checked={generateAudio}
                            onCheckedChange={setGenerateAudio}
                            disabled={isGenerating}
                        />
                        <span className="text-xs text-muted-foreground">
                            {generateAudio ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Negative Prompt */}
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Negative Prompt</Label>
                <Textarea
                    placeholder="Elements to avoid..."
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-[60px] resize-none text-xs p-2.5 rounded-lg"
                />
            </div>

            {/* Generate Button - Enterprise Standard */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full h-12 text-[14px] font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Generate Video
                    </>
                )}
            </Button>

            {/* AI Prompt Improvement Modal */}
            {showImprovementModal && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                    onClick={() => setShowImprovementModal(false)}
                >
                    <div
                        className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border border-border overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Improve Prompt with AI</h3>
                                    <p className="text-xs text-muted-foreground">Enhance your Kling video prompt</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowImprovementModal(false)}
                                className="w-8 h-8 rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">
                                    What would you like to improve? <span className="text-muted-foreground font-normal">(Optional)</span>
                                </label>
                                <Textarea
                                    value={improvementInstructions}
                                    onChange={(e) => setImprovementInstructions(e.target.value)}
                                    placeholder="Example: Add camera movements, include more detail, make it cinematic..."
                                    rows={7}
                                    className="resize-none min-h-[160px]"
                                />
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground">Quick suggestions:</p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { label: 'Cinematic Style', instruction: 'Add cinematic camera movements, dramatic lighting, and professional composition. Include slow motion and depth of field effects.' },
                                        { label: 'Motion Details', instruction: 'Add detailed motion descriptions for character movements, fabric physics, and environmental dynamics.' },
                                        { label: 'Audio Scene', instruction: 'Describe audio elements: ambient sounds, music mood, character dialogue in quotes, and sound effects.' },
                                        { label: 'Character Focus', instruction: 'Enhance character descriptions with emotional expressions, body language, and consistent appearance details.' },
                                    ].map((suggestion) => (
                                        <button
                                            key={suggestion.label}
                                            onClick={() => setImprovementInstructions(prev => prev ? `${prev}\n\n${suggestion.instruction}` : suggestion.instruction)}
                                            className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors border border-border"
                                        >
                                            {suggestion.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* AI Model Selection */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-foreground">AI Model</label>
                                <div className="relative inline-block">
                                    <button
                                        type="button"
                                        onClick={() => setShowAIModelDropdown(!showAIModelDropdown)}
                                        className="px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 transition-colors bg-muted/50 text-foreground flex items-center gap-2 text-xs"
                                    >
                                        <span>{getModelDisplayName(selectedAIModelId)}</span>
                                        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showAIModelDropdown ? 'rotate-180' : ''}`} />
                                    </button>

                                    {showAIModelDropdown && (
                                        <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto whitespace-nowrap">
                                            {AI_MODELS.map((aiModel) => (
                                                <button
                                                    key={aiModel.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedAIModelId(aiModel.id);
                                                        setShowAIModelDropdown(false);
                                                    }}
                                                    className={`w-full px-3 py-1.5 text-left hover:bg-muted transition-colors flex items-center gap-2 text-xs ${selectedAIModelId === aiModel.id ? 'bg-primary/10' : ''
                                                        }`}
                                                >
                                                    <span className="text-foreground">{aiModel.name} <span className="text-muted-foreground">({aiModel.providerLabel})</span></span>
                                                    {selectedAIModelId === aiModel.id && (
                                                        <Check className="w-3 h-3 text-primary" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                    💡 <strong>Tip:</strong> Kling v2.6 excels at character animation and motion. Describe actions and emotions in detail.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t border-border bg-muted/30">
                            <Button
                                onClick={() => {
                                    setShowImprovementModal(false);
                                    setImprovementInstructions('');
                                }}
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmitImprovement}
                                disabled={isImprovingPrompt}
                                className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600"
                            >
                                <Sparkles className="w-4 h-4 mr-2" />
                                {isImprovingPrompt ? 'Improving...' : 'Improve Prompt'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default KlingTextToVideo;
