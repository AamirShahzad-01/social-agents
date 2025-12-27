/**
 * Cloudinary Media Storage API
 * 
 * TypeScript client for unified media storage operations.
 * Supports images, videos, and audio with progress tracking.
 */

import { post, get, del, uploadFile as uploadFormData } from '../client';
import { ENDPOINTS } from '../config';

// =============================================================================
// TYPES
// =============================================================================

export type MediaType = 'image' | 'video' | 'audio';
export type ResourceType = 'image' | 'video';

export interface CloudinaryUploadResult {
    success: boolean;
    public_id: string;
    url: string;
    secure_url: string;
    resource_type: string;
    format: string;
    bytes: number;
    width?: number;
    height?: number;
    duration?: number;
    error?: string;
}

export interface CloudinaryMediaInfo {
    public_id: string;
    resource_type: string;
    format: string;
    bytes: number;
    url: string;
    secure_url: string;
    width?: number;
    height?: number;
    duration?: number;
    created_at?: string;
}

export interface TransformOptions {
    width?: number;
    height?: number;
    platform?: string;
    quality?: string;
    format?: string;
}

export interface TransformResult {
    url: string;
    public_id: string;
    platform?: string;
}

export interface PlatformPreset {
    width: number;
    height: number;
    aspect_ratio?: string;
    max_duration?: number | null;
}

export interface PlatformPresets {
    video_presets: Record<string, PlatformPreset>;
    image_presets: Record<string, PlatformPreset>;
}

export interface UploadOptions {
    folder?: string;
    tags?: string[];
    onProgress?: (percent: number) => void;
}

// =============================================================================
// IMAGE UPLOAD
// =============================================================================

/**
 * Upload an image to Cloudinary
 * 
 * @param file - Image file to upload
 * @param options - Upload options
 * @returns Upload result with CDN URL
 * 
 * @example
 * ```typescript
 * const result = await uploadImage(file, { folder: 'avatars' });
 * console.log('Image URL:', result.secure_url);
 * ```
 */
export async function uploadImage(
    file: File,
    options: UploadOptions = {}
): Promise<CloudinaryUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', options.folder || 'images');
    if (options.tags?.length) {
        formData.append('tags', options.tags.join(','));
    }

    return uploadFormData<CloudinaryUploadResult>(
        ENDPOINTS.cloudinary.uploadImage,
        formData
    );
}

// =============================================================================
// VIDEO UPLOAD
// =============================================================================

/**
 * Upload a video to Cloudinary
 * 
 * For large files (>100MB), set chunked: true for reliable upload.
 * 
 * @param file - Video file to upload
 * @param options - Upload options
 * @returns Upload result with CDN URL
 * 
 * @example
 * ```typescript
 * const result = await uploadVideo(file, { 
 *   folder: 'videos',
 *   onProgress: (p) => console.log(`${p}% uploaded`)
 * });
 * ```
 */
export async function uploadVideo(
    file: File,
    options: UploadOptions & { chunked?: boolean } = {}
): Promise<CloudinaryUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', options.folder || 'videos');
    formData.append('chunked', String(options.chunked || file.size > 100_000_000));
    if (options.tags?.length) {
        formData.append('tags', options.tags.join(','));
    }

    return uploadFormData<CloudinaryUploadResult>(
        ENDPOINTS.cloudinary.uploadVideo,
        formData
    );
}

// =============================================================================
// AUDIO UPLOAD
// =============================================================================

/**
 * Upload audio to Cloudinary
 * 
 * @param file - Audio file to upload
 * @param options - Upload options
 * @returns Upload result with CDN URL
 */
export async function uploadAudio(
    file: File,
    options: UploadOptions = {}
): Promise<CloudinaryUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', options.folder || 'audio');
    if (options.tags?.length) {
        formData.append('tags', options.tags.join(','));
    }

    return uploadFormData<CloudinaryUploadResult>(
        ENDPOINTS.cloudinary.uploadAudio,
        formData
    );
}

// =============================================================================
// URL UPLOAD
// =============================================================================

/**
 * Upload media from an external URL
 * 
 * Cloudinary fetches the media directly, faster for large files.
 * 
 * @param sourceUrl - URL of media to upload
 * @param mediaType - Type of media
 * @param options - Upload options
 */
export async function uploadFromUrl(
    sourceUrl: string,
    mediaType: MediaType,
    options: { folder?: string; tags?: string[] } = {}
): Promise<CloudinaryUploadResult> {
    return post<CloudinaryUploadResult>(
        ENDPOINTS.cloudinary.uploadUrl,
        {
            source_url: sourceUrl,
            media_type: mediaType,
            folder: options.folder || 'uploads',
            tags: options.tags,
        }
    );
}

// =============================================================================
// TRANSFORMATION
// =============================================================================

/**
 * Get a transformed/optimized URL for media
 * 
 * @param publicId - Cloudinary public ID
 * @param mediaType - Type of media
 * @param options - Transform options
 * 
 * @example
 * ```typescript
 * // Get optimized for TikTok
 * const result = await getTransformedUrl(publicId, 'video', { platform: 'tiktok' });
 * ```
 */
export async function getTransformedUrl(
    publicId: string,
    mediaType: MediaType,
    options: TransformOptions = {}
): Promise<TransformResult> {
    return post<TransformResult>(
        ENDPOINTS.cloudinary.transform,
        {
            public_id: publicId,
            media_type: mediaType,
            ...options,
        }
    );
}

