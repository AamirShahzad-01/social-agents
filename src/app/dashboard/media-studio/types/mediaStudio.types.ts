/**
 * Media Studio Types
 * Comprehensive type definitions for the Media Studio dashboard
 */

// ============================================================================
// Image Generation Types
// ============================================================================

export interface ImageGenerationConfig {
  prompt: string;
  model: 'gpt-image-1.5' | 'dall-e-3' | 'dall-e-2';
  size: '1024x1024' | '1536x1024' | '1024x1536' | '1792x1024' | '1024x1792' | '512x512' | '256x256';
  quality: 'low' | 'medium' | 'high' | 'hd' | 'standard' | 'auto';
  style?: 'vivid' | 'natural'; // DALL-E 3 only
  background: 'transparent' | 'opaque' | 'auto'; // gpt-image-1.5 only
  format: 'png' | 'jpeg' | 'webp'; // gpt-image-1.5 only (others use response_format)
  n?: number; // 1-10 for dall-e-2/gpt-image-1.5, only 1 for dall-e-3
  moderation?: 'auto' | 'low'; // gpt-image-1.5 only - content filtering
  output_compression?: number; // 0-100 for webp/jpeg, gpt-image-1.5 only
  stream?: boolean; // gpt-image-1.5 only - streaming generation
  partial_images?: number; // 0-3 for streaming, gpt-image-1.5 only
}

export interface ImageEditConfig {
  originalImageUrl: string;
  maskImageUrl: string;
  prompt: string;
  model: 'gpt-image-1.5' | 'dall-e-2';
  size?: '1024x1024' | '512x512' | '256x256';
}

export interface ImageVariationConfig {
  imageUrl: string;
  n?: number;
  size?: '1024x1024' | '512x512' | '256x256';
  model?: 'dall-e-2';
}

export interface ImageToImageConfig {
  referenceImages: string[];
  prompt: string;
  input_fidelity?: 'low' | 'high';
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  quality?: 'low' | 'medium' | 'high';
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  revisedPrompt?: string;
  config: Partial<ImageGenerationConfig>;
  createdAt: number;
  type: 'generated' | 'edited' | 'variation' | 'reference';
}

// ============================================================================
// Video Generation Types (Sora)
// ============================================================================

export interface VideoGenerationConfig {
  prompt: string;
  model: 'sora-2' | 'sora-2-pro';
  size: '1280x720' | '1920x1080' | '480x480' | '720x1280' | '1080x1920' | '1024x576';
  seconds: 5 | 8 | 10 | 15 | 16 | 20;
  inputReference?: string; // Image URL for image-to-video
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface VideoRemixConfig {
  previousVideoId: string;
  prompt: string; // New prompt describing the change
}

export interface ImageVariationConfig {
  imageUrl: string;
  model?: 'dall-e-2'; // Only DALL-E 2 supports variations
  n?: number; // 1-10
  size?: '256x256' | '512x512' | '1024x1024';
}

export interface VideoStatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  videoUrl?: string;
  error?: string;
  createdAt?: number;
  estimatedTime?: number;
}

export interface GeneratedVideo {
  id: string;
  url?: string;
  prompt: string;
  config: VideoGenerationConfig;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  createdAt: number;
  thumbnailUrl?: string;
  duration?: number;
}

// ============================================================================
// Storyboard Types
// ============================================================================

