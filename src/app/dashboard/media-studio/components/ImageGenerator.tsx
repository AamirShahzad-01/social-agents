'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Image as ImageIcon,
  Wand2,
  Download,
  Copy,
  Loader2,
  Settings,
  Sparkles,
  RefreshCw,
  Check,
  X,
  ChevronDown,
  Info,
  Search,
  Globe,
  Zap,
  Bot,
  Palette,
  AlertCircle,
} from 'lucide-react';
import type { GeneratedImage, ImageGenerationConfig } from '../types/mediaStudio.types';
import { useMediaLibrary } from '../hooks/useMediaLibrary';
import { AI_MODELS, DEFAULT_AI_MODEL_ID, getModelDisplayName } from '@/constants/aiModels';

interface ImageGeneratorProps {
  onImageGenerated: (image: GeneratedImage) => void;
  recentImages: GeneratedImage[];
}

// ============================================================================
// PROVIDER & MODEL CONFIGURATIONS
// ============================================================================

type ProviderType = 'openai' | 'google';
type ModelType = 'gpt-image-1.5' | 'gemini-3-pro-image';

interface ProviderConfig {
  value: ProviderType;
  label: string;
  description: string;
  icon: string;
  color: string;
  models: ModelType[];
}

const PROVIDERS: Record<ProviderType, ProviderConfig> = {
  openai: {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT Image 1',
    icon: 'openai',
    color: 'from-teal-500 to-teal-600',
    models: ['gpt-image-1.5'],
  },
  google: {
    value: 'google',
    label: 'Google AI',
    description: 'Gemini 3 Pro Image',
    icon: 'google',
    color: 'from-amber-500 to-amber-600',
    models: ['gemini-3-pro-image'],
  },
};

// Provider Icon Component
const ProviderIcon = ({ provider, className }: { provider: string; className?: string }) => {
  if (provider === 'openai') {
    return <Bot className={className} />;
  }
  return <Palette className={className} />;
};

interface ModelConfig {
  value: ModelType;
  label: string;
  description: string;
  provider: ProviderType;
  maxPromptLength: number;
  sizes: Array<{ value: string; label: string }>;
  qualities: Array<{ value: string; label: string }>;
  supportsN: boolean;
  maxN: number;
  supportsBackground: boolean;
  supportsModeration: boolean;
  supportsFormat: boolean;
  supportsCompression: boolean;
  supportsStyle: boolean;
  supportsStreaming: boolean;
  supportsVariations: boolean;
  supportsEditing: boolean;
  supportsGoogleSearch?: boolean; // Gemini 3 Pro feature
  supportsReferenceImages?: boolean; // Gemini 3 Pro feature
}

const MODEL_CONFIGS: Record<ModelType, ModelConfig> = {
  'gpt-image-1.5': {
    value: 'gpt-image-1.5',
    label: 'GPT Image 1',
    description: '32K prompt, transparency, streaming',
    provider: 'openai',
    maxPromptLength: 32000,
    sizes: [
      { value: '1024x1024', label: 'Square (1024×1024)' },
      { value: '1536x1024', label: 'Landscape (1536×1024)' },
      { value: '1024x1536', label: 'Portrait (1024×1536)' },
    ],
    qualities: [
      { value: 'low', label: 'Low (Fastest)' },
      { value: 'medium', label: 'Medium (Balanced)' },
      { value: 'high', label: 'High (Best Quality)' },
    ],
    supportsN: true,
    maxN: 10,
    supportsBackground: true,
    supportsModeration: true,
    supportsFormat: true,
    supportsCompression: true,
    supportsStyle: false,
    supportsStreaming: true,
    supportsVariations: false,
    supportsEditing: false,
  },
  'gemini-3-pro-image': {
    value: 'gemini-3-pro-image',
    label: 'Gemini 3 Pro Image',
    description: '4K resolution, Google Search, thinking mode',
    provider: 'google',
    maxPromptLength: 8000,
    sizes: [
      { value: '1:1', label: 'Square (1:1)' },
      { value: '2:3', label: 'Portrait (2:3)' },
      { value: '3:2', label: 'Landscape (3:2)' },
      { value: '3:4', label: 'Portrait (3:4)' },
      { value: '4:3', label: 'Landscape (4:3)' },
      { value: '4:5', label: 'Portrait (4:5)' },
      { value: '5:4', label: 'Photo (5:4)' },
      { value: '9:16', label: 'Story (9:16)' },
      { value: '16:9', label: 'Wide (16:9)' },
      { value: '21:9', label: 'Ultra Wide (21:9)' },
    ],
    qualities: [
      { value: '1K', label: '1K Resolution' },
      { value: '2K', label: '2K Resolution' },
      { value: '4K', label: '4K Resolution' },
    ],
    supportsN: false,
    maxN: 1,
    supportsBackground: false,
    supportsModeration: false,
    supportsFormat: false,
    supportsCompression: false,
    supportsStyle: false,
    supportsStreaming: false,
    supportsVariations: false,
    supportsEditing: false,
    supportsGoogleSearch: true,
    supportsReferenceImages: true,
  },
};

