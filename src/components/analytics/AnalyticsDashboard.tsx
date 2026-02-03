/**
 * Analytics Dashboard - Enterprise Buffer-Style UI
 * Clean, minimalist design inspired by Buffer's analytics interface.
 * Optimized with useMemo for chart data transformations.
 * Uses real API data via useAnalytics hooks.
 */
'use client';

import React, { useState, useMemo } from 'react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    ResponsiveContainer, Tooltip, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    TrendingUp, TrendingDown, Minus, Users, Eye, Heart,
    RefreshCw, Calendar, Facebook, Instagram, Youtube,
    PlayCircle, AlertCircle, BarChart3, ExternalLink, PieChart as PieChartIcon
} from 'lucide-react';
import { useAnalyticsDashboard } from '@/hooks/useAnalytics';
import {
    Platform, DatePreset, PlatformSummary, TopPerformingPost,
    MetricTrend, DATE_PRESET_OPTIONS, PLATFORM_CONFIGS,
    UnifiedDashboardData
} from '@/types/analytics';
import { useAuth } from '@/contexts/AuthContext';

// =============================================================================
// CONSTANTS - Buffer Brand Colors
// =============================================================================

const PLATFORM_COLORS: Record<Platform, string> = {
    facebook: '#1877F2',
    instagram: '#FF6B9D',
    youtube: '#FF0000',
    tiktok: '#25F4EE',
};

// Buffer-inspired gradient colors
const CHART_GRADIENTS = {
    facebook: { start: '#1877F2', end: '#4A9FF5' },
    instagram: { start: '#FF6B9D', end: '#FFADC6' },
    youtube: { start: '#FF0000', end: '#FF4444' },
    tiktok: { start: '#25F4EE', end: '#FE2C55' },
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground">
                <Minus className="w-3 h-3" />
                0%
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isUp
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
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
    <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/30">
                    <CardContent className="p-5">
                        <Skeleton className="h-4 w-24 mb-3" />
                        <Skeleton className="h-8 w-28 mb-2" />
                        <Skeleton className="h-4 w-16" />
                    </CardContent>
                </Card>
            ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card/50 backdrop-blur-sm border-border/30">
                <CardContent className="p-6">
                    <Skeleton className="h-[320px] w-full rounded-lg" />
                </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur-sm border-border/30">
                <CardContent className="p-6">
                    <Skeleton className="h-[320px] w-full rounded-lg" />
                </CardContent>
            </Card>
        </div>
    </div>
);

// =============================================================================
// KPI CARDS - Buffer Enterprise Style
// =============================================================================

interface KPICardProps {
    title: string;
    value: number | string;
    trend?: MetricTrend;
    icon: React.ReactNode;
    subtitle?: string;
    accentColor?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, trend, icon, subtitle, accentColor }) => (
    <Card className="group bg-card/60 backdrop-blur-sm border-border/40 hover:border-border/60 hover:shadow-sm transition-all duration-300 overflow-hidden">
        <CardContent className="px-3 py-2 relative">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {title}
                </span>
                <span className="text-muted-foreground/40 [&>svg]:w-3 [&>svg]:h-3">
                    {icon}
                </span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold">
                    {typeof value === 'number' ? formatNumber(value) : value}
                </span>
                {trend && <TrendBadge trend={trend} />}
                {subtitle && (
                    <span className="text-[9px] text-muted-foreground ml-auto">{subtitle}</span>
                )}
            </div>
            {/* Accent line - bottom */}
            <div
                className="absolute bottom-0 left-0 w-full h-0.5 opacity-80"
                style={{ background: accentColor || 'hsl(var(--primary))' }}
            />
        </CardContent>
    </Card>
);

// =============================================================================
// TIME SERIES CHART - Buffer Style with Memoization
// =============================================================================

interface TimeSeriesChartProps {
    data: UnifiedDashboardData;
}

const EngagementTimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data }) => {
    const ALLOWED_PLATFORMS = ['facebook', 'instagram', 'youtube'] as const;

    // OPTIMIZED: Memoized chart data transformation
    const chartData = useMemo(() => {
        const timeSeriesMap: Record<string, { date: string; originalDate: string } & Partial<Record<typeof ALLOWED_PLATFORMS[number], number>>> = {};

        ALLOWED_PLATFORMS.forEach(platform => {
            const platformData = data[platform];
            if (platformData?.time_series) {
                platformData.time_series.forEach((point) => {
                    if (!timeSeriesMap[point.date]) {
                        timeSeriesMap[point.date] = {
                            date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            originalDate: point.date
                        };
                    }
                    timeSeriesMap[point.date][platform] = point.value;
                });
            }
        });

        // Sort by date and return
        return Object.values(timeSeriesMap)
            .sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime());
    }, [data.facebook?.time_series, data.instagram?.time_series, data.youtube?.time_series]);

    // Check if we have any data
    const hasData = useMemo(() =>
        ALLOWED_PLATFORMS.some(platform => chartData.some(d => d[platform] !== undefined)),
        [chartData]
    );

    if (chartData.length === 0 || !hasData) {
        return (
            <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-orange-500 to-rose-500" />
                        <div>
                            <CardTitle className="text-lg font-semibold">Reach Over Time</CardTitle>
                            <CardDescription>Daily reach trends across platforms</CardDescription>
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
        <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-orange-500 to-rose-500" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Reach Over Time</CardTitle>
                        <CardDescription>Daily reach across all platforms</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            {ALLOWED_PLATFORMS.map(platform => (
                                <linearGradient key={`gradient-${platform}`} id={`area-gradient-${platform}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PLATFORM_COLORS[platform]} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={PLATFORM_COLORS[platform]} stopOpacity={0.02} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.15} />
                        <XAxis
                            dataKey="date"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
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
                            formatter={(value) => [formatNumber(value as number), '']}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                padding: '12px 16px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '8px' }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '16px' }}
                            formatter={(value) => (
                                <span className="text-sm font-medium text-muted-foreground ml-1 capitalize">
                                    {value}
                                </span>
                            )}
                            iconType="circle"
                            iconSize={8}
                        />
                        {ALLOWED_PLATFORMS.map(platform => {
                            const hasPlatformData = chartData.some(d => d[platform] !== undefined);
                            if (!hasPlatformData) return null;

                            return (
                                <Area
                                    key={platform}
                                    type="monotone"
                                    dataKey={platform}
                                    name={platform}
                                    stroke={PLATFORM_COLORS[platform]}
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill={`url(#area-gradient-${platform})`}
                                    animationDuration={800}
                                    animationEasing="ease-out"
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
// VIEWS BAR CHART - Buffer Style with Memoization
// =============================================================================

interface ViewsChartProps {
    platforms: Record<Platform, PlatformSummary>;
}

const ViewsChart: React.FC<ViewsChartProps> = ({ platforms }) => {
    // OPTIMIZED: Memoized chart data
    const chartData = useMemo(() => {
        return Object.entries(platforms)
            .filter(([_, summary]) => summary.connected)
            .map(([platform, summary]) => ({
                name: PLATFORM_CONFIGS.find(p => p.id === platform)?.name || platform,
                platform: platform as Platform,
                views: summary.views.current,
                fill: PLATFORM_COLORS[platform as Platform],
            }))
            .sort((a, b) => b.views - a.views);
    }, [platforms]);

    if (chartData.length === 0) {
        return (
            <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-purple-600" />
                        <div>
                            <CardTitle className="text-lg font-semibold">Views by Platform</CardTitle>
                            <CardDescription>Total views across connected platforms</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-2 flex items-center justify-center h-[320px]">
                    <p className="text-muted-foreground text-sm">No platforms connected</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-purple-600" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Views by Platform</CardTitle>
                        <CardDescription>Total views across connected platforms</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barCategoryGap="25%">
                        <defs>
                            {chartData.map((item) => (
                                <linearGradient key={`bar-gradient-${item.platform}`} id={`bar-gradient-${item.platform}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={item.fill} stopOpacity={0.95} />
                                    <stop offset="100%" stopColor={item.fill} stopOpacity={0.65} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.15} vertical={false} />
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
                            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2, radius: 8 }}
                            formatter={(value) => [formatNumber(value as number), 'Views']}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                padding: '12px 16px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '8px' }}
                        />
                        <Bar
                            dataKey="views"
                            name="Views"
                            radius={[10, 10, 0, 0]}
                            maxBarSize={70}
                            animationDuration={800}
                            animationEasing="ease-out"
                        >
                            {chartData.map((entry) => (
                                <Cell key={`cell-${entry.platform}`} fill={`url(#bar-gradient-${entry.platform})`} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                {/* Platform legend with values */}
                <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-border/30">
                    {chartData.map((item) => (
                        <div key={item.platform} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: item.fill }}
                            />
                            <span className="text-xs text-muted-foreground">
                                {item.name}: <span className="font-semibold text-foreground">{formatNumber(item.views)}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

// =============================================================================
// ENGAGEMENT DISTRIBUTION CHART - Donut Style
// =============================================================================

interface EngagementDistributionChartProps {
    data: UnifiedDashboardData;
}

const EngagementDistributionChart: React.FC<EngagementDistributionChartProps> = ({ data }) => {
    // OPTIMIZED: Memoized engagement data
    const engagementData = useMemo(() => {
        return Object.entries(data.platforms)
            .filter(([_, summary]) => summary.connected && summary.engagement.current > 0)
            .map(([platform, summary]) => ({
                name: PLATFORM_CONFIGS.find(p => p.id === platform)?.name || platform,
                value: summary.engagement.current,
                fill: PLATFORM_COLORS[platform as Platform],
            }));
    }, [data.platforms]);

    const totalEngagement = useMemo(() =>
        engagementData.reduce((sum, item) => sum + item.value, 0),
        [engagementData]
    );

    if (engagementData.length === 0) {
        return (
            <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-rose-500 to-orange-500" />
                        <div>
                            <CardTitle className="text-lg font-semibold">Engagement Distribution</CardTitle>
                            <CardDescription>Engagement share by platform</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-2 flex items-center justify-center h-[350px]">
                    <p className="text-muted-foreground text-sm">No engagement data available</p>
                </CardContent>
            </Card>
        );
    }

    const RADIAN = Math.PI / 180;
    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
        if (percent < 0.05) return null;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        return (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-rose-500 to-orange-500" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Engagement Distribution</CardTitle>
                        <CardDescription>Total: {formatNumber(totalEngagement)} interactions</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                        <Pie
                            data={engagementData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={130}
                            paddingAngle={3}
                            labelLine={false}
                            label={renderCustomizedLabel}
                            animationDuration={800}
                            animationEasing="ease-out"
                        >
                            {engagementData.map((entry, index) => (
                                <Cell key={index} fill={entry.fill} stroke="none" />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value) => [formatNumber(value as number), 'Engagement']}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                            }}
                        />
                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            iconSize={10}
                            formatter={(value) => (
                                <span className="text-sm text-muted-foreground ml-1">{value}</span>
                            )}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

// =============================================================================
// TOP POSTS TABLE - Buffer Style
// =============================================================================

interface TopPostsTableProps {
    posts: TopPerformingPost[];
}

const TopPostsTable: React.FC<TopPostsTableProps> = ({ posts }) => {
    // Group posts by platform and get top 3 for each
    const postsByPlatform = useMemo(() => {
        const grouped: Record<Platform, TopPerformingPost[]> = {
            facebook: [],
            instagram: [],
            youtube: [],
            tiktok: [],
        };

        posts.forEach(post => {
            if (grouped[post.platform].length < 3) {
                grouped[post.platform].push(post);
            }
        });

        return grouped;
    }, [posts]);

    const platformsWithPosts = Object.entries(postsByPlatform)
        .filter(([_, platformPosts]) => platformPosts.length > 0) as [Platform, TopPerformingPost[]][];

    if (platformsWithPosts.length === 0) return null;

    return (
        <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500" />
                    <div>
                        <CardTitle className="text-lg font-semibold">Top Performing Posts</CardTitle>
                        <CardDescription>Top 3 posts per platform</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {platformsWithPosts.map(([platform, platformPosts]) => (
                    <div key={platform}>
                        {/* Platform Header */}
                        <div
                            className="flex items-center gap-2 px-6 py-3 border-b border-border/30"
                            style={{ backgroundColor: `${PLATFORM_COLORS[platform]}08` }}
                        >
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: `${PLATFORM_COLORS[platform]}20` }}
                            >
                                <PlatformIcon platform={platform} className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-sm font-semibold capitalize">{platform}</span>
                            <span className="text-xs text-muted-foreground">({platformPosts.length} posts)</span>
                        </div>

                        {/* Posts for this platform */}
                        <div className="divide-y divide-border/20">
                            {platformPosts.map((post, index) => (
                                <div
                                    key={post.post_id}
                                    className="flex items-center gap-4 px-6 py-3 hover:bg-muted/20 transition-colors"
                                >
                                    {/* Rank Badge */}
                                    <div className={`
                                        flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
                                        ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' :
                                            index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white' :
                                                'bg-gradient-to-br from-orange-400 to-orange-600 text-white'}
                                    `}>
                                        {index + 1}
                                    </div>

                                    {/* Thumbnail */}
                                    {post.thumbnail_url ? (
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-muted shadow-sm">
                                            <img
                                                src={post.thumbnail_url}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center shadow-sm"
                                            style={{ backgroundColor: `${PLATFORM_COLORS[post.platform]}15` }}
                                        >
                                            <PlatformIcon platform={post.platform} className="w-4 h-4" />
                                        </div>
                                    )}

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(post.created_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </span>
                                        <p className="text-sm truncate font-medium">
                                            {post.content_preview || 'No caption'}
                                        </p>
                                    </div>

                                    {/* Metrics */}
                                    <div className="hidden md:flex items-center gap-3 text-sm">
                                        <div className="text-center min-w-[50px]">
                                            <div className="font-bold text-foreground">{formatNumber(post.views)}</div>
                                            <div className="text-[10px] text-muted-foreground">Views</div>
                                        </div>
                                        <div className="text-center min-w-[50px]">
                                            <div className="font-bold text-foreground">{formatNumber(post.total_engagement || (post.likes + post.comments + post.shares + (post.saves || 0)))}</div>
                                            <div className="text-[10px] text-muted-foreground">Engage</div>
                                        </div>
                                        <div className="text-center min-w-[50px]">
                                            <div className="font-bold text-emerald-600 dark:text-emerald-400">{post.engagement_rate.toFixed(1)}%</div>
                                            <div className="text-[10px] text-muted-foreground">Rate</div>
                                        </div>
                                    </div>

                                    {/* Link */}
                                    {post.post_url && (
                                        <Button variant="ghost" size="icon" asChild className="flex-shrink-0 h-8 w-8 hover:bg-muted/50">
                                            <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
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
        <Card className="bg-card/60 backdrop-blur-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                        style={{ backgroundColor: `${PLATFORM_COLORS[platform]}15` }}
                    >
                        <PlatformIcon platform={platform} className="w-6 h-6" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-semibold">{config?.name}</CardTitle>
                        <CardDescription>{summary.posts_count} posts in period</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Followers</p>
                        <p className="text-2xl font-bold">{formatNumber(summary.followers.current)}</p>
                        <TrendBadge trend={summary.followers} />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Views</p>
                        <p className="text-2xl font-bold">{formatNumber(summary.views.current)}</p>
                        <TrendBadge trend={summary.views} />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Engagement</p>
                        <p className="text-2xl font-bold">{formatNumber(summary.engagement.current)}</p>
                        <TrendBadge trend={summary.engagement} />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Eng. Rate</p>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.engagement_rate.toFixed(2)}%</p>
                    </div>
                </div>
                {summary.error && (
                    <Alert variant="destructive" className="mt-6">
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
            {/* Header with Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
                        <p className="text-sm text-muted-foreground">
                            Track your performance across all channels
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <TabsList className="bg-card/60 border border-border/40 shadow-sm">
                            <TabsTrigger value="overview" className="gap-1.5 text-xs px-3">
                                <BarChart3 className="w-3.5 h-3.5" />
                                Overview
                            </TabsTrigger>
                            {connectedPlatforms.map(([platform]) => (
                                <TabsTrigger key={platform} value={platform} className="gap-1.5 text-xs px-3">
                                    <PlatformIcon platform={platform as Platform} className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">
                                        {PLATFORM_CONFIGS.find(p => p.id === platform)?.name}
                                    </span>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                            <SelectTrigger className="w-[130px] bg-card/60 border-border/50 shadow-sm text-xs">
                                <Calendar className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
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
                            className="bg-card/60 border-border/50 shadow-sm hover:bg-card h-8 w-8"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <KPICard
                        title="Total Followers"
                        value={data.aggregated.total_followers.current}
                        trend={data.aggregated.total_followers}
                        icon={<Users className="w-4 h-4" />}
                        accentColor="#3B82F6"
                    />
                    <KPICard
                        title="Total Views"
                        value={data.aggregated.total_views.current}
                        trend={data.aggregated.total_views}
                        icon={<Eye className="w-4 h-4" />}
                        accentColor="#8B5CF6"
                    />
                    <KPICard
                        title="Total Engagement"
                        value={data.aggregated.total_engagement.current}
                        trend={data.aggregated.total_engagement}
                        icon={<Heart className="w-4 h-4" />}
                        accentColor="#EC4899"
                    />
                    <KPICard
                        title="Avg. Engagement Rate"
                        value={`${data.aggregated.average_engagement_rate.toFixed(2)}%`}
                        icon={<BarChart3 className="w-4 h-4" />}
                        subtitle={`${data.aggregated.platforms_connected} channels`}
                        accentColor="#10B981"
                    />
                </div>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-6 space-y-6">
                    {/* Row 1: Reach Over Time - Full Width */}
                    <EngagementTimeSeriesChart data={data} />

                    {/* Row 2: Views by Platform + Engagement Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ViewsChart platforms={data.platforms} />
                        <EngagementDistributionChart data={data} />
                    </div>

                    {/* Row 3: Top Performing Posts */}
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
            <p className="text-xs text-center text-muted-foreground pt-4">
                Last updated: {data.generated_at ? new Date(data.generated_at).toLocaleString() : 'N/A'}
            </p>
        </div>
    );
};

export default AnalyticsDashboard;