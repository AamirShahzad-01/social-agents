'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Image as ImageIcon,
  Smartphone,
  Monitor,
  Square,
  Check,
  Crop,
  Youtube,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Download,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

// Platform icons mapping
const PlatformIcon = ({ platform }: { platform: string }) => {
  switch (platform) {
    case 'youtube-thumbnail':
      return <Youtube className="w-5 h-5 text-red-500" />;
    case 'instagram-story':
    case 'instagram-post':
    case 'instagram-feed':
      return <Instagram className="w-5 h-5 text-pink-500" />;
    case 'facebook-story':
    case 'facebook-post-square':
    case 'facebook-feed':
    case 'facebook-cover':
      return <Facebook className="w-5 h-5 text-blue-600" />;
    case 'twitter-header':
      return <Twitter className="w-5 h-5 text-sky-500" />;
    case 'linkedin-square':
    case 'linkedin-cover':
      return <Linkedin className="w-5 h-5 text-blue-700" />;
    default:
      return <Monitor className="w-5 h-5" />;
  }
};

interface PlatformPreset {
  id: string;
  width: number;
  height: number;
  aspectRatio: string;
  name: string;
}

interface ImageItem {
  id: string;
  url: string;
  thumbnail_url?: string;
  prompt?: string;
}

interface ImageResizerProps {
  onResizeComplete: (imageUrl: string) => void;
}

