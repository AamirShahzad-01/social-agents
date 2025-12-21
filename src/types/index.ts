export type Platform = 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export type PostStatus = 'ready_to_publish' | 'scheduled' | 'published' | 'failed';

// NEW: Post Type for multi-template support
export type PostType =
  | 'post'       // Generic/default
  | 'feed'       // Instagram feed post (1:1 image)
  | 'carousel'   // Multi-image carousel
  | 'reel'       // Short video (Instagram/Facebook)
  | 'story'      // 24-hour story (Instagram/Facebook)
  | 'video'      // Standard video (TikTok/YouTube/etc)
  | 'short'      // YouTube Shorts (9:16)
  | 'slideshow'  // TikTok photo slideshow

export const TONES = ['professional', 'casual', 'humorous', 'inspirational', 'urgent', 'friendly'] as const;
export type Tone = typeof TONES[number];

export const CONTENT_TYPES = ['engaging', 'educational', 'promotional', 'storytelling'] as const;
export type ContentType = typeof CONTENT_TYPES[number];

// Platform content can be either string (legacy) or structured object (new)
export interface PlatformContentObject {
  type?: 'video' | 'text' | 'image';
  format?: 'post' | 'carousel' | 'reel' | 'short' | 'story' | 'thread' | 'article';
  title?: string;
  description?: string;
  content?: string; // Full text content (for text posts like Twitter)
  hashtags?: string[];
  tags?: string[];
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

export interface PostContent {
  twitter?: string | PlatformContentObject;
  linkedin?: string | PlatformContentObject;
  facebook?: string | PlatformContentObject;
  instagram?: string | PlatformContentObject;
  tiktok?: string | PlatformContentObject;
  youtube?: string | PlatformContentObject;
  imageSuggestion?: string;
  videoSuggestion?: string;
}

// Post Analytics
export interface PostAnalytics {
  reach: number;
  impressions: number;
  engagement: number;
  clicks: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}

// Enhanced Post interface with new features
export interface Post {
  id: string;
  topic: string;
  platforms: Platform[];
  content: PostContent;
  status: PostStatus;
  postType?: PostType; // NEW: Template type (feed, carousel, reel, story, video, short, slideshow)
  createdAt: string; // ISO string
  scheduledAt?: string; // ISO string
  publishedAt?: string; // ISO string
  generatedImage?: string; // base64 data URL
  carouselImages?: string[]; // Array of base64 data URLs for carousel slides
  generatedVideoUrl?: string; // URL to blob/mp4
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  videoGenerationStatus: string;
  videoOperation?: any;
  // Image generation metadata
  imageMetadata?: {
    size?: string;
    quality?: string;
    format?: string;
    background?: string;
    model?: string;
  };
  generatedImageTimestamp?: number;
  imageGenerationProgress?: number;
  // Additional fields
  queueId?: string;
  comments?: Comment[];
  engagementScore?: number;
  engagementSuggestions?: string[];
  recurrence?: RecurrencePattern;
  theme?: string;
  // Analytics
  analytics?: PostAnalytics;
}

// Media Library types
export interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string; // blob URL or base64
  thumbnailUrl?: string;
  size: number; // bytes
  width?: number;
  height?: number;
  tags: string[];
  createdAt: string;
  source: 'ai-generated' | 'uploaded';
  usedInPosts: string[]; // Array of post IDs
}

// Queue types
export interface ContentQueue {
  id: string;
  name: string;
  description?: string;
  schedule: QueueSchedule;
  postIds: string[]; // Ordered list of posts
  isActive: boolean;
  createdAt: string;
}

export interface QueueSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  timeOfDay: string; // HH:mm format
  daysOfWeek?: number[]; // 0-6, Sunday = 0
  dayOfMonth?: number; // 1-31
  customCron?: string; // For advanced users
}

// Recurring post types
export interface RecurrencePattern {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number; // e.g., every 2 weeks = interval: 2
  endDate?: string;
  occurrences?: number; // Stop after N occurrences
}

// Comment types
export interface Comment {
  id: string;
  postId: string;
  author: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  resolved: boolean;
  mentions?: string[]; // @username
}

// Notification types
export type NotificationType =
  | 'video_complete'
  | 'image_complete'
  | 'post_scheduled'
  | 'post_published'
  | 'post_failed'
  | 'comment_added'
  | 'insight_available'
  | 'queue_published'
  | 'success'
  | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  postId?: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

// Analytics Insight types
export interface AIInsight {
  id: string;
  type: 'engagement' | 'timing' | 'content' | 'platform';
  title: string;
  description: string;
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
  dataPoints?: Record<string, any>;
  createdAt: string;
}

// Social Media Platform Credentials
export type PlatformCredentials = Partial<
  Record<
    Platform,
    TwitterCredentials | LinkedInCredentials | FacebookCredentials | InstagramCredentials | TikTokCredentials | YouTubeCredentials
  >
>

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  isConnected: boolean;
  username?: string;
  connectedAt?: string;
}

export interface LinkedInCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  isConnected: boolean;
  profileId?: string;
  profileName?: string;
  connectedAt?: string;
  // Organization/Company Page support
  organizationId?: string;      // urn:li:organization:{id}
  organizationName?: string;    // Company page name
  postToPage?: boolean;         // If true, post to company page instead of personal profile
}

export interface FacebookCredentials {
  appId: string;
  appSecret: string;
  accessToken: string;
  pageId?: string;
  pageName?: string;
  expiresAt?: string;
  isConnected: boolean;
  connectedAt?: string;
}

export interface InstagramCredentials {
  accessToken: string;
  userId?: string;
  username?: string;
  expiresAt?: string;
  isConnected: boolean;
  connectedAt?: string;
}

export interface TikTokCredentials {
  accessToken: string;
  refreshToken?: string;
  openId?: string;
  expiresAt?: string;
  isConnected: boolean;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  connectedAt?: string;
}

export interface YouTubeCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  isConnected: boolean;
  channelId?: string;
  channelTitle?: string;
  channelThumbnail?: string;
  connectedAt?: string;
}

export interface AccountConnection {
  platform: Platform;
  isConnected: boolean;
  username?: string;
  lastVerified?: string;
  error?: string;
}

