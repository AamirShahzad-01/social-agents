import { Platform, Post, PostContent, TwitterCredentials, LinkedInCredentials, FacebookCredentials, InstagramCredentials, TikTokCredentials, YouTubeCredentials } from '@/types';
import { postTweet, uploadTwitterMedia } from './platforms/twitterService';
import { postToLinkedIn, postCarouselToLinkedIn, uploadLinkedInMedia } from './platforms/linkedinService';
import { postToFacebook, postCarouselToFacebook, uploadFacebookPhoto } from './platforms/facebookService';
import { postToInstagram, postCarouselToInstagram, uploadInstagramMedia } from './platforms/instagramService';
import { postToTikTok, uploadTikTokVideo } from './platforms/tiktokService';
import { uploadToYouTube } from './platforms/youtubeService';

export interface PublishResult {
  platform: Platform;
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

/**
 * Convert media type to platform-compatible type
 * 'reel' is Instagram-specific, other platforms use 'video'
 */
function getCompatibleMediaType(mediaType: 'image' | 'video' | 'reel' | undefined): 'image' | 'video' {
  if (mediaType === 'reel' || mediaType === 'video') {
    return 'video';
  }
  return 'image';
}

/**
 * Publish a post to a single platform
 */
export async function publishToSinglePlatform(
  platform: Platform,
  content: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'reel',
  carouselUrls?: string[], // Array of URLs for carousel posts
  postType?: string, // Post type: 'post', 'reel', 'story', 'carousel', 'short', etc.
  options?: { postToPage?: boolean } // Platform-specific options (e.g., LinkedIn company page)
): Promise<PublishResult> {
  // Auto-detect media type if not provided
  if (!mediaType && mediaUrl) {
    mediaType = (mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('video'))
      ? 'video'
      : 'image';
  }
  
  // Get platform-compatible media type (converts 'reel' to 'video' for non-Instagram platforms)
  const compatibleMediaType = getCompatibleMediaType(mediaType);
  
  try {
    // Create empty credentials object - backend API will validate actual credentials from database
    const emptyCredentials = {} as any;

    let result;

    switch (platform) {
      case 'twitter': {
        // Handle media upload - X/Twitter supports:
        // - Up to 4 images per tweet (carousel-style)
        // - OR 1 video/GIF per tweet
        // - Cannot mix images and video in the same tweet
        let mediaIds: string[] | undefined;
        
        // Check if this is a carousel post with multiple images
        if (carouselUrls && carouselUrls.length >= 2) {
          
          // Twitter supports max 4 images per tweet
          const imagesToUpload = carouselUrls.slice(0, 4);
          const uploadedIds: string[] = [];
          
          for (const imageUrl of imagesToUpload) {
            const mediaResult = await uploadTwitterMedia(
              emptyCredentials as TwitterCredentials,
              imageUrl,
              'image' // Carousel images are always images
            );
            if (mediaResult.success && mediaResult.mediaId) {
              uploadedIds.push(mediaResult.mediaId);
            } else {
            }
          }
          
          if (uploadedIds.length > 0) {
            mediaIds = uploadedIds;
          }
        } else if (mediaUrl) {
          // Single media upload
          const mediaResult = await uploadTwitterMedia(
            emptyCredentials as TwitterCredentials,
            mediaUrl,
            compatibleMediaType
          );
          if (mediaResult.success && mediaResult.mediaId) {
            mediaIds = [mediaResult.mediaId];
          }
        }

        result = await postTweet(emptyCredentials as TwitterCredentials, {
          text: content,
          mediaIds
        });
        break;
      }

      case 'linkedin': {
        // Check if this is a carousel post (2+ images)
        if (carouselUrls && carouselUrls.length >= 2) {
          result = await postCarouselToLinkedIn(emptyCredentials as LinkedInCredentials, {
            text: content,
            imageUrls: carouselUrls,
            visibility: 'PUBLIC',
            postToPage: options?.postToPage, // Pass LinkedIn target preference
          });
          break;
        }

        // Handle single media upload if present
        let mediaUrn: string | undefined;
        if (mediaUrl) {
          const mediaResult = await uploadLinkedInMedia(
            emptyCredentials as LinkedInCredentials,
            mediaUrl,
            compatibleMediaType
          );
          if (mediaResult.success && mediaResult.mediaUrn) {
            mediaUrn = mediaResult.mediaUrn;
          }
        }

        result = await postToLinkedIn(emptyCredentials as LinkedInCredentials, {
          text: content,
          visibility: 'PUBLIC',
          mediaUrn,
          postToPage: options?.postToPage, // Pass LinkedIn target preference
        });
        break;
      }

      case 'facebook': {
        // Check if this is a carousel post (2+ images)
        if (carouselUrls && carouselUrls.length >= 2) {
          result = await postCarouselToFacebook(emptyCredentials as FacebookCredentials, {
            message: content,
            imageUrls: carouselUrls
          });
          break;
        }

        // Handle single media upload if present
        let imageUrl: string | undefined;
        if (mediaUrl) {
          const mediaResult = await uploadFacebookPhoto(emptyCredentials as FacebookCredentials, mediaUrl);
          if (mediaResult.success && mediaResult.imageUrl) {
            imageUrl = mediaResult.imageUrl;
          }
        }

        result = await postToFacebook(emptyCredentials as FacebookCredentials, {
          message: content,
          imageUrl: imageUrl,
          mediaType: compatibleMediaType,
          postType: postType // Pass post type for Reels/Stories
        });
        break;
      }

      case 'tiktok': {
        if (!mediaUrl) {
          return {
            platform,
            success: false,
            error: 'TikTok requires a video to post'
          };
        }

        // Upload video to get public URL (TikTok requires public URLs)
        const mediaResult = await uploadTikTokVideo(emptyCredentials as TikTokCredentials, mediaUrl);
        if (!mediaResult.success || !mediaResult.videoUrl) {
          return {
            platform,
            success: false,
            error: mediaResult.error || 'Failed to upload video'
          };
        }

        result = await postToTikTok(emptyCredentials as TikTokCredentials, {
          caption: content,
          videoUrl: mediaResult.videoUrl,
          videoSize: mediaResult.videoSize || 0
        });
        break;
      }

      case 'instagram': {
        // Check if this is a carousel post
        if (carouselUrls && carouselUrls.length >= 2) {
          // Carousel URLs should already be public Supabase URLs
          // Just pass them directly to the API
          result = await postCarouselToInstagram(emptyCredentials as InstagramCredentials, {
            caption: content,
            mediaUrls: carouselUrls
          });
          break;
        }

        
        // Single media post
        if (!mediaUrl) {
          return {
            platform,
            success: false,
            error: 'Instagram requires an image or video to post'
          };
        }

        // Media URL should already be a public Supabase URL
        // Just pass it directly to the API
        result = await postToInstagram(emptyCredentials as InstagramCredentials, {
          caption: content,
          imageUrl: mediaUrl,
          mediaType: mediaType,
          postType: postType // Pass postType for Stories/Reels
        });
        break;
      }

      case 'youtube': {
        if (!mediaUrl) {
          return {
            platform,
            success: false,
            error: 'YouTube requires a video to upload'
          };
        }

        if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('data:')) {
          return {
            platform,
            success: false,
            error: 'YouTube requires a publicly accessible video URL. Please upload the video first.'
          };
        }

        // Detect if this is a YouTube Short based on post type
        const isShort = postType === 'short';

        // Pass video URL directly to backend - backend will fetch and upload to YouTube
        // This avoids 413 payload too large errors from sending base64 in request body
        result = await uploadToYouTube(emptyCredentials as YouTubeCredentials, {
          title: content.substring(0, 100), // YouTube title max 100 chars
          description: content,
          videoUrl: mediaUrl, // Pass URL instead of base64 buffer
          privacyStatus: 'public', // Default to public for direct publishing
          isShort: isShort // Pass isShort flag to add #Shorts hashtag
        });
        break;
      }

      default:
        return {
          platform,
          success: false,
          error: `Unsupported platform: ${platform}`
        };
    }

    return {
      platform,
      success: result.success,
      postId: (result as any).postId ?? (result as any).tweetId,
      url: result.url,
      error: result.error
    };
  } catch (error) {
    return {
      platform,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Publish a post to multiple platforms
 */
export async function publishPost(post: Post): Promise<PublishResult[]> {

  const results: PublishResult[] = [];

  for (const platform of post.platforms) {
    // Get platform-specific content, fallback to topic if not available
    const rawContent = post.content?.[platform] || post.topic;


    if (!rawContent) {
      results.push({
        platform,
        success: false,
        error: `No content specified for ${platform}`
      });
      continue;
    }

    // Convert content to string (handle structured content objects)
    // Content can be: string, or object with description/content/title fields
    let content = '';
    if (typeof rawContent === 'string') {
      content = rawContent;
    } else if (typeof rawContent === 'object' && rawContent !== null) {
      const contentObj = rawContent as any;
      // Try different content fields in order of preference
      // For Instagram carousels, description is typically used for captions
      content = contentObj.description || contentObj.content || contentObj.title || contentObj.caption || '';
      
    }

    // Fallback to topic if content is still empty
    if (!content && post.topic) {
      content = post.topic;
    }

    const generatedVideoUrl = post.generatedVideoUrl || (post.content as any)?.generatedVideoUrl;

    // Check if we have media (for platforms that allow empty captions with media)
    const hasMedia = post.generatedImage || generatedVideoUrl || 
                     (post.carouselImages && post.carouselImages.length > 0);

    // Instagram and Facebook allow empty captions if there's media
    const allowsEmptyCaption = ['instagram', 'facebook'].includes(platform) && hasMedia;

    if (!content && !allowsEmptyCaption) {
      results.push({
        platform,
        success: false,
        error: `Invalid content for ${platform}`
      });
      continue;
    }

    // Use empty string as caption if no content but media exists
    if (!content && allowsEmptyCaption) {
      content = '';
    }

    // Determine media URL (prefer generated image/video, fall back to carousel first image)
    let mediaUrl = post.generatedImage || generatedVideoUrl;
    if (platform === 'youtube') {
      mediaUrl = generatedVideoUrl;
    }
    if (!mediaUrl && post.carouselImages && post.carouselImages.length > 0) {
      mediaUrl = post.carouselImages[0]; // Use first carousel image as fallback
    }
    
    // Determine media type based on post type and content
    // postType can be: 'post', 'feed', 'carousel', 'reel', 'story', 'video', 'short', 'slideshow', 'thread', 'article'
    let mediaType: 'image' | 'video' | 'reel' = 'image';
    
    // Video-based post types
    const videoPostTypes = ['reel', 'video', 'short'];
    if (post.postType && videoPostTypes.includes(post.postType)) {
      mediaType = post.postType === 'reel' ? 'reel' : 'video';
    } else if (generatedVideoUrl) {
      mediaType = 'video';
    }
    
    // Get carousel URLs if this is a carousel/slideshow post
    const carouselPostTypes = ['carousel', 'slideshow'];
    const isCarouselPost = (post.postType && carouselPostTypes.includes(post.postType)) || 
                           (post.carouselImages && post.carouselImages.length >= 2);
    const carouselUrls = isCarouselPost ? post.carouselImages : undefined;

    // Get LinkedIn postToPage preference from post content or post-level setting
    let postToPage: boolean | undefined;
    if (platform === 'linkedin') {
      const linkedInContent = post.content?.linkedin as any;
      postToPage = linkedInContent?.postToPage ?? (post as any).linkedInPostToPage;
    }


    const result = await publishToSinglePlatform(platform, content, mediaUrl, mediaType, carouselUrls, post.postType, { postToPage });
    results.push(result);
  }

  return results;
}

/**
 * Check if a platform is ready to publish (connected and has valid credentials)
 * Note: This now returns true as validation is handled server-side
 * Backend APIs will return proper errors if platform is not connected
 */
export function isPlatformReady(platform: Platform): boolean {
  // Credential validation is now done server-side by backend APIs
  // which have access to database credentials
  return true;
}

/**
 * Get publishing readiness for all platforms
 */
export function getPublishingReadiness(): Record<Platform, boolean> {
  return {
    twitter: isPlatformReady('twitter'),
    linkedin: isPlatformReady('linkedin'),
    facebook: isPlatformReady('facebook'),
    instagram: isPlatformReady('instagram'),
    tiktok: isPlatformReady('tiktok'),
    youtube: isPlatformReady('youtube')
  };
}

/**
 * Validate post before publishing
 */
export function validatePostForPublishing(post: Post): { valid: boolean; errors: string[] } {
  const errors: string[] = [];


  // Check if at least one platform is selected
  if (!post.platforms || post.platforms.length === 0) {
    errors.push('No platforms selected');
  }

  // Platform connection validation is now done server-side by backend APIs
  // No need to check client-side since backend APIs have database access

  // Check if content exists for each platform
  // Content can be in post.content[platform] or we can use post.topic as fallback
  // Instagram and Facebook allow empty captions if there's media
  const hasMedia = post.generatedImage || post.generatedVideoUrl || 
                   (post.carouselImages && post.carouselImages.length > 0);
  
  
  post.platforms.forEach(platform => {
    const platformContent = post.content[platform];
    const allowsEmptyCaption = ['instagram', 'facebook'].includes(platform) && hasMedia;
    
    // Allow topic as fallback content if platform-specific content is missing
    // Also allow empty content for Instagram/Facebook if there's media
    if (!platformContent && !post.topic && !allowsEmptyCaption) {
      errors.push(`Missing content for ${platform}`);
    }
  });

  // Platform-specific validations
  post.platforms.forEach(platform => {
    const rawContent = post.content[platform];
    if (!rawContent) return;

    // Convert content to string (handle YouTube object type)
    const content = typeof rawContent === 'string'
      ? rawContent
      : typeof rawContent === 'object'
      ? (rawContent as any)?.description || ''
      : '';

    if (!content) return;

    switch (platform) {
      case 'twitter':
        if (content.length > 280) {
          errors.push('Twitter content exceeds 280 characters');
        }
        break;
      case 'linkedin':
        if (content.length > 3000) {
          errors.push('LinkedIn content exceeds 3000 characters');
        }
        break;
      case 'facebook':
        if (content.length > 63206) {
          errors.push('Facebook content exceeds 63206 characters');
        }
        break;
      case 'instagram':
        if (content.length > 2200) {
          errors.push('Instagram caption exceeds 2200 characters');
        }
        // Check for any media: single image, video, or carousel images
        const hasInstagramMedia = post.generatedImage || 
                                   post.generatedVideoUrl || 
                                   (post.carouselImages && post.carouselImages.length > 0);
        if (!hasInstagramMedia) {
          errors.push('Instagram requires an image, video, or carousel');
        }
        break;
      case 'tiktok':
        if (content.length > 2200) {
          errors.push('TikTok caption exceeds 2200 characters');
        }
        if (!post.generatedImage && !post.generatedVideoUrl) {
          errors.push('TikTok requires a video');
        }
        break;
      case 'youtube':
        if (content.length > 5000) {
          errors.push('YouTube description exceeds 5000 characters');
        }
        if (!post.generatedVideoUrl) {
          errors.push('YouTube requires a video');
        }
        break;
    }
  });


  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Publishing service namespace for compatibility
 */
export const publishingService = {
  publishToSinglePlatform,
  publishPost,
  isPlatformReady,
  getPublishingReadiness,
  validatePostForPublishing
};
