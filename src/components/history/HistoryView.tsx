'use client'

import React, { useMemo } from 'react';
import { Post, PostStatus, Platform } from '@/types';
import PublishedCard from '@/components/history/HistoryCard';
import { Badge } from '@/components/ui/badge';
import { BookCheck, Zap } from 'lucide-react';

interface PublishedViewProps {
    posts: Post[];
    onUpdatePost: (post: Post) => void;
    onDeletePost: (postId: string) => void;
    onPublishPost?: (post: Post) => Promise<void>;
    connectedAccounts: Record<Platform, boolean>;
}

const PublishedView: React.FC<PublishedViewProps> = ({ posts = [], onUpdatePost, onDeletePost, onPublishPost, connectedAccounts }) => {
    const postsForPublishing = useMemo(() => {
        const relevantPosts = (posts || []).filter(post => ['ready_to_publish', 'scheduled', 'published', 'failed'].includes(post.status));

        return relevantPosts
            .sort((a, b) => {
                const statusOrder: Partial<Record<PostStatus, number>> = {
                    'failed': 0,
                    'ready_to_publish': 1,
                    'scheduled': 2,
                    'published': 3,
                };
                const weightA = statusOrder[a.status] ?? 99;
                const weightB = statusOrder[b.status] ?? 99;
                if (weightA !== weightB) {
                    return weightA - weightB;
                }
                const dateA = a.publishedAt || a.scheduledAt || a.createdAt;
                const dateB = b.publishedAt || b.scheduledAt || b.createdAt;
                return new Date(dateB).getTime() - new Date(dateA).getTime();
            });
    }, [posts]);

    // Compact Header Component
    const CompactHeader = () => (
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2">
            <div className="flex items-center gap-2">
                <div className="bg-white/20 p-1.5 rounded-lg">
                    <BookCheck className="w-4 h-4 text-white" />
                </div>
                <div className="flex items-center gap-2">
                    <h1 className="text-sm font-semibold text-white">Publishing Studio</h1>
                    <Badge className="bg-white/20 text-white border-0 text-[9px] px-1.5 py-0 h-4">
                        <Zap className="w-2 h-2 mr-0.5" />
                        {postsForPublishing.length}
                    </Badge>
                </div>
            </div>
        </div>
    );

    if (postsForPublishing.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <CompactHeader />
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
            <CompactHeader />

            {/* Main Content - 3 Column Grid */}
            <div className="flex-1 p-2 bg-background overflow-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
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
            </div>
        </div>
    );
};

export default PublishedView;
