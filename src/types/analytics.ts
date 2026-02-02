/**
 * Analytics Types
 * TypeScript interfaces matching backend Pydantic models.
 * Enterprise-grade types for organic content analytics.
 */

// =============================================================================
// ENUMS
// =============================================================================

export type AnalyticsPeriod = 'day' | 'week' | 'days_28' | 'month' | 'lifetime';

export type DatePreset =
    | 'today'
    | 'yesterday'
    | 'last_7d'
    | 'last_14d'
    | 'last_30d'
    | 'last_90d'
    | 'this_month'
    | 'last_month';

export type Platform = 'facebook' | 'instagram' | 'youtube' | 'tiktok';

// =============================================================================
// BASE TYPES
// =============================================================================

export interface DateRange {
    start_date: string; // YYYY-MM-DD
    end_date: string;   // YYYY-MM-DD
}

export interface MetricTrend {
    current: number;
    previous?: number;
    change?: number;
    change_percent?: number;
    trend?: 'up' | 'down' | 'stable';
}

export interface TimeSeriesDataPoint {
    date: string;
    value: number;
    label?: string;
}

// =============================================================================
// FACEBOOK TYPES
// =============================================================================

export interface FacebookPageMetrics {
    page_id: string;
    page_name: string;
    page_fans: MetricTrend;
    page_fan_adds?: number;
    page_fan_removes?: number;
    page_views_total: MetricTrend;
    page_engaged_users: MetricTrend;
    page_post_engagements: MetricTrend;
    page_impressions?: MetricTrend;
    page_reach?: MetricTrend;
    page_actions_post_reactions_total?: number;
    page_content_activity?: number;
}

export interface FacebookPostInsights {
    post_id: string;
    message?: string;
    created_time: string;
    post_type?: string;
    post_impressions: number;
    post_impressions_unique: number;
    post_engaged_users: number;
    post_clicks: number;
    reactions_like: number;
    reactions_love: number;
    reactions_haha: number;
    reactions_wow: number;
    reactions_sad: number;
    reactions_angry: number;
    comments: number;
    shares: number;
    video_views?: number;
    video_view_time?: number;
}

export interface FacebookInsights {
    page_metrics: FacebookPageMetrics;
    time_series?: TimeSeriesDataPoint[];
    top_posts?: FacebookPostInsights[];
    period: AnalyticsPeriod;
    date_range: DateRange;
}

// =============================================================================
// INSTAGRAM TYPES
// =============================================================================

export interface InstagramAccountMetrics {
    ig_user_id: string;
    username: string;
    follower_count: MetricTrend;
    follows_count?: number;
    views: MetricTrend;
    reach: MetricTrend;
    total_likes?: number;
    total_comments?: number;
    total_saves?: number;
    total_shares?: number;
    /** @deprecated Jan 2025 - No longer returned by Instagram API */
    profile_views?: MetricTrend;
    /** @deprecated Jan 2025 - No longer returned by Instagram API */
    website_clicks?: number;
}

export interface InstagramMediaInsights {
    media_id: string;
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
    caption?: string;
    timestamp: string;
    permalink?: string;
    thumbnail_url?: string;
    views: number;
    reach: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    /** @deprecated Apr 2025 - Use 'views' instead */
    plays?: number;
    /** @deprecated Apr 2025 - Use 'views' for replay counts */
    replays?: number;
    engagement_rate?: number;
}

export interface InstagramAudienceDemographics {
    age_gender?: Record<string, number>;
    top_cities?: Record<string, number>;
    top_countries?: Record<string, number>;
    follower_locale?: Record<string, number>;
}

export interface InstagramInsights {
    account_metrics: InstagramAccountMetrics;
    time_series?: TimeSeriesDataPoint[];
    top_media?: InstagramMediaInsights[];
    audience?: InstagramAudienceDemographics;
    period: AnalyticsPeriod;
    date_range: DateRange;
}

// =============================================================================
// YOUTUBE TYPES
// =============================================================================

export interface YouTubeChannelMetrics {
    channel_id: string;
    channel_title: string;
    subscriber_count: MetricTrend;
    subscribers_gained?: number;
    subscribers_lost?: number;
    views: MetricTrend;
    estimated_minutes_watched: MetricTrend;
    average_view_duration?: number;
    likes?: number;
    /** @deprecated Dec 2021 - Always returns 0, YouTube disabled public dislike counts */
    dislikes?: number;
    comments?: number;
    shares?: number;
    estimated_revenue?: number;
    cpm?: number;
}

export interface YouTubeVideoMetrics {
    video_id: string;
    title: string;
    published_at: string;
    thumbnail_url?: string;
    views: number;
    estimated_minutes_watched: number;
    average_view_duration: number;
    average_view_percentage?: number;
    likes: number;
    comments: number;
    shares: number;
    audience_retention?: number;
    traffic_source_type?: Record<string, number>;
}

