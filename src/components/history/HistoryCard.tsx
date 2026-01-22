'use client'

import React, { useState } from 'react';
import { Post, Platform, MediaAsset } from '@/types';
import { PLATFORMS } from '@/constants';
import {
    Send, Clock, X, Trash2, Loader2, AlertCircle, CheckCircle2,
    Edit3, Play, Image as ImageIcon, Layers, Film,
    CalendarDays
} from 'lucide-react';
import { PlatformTemplateRenderer } from '@/components/templates/PlatformTemplateRenderer';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { EditPostModal } from './EditPostModal';
import { QuotaTooltip } from './QuotaTooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PublishedCardProps {
    post: Post;
    onUpdatePost: (post: Post) => void;
    onDeletePost: (postId: string, postTitle?: string) => void;
    onPublishPost?: (post: Post) => Promise<void>;
    connectedAccounts: Record<Platform, boolean>;
}

const PublishedCard: React.FC<PublishedCardProps> = ({ post, onUpdatePost, onDeletePost, onPublishPost, connectedAccounts }) => {
    const { isViewOnly } = usePermissions();
    const { workspaceId } = useAuth();
    const [activePlatform] = useState<Platform>(post.platforms[0]);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [publishSuccess, setPublishSuccess] = useState(false);

    const publishLog = (post.content as any)?._publishLog as
        | { lastAttempt?: string; retryCount?: number; error?: string }
        | undefined;

    const formatDateTime = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    };

    const handlePublish = async () => {
        if (!onPublishPost || isPublishing) return;

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
    const mediaUrl = post.generatedImage || (post.carouselImages && post.carouselImages.length > 0 ? post.carouselImages[0] : null) || null;
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
                    tags: [], // Added required property
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
                tags: [], // Added required property
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
                tags: [], // Added required property
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

    // Preview Modal
    const PreviewModal = () => {
        if (!isPreviewOpen) return null;
        const media = buildMediaArray();

        // Determine the correct postType for template routing
        const getEffectivePostType = () => {
            // If post.postType is explicitly set, use it
            if (post.postType && post.postType !== 'post') {
                return post.postType;
            }

            // Infer from media
            if (post.carouselImages && post.carouselImages.length > 1) {
                return 'carousel';
            }
            if (post.generatedVideoUrl) {
                // For video content, determine type based on platform
                if (activePlatform === 'youtube') {
                    return 'short'; // YouTube Shorts
                }
                if (activePlatform === 'tiktok') {
                    return 'video'; // TikTok video
                }
                return 'reel'; // Default to reel for Instagram/Facebook
            }
            if (post.generatedImage || (post.carouselImages && post.carouselImages.length === 1)) {
                return 'feed'; // Single image = feed post
            }
            return 'post'; // Fallback
        };

        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setIsPreviewOpen(false)}>
                <div
                    className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hide rounded-xl"
                    onClick={e => e.stopPropagation()}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    <button
                        onClick={() => setIsPreviewOpen(false)}
                        className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <PlatformTemplateRenderer
                        post={post}
                        platform={activePlatform}
                        postType={getEffectivePostType()}
                        media={media}
                        mode="preview"
                    />
                </div>
            </div>
        );
    };

    return (
        <>
            <div
                className="group relative bg-muted rounded-lg overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out cursor-pointer border border-border/50 break-inside-avoid mb-1 inline-block w-full align-top"
                onClick={() => setIsPreviewOpen(true)}
            >
                {/* Media Content */}
                {videoUrl ? (
                    <video
                        src={videoUrl}
                        className="w-full h-auto min-h-[220px] max-h-[440px] object-cover"
                        muted
                        playsInline
                    />
                ) : mediaUrl ? (
                    <img
                        src={mediaUrl}
                        alt="Post"
                        className="w-full h-auto object-contain transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                )}

                {/* Badges - Top Left: Platform */}
                <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10">
                    <Badge className={`px-2 py-1 bg-black/60 hover:bg-black/70 backdrop-blur-sm border-0 text-white rounded-lg flex items-center gap-1.5`}>
                        {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5" />}
                        <span className="capitalize text-[10px] sm:hidden md:inline">{activePlatform}</span>
                    </Badge>
                </div>

                {/* Badges - Top Right: Status */}
                <div className="absolute top-2 right-2 z-10">
                    {post.status === 'published' && (
                        <Badge className="bg-emerald-500/90 hover:bg-emerald-600/90 text-white border-0 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" />
                            <span className="hidden md:inline text-[10px]">Published</span>
                        </Badge>
                    )}
                    {post.status === 'scheduled' && (
                        <Badge className="bg-blue-500/90 hover:bg-blue-600/90 text-white border-0 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            <span className="hidden md:inline text-[10px]">Scheduled</span>
                        </Badge>
                    )}
                    {post.status === 'failed' && (
                        <Badge className="bg-red-500/90 hover:bg-red-600/90 text-white border-0 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3" />
                            <span className="hidden md:inline text-[10px]">Failed</span>
                        </Badge>
                    )}
                </div>

                {/* Badges - Under Status: Schedule/Audit info */}
                {(post.status === 'scheduled' || post.status === 'failed') && (
                    <div className="absolute top-12 right-2 z-10 flex flex-col gap-1 items-end">
                        {post.scheduledAt && (
                            <Badge className="bg-black/60 hover:bg-black/70 text-white border-0 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px]">
                                {post.status === 'scheduled' ? 'Publish' : 'Scheduled'}: {formatDateTime(post.scheduledAt)}
                            </Badge>
                        )}
                        {post.status === 'failed' && (publishLog?.lastAttempt || publishLog?.retryCount != null) && (
                            <Badge className="bg-black/60 hover:bg-black/70 text-white border-0 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px]">
                                Last attempt: {formatDateTime(publishLog?.lastAttempt)}{publishLog?.retryCount != null ? ` • Retry ${publishLog.retryCount}` : ''}
                            </Badge>
                        )}
                    </div>
                )}

                {/* Badges - Bottom Left: Post Type */}
                <div className="absolute bottom-2 left-2 z-10 opacity-100 group-hover:opacity-0 transition-opacity duration-200">
                    <Badge className="bg-black/50 hover:bg-black/60 text-white border-0 backdrop-blur-sm flex items-center gap-1.5 rounded-lg">
                        <PostTypeIcon className="w-3 h-3" />
                        <span className="text-[10px] capitalize">{postTypeInfo.label}</span>
                        {isCarousel && <span className="text-[9px] opacity-80">({post.carouselImages!.length})</span>}
                    </Badge>
                </div>

                {/* Hover Overlay with Actions */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                    <div className="flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                        {/* Edit Button */}
                        {!isViewOnly && post.status !== 'published' && (
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 w-8 p-0 rounded-lg bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-sm hover:scale-110 transition-all"
                                onClick={() => setIsEditModalOpen(true)}
                                title="Edit Post"
                            >
                                <Edit3 className="w-4 h-4" />
                            </Button>
                        )}

                        {/* Schedule Button */}
                        {!isViewOnly && post.status !== 'published' && post.status !== 'scheduled' && (
                            <QuotaTooltip platform={activePlatform} workspaceId={workspaceId || ''}>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 w-8 p-0 rounded-lg bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-sm hover:scale-110 transition-all"
                                    onClick={() => setIsScheduleModalOpen(true)}
                                    title="Schedule"
                                >
                                    <Clock className="w-4 h-4" />
                                </Button>
                            </QuotaTooltip>
                        )}

                        {/* Unschedule Button */}
                        {!isViewOnly && post.status === 'scheduled' && (
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 w-8 p-0 rounded-lg bg-orange-500/80 hover:bg-orange-600/80 text-white border-0 backdrop-blur-sm hover:scale-110 transition-all"
                                onClick={handleUnschedule}
                                title="Unschedule"
                            >
                                <CalendarDays className="w-4 h-4" />
                            </Button>
                        )}

                        {/* Publish Button */}
                        {!isViewOnly && (post.status === 'ready_to_publish' || post.status === 'failed') && (
                            <QuotaTooltip platform={activePlatform} workspaceId={workspaceId || ''}>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 w-8 p-0 rounded-lg bg-teal-500/80 hover:bg-teal-600/80 text-white border-0 backdrop-blur-sm hover:scale-110 transition-all"
                                    onClick={handlePublish}
                                    disabled={!canPublish || isPublishing}
                                    title={!canPublish ? `Connect ${unconnectedPlatforms.join(', ')} to publish` : "Publish Now"}
                                >
                                    {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </Button>
                            </QuotaTooltip>
                        )}

                        {/* Delete/More Options */}
                        {!isViewOnly && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-8 w-8 p-0 rounded-lg bg-red-500/80 hover:bg-red-600/80 text-white border-0 backdrop-blur-sm hover:scale-110 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40 z-50">
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 cursor-pointer"
                                        onClick={() => onDeletePost(post.id, post.topic)}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Post
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {/* Error Message if Failed */}
                    {publishError && (
                        <div className="mt-2 text-[10px] text-white bg-red-500/80 p-1.5 rounded backdrop-blur-sm flex items-center gap-1.5 animate-in slide-in-from-bottom-1 fade-in">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{publishError}</span>
                        </div>
                    )}

                    {/* Cron failure detail (from server-side publish log) */}
                    {post.status === 'failed' && !publishError && publishLog?.error && (
                        <div className="mt-2 text-[10px] text-white bg-red-500/70 p-1.5 rounded backdrop-blur-sm flex items-center gap-1.5 animate-in slide-in-from-bottom-1 fade-in">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{publishLog.error}</span>
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