export interface StoryboardScene {
  id: string;
  order: number;
  prompt: string;
  imageUrl?: string;
  videoUrl?: string;
  duration: number;
  transition?: 'fade' | 'cut' | 'dissolve' | 'wipe';
  notes?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface Storyboard {
  id: string;
  title: string;
  description?: string;
  scenes: StoryboardScene[];
  totalDuration: number;
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'processing' | 'completed';
}

// ============================================================================
// Media Library Types
// ============================================================================

export interface AudioGenerationConfig {
  audioTab?: string;
  voice_id?: string;
  duration?: number;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl?: string;
  prompt?: string;
  config?: Partial<ImageGenerationConfig | VideoGenerationConfig | AudioGenerationConfig>;
  createdAt: number;
  isFavorite?: boolean;
  tags?: string[];
  folder?: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  itemCount: number;
  createdAt: number;
}

// ============================================================================
// UI State Types
// ============================================================================

export type MediaStudioTab =
  | 'generate-image'
  | 'edit-image'
  | 'generate-video'
  | 'generate-audio'
  | 'storyboard';

export interface MediaStudioState {
  activeTab: MediaStudioTab;
  isGenerating: boolean;
  currentGeneration?: {
    type: 'image' | 'video';
    progress?: number;
    status?: string;
  };
  selectedMedia?: MediaItem;
  recentGenerations: (GeneratedImage | GeneratedVideo)[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ImageGenerateRequest {
  prompt: string;
  options?: Partial<ImageGenerationConfig>;
}

export interface ImageEditRequest {
  originalImageUrl: string;
  maskImageUrl: string;
  prompt: string;
  options?: Partial<ImageEditConfig>;
}

export interface ImageReferenceRequest {
  referenceImages: string[];
  prompt: string;
  input_fidelity?: 'low' | 'high';
  options?: Partial<ImageGenerationConfig>;
}

export interface VideoGenerateRequest {
  prompt: string;
  options?: Partial<VideoGenerationConfig>;
}

export interface ImageToVideoRequest {
  imageUrl: string;
  prompt: string;
  options?: Partial<VideoGenerationConfig>;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// Presets and Constants
// ============================================================================

export const IMAGE_SIZE_OPTIONS = [
  { value: '1024x1024', label: 'Square (1024×1024)', aspect: '1:1' },
  { value: '1536x1024', label: 'Landscape (1536×1024)', aspect: '3:2' },
  { value: '1024x1536', label: 'Portrait (1024×1536)', aspect: '2:3' },
  { value: '512x512', label: 'Small Square (512×512)', aspect: '1:1' },
] as const;

export const VIDEO_SIZE_OPTIONS = [
  { value: '1280x720', label: 'HD Landscape (1280×720)', aspect: '16:9' },
  { value: '1920x1080', label: 'Full HD (1920×1080)', aspect: '16:9' },
  { value: '720x1280', label: 'HD Portrait (720×1280)', aspect: '9:16' },
  { value: '1080x1920', label: 'Full HD Portrait (1080×1920)', aspect: '9:16' },
  { value: '480x480', label: 'Square (480×480)', aspect: '1:1' },
] as const;

export const VIDEO_DURATION_OPTIONS = [
  { value: 5, label: '5 seconds' },
  { value: 8, label: '8 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 16, label: '16 seconds' },
  { value: 20, label: '20 seconds' },
] as const;

export const IMAGE_QUALITY_OPTIONS = [
  { value: 'low', label: 'Low (Fast)', description: 'Quick generation' },
  { value: 'medium', label: 'Medium', description: 'Balanced quality' },
  { value: 'high', label: 'High', description: 'Best quality' },
] as const;

export const IMAGE_MODEL_OPTIONS = [
  { value: 'gpt-image-1.5', label: 'GPT Image 1', description: 'Latest model with advanced features' },
  { value: 'dall-e-3', label: 'DALL-E 3', description: 'High quality, better prompt following' },
  { value: 'dall-e-2', label: 'DALL-E 2', description: 'Fast, supports variations & edits' },
] as const;

export const VIDEO_MODEL_OPTIONS = [
  { value: 'sora-2', label: 'Sora 2', description: 'Standard video generation' },
  { value: 'sora-2-pro', label: 'Sora 2 Pro', description: 'Higher quality, longer videos' },
] as const;

// ============================================================================
// Google Veo 3.1 Video Generation Types
// ============================================================================

export type VeoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-generate-preview';
export type VeoResolution = '720p' | '1080p' | '4k';
export type VeoDuration = 4 | 6 | 8;
export type VeoAspectRatio = '16:9' | '9:16';
export type VeoGenerationMode = 'text' | 'image' | 'extend' | 'frame-specific' | 'reference';

export interface VeoVideoGenerationConfig {
  prompt: string;
  model: VeoModel;
  aspectRatio: VeoAspectRatio;
  duration: VeoDuration;
  resolution: VeoResolution;

  // Veo-specific IDs (for extension feature)
  veo_video_id?: string;
  veo_operation_id?: string;

  // Extension tracking
  extension_count?: number;
  parent_video_id?: string;
  is_extendable?: boolean;
  total_duration?: number;

  // Source tracking
  input_image_url?: string;
  first_frame_url?: string;
  last_frame_url?: string;
  reference_image_urls?: string[];

  // Generation mode
  generation_mode?: VeoGenerationMode;
}

export interface GeneratedVeoVideo {
  id: string;
  url?: string;
  prompt: string;
  config: VeoVideoGenerationConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  createdAt: number;
  thumbnailUrl?: string;
  duration?: number;
  hasAudio: boolean; // Veo 3.1 always generates audio
  operationId?: string;
  operationName?: string;
  veoVideoId?: string;
  extensionCount?: number;
  isExtendable?: boolean;
}

export const VEO_MODEL_OPTIONS = [
  { value: 'veo-3.1-generate-preview', label: 'Veo 3.1', description: 'Latest with native audio', audio: true, fast: false },
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast', description: 'Speed optimized with audio', audio: true, fast: true },
] as const;

export const VEO_RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p HD', note: '' },
  { value: '1080p', label: '1080p Full HD', note: 'Only for 8s duration' },
  { value: '4k', label: '4K Ultra HD', note: 'Only for 8s duration' },
] as const;

export const VEO_DURATION_OPTIONS = [
  { value: 4, label: '4 seconds' },
  { value: 6, label: '6 seconds' },
  { value: 8, label: '8 seconds' },
] as const;

export const VEO_ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: 'Landscape (16:9)', description: 'Standard widescreen' },
  { value: '9:16', label: 'Portrait (9:16)', description: 'Vertical/mobile' },
] as const;

export const VEO_PLATFORM_PRESETS = [
  { id: 'youtube_short', name: 'YouTube Short', icon: '📹', aspectRatio: '9:16' as const, duration: 8 as const, model: 'veo-3.1-generate-preview' as const },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', aspectRatio: '9:16' as const, duration: 8 as const, model: 'veo-3.1-fast-generate-preview' as const },
  { id: 'instagram_reel', name: 'Insta Reel', icon: '📱', aspectRatio: '9:16' as const, duration: 8 as const, model: 'veo-3.1-fast-generate-preview' as const },
  { id: 'twitter', name: 'Twitter/X', icon: '🐦', aspectRatio: '16:9' as const, duration: 8 as const, model: 'veo-3.1-fast-generate-preview' as const },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', aspectRatio: '16:9' as const, duration: 8 as const, model: 'veo-3.1-generate-preview' as const },
  { id: 'landscape_hd', name: 'HD Video', icon: '🎬', aspectRatio: '16:9' as const, duration: 8 as const, model: 'veo-3.1-generate-preview' as const },
] as const;

// Veo extension constants
export const VEO_EXTENSION_SECONDS = 7;
export const VEO_MAX_EXTENSIONS = 20;
export const VEO_MAX_REFERENCE_IMAGES = 3;

export const PLATFORM_PRESETS = {
  instagram_post: {
    name: 'Instagram Post',
    icon: '📸',
    image: { size: '1024x1024' as const, quality: 'high' as const },
    video: { size: '1080x1920' as const, seconds: 15 as const },
  },
  instagram_story: {
    name: 'Instagram Story',
    icon: '📱',
    image: { size: '1024x1536' as const, quality: 'high' as const },
    video: { size: '1080x1920' as const, seconds: 15 as const },
  },
  twitter: {
    name: 'Twitter/X',
    icon: '🐦',
    image: { size: '1536x1024' as const, quality: 'medium' as const },
    video: { size: '1280x720' as const, seconds: 8 as const },
  },
  youtube_thumbnail: {
    name: 'YouTube Thumbnail',
    icon: '📺',
    image: { size: '1536x1024' as const, quality: 'high' as const },
  },
  youtube_short: {
    name: 'YouTube Short',
    icon: '📹',
    video: { size: '1080x1920' as const, seconds: 16 as const },
  },
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    image: { size: '1024x1536' as const, quality: 'high' as const },
    video: { size: '1080x1920' as const, seconds: 15 as const },
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    image: { size: '1536x1024' as const, quality: 'high' as const },
    video: { size: '1280x720' as const, seconds: 10 as const },
  },
  facebook: {
    name: 'Facebook',
    icon: '📘',
    image: { size: '1536x1024' as const, quality: 'medium' as const },
    video: { size: '1280x720' as const, seconds: 15 as const },
  },
} as const;

// ============================================================================
// Runway Gen4 Alpha Video Generation Types
// ============================================================================

export type RunwayModel = 'gen4_turbo' | 'gen4_aleph' | 'veo3.1' | 'upscale_v1';
export type RunwayRatio = '1280:720' | '1920:1080' | '720:1280' | '1080:1920';
export type RunwayDuration = 5 | 8 | 10;
export type RunwayGenerationMode = 'text' | 'image' | 'video' | 'upscale';
export type RunwayTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface RunwayContentModeration {
  publicFigureThreshold?: 'low';
}

export interface RunwayPromptImage {
  uri: string;
  position: 'first';
}

export interface RunwayVideoGenerationConfig {
  prompt: string;
  model: RunwayModel;
  ratio: RunwayRatio;
  duration: RunwayDuration;
  audio?: boolean;

