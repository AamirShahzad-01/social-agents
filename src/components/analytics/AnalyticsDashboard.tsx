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
    MetricTrend, DATE_PRESET_OPTIONS, PLATFORM_CONFIGS,
    TimeSeriesDataPoint, UnifiedDashboardData
} from '@/types/analytics';
import { useAuth } from '@/contexts/AuthContext';

// =============================================================================
// CONSTANTS
// =============================================================================

const PLATFORM_COLORS: Record<Platform, string> = {
    facebook: '#1877F2',
    instagram: '#833AB4',
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
        <CardContent className="p-2">
            <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">{title}</span>
                <span className="text-muted-foreground/40">{icon}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold tracking-tight">
                    {typeof value === 'number' ? formatNumber(value) : value}
                </span>
                {trend && <TrendBadge trend={trend} />}
            </div>
            {subtitle && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
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
            platform: platform as Platform,
            views: summary.views.current,
            engagement: summary.engagement.current,
            followers: summary.followers.current,
            fill: PLATFORM_COLORS[platform as Platform],
        }));

    if (data.length === 0) return null;

    // Custom bar component with platform colors
    const CustomBar = (props: { x?: number; y?: number; width?: number; height?: number; payload?: { fill: string; platform: Platform } }) => {
        const { x = 0, y = 0, width = 0, height = 0, payload } = props;
        const color = payload?.fill || '#3B82F6';
        const gradientId = `gradient-${payload?.platform}`;
        return (
            <g>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                    </linearGradient>
                </defs>
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={`url(#${gradientId})`}
                    rx={6}
                    ry={6}
                    style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))' }}
                />
            </g>
        );
    };

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50 overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-8 rounded-full bg-gradient-to-b from-blue-500 to-purple-500" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Channel Performance</CardTitle>
                        <CardDescription>Compare metrics across connected platforms</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barCategoryGap="25%">
                        <defs>
                            {data.map((item) => (
                                <linearGradient key={`bar-gradient-${item.platform}`} id={`bar-gradient-${item.platform}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={item.fill} stopOpacity={0.9} />
                                    <stop offset="100%" stopColor={item.fill} stopOpacity={0.5} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis
                            tickFormatter={formatNumber}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            dx={-10}
                        />
                        <Tooltip
                            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3, radius: 8 }}
                            formatter={(value, name) => [formatNumber(value as number), name]}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                                padding: '12px 16px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '8px' }}
                            itemStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '24px' }}
                            formatter={(value) => (
                                <span className="text-sm font-medium text-muted-foreground ml-1">{value}</span>
                            )}
                            iconType="circle"
                            iconSize={8}
                        />
                        <Bar
                            dataKey="views"
                            name="Views"
                            radius={[8, 8, 0, 0]}
                            maxBarSize={50}
                        >
                            {data.map((entry, index) => (
                                <rect key={`bar-views-${index}`} fill={`url(#bar-gradient-${entry.platform})`} />
                            ))}
                        </Bar>
                        <Bar
                            dataKey="engagement"
                            name="Engagement"
                            fill="#8B5CF6"
                            radius={[8, 8, 0, 0]}
                            maxBarSize={50}
                            opacity={0.8}
                        />
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
    // Use actual engagement rate data from platforms
    const chartData = Object.entries(platforms)
        .filter(([_, summary]) => summary.connected)
        .map(([platform, summary]) => ({
            name: PLATFORM_CONFIGS.find(p => p.id === platform)?.name || platform,
            platform: platform as Platform,
            engagementRate: summary.engagement_rate,
            engagement: summary.engagement.current,
            fill: PLATFORM_COLORS[platform as Platform],
        }))
        .sort((a, b) => b.engagementRate - a.engagementRate); // Sort by engagement rate

    if (chartData.length === 0) return null;

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50 overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-8 rounded-full bg-gradient-to-b from-emerald-500 to-cyan-500" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Engagement Rate</CardTitle>
                        <CardDescription>Compare engagement rates across platforms</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 20, right: 40, left: 20, bottom: 20 }}
                        barCategoryGap="30%"
                    >
                        <defs>
                            {chartData.map((item) => (
                                <linearGradient key={`eng-gradient-${item.platform}`} id={`eng-gradient-${item.platform}`} x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor={item.fill} stopOpacity={0.7} />
                                    <stop offset="100%" stopColor={item.fill} stopOpacity={1} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} horizontal={false} />
                        <XAxis
                            type="number"
                            tickFormatter={(v) => `${v.toFixed(1)}%`}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, 'dataMax + 0.5']}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }}
                            axisLine={false}
                            tickLine={false}
                            width={80}
                        />
                        <Tooltip
                            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                            formatter={(value) => [`${(value as number).toFixed(2)}%`, 'Engagement Rate']}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                                padding: '12px 16px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '4px' }}
                        />
                        <Bar
                            dataKey="engagementRate"
                            radius={[0, 8, 8, 0]}
                            maxBarSize={40}
                        >
                            {chartData.map((entry) => (
                                <rect
                                    key={`bar-${entry.platform}`}
                                    fill={`url(#eng-gradient-${entry.platform})`}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                {/* Platform legend with actual values */}
                <div className="flex flex-wrap justify-center gap-4 mt-2 pt-2 border-t border-border/30">
                    {chartData.map((item) => (
                        <div key={item.platform} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: item.fill }}
                            />
                            <span className="text-xs text-muted-foreground">
                                {item.name}: <span className="font-semibold text-foreground">{item.engagementRate.toFixed(2)}%</span>
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

// =============================================================================
// ENGAGEMENT TIME-SERIES CHART (True Trend Over Time)
// =============================================================================

interface TimeSeriesChartProps {
    data: UnifiedDashboardData;
}

const EngagementTimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data }) => {
    // Define allowed platforms for this specific chart
    const ALLOWED_PLATFORMS = ['facebook', 'instagram', 'youtube'] as const;

    // Collect time-series data from allowed platforms
    const timeSeriesMap: Record<string, { date: string } & Partial<Record<typeof ALLOWED_PLATFORMS[number], number>>> = {};

    ALLOWED_PLATFORMS.forEach(platform => {
        if (data[platform]?.time_series) {
            data[platform].time_series.forEach((point) => {
                if (!timeSeriesMap[point.date]) {
                    timeSeriesMap[point.date] = { date: point.date };
                }
                // @ts-ignore - dynamic key assignment
                timeSeriesMap[point.date][platform] = point.value;
            });
        }
    });

    // Convert to sorted array
    const chartData = Object.values(timeSeriesMap)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((item) => ({
            ...item,
            date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        }));

    // Check if we have any data for the allowed platforms
    const hasData = ALLOWED_PLATFORMS.some(platform =>
        chartData.some(d => d[platform] !== undefined)
    );

    if (chartData.length === 0 || !hasData) {
        return (
            <Card className="bg-card/60 backdrop-blur-sm border-border/50 overflow-hidden">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-8 rounded-full bg-gradient-to-b from-orange-500 to-rose-500" />
                        <div>
                            <CardTitle className="text-lg font-semibold">Engagement Over Time</CardTitle>
                            <CardDescription>Daily engagement trends</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                        No time-series data available for the selected period
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/50 overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-8 rounded-full bg-gradient-to-b from-orange-500 to-rose-500" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Engagement Over Time</CardTitle>
                        <CardDescription>Daily engagement trends across platforms</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            {ALLOWED_PLATFORMS.map(platform => (
                                <linearGradient key={`color-${platform}`} id={`color-${platform}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={PLATFORM_COLORS[platform]} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={PLATFORM_COLORS[platform]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                        <XAxis
                            dataKey="date"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tickFormatter={formatNumber}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            formatter={(value) => [formatNumber(value as number), '']}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                                padding: '12px 16px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '8px' }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '16px' }}
                            formatter={(value) => (
                                <span className="text-sm font-medium text-muted-foreground ml-1">
                                    {value.charAt(0).toUpperCase() + value.slice(1)}
                                </span>
                            )}
                            iconType="circle"
                            iconSize={8}
                        />
                        {ALLOWED_PLATFORMS.map(platform => {
                            // Only render area if data exists for this platform
                            const hasPlatformData = chartData.some(d => d[platform] !== undefined);
                            if (!hasPlatformData) return null;

                            return (
                                <Area
                                    key={platform}
                                    type="monotone"
                                    dataKey={platform}
                                    name={platform}
                                    stroke={PLATFORM_COLORS[platform]}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill={`url(#color-${platform})`}
                                />
                            );
                        })}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KPICard
                    title="Total Followers"
                    value={data.aggregated.total_followers.current}
                    trend={data.aggregated.total_followers}
                    icon={<Users className="w-3.5 h-3.5" />}
                />
                <KPICard
                    title="Total Views"
                    value={data.aggregated.total_views.current}
                    trend={data.aggregated.total_views}
                    icon={<Eye className="w-3.5 h-3.5" />}
                />
                <KPICard
                    title="Total Engagement"
                    value={data.aggregated.total_engagement.current}
                    trend={data.aggregated.total_engagement}
                    icon={<Heart className="w-3.5 h-3.5" />}
                />
                <KPICard
                    title="Avg. Engagement Rate"
                    value={`${data.aggregated.average_engagement_rate.toFixed(2)}%`}
                    icon={<BarChart3 className="w-3.5 h-3.5" />}
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
                    {/* Time Series Chart - Full Width */}
                    <EngagementTimeSeriesChart data={data} />

                    {/* Platform Comparison Charts */}
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