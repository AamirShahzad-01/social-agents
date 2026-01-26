/**
 * LinkedIn API
 * 
 * API client for LinkedIn posting operations including text posts,
 * images, videos, and carousels.
 */

import { get, post } from '../../client';
import { ENDPOINTS } from '../../config';
import type {
    LinkedInPostRequest,
    LinkedInCarouselRequest,
    LinkedInUploadMediaRequest,
    LinkedInPostResponse,
    LinkedInCarouselResponse,
    LinkedInUploadResponse,
    VerifyCredentialsResponse,
    PlatformApiInfo,
} from '../../types';

/**
 * Create a LinkedIn post
 * 
 * Posts content to LinkedIn. Supports text, images, and videos.
 * 
 * @param request - Post request with content and media
 * @returns Promise resolving to post response with ID and URL
 */
export async function createPost(
    request: LinkedInPostRequest
): Promise<LinkedInPostResponse> {
    return post<LinkedInPostResponse>(
        ENDPOINTS.social.linkedin.post,
        request
    );
}

/**
 * Create a LinkedIn carousel post
 * 
 * Posts a multi-image carousel (document post) to LinkedIn.
 * Requires at least 2 images.
 * 
 * @param request - Carousel request with text and image URLs
 * @returns Promise resolving to carousel post response
 */
export async function createCarousel(
    request: LinkedInCarouselRequest
): Promise<LinkedInCarouselResponse> {
    return post<LinkedInCarouselResponse>(
        ENDPOINTS.social.linkedin.carousel,
        request
    );
}

/**
 * Upload media for LinkedIn
 * 
 * Uploads media to LinkedIn using their upload API.
 * 
 * @param request - Upload request with base64 media data and type
 * @returns Promise resolving to upload response with asset URN
 */
export async function uploadMedia(
    request: LinkedInUploadMediaRequest
): Promise<LinkedInUploadResponse> {
    return post<LinkedInUploadResponse>(
        ENDPOINTS.social.linkedin.uploadMedia,
        request
    );
}

/**
 * Verify LinkedIn connection
 * 
 * Checks if LinkedIn is connected and returns profile info.
 * 
 * @returns Promise resolving to verification response
 */
export async function verifyCredentials(): Promise<VerifyCredentialsResponse> {
    return get<VerifyCredentialsResponse>(ENDPOINTS.social.linkedin.verify);
}

/**
 * Get LinkedIn API info
 * 
 * Retrieves information about the LinkedIn API service.
 * 
 * @returns Promise resolving to API info
 */
export async function getInfo(): Promise<PlatformApiInfo> {
    return get<PlatformApiInfo>(ENDPOINTS.social.linkedin.base);
}

/**
 * Post text to LinkedIn
 * 
 * Convenience function for posting text content without media.
 * 
 * @param text - Text content to post
 * @param visibility - Post visibility ('PUBLIC' or 'CONNECTIONS')
 * @returns Promise resolving to post response
 */
export async function postText(
    text: string,
    visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'
): Promise<LinkedInPostResponse> {
    return createPost({ text, visibility });
}

/**
 * Post image to LinkedIn
 * 
 * Convenience function for posting a single image.
 * 
 * @param text - Text content to accompany the image
 * @param imageUrl - URL of the image to post
 * @param visibility - Post visibility
 * @returns Promise resolving to post response
 */
export async function postImage(
    text: string,
    imageUrl: string,
    visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'
): Promise<LinkedInPostResponse> {
    return createPost({
        text,
        mediaUrl: imageUrl,
        mediaType: 'image',
        visibility,
    });
}

/**
 * Post video to LinkedIn
 * 
 * Convenience function for posting a video.
 * 
 * @param text - Text content to accompany the video
 * @param videoUrl - URL of the video to post
 * @param visibility - Post visibility
 * @returns Promise resolving to post response
 */
export async function postVideo(
    text: string,
    videoUrl: string,
    visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'
): Promise<LinkedInPostResponse> {
    return createPost({
        text,
        mediaUrl: videoUrl,
        mediaType: 'video',
        visibility,
    });
}

/**
 * Upload and post image
 * 
 * Convenience function that handles upload and posting in one call.
 * 
 * @param text - Text content to accompany the image
 * @param base64Data - Base64 encoded image data
 * @param visibility - Post visibility
 * @returns Promise resolving to post response
 */
export async function uploadAndPostImage(
    text: string,
    base64Data: string,
    visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'
): Promise<LinkedInPostResponse> {
    const uploadResult = await uploadMedia({
        mediaData: base64Data,
        mediaType: 'image',
    });
    return createPost({
        text,
        mediaUrn: uploadResult.mediaUrn,
        mediaType: 'image',
        visibility,
    });
}