  // For image-to-video (legacy single image)
  promptImage?: string;

  // For image-to-video (official API array format)
  promptImages?: RunwayPromptImage[];

  // For video-to-video
  videoUri?: string;
  referenceImageUri?: string;

  // Seed for reproducibility
  seed?: number;

  // Content moderation settings
  contentModeration?: RunwayContentModeration;

  // Generation mode tracking
  generation_mode?: RunwayGenerationMode;
}

export interface GeneratedRunwayVideo {
  id: string;
  url?: string;
  prompt: string;
  config: RunwayVideoGenerationConfig;
  status: RunwayTaskStatus;
  progress?: number;
  createdAt: number;
  thumbnailUrl?: string;
  duration?: number;
  taskId?: string;
  error?: string;
}

export const RUNWAY_MODEL_OPTIONS = [
  { value: 'gen4_turbo', label: 'Gen-4 Turbo', description: 'Fast image-to-video generation', type: 'image_to_video', estimatedTime: '1-2 min' },
  { value: 'gen4_aleph', label: 'Gen-4 Aleph', description: 'Video style transfer', type: 'video_to_video', estimatedTime: '2-3 min' },
  { value: 'veo3.1', label: 'Veo 3.1', description: 'Text-to-video with audio', type: 'text_to_video', estimatedTime: '2-4 min' },
  { value: 'upscale_v1', label: 'Upscale V1', description: '4x video upscaling', type: 'upscale', estimatedTime: '1-2 min' },
] as const;

export const RUNWAY_RATIO_OPTIONS = [
  { value: '1280:720', label: 'HD 16:9 (1280×720)', aspect: '16:9' },
  { value: '1920:1080', label: 'Full HD 16:9 (1920×1080)', aspect: '16:9' },
  { value: '720:1280', label: 'HD 9:16 Portrait (720×1280)', aspect: '9:16' },
  { value: '1080:1920', label: 'Full HD 9:16 Portrait (1080×1920)', aspect: '9:16' },
] as const;

export const RUNWAY_DURATION_OPTIONS = [
  { value: 5, label: '5 seconds', description: 'Quick clip' },
  { value: 8, label: '8 seconds', description: 'Standard' },
  { value: 10, label: '10 seconds', description: 'Extended' },
] as const;

export const RUNWAY_PLATFORM_PRESETS = [
  { id: 'youtube_short', name: 'YouTube Short', icon: '📹', ratio: '1080:1920' as const, duration: 10 as const, model: 'gen4_turbo' as const },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', ratio: '1080:1920' as const, duration: 10 as const, model: 'gen4_turbo' as const },
  { id: 'instagram_reel', name: 'Insta Reel', icon: '📱', ratio: '1080:1920' as const, duration: 10 as const, model: 'gen4_turbo' as const },
  { id: 'twitter', name: 'Twitter/X', icon: '🐦', ratio: '1280:720' as const, duration: 10 as const, model: 'veo3.1' as const },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', ratio: '1280:720' as const, duration: 10 as const, model: 'veo3.1' as const },
  { id: 'landscape_hd', name: 'HD Video', icon: '🎬', ratio: '1920:1080' as const, duration: 10 as const, model: 'gen4_turbo' as const },
] as const;

// ============================================================================
// Kling AI v2.6 Video Generation Types
// ============================================================================

export type KlingModel = 'kling-v2-6-pro' | 'kling-v2-6-standard';
export type KlingAspectRatio = '16:9' | '9:16' | '1:1';
export type KlingDuration = '5' | '10';
export type KlingGenerationMode = 'text' | 'image' | 'motion' | 'lipsync' | 'multi-image' | 'avatar' | 'extend';
export type KlingTaskStatus = 'submitted' | 'processing' | 'succeed' | 'failed';
export type KlingOrientation = 'video' | 'image';

export interface KlingVideoGenerationConfig {
  prompt: string;
  model: KlingModel;
  aspectRatio: KlingAspectRatio;
  duration: KlingDuration;
  negativePrompt?: string;
  cfgScale?: number;
  generateAudio?: boolean;