export function ImageResizer({ onResizeComplete }: ImageResizerProps) {
  const { workspaceId } = useAuth();
  const [presets, setPresets] = useState<PlatformPreset[]>([]);
  const [libraryImages, setLibraryImages] = useState<ImageItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const [lockAspect, setLockAspect] = useState(true);
  const [customAspectRatio, setCustomAspectRatio] = useState(1);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);
  const [resizeMode, setResizeMode] = useState<'cover' | 'contain' | 'stretch'>('contain');
  const [outputFormat, setOutputFormat] = useState<'auto' | 'jpeg' | 'png'>('auto');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [useTransparentBackground, setUseTransparentBackground] = useState(false);
  const [jpegQuality, setJpegQuality] = useState(95);
  const [isResizing, setIsResizing] = useState(false);
  const [resizedImageUrl, setResizedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets();
    if (workspaceId) {
      fetchLibraryImages();
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedImage) {
      setSourceDimensions(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setSourceDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = selectedImage.url;
  }, [selectedImage]);

  const fetchPresets = async () => {
    try {
      const response = await fetch('/api/media-studio/resize-image');
      if (response.ok) {
        const data = await response.json();
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const fetchLibraryImages = async () => {
    if (!workspaceId) return;
    setIsLoadingLibrary(true);
    try {
      const response = await fetch(
        `/api/media-studio/library?workspace_id=${workspaceId}&type=image&limit=50`
      );
      if (response.ok) {
        const data = await response.json();
        setLibraryImages(data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleResize = async () => {
    if (!selectedImage) {
      toast.error('Please select an image');
      return;
    }

    if (useCustomSize && (!customWidth || !customHeight)) {
      toast.error('Please enter custom width and height');
      return;
    }

    if (!useCustomSize && !selectedPlatform) {
      toast.error('Please select a platform or use custom size');
      return;
    }

    if (!workspaceId) {
      toast.error('No workspace selected');
      return;
    }

    setIsResizing(true);
    const preset = presets.find(p => p.id === selectedPlatform);
    const platformLabel = useCustomSize
      ? `Custom (${customWidth}x${customHeight})`
      : preset?.name || selectedPlatform;
    const loadingToast = toast.loading(`Resizing for ${platformLabel}...`);

    try {
      const response = await fetch('/api/media-studio/resize-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          imageUrl: selectedImage.url,
          platform: useCustomSize ? undefined : selectedPlatform,
          customWidth: useCustomSize ? customWidth : undefined,
          customHeight: useCustomSize ? customHeight : undefined,
          resizeMode,
          outputFormat,
          backgroundColor: useTransparentBackground ? 'transparent' : backgroundColor,
          jpegQuality,
        }),
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        const data = await response.json();
        toast.success(`Image resized for ${data.platform}!`);

        // Store the resized image URL for download
        setResizedImageUrl(data.url);

        // Reset state
        setSelectedImage(null);
        setSelectedPlatform(null);

        // Refresh library and notify parent
        await fetchLibraryImages();
        onResizeComplete(data.url);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to resize image');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Failed to resize image');
    } finally {
      setIsResizing(false);
    }
  };

  // Group presets by category
  const storyPresets = presets.filter(p =>
    ['instagram-story', 'facebook-story'].includes(p.id)
  );
  const squarePresets = presets.filter(p =>
    ['instagram-post', 'facebook-post-square', 'linkedin-square'].includes(p.id)
  );
  const portraitPresets = presets.filter(p =>
    ['instagram-feed', 'facebook-feed'].includes(p.id)
  );
  const landscapePresets = presets.filter(p =>
    ['youtube-thumbnail', 'facebook-cover', 'twitter-header', 'linkedin-cover'].includes(p.id)
  );

  const recommendedPresets = useMemo(() => {
    if (!sourceDimensions || presets.length === 0) return [];
    const sourceRatio = sourceDimensions.width / sourceDimensions.height;

    return [...presets]
      .map((preset) => ({
        ...preset,
        score: Math.abs((preset.width / preset.height) - sourceRatio),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);
  }, [presets, sourceDimensions]);

  useEffect(() => {
    if (!selectedPlatform && !useCustomSize && recommendedPresets.length > 0) {
      handlePresetSelect(recommendedPresets[0]);
    }
  }, [recommendedPresets, selectedPlatform, useCustomSize]);

  const handlePresetSelect = (preset: PlatformPreset) => {
    setSelectedPlatform(preset.id);
    setUseCustomSize(false);
    setCustomWidth(preset.width);
    setCustomHeight(preset.height);
    setCustomAspectRatio(preset.width / preset.height);
  };

  const handleCustomWidthChange = (value: number) => {
    if (!value || value < 1) {
      setCustomWidth(0);
      return;
    }

    setCustomWidth(value);
    if (lockAspect && customAspectRatio > 0) {
      setCustomHeight(Math.max(1, Math.round(value / customAspectRatio)));
    }
  };

  const handleCustomHeightChange = (value: number) => {
    if (!value || value < 1) {
      setCustomHeight(0);
      return;
    }

    setCustomHeight(value);
    if (lockAspect && customAspectRatio > 0) {
      setCustomWidth(Math.max(1, Math.round(value * customAspectRatio)));
    }
  };

  const outputWidth = useCustomSize
    ? customWidth
    : presets.find(p => p.id === selectedPlatform)?.width;
  const outputHeight = useCustomSize
    ? customHeight
    : presets.find(p => p.id === selectedPlatform)?.height;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Image Selection */}
      <Card className="flex flex-col h-full overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <ImageIcon className="w-5 h-5 text-white" />
            Select Image
          </CardTitle>
          <CardDescription className="text-teal-50">
            Choose an image to resize
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          {isLoadingLibrary ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : libraryImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No images in library</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {libraryImages.map((item) => {
                const isSelected = selectedImage?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 shadow-sm ${isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/50 scale-[0.98]'
                      : 'border-transparent hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md'
                      }`}
                    onClick={() => setSelectedImage(isSelected ? null : item)}
                  >
                    <img
                      src={item.thumbnail_url || item.url}
                      alt={item.prompt || 'Image'}
                      className="aspect-square object-cover w-full"
                    />

                    {isSelected && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                        <Badge className="bg-indigo-500">
                          <Check className="w-3 h-3 mr-1" />
                          Selected
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Middle: Platform & Size */}
      <Card className="flex flex-col h-full overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Crop className="w-5 h-5 text-white" />
            Select Platform
          </CardTitle>
          <CardDescription className="text-teal-50">
            Choose the target size
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-h-[600px] overflow-y-auto p-2">
          {recommendedPresets.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Recommended (Best Fit)</span>
                <Badge variant="secondary">Auto-detected</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recommendedPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPlatform === preset.id ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-auto py-2"
                    onClick={() => handlePresetSelect(preset)}
                  >
                    <PlatformIcon platform={preset.id} />
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Stories (9:16) */}
          {storyPresets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4" />
                <span className="text-sm font-medium">Stories (9:16)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {storyPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPlatform === preset.id ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-auto py-2"
                    onClick={() => handlePresetSelect(preset)}
                  >
                    <PlatformIcon platform={preset.id} />
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Square (1:1) */}
          {squarePresets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Square className="w-4 h-4" />
                <span className="text-sm font-medium">Square (1:1)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {squarePresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPlatform === preset.id ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-auto py-2"
                    onClick={() => setSelectedPlatform(preset.id)}
                  >
                    <PlatformIcon platform={preset.id} />
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Portrait (4:5) */}
          {portraitPresets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4" />
                <span className="text-sm font-medium">Portrait (4:5)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {portraitPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPlatform === preset.id ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-auto py-2"
                    onClick={() => setSelectedPlatform(preset.id)}
                  >
                    <PlatformIcon platform={preset.id} />
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Landscape */}
          {landscapePresets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-4 h-4" />
                <span className="text-sm font-medium">Landscape / Covers</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {landscapePresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPlatform === preset.id ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-auto py-2"
                    onClick={() => setSelectedPlatform(preset.id)}
                  >
                    <PlatformIcon platform={preset.id} />
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Selected info */}
          {(selectedPlatform || useCustomSize) && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Output Size:</span>
                <Badge variant="secondary">
                  {outputWidth} x {outputHeight}
                </Badge>
              </div>
            </div>
          )}

          <div className="p-3 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Custom Size</p>
                <p className="text-xs text-muted-foreground">Override platform presets</p>
              </div>
              <Switch
                checked={useCustomSize}
                onCheckedChange={(checked) => {
                  setUseCustomSize(checked);
                  if (checked) {
                    setSelectedPlatform(null);
                    const baseWidth = customWidth || sourceDimensions?.width || 1080;
                    const baseHeight = customHeight || sourceDimensions?.height || 1080;
                    setCustomWidth(baseWidth);
                    setCustomHeight(baseHeight);
                    setCustomAspectRatio(baseWidth / baseHeight);
                  }
                }}
              />
            </div>

            {useCustomSize && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="custom-width">Width (px)</Label>
                    <Input
                      id="custom-width"
                      type="number"
                      min={1}
                      value={customWidth}
                      onChange={(event) => handleCustomWidthChange(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="custom-height">Height (px)</Label>
                    <Input
                      id="custom-height"
                      type="number"
                      min={1}
                      value={customHeight}
                      onChange={(event) => handleCustomHeightChange(Number(event.target.value))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Lock Aspect Ratio</p>
                    <p className="text-xs text-muted-foreground">Keep proportions consistent</p>
                  </div>
                  <Switch
                    checked={lockAspect}
                    onCheckedChange={(checked) => {
                      setLockAspect(checked);
                      if (checked && customWidth > 0 && customHeight > 0) {
                        setCustomAspectRatio(customWidth / customHeight);
                      }
                    }}
                  />
                </div>
                {sourceDimensions && (
                  <div className="text-xs text-muted-foreground">
                    Source: {sourceDimensions.width} x {sourceDimensions.height}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resize button */}
          <Button
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
            onClick={handleResize}
            disabled={!selectedImage || (!selectedPlatform && !useCustomSize) || isResizing}
          >
            {isResizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resizing...
              </>
            ) : (
              <>
                <Crop className="w-4 h-4 mr-2" />
                Resize Image
              </>
            )}
          </Button>

          {(!selectedImage || (!selectedPlatform && !useCustomSize)) && (
            <p className="text-xs text-muted-foreground text-center">
              Select an image and platform or custom size
            </p>
          )}
        </CardContent>
      </Card>

      {/* Right: Resize Settings */}
      <Card className="flex flex-col h-full overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-b py-1">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Crop className="w-5 h-5 text-white" />
            Resize Settings
          </CardTitle>
          <CardDescription className="text-teal-50">
            Control fit, format, and quality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-2">
          <div className="space-y-2">
            <Label>Resize Mode</Label>
            <Select
              value={resizeMode}
              onValueChange={(value) => setResizeMode(value as 'cover' | 'contain' | 'stretch')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover (crop to fill)</SelectItem>
                <SelectItem value="contain">Contain (fit with padding)</SelectItem>
                <SelectItem value="stretch">Stretch (ignore ratio)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Output Format</Label>
            <Select
              value={outputFormat}
              onValueChange={(value) => setOutputFormat(value as 'auto' | 'jpeg' | 'png')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {resizeMode === 'contain' && outputFormat !== 'jpeg' && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">Transparent Background</p>
                <p className="text-xs text-muted-foreground">Only for PNG/Auto</p>
              </div>
              <Switch
                checked={useTransparentBackground}
                onCheckedChange={(checked) => {
                  setUseTransparentBackground(checked);
                  if (checked) {
                    setBackgroundColor('#000000');
                  }
                }}
              />
            </div>
          )}

          {resizeMode === 'contain' && !useTransparentBackground && (
            <div className="space-y-2">
              <Label>Background Color</Label>
              <Input
                type="color"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
                className="h-10 p-1"
              />
            </div>
          )}

          {(outputFormat === 'jpeg' || outputFormat === 'auto') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>JPEG Quality</Label>
                <span className="text-sm text-muted-foreground">{jpegQuality}%</span>
              </div>
              <Slider
                value={[jpegQuality]}
                min={60}
                max={100}
                step={1}
                onValueChange={(value) => setJpegQuality(value[0])}
              />
            </div>
          )}

          {/* Download Section - Shows when resize is complete */}
          {resizedImageUrl && (
            <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="w-5 h-5" />
                <span className="font-medium text-sm">Resize Complete!</span>
              </div>
              <Button
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                onClick={async () => {
                  try {
                    const response = await fetch(resizedImageUrl);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `resized-image-${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                  } catch (error) {
                    toast.error('Failed to download image');
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Resized Image
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setResizedImageUrl(null)}
              >
                Dismiss
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
