/**
 * Analytics Dashboard - Buffer-Style UI
 * Clean, minimalist design inspired by Buffer's analytics interface.
 * Uses real API data via useAnalytics hooks.
 */
'use client';

import React, { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    TrendingUp, TrendingDown, Minus, Users, Eye, Heart,
    MessageCircle, Share2, RefreshCw, Calendar,
    Facebook, Instagram, Youtube, PlayCircle, AlertCircle, BarChart3, ExternalLink
} from 'lucide-react';
import { useAnalyticsDashboard } from '@/hooks/useAnalytics';
import {
    Platform, DatePreset, PlatformSummary, TopPerformingPost,
    MetricTrend, DATE_PRESET_OPTIONS, PLATFORM_CONFIGS
} from '@/types/analytics';
import { useAuth } from '@/contexts/AuthContext';

// =============================================================================
// CONSTANTS
// =============================================================================

const PLATFORM_COLORS: Record<Platform, string> = {
    facebook: '#1877F2',
    instagram: '#E4405F',
    youtube: '#FF0000',
    tiktok: '#000000',
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

const TrendBadge: React.FC<{ trend?: MetricTrend }> = ({ trend }) => {
    if (!trend?.change_percent) return null;

    const isUp = trend.change_percent > 0;
    const isStable = Math.abs(trend.change_percent) < 0.5;

    if (isStable) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Minus className="w-3 h-3" />
                0%
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? '+' : ''}{trend.change_percent.toFixed(1)}%
        </span>
    );
};

const PlatformIcon: React.FC<{ platform: Platform; className?: string }> = ({ platform, className = 'w-4 h-4' }) => {
    const iconProps = { className };
    switch (platform) {
        case 'facebook': return <Facebook {...iconProps} />;
        case 'instagram': return <Instagram {...iconProps} />;
        case 'youtube': return <Youtube {...iconProps} />;
        case 'tiktok': return <PlayCircle {...iconProps} />;
        default: return null;
    }
};

const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
};

const LoadingSkeleton: React.FC = () => (
    <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardContent className="p-6">
                        <Skeleton className="h-4 w-20 mb-3" />
                        <Skeleton className="h-8 w-24 mb-2" />
                        <Skeleton className="h-3 w-16" />
                    </CardContent>
                </Card>
            ))}
        </div>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-6">
                <Skeleton className="h-[300px] w-full" />
            </CardContent>
        </Card>
    </div>
);

// =============================================================================
// KPI CARDS - BUFFER STYLE
// =============================================================================

interface KPICardProps {
    title: string;
    value: number | string;
    trend?: MetricTrend;
    icon: React.ReactNode;
    subtitle?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, trend, icon, subtitle }) => (
    <Card className="bg-card/60 backdrop-blur-sm border-border/50 hover:bg-card/80 transition-all duration-200">
        <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">{title}</span>
                <span className="text-muted-foreground/60">{icon}</span>
            </div>
            <div className="flex items-end gap-3">
                <span className="text-3xl font-bold tracking-tight">
                    {typeof value === 'number' ? formatNumber(value) : value}
                </span>
                {trend && <TrendBadge trend={trend} />}
            </div>
            {subtitle && (
                <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
            )}
        </CardContent>
    </Card>
);

// =============================================================================
// PERFORMANCE CHART
// =============================================================================

interface PerformanceChartProps {
    platforms: Record<Platform, PlatformSummary>;
}

const PerformanceChart: React.FC<PerformanceChartProps> = ({ platforms }) => {
    const data = Object.entries(platforms)
        .filter(([_, summary]) => summary.connected)
        .map(([platform, summary]) => ({
            name: PLATFORM_CONFIGS.find(p => p.id === platform)?.name || platform,
            views: summary.views.current,
            engagement: summary.engagement.current,
            followers: summary.followers.current,
        }));

    if (data.length === 0) return null;

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold">Channel Performance</CardTitle>
                <CardDescription>Compare metrics across connected platforms</CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <YAxis
                            tickFormatter={formatNumber}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <Tooltip
                            formatter={(value) => formatNumber(value as number)}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '20px' }}
                            formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
                        />
                        <Bar dataKey="views" name="Views" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="engagement" name="Engagement" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

