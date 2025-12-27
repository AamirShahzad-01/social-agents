'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Media types supported by the library
 */
export type MediaType = 'image' | 'video' | 'audio';

/**
 * Source/action types for media generation
 */
export type MediaSource =
  | 'generated'      // Text-to-image or text-to-video
  | 'edited'         // Smart edit or Canva edited
  | 'uploaded'       // User uploaded media
  | 'variation'      // DALL-E 2 variations
  | 'reference'      // Style reference generation
  | 'image-to-video' // Image animated to video
  | 'remix'          // Video remix
  | 'inpaint'        // Inpainting edit
  // Google Veo 3.1 sources
  | 'veo-text'           // Veo text-to-video
  | 'veo-image'          // Veo image-to-video
  | 'veo-extend'         // Veo video extension
  | 'veo-frame-specific' // Veo first+last frame
  | 'veo-reference';     // Veo reference images

export interface SaveMediaOptions {
  type: MediaType;
  source: MediaSource;
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  revisedPrompt?: string;
  model: string;
  config: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface SaveHistoryOptions {
  type: MediaType;
  action: MediaSource;
  prompt: string;
  model: string;
  config: Record<string, any>;
  inputMediaUrls?: string[];
}

export interface UpdateHistoryOptions {
  historyId: string;
  status: 'completed' | 'failed';
  outputMediaUrl?: string;
  outputMediaId?: string;
  generationTimeMs?: number;
  revisedPrompt?: string;
  errorMessage?: string;
}

/**
 * Hook for saving generated media to the database
 * Automatically handles workspace context and Cloudinary upload
 */
export function useMediaLibrary() {
  const { workspaceId, user } = useAuth();

  /**
   * Upload base64 data URL to Cloudinary
   */
  const uploadToCloudinary = useCallback(async (
    dataUrl: string,
    type: MediaType,
    tags: string[] = []
  ): Promise<{ url: string; publicId: string; metadata: Record<string, any> } | null> => {
    if (!workspaceId) return null;

    try {
      // Convert data URL to File/Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Determine file extension and MIME type
      let ext = 'bin';
      let mimeType = blob.type;
      if (type === 'image') {
        ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      } else if (type === 'video') {
        ext = mimeType.includes('webm') ? 'webm' : 'mp4';
      } else if (type === 'audio') {
        ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mpeg') ? 'mp3' : 'mp3';
      }

      const file = new File([blob], `${type}_${Date.now()}.${ext}`, { type: mimeType });

      // Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'generated');
      formData.append('tags', [...tags, `workspace:${workspaceId}`, 'generated'].join(','));

      const pythonBackendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:8000';
      const uploadEndpoint = type === 'image'
        ? '/api/v1/cloudinary/upload/image'
        : type === 'video'
          ? '/api/v1/cloudinary/upload/video'
          : '/api/v1/cloudinary/upload/audio';

      const uploadResponse = await fetch(`${pythonBackendUrl}${uploadEndpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        console.warn('Cloudinary upload failed, using original URL');
        return null;
      }

      const result = await uploadResponse.json();

      if (!result.success) {
        console.warn('Cloudinary upload failed:', result.error);
        return null;
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        metadata: {
          cloudinaryPublicId: result.public_id,
          cloudinaryFormat: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          duration: result.duration,
        }
      };
    } catch (error) {
      console.warn('Cloudinary upload error:', error);
      return null;
    }
  }, [workspaceId]);

  /**
   * Save generated media to the library
   * If URL is a data URL, upload to Cloudinary first
   */
  const saveMedia = useCallback(async (options: SaveMediaOptions): Promise<string | null> => {
    if (!workspaceId) {
      return null;
    }

    try {
      let finalUrl = options.url;
      let additionalMetadata = {};

      // If URL is a data URL, upload to Cloudinary first
      if (options.url.startsWith('data:')) {
        const cloudinaryResult = await uploadToCloudinary(
          options.url,
          options.type,
          options.tags
        );

        if (cloudinaryResult) {
          finalUrl = cloudinaryResult.url;
          additionalMetadata = cloudinaryResult.metadata;
        }
        // If Cloudinary upload fails, fall back to original URL
      }

      console.log('Sending to backend:', { workspaceId, userId: user?.id });

      const response = await fetch('/api/media-studio/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          mediaItem: {
            type: options.type,
            source: options.source,
            url: finalUrl,
            thumbnailUrl: options.thumbnailUrl,
            prompt: options.prompt,
            revisedPrompt: options.revisedPrompt,
            model: options.model,
            config: { ...options.config, ...additionalMetadata },
            metadata: { ...options.metadata, ...additionalMetadata },
            tags: options.tags,
            user_id: user?.id,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save media');
      }

      const result = await response.json();
      return result.data?.id || null;
    } catch (error) {
      return null;
    }
  }, [workspaceId, uploadToCloudinary]);

  /**
   * Create a history entry when generation starts
   */
  const createHistoryEntry = useCallback(async (options: SaveHistoryOptions): Promise<string | null> => {
    if (!workspaceId) {
      return null;
    }

    try {
      const response = await fetch('/api/media-studio/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          historyEntry: {
            type: options.type,
            action: options.action,
            prompt: options.prompt,
            model: options.model,
            config: options.config,
            inputMediaUrls: options.inputMediaUrls,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create history');
      }

      const result = await response.json();
      return result.data?.id || null;
    } catch (error) {
      return null;
    }
  }, [workspaceId]);

  /**
   * Update history entry on completion or failure
   */
  const updateHistoryEntry = useCallback(async (options: UpdateHistoryOptions): Promise<boolean> => {
    if (!workspaceId) {
      return false;
    }

    try {
      const response = await fetch('/api/media-studio/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          historyId: options.historyId,
          updates: {
            status: options.status,
            outputMediaUrl: options.outputMediaUrl,
            outputMediaId: options.outputMediaId,
            generationTimeMs: options.generationTimeMs,
            revisedPrompt: options.revisedPrompt,
            errorMessage: options.errorMessage,
          },
        }),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }, [workspaceId]);

  /**
   * Save media and update history in one call
   * Use this for the complete flow after successful generation
   */
  const saveGeneratedMedia = useCallback(async (
    mediaOptions: SaveMediaOptions,
    historyId?: string | null,
    generationTimeMs?: number
  ): Promise<{ mediaId: string | null; success: boolean }> => {
    const startTime = Date.now();

    // Save media to library
    const mediaId = await saveMedia(mediaOptions);

    // Update history if we have a history entry
    if (historyId && mediaId) {
      await updateHistoryEntry({
        historyId,
        status: 'completed',
        outputMediaUrl: mediaOptions.url,
        outputMediaId: mediaId,
        generationTimeMs: generationTimeMs || (Date.now() - startTime),
        revisedPrompt: mediaOptions.revisedPrompt,
      });
    }

    return { mediaId, success: !!mediaId };
  }, [saveMedia, updateHistoryEntry]);

  /**
   * Mark a generation as failed
   */
  const markGenerationFailed = useCallback(async (
    historyId: string | null,
    errorMessage: string
  ): Promise<void> => {
    if (historyId) {
      await updateHistoryEntry({
        historyId,
        status: 'failed',
        errorMessage,
      });
    }
  }, [updateHistoryEntry]);

  return {
    workspaceId,
    saveMedia,
    createHistoryEntry,
    updateHistoryEntry,
    saveGeneratedMedia,
    markGenerationFailed,
    isEnabled: !!workspaceId,
  };
}

export default useMediaLibrary;