export interface YouTubeTrafficSource {
    source_type: string;
    views: number;
    estimated_minutes_watched: number;
    percentage: number;
}

export interface YouTubeAnalytics {
    channel_metrics: YouTubeChannelMetrics;
    time_series?: TimeSeriesDataPoint[];
    top_videos?: YouTubeVideoMetrics[];
    traffic_sources?: YouTubeTrafficSource[];
    date_range: DateRange;
}

// =============================================================================
// TIKTOK TYPES
// =============================================================================

export interface TikTokUserMetrics {
    open_id: string;
    display_name: string;
    avatar_url?: string;
    follower_count: MetricTrend;
    following_count?: number;
    likes_count?: number;
    video_count?: number;
}

export interface TikTokVideoMetrics {
    video_id: string;
    title?: string;
    create_time: string;
    cover_image_url?: string;
    share_url?: string;
    duration?: number;
    view_count: number;
    like_count: number;
    comment_count: number;
    share_count: number;
    engagement_rate?: number;
}

export interface TikTokAnalytics {
    user_metrics: TikTokUserMetrics;
    top_videos?: TikTokVideoMetrics[];
    total_views?: number;
    total_likes?: number;
    total_comments?: number;
    total_shares?: number;
    date_range: DateRange;
}

// =============================================================================
// UNIFIED DASHBOARD TYPES
// =============================================================================

export interface PlatformSummary {
    platform: Platform;
    connected: boolean;
    followers: MetricTrend;
    views: MetricTrend;
    engagement: MetricTrend;
    engagement_rate: number;
    posts_count: number;
    top_post_id?: string;
    error?: string;
}

export interface TopPerformingPost {
    platform: Platform;
    post_id: string;
    content_preview?: string;
    thumbnail_url?: string;
    created_at: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement_rate: number;
    post_url?: string;
}

export interface AggregatedMetrics {
    total_followers: MetricTrend;
    total_views: MetricTrend;
    total_engagement: MetricTrend;
    average_engagement_rate: number;
    total_posts: number;
    platforms_connected: number;
}

export interface PlatformComparisonData {
    platforms: PlatformSummary[];
    metrics_comparison: {
        followers: Record<string, number>;
        views: Record<string, number>;
        engagement: Record<string, number>;
        engagement_rate: Record<string, number>;
    };
}

export interface UnifiedDashboardData {
    aggregated: AggregatedMetrics;
    platforms: Record<Platform, PlatformSummary>;
    facebook?: FacebookInsights;
    instagram?: InstagramInsights;
    youtube?: YouTubeAnalytics;
    tiktok?: TikTokAnalytics;
    top_posts: TopPerformingPost[];
    platform_comparison: PlatformComparisonData;
    date_range: DateRange;
    generated_at: string;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface AnalyticsRequest {
    workspace_id: string;
    datePreset?: DatePreset;
    startDate?: string;
    endDate?: string;
    period?: AnalyticsPeriod;
    includeTimeSeries?: boolean;
    includeTopPosts?: boolean;
    topPostsLimit?: number;
}

export interface DashboardRequest extends AnalyticsRequest {
    platforms?: Platform[];
    include_comparison?: boolean;
}

export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

// Response types
export type FacebookInsightsResponse = ApiResponse<FacebookInsights>;
export type InstagramInsightsResponse = ApiResponse<InstagramInsights>;
export type YouTubeAnalyticsResponse = ApiResponse<YouTubeAnalytics>;
export type TikTokAnalyticsResponse = ApiResponse<TikTokAnalytics>;
export type UnifiedDashboardResponse = ApiResponse<UnifiedDashboardData>;
export type TopPostsResponse = ApiResponse<TopPerformingPost[]>;
export type PlatformComparisonResponse = ApiResponse<PlatformComparisonData>;

// =============================================================================
// UI HELPER TYPES
// =============================================================================

export interface KPICardData {
    title: string;
    value: number | string;
    change?: number;
    changePercent?: number;
    trend?: 'up' | 'down' | 'stable';
    icon?: React.ReactNode;
    platform?: Platform;
}

export interface ChartDataPoint {
    name: string;
    [key: string]: string | number;
}

export interface PlatformConfig {
    id: Platform;
    name: string;
    color: string;
    icon: string;
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
    { id: 'facebook', name: 'Facebook', color: '#1877F2', icon: 'facebook' },
    { id: 'instagram', name: 'Instagram', color: '#E4405F', icon: 'instagram' },
    { id: 'youtube', name: 'YouTube', color: '#FF0000', icon: 'youtube' },
    { id: 'tiktok', name: 'TikTok', color: '#000000', icon: 'tiktok' },
];

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7d', label: 'Last 7 Days' },
    { value: 'last_14d', label: 'Last 14 Days' },
    { value: 'last_30d', label: 'Last 30 Days' },
    { value: 'last_90d', label: 'Last 90 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
];