const BACKGROUND_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Let AI decide' },
  { value: 'transparent', label: 'Transparent', description: 'PNG/WebP only' },
  { value: 'opaque', label: 'Opaque', description: 'Solid background' },
];

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG', description: 'Best for transparency' },
  { value: 'jpeg', label: 'JPEG', description: 'Smaller file size' },
  { value: 'webp', label: 'WebP', description: 'Modern, efficient' },
];

const MODERATION_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Standard filtering' },
  { value: 'low', label: 'Low', description: 'Less restrictive' },
];

// Standard platform presets - using existing dimensions only
const PLATFORM_PRESETS: Record<ProviderType, Array<{ id: string; name: string; model: ModelType; size: string; quality: string }>> = {
  openai: [
    { id: 'instagram', name: 'Instagram', model: 'gpt-image-1.5', size: '1024x1024', quality: 'high' },
    { id: 'facebook', name: 'Facebook', model: 'gpt-image-1.5', size: '1024x1024', quality: 'high' },
    { id: 'twitter', name: 'Twitter', model: 'gpt-image-1.5', size: '1536x1024', quality: 'medium' },
    { id: 'linkedin', name: 'LinkedIn', model: 'gpt-image-1.5', size: '1024x1024', quality: 'high' },
    { id: 'youtube_short', name: 'y-short', model: 'gpt-image-1.5', size: '1024x1536', quality: 'high' },
    { id: 'tiktok', name: 'TikTok', model: 'gpt-image-1.5', size: '1024x1536', quality: 'high' },
  ],
  google: [
    { id: 'instagram', name: 'Instagram', model: 'gemini-3-pro-image', size: '1:1', quality: '2K' },
    { id: 'facebook', name: 'Facebook', model: 'gemini-3-pro-image', size: '1:1', quality: '2K' },
    { id: 'twitter', name: 'Twitter', model: 'gemini-3-pro-image', size: '16:9', quality: '2K' },
    { id: 'linkedin', name: 'LinkedIn', model: 'gemini-3-pro-image', size: '1:1', quality: '2K' },
    { id: 'youtube_short', name: 'y-short', model: 'gemini-3-pro-image', size: '9:16', quality: '2K' },
    { id: 'tiktok', name: 'TikTok', model: 'gemini-3-pro-image', size: '9:16', quality: '2K' },
  ],
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ImageGenerator({ onImageGenerated, recentImages }: ImageGeneratorProps) {
  // Media Library hook for saving to database
  const { saveGeneratedMedia, createHistoryEntry, markGenerationFailed, isEnabled: canSaveToDb } = useMediaLibrary();

  // State - Provider first, then model
  const [provider, setProvider] = useState<ProviderType>('openai');
  const [model, setModel] = useState<ModelType>('gpt-image-1.5');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('medium');
  const [background, setBackground] = useState('auto');
  const [format, setFormat] = useState('png');
  const [moderation, setModeration] = useState('auto');
  const [n, setN] = useState(1);
  const [compression, setCompression] = useState(80);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  // Gemini 3 Pro specific options
  const [enableGoogleSearch, setEnableGoogleSearch] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

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
    if (errorMessage.includes('MODULE_NOT_FOUND') || errorMessage.includes('Cannot find module')) {
      return 'Service temporarily unavailable. Please try again.';
    }
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      return 'Connection error. Please check your internet.';
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return 'Request timed out. Please try again.';
    }
    return 'Failed to improve prompt. Please try again.';
  };

  const config = MODEL_CONFIGS[model];

  // Handle provider change - switch to first model of that provider
  const handleProviderChange = (newProvider: ProviderType) => {
    setProvider(newProvider);
    const firstModel = PROVIDERS[newProvider].models[0];
    handleModelChange(firstModel);
  };

  // Handle model change - reset to valid defaults
  const handleModelChange = (newModel: ModelType) => {
    const newConfig = MODEL_CONFIGS[newModel];
    setModel(newModel);
    setProvider(newConfig.provider); // Sync provider
    setSize(newConfig.sizes[0].value);
    setQuality(newConfig.qualities[0].value);
    if (!newConfig.supportsN) setN(1);
    if (!newConfig.supportsBackground) setBackground('auto');
    if (!newConfig.supportsFormat) setFormat('png');
  };

  // Generate image
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    if (prompt.length > config.maxPromptLength) {
      setError(`Prompt too long. ${model} supports max ${config.maxPromptLength} characters.`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);
    const startTime = Date.now();

    // Create history entry for tracking
    const historyId = canSaveToDb ? await createHistoryEntry({
      type: 'image',
      action: 'generated',
      prompt,
      model,
      config: { size, quality, background, format },
    }) : null;

    try {
      const requestBody: any = {
        prompt,
        options: {
          model,
          size,
          quality,
        },
      };

      // Add model-specific options
      if (config.supportsBackground) {
        requestBody.options.background = background;
      }
      if (config.supportsFormat) {
        requestBody.options.format = format;
      }
      if (config.supportsModeration) {
        requestBody.options.moderation = moderation;
      }
      if (config.supportsCompression && format !== 'png') {
        requestBody.options.output_compression = compression;
      }
      if (config.supportsN && n > 1) {
        requestBody.options.n = n;
      }


      let imageUrl: string;
      let revisedPrompt: string | undefined;
      let generatedUrls: string[] = [];

      // Route to appropriate API based on model
      if (model === 'gemini-3-pro-image') {
        // Use Gemini 3 Pro Image API
        const geminiBody = {
          action: 'gemini-3-pro',
          prompt,
          aspectRatio: size,
          imageSize: quality,
          responseModalities: ['TEXT', 'IMAGE'],
          enableGoogleSearch,
        };

        const response = await fetch('/api/ai/media/imagen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to generate image with Gemini 3 Pro');
        }

        generatedUrls = data.images;
        imageUrl = generatedUrls[0];
        setGeneratedImages(generatedUrls);
        setSelectedImageIndex(0);

        // Store AI text response if available
        if (data.text) {
          setAiResponse(data.text);
        }
      } else {
        // Use OpenAI API
        const response = await fetch('/api/ai/media/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to generate image');
        }

        imageUrl = data.data.imageUrl;
        revisedPrompt = data.data.metadata?.revisedPrompt;
        generatedUrls = [imageUrl];
        setGeneratedImages(generatedUrls);
        setSelectedImageIndex(0);
        setAiResponse(null);
      }

      const generatedImage: GeneratedImage = {
        id: `img_${Date.now()}`,
        url: imageUrl,
        prompt,
        revisedPrompt,
        config: { model, size, quality, background, format } as any,
        createdAt: Date.now(),
        type: 'generated',
      };

      // Save to database
      if (canSaveToDb) {
        await saveGeneratedMedia({
          type: 'image',
          source: 'generated',
          url: imageUrl,
          prompt,
          revisedPrompt,
          model,
          config: { size, quality, background, format },
        }, historyId, Date.now() - startTime);
      }

      onImageGenerated(generatedImage);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMsg);
      if (historyId) {
        await markGenerationFailed(historyId, errorMsg);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, model, size, quality, background, format, moderation, compression, n, config, onImageGenerated, canSaveToDb, createHistoryEntry, saveGeneratedMedia, markGenerationFailed, enableGoogleSearch]);

  // Apply preset - uses current provider's presets
  const applyPreset = (presetId: string) => {
    const preset = PLATFORM_PRESETS[provider].find(p => p.id === presetId);
    if (preset) {
      handleModelChange(preset.model);
      setTimeout(() => {
        setSize(preset.size);
        setQuality(preset.quality);
      }, 0);
    }
  };

  // Download image
  const handleDownload = async (imageUrl: string, index: number = 0) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model}_${Date.now()}_${index}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
    }
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          mediaType: 'image-generation',
          mediaSubType: 'text-to-image',
          provider: provider,
          model: model,
          userInstructions: improvementInstructions || undefined,
          modelId: selectedAIModelId,
          context: {
            aspectRatio: size,
            resolution: quality,
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

  const currentImage = generatedImages[selectedImageIndex];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-2 rounded-md" style={{ background: 'var(--ms-gradient-primary)' }}>
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <span>Generate Image</span>
          </CardTitle>
          <CardDescription className="text-sm">
            {config.label} - {config.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Model Selection - Clean Tab Style */}
          <div className="space-y-2">
            <label className="text-sm font-medium">AI Model</label>
            <div className="inline-flex h-auto p-1 bg-muted rounded-lg gap-1">
              {Object.values(MODEL_CONFIGS).map((cfg) => {
                const isSelected = model === cfg.value;
                const providerConfig = PROVIDERS[cfg.provider];

                return (
                  <button
                    key={cfg.value}
                    onClick={() => handleModelChange(cfg.value)}
                    className={`
                      flex items-center gap-2 h-9 px-4 rounded-md text-sm transition-all duration-200
                      ${isSelected
                        ? 'bg-white dark:bg-white shadow-sm'
                        : 'hover:bg-white/50 dark:hover:bg-white/20'
                      }
                    `}
                  >
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{
                        background: cfg.provider === 'openai'
                          ? 'var(--ms-gradient-primary)'
                          : 'linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 100%)'
                      }}
                    >
                      <ProviderIcon
                        provider={cfg.provider}
                        className="w-3 h-3 text-white"
                      />
                    </div>
                    <span className={`font-medium text-sm ${isSelected
                      ? 'text-gray-900 dark:text-gray-900'
                      : 'text-foreground'
                      }`}>
                      {cfg.value === 'gpt-image-1.5' ? 'GPT Image 1' : 'Gemini 3 Pro'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Prompt</label>
              <span className="text-xs text-muted-foreground">
                {prompt.length} / {config.maxPromptLength.toLocaleString()}
              </span>
            </div>
            <Textarea
              placeholder={`Describe the image you want to create... (max ${config.maxPromptLength.toLocaleString()} chars)`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[140px] resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleImprovePrompt}
                  disabled={isImprovingPrompt || !prompt.trim()}
                  className="h-8 text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600 border-0"
                >
                  {isImprovingPrompt ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                      Improving...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1.5" />
                      Improve Prompt
                    </>
                  )}
                </Button>
                {improvementError && (
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {improvementError}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={handleCopyPrompt}>
                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* Platform Presets - Standard Platforms Only */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Quick Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_PRESETS[provider].map((preset) => {
                const isSelected = size === preset.size && model === preset.model;
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    className={`
                      h-8 px-3 rounded-md border text-sm font-medium transition-all duration-200
                      ${isSelected
                        ? 'border-[var(--ms-primary)] bg-[var(--ms-primary)] text-white'
                        : 'border-[var(--ms-border)] hover:border-[var(--ms-primary)]/50 hover:bg-muted/50'
                      }
                    `}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size & Quality */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                {config.sizes.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                {config.qualities.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Number of Images */}
          {config.supportsN && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Number of Images (1-{config.maxN})
              </label>
              <input
                type="number"
                min={1}
                max={config.maxN}
                value={n}
                onChange={(e) => setN(Math.min(config.maxN, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
          )}

          {/* Gemini 3 Pro: Google Search Grounding */}
          {config.supportsGoogleSearch && (
            <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-500/5 to-indigo-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <label className="text-sm font-medium">Google Search Grounding</label>
                  <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600">
                    <Zap className="w-3 h-3 mr-1" />
                    Gemini 3 Pro
                  </Badge>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableGoogleSearch}
                  onClick={() => setEnableGoogleSearch(!enableGoogleSearch)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableGoogleSearch ? 'bg-blue-500' : 'bg-muted'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableGoogleSearch ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enable real-time data grounding for weather, stock charts, current events, and more.
              </p>
              {enableGoogleSearch && (
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-500/10 p-2 rounded">
                  <Search className="w-3 h-3" />
                  <span>AI will use Google Search to verify facts and generate accurate imagery</span>
                </div>
              )}
            </div>
          )}

          {/* Advanced Options Toggle */}
          {(config.supportsBackground || config.supportsFormat || config.supportsModeration) && (
            <>
              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Advanced Options ({model})
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </Button>

              {showAdvanced && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  {/* GPT Image 1: Background */}
                  {config.supportsBackground && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        Background
                        <Badge variant="secondary" className="text-xs">gpt-image-1.5</Badge>
                      </label>
                      <select
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      >
                        {BACKGROUND_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} - {opt.description}
                          </option>
                        ))}
                      </select>
                      {background === 'transparent' && format === 'jpeg' && (
                        <p className="text-xs text-amber-500 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          JPEG doesn't support transparency. Use PNG or WebP.
                        </p>
                      )}
                    </div>
                  )}

                  {/* GPT Image 1: Format */}
                  {config.supportsFormat && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        Output Format
                        <Badge variant="secondary" className="text-xs">gpt-image-1.5</Badge>
                      </label>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      >
                        {FORMAT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} - {opt.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* GPT Image 1: Compression */}
                  {config.supportsCompression && format !== 'png' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Compression: {compression}%
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={compression}
                        onChange={(e) => setCompression(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Lower = smaller file, higher = better quality
                      </p>
                    </div>
                  )}

                  {/* GPT Image 1: Moderation */}
                  {config.supportsModeration && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        Content Moderation
                        <Badge variant="secondary" className="text-xs">gpt-image-1.5</Badge>
                      </label>
                      <select
                        value={moderation}
                        onChange={(e) => setModeration(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                      >
                        {MODERATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} - {opt.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full text-white border-0 transition-all duration-200"
            style={{
              background: model === 'gpt-image-1.5' ? 'var(--ms-gradient-primary)' : 'var(--ms-gradient-accent)',
              boxShadow: model === 'gpt-image-1.5'
                ? '0 4px 16px rgba(13, 148, 136, 0.3)'
                : '0 4px 16px rgba(245, 158, 11, 0.3)',
              color: model === 'gpt-image-1.5' ? 'white' : 'var(--ms-accent-foreground)'
            }}
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating with {config.label}...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate {n > 1 ? `${n} Images` : 'Image'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="overflow-hidden">
        <CardHeader style={{ background: 'var(--ms-gradient-subtle)', borderBottom: '1px solid var(--ms-border)' }}>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg" style={{ background: 'var(--ms-gradient-primary)' }}>
              <ImageIcon className="w-4 h-4 text-white" />
            </div>
            <span className="ms-heading-md">Preview</span>
          </CardTitle>
          <CardDescription className="ms-body-sm">
            Generated images
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Main Preview */}
          <div className="aspect-square bg-gradient-to-br from-muted to-muted/50 rounded-xl overflow-hidden mb-4 relative border-2 border-dashed border-muted-foreground/20">
            {isGenerating ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500/5 to-pink-500/5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 blur-xl opacity-50 animate-pulse" />
                  <Loader2 className="w-16 h-16 animate-spin text-purple-500 relative" />
                </div>
                <p className="text-sm text-muted-foreground mt-6 font-medium">
                  Generating with {config.label}...
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">This may take a few seconds</p>
              </div>
            ) : currentImage ? (
              <img
                src={currentImage}
                alt="Generated"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="p-6 rounded-full bg-gradient-to-br from-muted-foreground/5 to-muted-foreground/10 mb-4">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No image generated yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 text-center px-8">
                  Write a prompt and click generate to create your first image
                </p>
              </div>
            )}
          </div>

          {/* Multiple Images Selector */}
          {generatedImages.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {generatedImages.map((img, index) => (
                <button
                  key={index}
                  className={`w-16 h-16 flex-shrink-0 rounded-md overflow-hidden transition-all ${selectedImageIndex === index ? 'ring-2 ring-primary' : 'opacity-60 hover:opacity-100'
                    }`}
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <img src={img} alt={`Generated ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* AI Response Text (Gemini 3 Pro) */}
          {aiResponse && currentImage && (
            <div className="mb-4 p-3 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 border border-blue-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-600">AI Response</span>
              </div>
              <p className="text-sm text-muted-foreground">{aiResponse}</p>
            </div>
          )}

          {/* Actions */}
          {currentImage && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <Button variant="outline" onClick={() => handleDownload(currentImage, selectedImageIndex)}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setGeneratedImages([]);
                  setSelectedImageIndex(0);
                  setAiResponse(null);
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          )}

          {/* Recent Generations */}
          {recentImages.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Recent</label>
              <div className="grid grid-cols-4 gap-2">
                {recentImages.slice(0, 8).map((img) => (
                  <button
                    key={img.id}
                    className="aspect-square bg-muted rounded-md overflow-hidden hover:ring-2 hover:ring-primary transition-all relative group"
                    onClick={() => {
                      setGeneratedImages([img.url]);
                      setSelectedImageIndex(0);
                      setPrompt(img.prompt);
                    }}
                  >
                    <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                    <Badge className="absolute bottom-1 right-1 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                      {img.type}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Improve Prompt with AI</h3>
                  <p className="text-xs text-muted-foreground">Get professional image generation prompt</p>
                </div>
              </div>
              <button
                onClick={() => setShowImprovementModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  What would you like to improve? <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Textarea
                  value={improvementInstructions}
                  onChange={(e) => setImprovementInstructions(e.target.value)}
                  placeholder="Example: Add professional lighting details, include camera angle, make it more cinematic, add color palette..."
                  rows={7}
                  className="resize-none min-h-[160px]"
                />
              </div>

              {/* Quick Suggestions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Quick suggestions:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Product Photography', instruction: 'Make it professional product photography: clean background, soft studio lighting, sharp focus on details. Good for e-commerce.' },
                    { label: 'Fashion Editorial', instruction: 'Fashion editorial style: aspirational setting, dramatic lighting, shallow depth of field with 85mm bokeh, model posing.' },
                    { label: 'Brand Lifestyle', instruction: 'Lifestyle imagery: product in real-world context, natural lighting, relatable environment showing product in use.' },
                    { label: 'Transparent PNG', instruction: 'Add transparent background for the product. Clean edges, no shadows. Good for website assets and marketing.' },
                    { label: 'Text & Logo', instruction: 'Include text or logo in image. Specify exact text content, font style, and placement for brand messaging.' },
                    { label: 'Artistic Style', instruction: 'Apply artistic style like "Van Gogh", "cyberpunk", "art deco", or "minimalist". Add specific mood and color palette.' }
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
                  💡 <strong>Tip:</strong> Leave empty for general improvements, or specify exactly what you want enhanced.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
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
