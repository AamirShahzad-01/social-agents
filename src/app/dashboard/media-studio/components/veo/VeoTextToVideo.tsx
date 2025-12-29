'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Info, AlertCircle, X, ChevronDown, Check } from 'lucide-react';
import { AI_MODELS, DEFAULT_AI_MODEL_ID, getModelDisplayName } from '@/constants/aiModels';
import {
  VEO_MODEL_OPTIONS,
  VEO_RESOLUTION_OPTIONS,
  VEO_DURATION_OPTIONS,
  VEO_ASPECT_RATIO_OPTIONS,
  VEO_PLATFORM_PRESETS,
  type VeoModel,
  type VeoResolution,
  type VeoDuration,
  type VeoAspectRatio,
  type GeneratedVeoVideo,
} from '../../types/mediaStudio.types';

// ============================================================================
// Types
// ============================================================================

interface VeoTextToVideoProps {
  onGenerationStarted: (video: GeneratedVeoVideo, historyAction: string) => void;
  onError: (error: string) => void;
  isGenerating: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function VeoTextToVideo({
  onGenerationStarted,
  onError,
  isGenerating,
}: VeoTextToVideoProps) {
  // State
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<VeoModel>('veo-3.1-generate-preview');
  const [aspectRatio, setAspectRatio] = useState<VeoAspectRatio>('16:9');
  const [duration, setDuration] = useState<VeoDuration>(8);
  const [resolution, setResolution] = useState<VeoResolution>('720p');

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

  // Validation: 1080p only available for 8s duration
  const is1080pDisabled = duration !== 8;

  // Auto-adjust resolution if 1080p is selected but duration changes
  React.useEffect(() => {
    if (resolution === '1080p' && duration !== 8) {
      setResolution('720p');
    }
  }, [duration, resolution]);

  // Handle preset selection
  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = VEO_PLATFORM_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setAspectRatio(preset.aspectRatio);
      setDuration(preset.duration);
      setModel(preset.model);
      // Reset to 720p since presets use 8s duration
      setResolution('720p');
    }
  }, []);

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
          provider: 'google',
          model: model,
          userInstructions: improvementInstructions || undefined,
          modelId: selectedAIModelId,
          context: {
            aspectRatio: aspectRatio,
            duration: duration,
            resolution: resolution,
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
      const response = await fetch('/api/ai/media/veo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          aspectRatio,
          durationSeconds: duration,
          resolution,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start video generation');
      }

      // Create video object for tracking
      const video: GeneratedVeoVideo = {
        id: data.operationId,
        prompt: prompt.trim(),
        config: {
          prompt: prompt.trim(),
          model,
          aspectRatio,
          duration,
          resolution,
          generation_mode: 'text',
        },
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        hasAudio: true,
        operationId: data.operationId,
        operationName: data.operationName,
        extensionCount: 0,
        isExtendable: true,
      };

      onGenerationStarted(video, 'veo-text');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate video');
    }
  }, [prompt, model, aspectRatio, duration, resolution, onGenerationStarted, onError]);

  return (
    <div className="space-y-5">
      {/* Prompt - Enterprise Standard */}
      <div className="space-y-2.5">
        <Label htmlFor="prompt" className="text-[13px] font-medium">
          Prompt
          <span className="text-muted-foreground ml-1.5 font-normal text-[11px]">
            (max 1024 tokens)
          </span>
        </Label>
        <Textarea
          id="prompt"
          placeholder='Describe your video... Use "quotes" for dialogue. E.g., A man walking through a forest says "What a beautiful day!"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
          className="min-h-[180px] resize-none text-[14px] leading-relaxed p-3.5 rounded-lg"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImprovePrompt}
              disabled={isImprovingPrompt || !prompt.trim() || isGenerating}
              className="h-9 px-4 text-[13px] font-medium bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600 border-0 rounded-lg"
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
            💡 Tip: Veo 3.1 supports dialogue with quotes
          </p>
        </div>
      </div>

      {/* Model Selection - Enterprise Standard */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Model</Label>
          <Select
            value={model}
            onValueChange={(v: string) => setModel(v as VeoModel)}
            disabled={isGenerating}
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEO_MODEL_OPTIONS.map((opt) => (
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
            onValueChange={(v: string) => setAspectRatio(v as VeoAspectRatio)}
            disabled={isGenerating}
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEO_ASPECT_RATIO_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Duration and Resolution */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Duration</Label>
          <Select
            value={String(duration)}
            onValueChange={(v: string) => setDuration(Number(v) as VeoDuration)}
            disabled={isGenerating}
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEO_DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Resolution</Label>
          <Select
            value={resolution}
            onValueChange={(v: string) => setResolution(v as VeoResolution)}
            disabled={isGenerating}
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEO_RESOLUTION_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.value === '1080p' && is1080pDisabled}
                >
                  <div className="flex items-center gap-2">
                    <span>{opt.label}</span>
                    {opt.value === '1080p' && is1080pDisabled && (
                      <span className="text-[10px] text-muted-foreground">(8s only)</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resolution Note */}
      {resolution === '1080p' && (
        <div className="flex items-center gap-2.5 text-[12px] text-amber-600 bg-amber-50 dark:bg-amber-950/50 p-3 rounded-xl">
          <Info className="w-4 h-4" />
          <span>1080p resolution is only available for 8 second videos</span>
        </div>
      )}

      {/* Generate Button - Enterprise Standard */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full h-12 text-[14px] font-medium bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl"
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
            <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Improve Prompt with AI</h3>
                  <p className="text-xs text-muted-foreground">Enhance your Veo video prompt</p>
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
                  placeholder="Example: Add camera movements, include more detail, make it cinematic, add environmental changes..."
                  rows={7}
                  className="resize-none min-h-[160px]"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Quick suggestions:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Cinematic Product', instruction: 'Make this a cinematic product showcase. Add slow dolly camera movements, dramatic rim lighting, and shallow depth of field. Optimize for luxury brand marketing.' },
                    { label: 'Camera Movements', instruction: 'Add professional camera movements like tracking shots, push-ins, arc movements, or aerial views. Specify lens types and movement speed for cinematic quality.' },
                    { label: 'Brand Marketing', instruction: 'Optimize for brand marketing with hero product shots, lifestyle context, warm color grading, and clean backgrounds. Make it suitable for fashion, beauty, or e-commerce.' },
                    { label: 'Audio & Sound', instruction: 'Add detailed audio: ambient sounds, dialogue in quotes, or music mood description. Veo generates native audio - include specific sound design elements.' },
                    { label: 'Atmosphere', instruction: 'Enhance the atmosphere with specific time of day (golden hour), weather conditions, color palette, and emotional tone (luxurious, energetic, inspirational).' },
                    { label: 'Dynamic Action', instruction: 'Add dynamic motion like walking, fabric flowing, hair movement. Describe actions beat-by-beat for precise timing control.' }
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

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  💡 <strong>Tip:</strong> Veo excels at high-resolution video with native audio. Specify camera work and scene details.
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
                className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
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

export default VeoTextToVideo;