// =============================================================================
// ENGAGEMENT TREND CHART
// =============================================================================

const EngagementTrendChart: React.FC<PerformanceChartProps> = ({ platforms }) => {
    const data = Object.entries(platforms)
        .filter(([_, summary]) => summary.connected)
        .map(([platform, summary]) => ({
            name: PLATFORM_CONFIGS.find(p => p.id === platform)?.name || platform,
            rate: summary.engagement_rate,
            platform,
        }));

    if (data.length === 0) return null;

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold">Engagement Rate</CardTitle>
                <CardDescription>Engagement rate by platform</CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <defs>
                            <linearGradient id="engagementGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <YAxis
                            tickFormatter={(v) => `${v}%`}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <Tooltip
                            formatter={(value) => [`${(value as number).toFixed(2)}%`, 'Engagement Rate']}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="rate"
                            stroke="#8B5CF6"
                            strokeWidth={2}
                            fill="url(#engagementGradient)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

// =============================================================================
// TOP POSTS - BUFFER STYLE TABLE
// =============================================================================

interface TopPostsTableProps {
    posts: TopPerformingPost[];
}

const TopPostsTable: React.FC<TopPostsTableProps> = ({ posts }) => {
    if (posts.length === 0) return null;

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">Top Performing Posts</CardTitle>
                <CardDescription>Your best content across all channels</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                    {posts.slice(0, 5).map((post, index) => (
                        <div
                            key={post.post_id}
                            className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                        >
                            {/* Rank */}
                            <div className={`
                                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                                ${index === 0 ? 'bg-amber-500/20 text-amber-500' :
                                    index === 1 ? 'bg-slate-400/20 text-slate-400' :
                                        index === 2 ? 'bg-orange-600/20 text-orange-600' :
                                            'bg-muted text-muted-foreground'}
                            `}>
                                {index + 1}
                            </div>

                            {/* Thumbnail */}
                            {post.thumbnail_url ? (
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-muted">
                                    <img
                                        src={post.thumbnail_url}
                                        alt=""
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                    <PlatformIcon platform={post.platform} className="w-5 h-5 text-muted-foreground" />
                                </div>
                            )}

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <PlatformIcon
                                        platform={post.platform}
                                        className="w-3.5 h-3.5"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(post.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                    </span>
                                </div>
                                <p className="text-sm truncate">
                                    {post.content_preview || 'No caption'}
                                </p>
                            </div>

                            {/* Metrics */}
                            <div className="hidden md:flex items-center gap-6 text-sm">
                                <div className="text-center min-w-[60px]">
                                    <div className="font-semibold">{formatNumber(post.views)}</div>
                                    <div className="text-xs text-muted-foreground">Views</div>
                                </div>
                                <div className="text-center min-w-[60px]">
                                    <div className="font-semibold">{formatNumber(post.likes)}</div>
                                    <div className="text-xs text-muted-foreground">Likes</div>
                                </div>
                                <div className="text-center min-w-[60px]">
                                    <div className="font-semibold text-emerald-500">{post.engagement_rate.toFixed(1)}%</div>
                                    <div className="text-xs text-muted-foreground">Eng. Rate</div>
                                </div>
                            </div>

                            {/* Link */}
                            {post.post_url && (
                                <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
                                    <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

// =============================================================================
// PLATFORM DETAIL CARD
// =============================================================================

const PlatformDetailCard: React.FC<{ platform: Platform; summary: PlatformSummary }> = ({ platform, summary }) => {
    const config = PLATFORM_CONFIGS.find(p => p.id === platform);

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${PLATFORM_COLORS[platform]}20` }}
                    >
                        <PlatformIcon platform={platform} className="w-5 h-5" />
                    </div>
                    <div>
                        <CardTitle className="text-base font-semibold">{config?.name}</CardTitle>
                        <CardDescription className="text-xs">{summary.posts_count} posts</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">Followers</p>
                        <p className="text-xl font-bold">{formatNumber(summary.followers.current)}</p>
                        <TrendBadge trend={summary.followers} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">Views</p>
                        <p className="text-xl font-bold">{formatNumber(summary.views.current)}</p>
                        <TrendBadge trend={summary.views} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">Engagement</p>
                        <p className="text-xl font-bold">{formatNumber(summary.engagement.current)}</p>
                        <TrendBadge trend={summary.engagement} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">Eng. Rate</p>
                        <p className="text-xl font-bold">{summary.engagement_rate.toFixed(2)}%</p>
                    </div>
                </div>
                {summary.error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-xs">{summary.error}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
};

// =============================================================================
// MAIN DASHBOARD COMPONENT
// =============================================================================

const AnalyticsDashboard: React.FC = () => {
    const { workspaceId: authWorkspaceId } = useAuth();
    const workspaceId = authWorkspaceId || '';
    const [datePreset, setDatePreset] = useState<DatePreset>('last_30d');
    const [activeTab, setActiveTab] = useState<'overview' | Platform>('overview');

    const { data, loading, error, refetch, isRefetching } = useAnalyticsDashboard({
        workspaceId,
        datePreset,
        includeTopPosts: true,
        includeComparison: true,
        autoRefresh: false,
    });

    // Loading state
    if (loading && !data) {
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Analytics</h1>
                        <p className="text-sm text-muted-foreground">Loading your analytics...</p>
                    </div>
                </div>
                <LoadingSkeleton />
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                        {error}
                        <Button variant="link" onClick={() => refetch()} className="ml-2 p-0 h-auto">
                            Try again
                        </Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    // No workspace
    if (!workspaceId) {
        return (
            <div className="p-6">
                <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>Please select a workspace to view analytics.</AlertDescription>
                </Alert>
            </div>
        );
    }

    // No data
    if (!data) {
        return (
            <div className="p-6">
                <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                        No analytics data available. Connect your social media accounts to get started.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    const connectedPlatforms = Object.entries(data.platforms).filter(([_, s]) => s.connected);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Analytics</h1>
                    <p className="text-sm text-muted-foreground">
                        Track your performance across all channels
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                        <SelectTrigger className="w-[160px] bg-card/60 border-border/50">
                            <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DATE_PRESET_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className="bg-card/60 border-border/50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                    title="Total Followers"
                    value={data.aggregated.total_followers.current}
                    trend={data.aggregated.total_followers}
                    icon={<Users className="w-5 h-5" />}
                />
                <KPICard
                    title="Total Views"
                    value={data.aggregated.total_views.current}
                    trend={data.aggregated.total_views}
                    icon={<Eye className="w-5 h-5" />}
                />
                <KPICard
                    title="Total Engagement"
                    value={data.aggregated.total_engagement.current}
                    trend={data.aggregated.total_engagement}
                    icon={<Heart className="w-5 h-5" />}
                />
                <KPICard
                    title="Avg. Engagement Rate"
                    value={`${data.aggregated.average_engagement_rate.toFixed(2)}%`}
                    icon={<BarChart3 className="w-5 h-5" />}
                    subtitle={`${data.aggregated.platforms_connected} channels connected`}
                />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="bg-card/60 border border-border/50">
                    <TabsTrigger value="overview" className="gap-2">
                        <BarChart3 className="w-4 h-4" />
                        Overview
                    </TabsTrigger>
                    {connectedPlatforms.map(([platform]) => (
                        <TabsTrigger key={platform} value={platform} className="gap-2">
                            <PlatformIcon platform={platform as Platform} className="w-4 h-4" />
                            <span className="hidden sm:inline">
                                {PLATFORM_CONFIGS.find(p => p.id === platform)?.name}
                            </span>
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <PerformanceChart platforms={data.platforms} />
                        <EngagementTrendChart platforms={data.platforms} />
                    </div>
                    <TopPostsTable posts={data.top_posts} />
                </TabsContent>

                {/* Platform Tabs */}
                {connectedPlatforms.map(([platform, summary]) => (
                    <TabsContent key={platform} value={platform} className="mt-6">
                        <PlatformDetailCard platform={platform as Platform} summary={summary} />
                    </TabsContent>
                ))}
            </Tabs>

            {/* Footer */}
            <p className="text-xs text-center text-muted-foreground">
                Last updated: {data.generated_at ? new Date(data.generated_at).toLocaleString() : 'N/A'}
            </p>
        </div>
    );
};

export default AnalyticsDashboard;