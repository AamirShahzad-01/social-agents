'use client'

import React, { useMemo, useState } from 'react';
import { Post, PostStatus, Platform } from '@/types';
import PublishedCard from '@/components/history/HistoryCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    BookCheck, Search, Grid, List, Filter, X,
    Image as ImageIcon, Video, Layers, Film, Clock, CheckCircle2, AlertCircle, Send
} from 'lucide-react';
import { PLATFORMS } from '@/constants';

interface PublishedViewProps {
    posts: Post[];
    onUpdatePost: (post: Post) => void;
    onDeletePost: (postId: string) => void;
    onPublishPost?: (post: Post) => Promise<void>;
    connectedAccounts: Record<Platform, boolean>;
}

type StatusFilter = 'all' | 'ready_to_publish' | 'scheduled' | 'published' | 'failed';
type TypeFilter = 'all' | 'image' | 'video' | 'carousel' | 'reel' | 'story';
type PlatformFilter = 'all' | Platform;

const PublishedView: React.FC<PublishedViewProps> = ({ posts = [], onUpdatePost, onDeletePost, onPublishPost, connectedAccounts }) => {
    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const postsForPublishing = useMemo(() => {
        let filteredPosts = (posts || []).filter(post =>
            ['ready_to_publish', 'scheduled', 'published', 'failed'].includes(post.status)
        );

        // Apply status filter
        if (statusFilter !== 'all') {
            filteredPosts = filteredPosts.filter(post => post.status === statusFilter);
        }

        // Apply type filter
        if (typeFilter !== 'all') {
            filteredPosts = filteredPosts.filter(post => {
                if (typeFilter === 'image') return !post.generatedVideoUrl && !post.carouselImages?.length;
                if (typeFilter === 'video') return !!post.generatedVideoUrl;
                if (typeFilter === 'carousel') return post.carouselImages && post.carouselImages.length > 1;
                if (typeFilter === 'reel') return post.postType === 'reel';
                if (typeFilter === 'story') return post.postType === 'story';
                return true;
            });
        }

        // Apply platform filter
        if (platformFilter !== 'all') {
            filteredPosts = filteredPosts.filter(post => post.platforms.includes(platformFilter));
        }

        // Apply search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredPosts = filteredPosts.filter(post =>
                post.topic?.toLowerCase().includes(query) ||
                post.platforms.some(p => p.toLowerCase().includes(query))
            );
        }

        // Sort by status priority and date
        return filteredPosts.sort((a, b) => {
            const statusOrder: Partial<Record<PostStatus, number>> = {
                'failed': 0,
                'ready_to_publish': 1,
                'scheduled': 2,
                'published': 3,
            };
            const weightA = statusOrder[a.status] ?? 99;
            const weightB = statusOrder[b.status] ?? 99;
            if (weightA !== weightB) return weightA - weightB;
            const dateA = a.publishedAt || a.scheduledAt || a.createdAt;
            const dateB = b.publishedAt || b.scheduledAt || b.createdAt;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [posts, statusFilter, typeFilter, platformFilter, searchQuery]);

    // Count posts by status
    const statusCounts = useMemo(() => {
        const counts = { ready_to_publish: 0, scheduled: 0, published: 0, failed: 0 };
        posts.forEach(post => {
            if (counts[post.status as keyof typeof counts] !== undefined) {
                counts[post.status as keyof typeof counts]++;
            }
        });
        return counts;
    }, [posts]);

    const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || platformFilter !== 'all' || searchQuery !== '';

    const clearFilters = () => {
        setStatusFilter('all');
        setTypeFilter('all');
        setPlatformFilter('all');
        setSearchQuery('');
    };

    // Filter button component
    const FilterButton: React.FC<{
        active: boolean;
        onClick: () => void;
        children: React.ReactNode;
        count?: number;
    }> = ({ active, onClick, children, count }) => (
        <button
            onClick={onClick}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5 ${active
                ? 'bg-primary text-white'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
        >
            {children}
            {count !== undefined && count > 0 && (
                <span className={`text-[9px] px-1 rounded ${active ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>
                    {count}
                </span>
            )}
        </button>
    );

    if (postsForPublishing.length === 0 && !hasActiveFilters) {
        return (
            <div className="flex flex-col h-full">
                {/* Header - Library Style */}
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-900 via-orange-900 to-amber-900 dark:from-amber-950 dark:via-orange-950 dark:to-amber-950">
                    {/* Animated background elements */}
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500/30 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                    </div>
                    <div className="relative px-6 py-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 rounded-xl blur-lg opacity-75" />
                                    <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 p-3 rounded-xl shadow-xl">
                                        <BookCheck className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold text-white flex items-center gap-3">
                                        Publishing Studio
                                        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[11px] px-2 py-0.5 h-6 shadow-lg">0 items</Badge>
                                    </h1>
                                    <p className="text-white/80 text-[13px] mt-0.5">Publish and schedule your content</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-4 bg-background">
                    <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg px-6">
                        <h2 className="text-lg font-semibold text-foreground">Nothing to Publish</h2>
                        <p className="text-muted-foreground text-sm mt-1">Create content or send media from Library.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header & Filters - Library Style */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-900 via-orange-900 to-amber-900 dark:from-amber-950 dark:via-orange-950 dark:to-amber-950">
                {/* Animated background elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500/30 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                </div>
                <div className="relative px-6 py-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        {/* Left - Title */}
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 rounded-xl blur-lg opacity-75" />
                                <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 p-3 rounded-xl shadow-xl">
                                    <BookCheck className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-white flex items-center gap-3">
                                    Publishing Studio
                                    <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[11px] px-2 py-0.5 h-6 shadow-lg">{postsForPublishing.length} items</Badge>
                                </h1>
                                <p className="text-white/80 text-[13px] mt-0.5">Publish and schedule your content</p>
                            </div>
                        </div>

                        {/* Right - Filter Buttons */}
                        <div className="flex flex-wrap gap-2.5 items-center">
                            {/* Filter Tabs */}
                            <div className="flex gap-1.5 p-1.5 bg-white/10 rounded-xl">
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${statusFilter === 'all' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setStatusFilter('all')}
                                >
                                    All
                                </button>
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${statusFilter === 'ready_to_publish' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setStatusFilter('ready_to_publish')}
                                >
                                    Ready
                                </button>
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${statusFilter === 'scheduled' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setStatusFilter('scheduled')}
                                >
                                    Scheduled
                                </button>
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${statusFilter === 'published' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setStatusFilter('published')}
                                >
                                    Published
                                </button>
                            </div>

                            {/* Type Filters */}
                            <div className="flex gap-1.5 p-1.5 bg-white/10 rounded-xl">
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-1.5 ${typeFilter === 'image' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setTypeFilter('image')}
                                >
                                    <ImageIcon className="w-3.5 h-3.5" /> Images
                                </button>
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-1.5 ${typeFilter === 'video' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setTypeFilter('video')}
                                >
                                    <Video className="w-3.5 h-3.5" /> Videos
                                </button>
                                <button
                                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-1.5 ${typeFilter === 'carousel' ? 'bg-white text-amber-900 shadow-sm font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                    onClick={() => setTypeFilter('carousel')}
                                >
                                    <Layers className="w-3.5 h-3.5" /> Carousel
                                </button>
                            </div>

                            {/* Platform Filters */}
                            <div className="flex gap-1.5 p-1.5 bg-white/10 rounded-xl">
                                {PLATFORMS.map(platform => {
                                    const Icon = platform.icon;
                                    return (
                                        <button
                                            key={platform.id}
                                            className={`p-2 rounded-lg transition-colors ${platformFilter === platform.id ? 'bg-white text-amber-900 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                            onClick={() => setPlatformFilter(platform.id as Platform)}
                                        >
                                            <Icon className="w-4 h-4" />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Clear Filters */}
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" /> Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-2 bg-background overflow-auto">
                {postsForPublishing.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center py-8">
                            <p className="text-muted-foreground text-sm">No posts match your filters</p>
                            <button onClick={clearFilters} className="text-primary text-xs mt-1 hover:underline">
                                Clear filters
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={viewMode === 'grid'
                        ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5"
                        : "flex flex-col gap-1.5"
                    }>
                        {postsForPublishing.map(post => (
                            <PublishedCard
                                key={post.id}
                                post={post}
                                onUpdatePost={onUpdatePost}
                                onDeletePost={onDeletePost}
                                onPublishPost={onPublishPost}
                                connectedAccounts={connectedAccounts}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublishedView;