  // Image-to-video specific
  startImageUrl?: string;
  endImageUrl?: string;
  voiceIds?: string[];

  // Motion control specific
  referenceImageUrl?: string;
  motionReferenceVideoUrl?: string;
  characterOrientation?: KlingOrientation;
  keepOriginalSound?: boolean;

  // Generation mode tracking
  generation_mode?: KlingGenerationMode;
}

export interface GeneratedKlingVideo {
  id: string;
  url?: string;
  coverUrl?: string;
  prompt: string;
  config: KlingVideoGenerationConfig;
  status: KlingTaskStatus;
  progress?: number;
  createdAt: number;
  thumbnailUrl?: string;
  duration?: number;
  taskId?: string;
  videoId?: string; // Kling video ID for extensions
  hasAudio: boolean;
  error?: string;
}

export const KLING_MODEL_OPTIONS = [
  { value: 'kling-v2-6-pro', label: 'Kling v2.6 Pro', description: '1080p, higher quality', resolution: '1080p', estimatedTime: '2-4 min' },
  { value: 'kling-v2-6-standard', label: 'Kling v2.6 Standard', description: '720p, faster generation', resolution: '720p', estimatedTime: '1-2 min' },
] as const;

export const KLING_ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: 'Landscape (16:9)', description: 'Standard widescreen' },
  { value: '9:16', label: 'Portrait (9:16)', description: 'Vertical/mobile' },
  { value: '1:1', label: 'Square (1:1)', description: 'Social media' },
] as const;

