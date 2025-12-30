'use client'

import React, { useState } from 'react';
import { Post, Platform, PostType, MediaAsset } from '@/types';
import { PLATFORMS, STATUS_CONFIG } from '@/constants';
import { Send, Clock, X, Trash2, Loader2, AlertCircle, CheckCircle2, Edit3, Play, Image as ImageIcon, Layers, Film } from 'lucide-react';
import { PlatformTemplateRenderer } from '@/components/templates/PlatformTemplateRenderer';
import { usePermissions } from '@/hooks/usePermissions';
import { EditPostModal } from './EditPostModal';

interface PublishedCardProps {
    post: Post;
    onUpdatePost: (post: Post) => void;
    onDeletePost: (postId: string, postTitle?: string) => void;
    onPublishPost?: (post: Post) => Promise<void>;
    connectedAccounts: Record<Platform, boolean>;
}

// Platform-specific max widths for realistic preview sizing
const PLATFORM_MAX_WIDTHS: Record<Platform, string> = {
    instagram: 'max-w-[280px]',
    facebook: 'max-w-[280px]',
    twitter: 'max-w-[280px]',
    linkedin: 'max-w-[280px]',
    tiktok: 'max-w-[280px]',
    youtube: 'max-w-[280px]',
};

const PublishedCard: React.FC<PublishedCardProps> = ({ post, onUpdatePost, onDeletePost, onPublishPost, connectedAccounts }) => {
    const { isViewOnly } = usePermissions();
    const [activePlatform] = useState<Platform>(post.platforms[0]);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [publishSuccess, setPublishSuccess] = useState(false);

    const handlePublish = async () => {
        if (!onPublishPost) return;
        setIsPublishing(true);
        setPublishError(null);
        setPublishSuccess(false);

        try {
            await onPublishPost(post);
            setPublishSuccess(true);
            setTimeout(() => setPublishSuccess(false), 3000);
        } catch (error) {
            setPublishError(error instanceof Error ? error.message : 'Publishing failed');
        } finally {
            setIsPublishing(false);
        }
    };

    const handleSchedule = async () => {
        if (!scheduleDate) return;
        const scheduledAt = new Date(scheduleDate).toISOString();
        onUpdatePost({ ...post, status: 'scheduled', scheduledAt });
        setIsScheduleModalOpen(false);
        setScheduleDate('');
    };

    const handleUnschedule = () => {
        onUpdatePost({ ...post, status: 'ready_to_publish', scheduledAt: undefined });
    };

    const unconnectedPlatforms = post.platforms.filter(p => !connectedAccounts[p]);
    const canPublish = unconnectedPlatforms.length === 0;

    // Get media URL
    const mediaUrl = post.generatedImage || (post.carouselImages && post.carouselImages[0]) || null;
    const videoUrl = post.generatedVideoUrl || null;
    const isVideo = !!videoUrl;
    const isCarousel = post.carouselImages && post.carouselImages.length > 1;

    // Get post type icon and label
    const getPostTypeInfo = () => {
        if (post.postType === 'story') return { icon: Film, label: 'Story' };
        if (post.postType === 'reel') return { icon: Film, label: 'Reel' };
        if (isCarousel) return { icon: Layers, label: 'Carousel' };
        if (isVideo) return { icon: Play, label: 'Video' };
        return { icon: ImageIcon, label: 'Post' };
    };
    const postTypeInfo = getPostTypeInfo();
    const PostTypeIcon = postTypeInfo.icon;

    // Platform info
    const platformInfo = PLATFORMS.find(p => p.id === activePlatform);
    const PlatformIcon = platformInfo?.icon;

    // Platform colors
    const platformBgColors: Record<Platform, string> = {
        instagram: 'from-purple-500 to-pink-500',
        facebook: 'bg-[#1877F2]',
        twitter: 'bg-black',
        linkedin: 'bg-[#0A66C2]',
        tiktok: 'bg-black',
        youtube: 'bg-[#FF0000]',
    };

    // Helper to check video URL
    const isVideoUrl = (url: string): boolean => {
        return !!(url?.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i) || url?.includes('video'));
    };

    // Build media array for template
    const buildMediaArray = (): MediaAsset[] => {
        const media: MediaAsset[] = [];
        if (post.carouselImages && post.carouselImages.length > 0) {
            post.carouselImages.forEach((url, index) => {
                media.push({
                    id: `carousel-${index}`,
                    name: `Slide ${index + 1}`,
                    type: isVideoUrl(url) ? 'video' : 'image',
                    url,
                    size: 0,
                    tags: [],
                    createdAt: new Date().toISOString(),
                    source: 'ai-generated',
                    usedInPosts: [post.id]
                });
            });
        } else if (post.generatedImage) {
            media.push({
                id: 'image',
                name: 'Image',
                type: 'image',
                url: post.generatedImage,
                size: 0,
                tags: [],
                createdAt: new Date().toISOString(),
                source: 'ai-generated',
                usedInPosts: [post.id]
            });
        }
        if (post.generatedVideoUrl) {
            media.push({
                id: 'video',
                name: 'Video',
                type: 'video',
                url: post.generatedVideoUrl,
                size: 0,
                tags: [],
                createdAt: new Date().toISOString(),
                source: 'ai-generated',
                usedInPosts: [post.id]
            });
        }
        return media;
    };

    const ScheduleModal = () => (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsScheduleModalOpen(false)}>
            <div className="bg-card rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-3 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">Schedule Post</h2>
                    <button onClick={() => setIsScheduleModalOpen(false)} className="p-1 rounded hover:bg-muted">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </header>
                <div className="p-3 space-y-3">
                    <input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary"
                        min={new Date().toISOString().slice(0, 16)}
                    />
                    <button
                        onClick={handleSchedule}
                        disabled={!scheduleDate}
                        className="w-full py-2 px-3 text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
                    >
                        Confirm Schedule
                    </button>
                </div>
            </div>
        </div>
    );

    // Preview Modal - Shows full platform template with caption
    const PreviewModal = () => {
        if (!isPreviewOpen) return null;
        const media = buildMediaArray();

        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setIsPreviewOpen(false)}>
                <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hide rounded-xl" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => setIsPreviewOpen(false)}
                        className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <PlatformTemplateRenderer
                        post={post}
                        platform={activePlatform}
                        postType={post.postType || 'post'}
                        media={media}
                        mode="preview"
                    />
                </div>
            </div>
        );
    };

    return (
        <>
            <div className={`bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden ${PLATFORM_MAX_WIDTHS[activePlatform]} w-full mx-auto`}>
                {/* Header - Platform & Post Type */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 border-b border-border">
                    {/* Platform Icon */}
                    {PlatformIcon && (
                        <div className={`p-1 rounded ${activePlatform === 'instagram' ? 'bg-gradient-to-r ' + platformBgColors[activePlatform] : platformBgColors[activePlatform]}`}>
                            <PlatformIcon className="w-3 h-3 text-white" />
                        </div>
                    )}
                    {/* Post Type */}
                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-0.5">
                        <PostTypeIcon className="w-2.5 h-2.5" />
                        {postTypeInfo.label}
                    </span>
                    {isCarousel && (
                        <span className="text-[9px] text-muted-foreground">({post.carouselImages!.length})</span>
                    )}
                </div>

                {/* Media Preview - Compact - Click to open full preview */}
                <div className="relative aspect-square bg-black overflow-hidden cursor-pointer" onClick={() => setIsPreviewOpen(true)}>
                    {videoUrl ? (
                        <video src={videoUrl} className="w-full h-full object-cover" muted playsInline />
                    ) : mediaUrl ? (
                        <img src={mediaUrl} alt="Post" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                    )}
                    {/* Video Play Overlay */}
                    {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Play className="w-8 h-8 text-white fill-white" />
                        </div>
                    )}
                    {/* Carousel Indicator */}
                    {isCarousel && (
                        <div className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
                            1/{post.carouselImages!.length}
                        </div>
                    )}
                </div>

                {/* Action Buttons - Compact */}
                <div className="p-1.5 bg-muted/30 border-t border-border">
                    {post.status === 'ready_to_publish' && (
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => !isViewOnly && setIsEditModalOpen(true)}
                                    disabled={isViewOnly}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 text-[10px] font-medium rounded bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm disabled:opacity-50"
                                >
                                    <Edit3 className="w-2.5 h-2.5" />
                                    Edit
                                </button>
                                <button
                                    onClick={() => !isViewOnly && setIsScheduleModalOpen(true)}
                                    disabled={isViewOnly}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 text-[10px] font-medium rounded bg-sky-400 hover:bg-sky-500 text-white shadow-sm disabled:opacity-50"
                                >
                                    <Clock className="w-2.5 h-2.5" />
                                    Schedule
                                </button>
                                <button
                                    onClick={() => !isViewOnly && handlePublish()}
                                    disabled={!canPublish || isPublishing || isViewOnly}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 text-[10px] font-medium rounded bg-teal-500 hover:bg-teal-600 text-white shadow-sm disabled:opacity-50"
                                >
                                    {isPublishing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                                    {isPublishing ? '...' : 'Publish'}
                                </button>
                                <button
                                    onClick={() => !isViewOnly && onDeletePost(post.id, post.topic)}
                                    disabled={isViewOnly}
                                    className="p-1 rounded bg-rose-500 hover:bg-rose-600 text-white shadow-sm disabled:opacity-50"
                                >
                                    <Trash2 className="w-2.5 h-2.5" />
                                </button>
                            </div>
                            {!canPublish && (
                                <p className="text-[9px] text-amber-600 dark:text-amber-400 truncate">
                                    Connect {unconnectedPlatforms.join(', ')} to publish
                                </p>
                            )}
                            {publishError && (
                                <p className="text-[9px] text-red-500 flex items-center gap-0.5">
                                    <AlertCircle className="w-2.5 h-2.5" />{publishError}
                                </p>
                            )}
                            {publishSuccess && (
                                <p className="text-[9px] text-green-500 flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" />Published!
                                </p>
                            )}
                        </div>
                    )}

                    {post.status === 'scheduled' && (
                        <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                                <Clock className="w-2.5 h-2.5" />
                                <span className="font-medium">{new Date(post.scheduledAt!).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => !isViewOnly && setIsEditModalOpen(true)}
                                    disabled={isViewOnly}
                                    className="py-0.5 px-1.5 text-[9px] font-medium rounded bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm disabled:opacity-50"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => !isViewOnly && handleUnschedule()}
                                    disabled={isViewOnly}
                                    className="py-0.5 px-1.5 text-[9px] font-medium rounded text-muted-foreground hover:text-foreground"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {post.status === 'published' && (
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-green-600 flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {new Date(post.publishedAt!).toLocaleDateString()}
                            </span>
                            <a href="#" className="text-primary hover:underline text-[9px]">View Live</a>
                        </div>
                    )}

                    {post.status === 'failed' && (
                        <div className="space-y-1">
                            <p className="text-[9px] text-red-500 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5" />Failed to publish
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => !isViewOnly && setIsEditModalOpen(true)}
                                    disabled={isViewOnly}
                                    className="flex-1 py-0.5 px-1.5 text-[9px] font-medium rounded bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm disabled:opacity-50"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => !isViewOnly && handlePublish()}
                                    disabled={isPublishing || isViewOnly}
                                    className="flex-1 py-0.5 px-1.5 text-[9px] font-medium rounded bg-orange-600 text-white disabled:opacity-50"
                                >
                                    Retry
                                </button>
                                <button
                                    onClick={() => !isViewOnly && onDeletePost(post.id)}
                                    disabled={isViewOnly}
                                    className="p-0.5 rounded bg-red-600 text-white disabled:opacity-50"
                                >
                                    <Trash2 className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <PreviewModal />
            {isScheduleModalOpen && <ScheduleModal />}
            {isEditModalOpen && (
                <EditPostModal
                    post={post}
                    onSave={(updatedPost) => {
                        onUpdatePost(updatedPost);
                        setIsEditModalOpen(false);
                    }}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}
        </>
    );
};

export default PublishedCard;