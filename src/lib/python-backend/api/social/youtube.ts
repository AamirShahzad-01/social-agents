/**
 * YouTube API
 * 
 * API client for YouTube video uploading operations.
 */

import { get, post } from '../../client';
import { ENDPOINTS } from '../../config';
import type {
    YouTubePostRequest,
    YouTubePostResponse,
    VerifyCredentialsResponse,
    PlatformApiInfo,
    YouTubeTokenRefreshResponse,
} from '../../types';

/**
 * Upload video to YouTube
 * 
 * Uploads a video to YouTube with metadata.
 * 
 * @param request - Upload request with video URL and metadata
 * @returns Promise resolving to upload response with video ID and URL
 */
export async function createPost(
    request: YouTubePostRequest
): Promise<YouTubePostResponse> {
    return post<YouTubePostResponse>(
        ENDPOINTS.social.youtube.post,
        request
    );
}

/**
 * Verify YouTube connection
 * 
 * Checks if YouTube is connected and returns channel info.
 * 
 * @returns Promise resolving to verification response
 */
export async function verifyCredentials(): Promise<VerifyCredentialsResponse> {
    return get<VerifyCredentialsResponse>(ENDPOINTS.social.youtube.verify);
}

/**
 * Get YouTube API info
 * 
 * Retrieves information about the YouTube API service.
 * 
 * @returns Promise resolving to API info
 */
export async function getInfo(): Promise<PlatformApiInfo> {
    return get<PlatformApiInfo>(ENDPOINTS.social.youtube.base);
}

/**
 * Proactive token refresh - Call on app startup
 * 
 * Checks if the YouTube token expires within 2 hours and auto-refreshes if needed.
 * 
 * @returns Promise resolving to refresh result
 */
export async function refreshToken(): Promise<YouTubeTokenRefreshResponse> {
    return post<YouTubeTokenRefreshResponse>(ENDPOINTS.social.youtube.authRefresh);
}

/**
 * Auto-refresh YouTube token on app startup
 * 
 * @returns Promise resolving to boolean indicating if connected
 */
export async function autoRefreshOnStartup(): Promise<boolean> {
    try {
        const result = await refreshToken();

        if (!result.connected) {
            console.log('[YouTube] Not connected, skipping auto-refresh');
            return false;
        }

        if (result.refreshed) {
            console.log('[YouTube] Token auto-refreshed successfully, expires at:', result.expiresAt);
        } else {
            console.log('[YouTube] Token still valid, expires in', result.hoursUntilExpiry, 'hours');
        }

        return true;
    } catch (error) {
        console.warn('[YouTube] Auto-refresh failed:', error);
        return false;
    }
}

/**
 * Upload public video
 * 
 * Convenience function for uploading a public video.
 * 
 * @param title - Video title
 * @param description - Video description
 * @param videoUrl - URL of the video to upload
 * @param tags - Optional array of tags
 * @param categoryId - Optional category ID
 * @returns Promise resolving to upload response
 */
export async function uploadPublicVideo(
    title: string,
    description: string,
    videoUrl: string,
    tags?: string[],
    categoryId?: string
): Promise<YouTubePostResponse> {
    return createPost({
        title,
        description,
        videoUrl,
        privacyStatus: 'public',
        tags,
        categoryId,
    });
}

/**
 * Upload unlisted video
 * 
 * Convenience function for uploading an unlisted video.
 * 
 * @param title - Video title
 * @param description - Video description
 * @param videoUrl - URL of the video to upload
 * @param tags - Optional array of tags
 * @returns Promise resolving to upload response
 */
export async function uploadUnlistedVideo(
    title: string,
    description: string,
    videoUrl: string,
    tags?: string[]
): Promise<YouTubePostResponse> {
    return createPost({
        title,
        description,
        videoUrl,
        privacyStatus: 'unlisted',
        tags,
    });
}

/**
 * Upload private video
 * 
 * Convenience function for uploading a private video.
 * 
 * @param title - Video title
 * @param description - Video description
 * @param videoUrl - URL of the video to upload
 * @param tags - Optional array of tags
 * @returns Promise resolving to upload response
 */
export async function uploadPrivateVideo(
    title: string,
    description: string,
    videoUrl: string,
    tags?: string[]
): Promise<YouTubePostResponse> {
    return createPost({
        title,
        description,
        videoUrl,
        privacyStatus: 'private',
        tags,
    });
}

/**
 * Upload video with thumbnail
 * 
 * Uploads a video with a custom thumbnail.
 * 
 * @param title - Video title
 * @param description - Video description
 * @param videoUrl - URL of the video to upload
 * @param thumbnailUrl - URL of the thumbnail image
 * @param privacyStatus - Video privacy status
 * @param tags - Optional array of tags
 * @returns Promise resolving to upload response
 */
export async function uploadVideoWithThumbnail(
    title: string,
    description: string,
    videoUrl: string,
    thumbnailUrl: string,
    privacyStatus: 'public' | 'unlisted' | 'private' = 'public',
    tags?: string[]
): Promise<YouTubePostResponse> {
    return createPost({
        title,
        description,
        videoUrl,
        thumbnailUrl,
        privacyStatus,
        tags,
    });
}

/**
 * Upload YouTube Short
 * 
 * Convenience function for uploading a YouTube Short.
 * Shorts are vertical videos under 60 seconds.
 * 
 * @param title - Short title (will include #Shorts hashtag)
 * @param videoUrl - URL of the vertical video (under 60 seconds)
 * @param description - Optional description
 * @returns Promise resolving to upload response
 */
export async function uploadShort(
    title: string,
    videoUrl: string,
    description?: string
): Promise<YouTubePostResponse> {
    const shortsTitle = title.includes('#Shorts') ? title : `${title} #Shorts`;
    const shortsDescription = description || title;

    return createPost({
        title: shortsTitle,
        description: shortsDescription,
        videoUrl,
        privacyStatus: 'public',
        tags: ['Shorts', 'YouTubeShorts'],
    });
}

/**
 * Get YouTube category IDs
 * 
 * Returns commonly used YouTube category IDs.
 * 
 * @returns Object mapping category names to IDs
 */
export function getCategoryIds(): Record<string, string> {
    return {
        'Film & Animation': '1',
        'Autos & Vehicles': '2',
        'Music': '10',
        'Pets & Animals': '15',
        'Sports': '17',
        'Short Movies': '18',
        'Travel & Events': '19',
        'Gaming': '20',
        'Videoblogging': '21',
        'People & Blogs': '22',
        'Comedy': '23',
        'Entertainment': '24',
        'News & Politics': '25',
        'Howto & Style': '26',
        'Education': '27',
        'Science & Technology': '28',
        'Nonprofits & Activism': '29',
        'Movies': '30',
        'Anime/Animation': '31',
        'Action/Adventure': '32',
        'Classics': '33',
        'Documentary': '35',
        'Drama': '36',
        'Family': '37',
        'Foreign': '38',
        'Horror': '39',
        'Sci-Fi/Fantasy': '40',
        'Thriller': '41',
    };
}