/**
 * Get platform-optimized URL directly
 * 
 * @param publicId - Cloudinary public ID
 * @param platform - Platform name (tiktok, instagram, youtube, etc.)
 * @param mediaType - Type of media
 */
export async function getPlatformUrl(
    publicId: string,
    platform: string,
    mediaType: MediaType
): Promise<string> {
    const result = await getTransformedUrl(publicId, mediaType, { platform });
    return result.url;
}

// =============================================================================
// MEDIA MANAGEMENT
// =============================================================================

/**
 * Get media information and metadata
 * 
 * @param publicId - Cloudinary public ID
 * @param resourceType - Resource type (image or video)
 */
export async function getMediaInfo(
    publicId: string,
    resourceType: ResourceType = 'image'
): Promise<CloudinaryMediaInfo> {
    return get<CloudinaryMediaInfo>(
        ENDPOINTS.cloudinary.media(publicId),
        { params: { resource_type: resourceType } }
    );
}

/**
 * Delete media from Cloudinary
 * 
 * @param publicId - Cloudinary public ID
 * @param resourceType - Resource type
 */
export async function deleteMedia(
    publicId: string,
    resourceType: ResourceType = 'image'
): Promise<{ success: boolean; message: string }> {
    return del<{ success: boolean; message: string }>(
        ENDPOINTS.cloudinary.media(publicId),
        { params: { resource_type: resourceType } }
    );
}

// =============================================================================
// PRESETS
// =============================================================================

/**
 * Get all platform presets for images and videos
 */
export async function getPresets(): Promise<PlatformPresets> {
    return get<PlatformPresets>(ENDPOINTS.cloudinary.presets);
}

/**
 * Get presets for a specific media type
 */
export async function getPresetsByType(
    mediaType: 'image' | 'video'
): Promise<Record<string, PlatformPreset>> {
    return get<Record<string, PlatformPreset>>(
        ENDPOINTS.cloudinary.presetsByType(mediaType)
    );
}

// =============================================================================
// SERVICE INFO
// =============================================================================

/**
 * Get Cloudinary service status and info
 */
export async function getCloudinaryInfo(): Promise<{
    service: string;
    version: string;
    configured: boolean;
    status: string;
    features: Record<string, boolean>;
}> {
    return get(ENDPOINTS.cloudinary.base);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a URL is a Cloudinary URL
 */
export function isCloudinaryUrl(url: string): boolean {
    return url.includes('cloudinary.com') || url.includes('res.cloudinary.com');
}

/**
 * Extract public ID from Cloudinary URL
 */
export function extractPublicId(url: string): string | null {
    if (!isCloudinaryUrl(url)) return null;

    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');

        // Find upload or video/image segment
        const uploadIndex = pathParts.findIndex(p => p === 'upload' || p === 'video' || p === 'image');
        if (uploadIndex === -1) return null;

        // Skip version segment (v1234567890)
        let startIndex = uploadIndex + 1;
        if (pathParts[startIndex]?.match(/^v\d+$/)) {
            startIndex++;
        }

        // Join remaining parts and remove extension
        const publicId = pathParts.slice(startIndex).join('/').replace(/\.[^/.]+$/, '');
        return publicId || null;
    } catch {
        return null;
    }
}

/**
 * Generate optimized image URL with transformations
 * 
 * @param publicId - Cloudinary public ID
 * @param width - Target width
 * @param height - Target height
 * @param cloudName - Your Cloudinary cloud name
 */
export function buildImageUrl(
    publicId: string,
    options: {
        width?: number;
        height?: number;
        crop?: string;
        quality?: string;
        format?: string;
        cloudName?: string;
    } = {}
): string {
    const cloudName = options.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
        console.warn('Cloudinary cloud name not configured');
        return '';
    }

    const transformations: string[] = [];

    if (options.width) transformations.push(`w_${options.width}`);
    if (options.height) transformations.push(`h_${options.height}`);
    if (options.crop) transformations.push(`c_${options.crop}`);
    if (options.quality) transformations.push(`q_${options.quality}`);
    if (options.format) transformations.push(`f_${options.format}`);

    const transformStr = transformations.length > 0
        ? `${transformations.join(',')}/`
        : '';

    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformStr}${publicId}`;
}

/**
 * Generate optimized video URL
 */
export function buildVideoUrl(
    publicId: string,
    options: {
        width?: number;
        height?: number;
        quality?: string;
        format?: string;
        cloudName?: string;
    } = {}
): string {
    const cloudName = options.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
        console.warn('Cloudinary cloud name not configured');
        return '';
    }

    const transformations: string[] = [];

    if (options.width) transformations.push(`w_${options.width}`);
    if (options.height) transformations.push(`h_${options.height}`);
    if (options.quality) transformations.push(`q_${options.quality}`);
    if (options.format) transformations.push(`f_${options.format}`);

    const transformStr = transformations.length > 0
        ? `${transformations.join(',')}/`
        : '';

    return `https://res.cloudinary.com/${cloudName}/video/upload/${transformStr}${publicId}`;
}

// =============================================================================
// NAMESPACE EXPORT
// =============================================================================

export const cloudinaryApi = {
    // Upload
    uploadImage,
    uploadVideo,
    uploadAudio,
    uploadFromUrl,
    // Transform
    getTransformedUrl,
    getPlatformUrl,
    // Management
    getMediaInfo,
    deleteMedia,
    // Presets
    getPresets,
    getPresetsByType,
    // Info
    getCloudinaryInfo,
    // Helpers
    isCloudinaryUrl,
    extractPublicId,
    buildImageUrl,
    buildVideoUrl,
};

export default cloudinaryApi;