export const KLING_DURATION_OPTIONS = [
  { value: '5', label: '5 seconds', description: 'Quick clip' },
  { value: '10', label: '10 seconds', description: 'Extended' },
] as const;

export const KLING_ORIENTATION_OPTIONS = [
  { value: 'video', label: 'Match Video', description: 'Use reference video orientation (up to 30s)' },
  { value: 'image', label: 'Match Image', description: 'Use character image orientation (up to 10s)' },
] as const;

export const KLING_PLATFORM_PRESETS = [
  { id: 'youtube_short', name: 'YouTube Short', icon: '📹', aspectRatio: '9:16' as const, duration: '10' as const, model: 'kling-v2-6-pro' as const },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', aspectRatio: '9:16' as const, duration: '10' as const, model: 'kling-v2-6-standard' as const },
  { id: 'instagram_reel', name: 'Insta Reel', icon: '📱', aspectRatio: '9:16' as const, duration: '10' as const, model: 'kling-v2-6-standard' as const },
  { id: 'twitter', name: 'Twitter/X', icon: '🐦', aspectRatio: '16:9' as const, duration: '10' as const, model: 'kling-v2-6-pro' as const },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', aspectRatio: '16:9' as const, duration: '10' as const, model: 'kling-v2-6-pro' as const },
  { id: 'square', name: 'Square', icon: '⬜', aspectRatio: '1:1' as const, duration: '5' as const, model: 'kling-v2-6-standard' as const },
] as const;

