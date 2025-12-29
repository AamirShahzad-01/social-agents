'use client'

import React, { useMemo, useState } from 'react';
import { Post, Platform, PostStatus } from '@/types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PLATFORMS, STATUS_CONFIG } from '@/constants';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, BarChart3, Activity, Users, Eye, Heart, MessageCircle, Share2, Target, Zap, Award } from 'lucide-react';

interface AnalyticsDashboardProps {
    posts: Post[];
}

// Modern color palette for charts - Excluding Twitter and LinkedIn
const CHART_COLORS = {
    facebook: 'hsl(221, 44%, 41%)',
    instagram: 'hsl(329, 70%, 58%)',
    tiktok: 'hsl(0, 0%, 0%)',
    youtube: 'hsl(0, 100%, 50%)',
    ready_to_publish: 'hsl(271, 91%, 65%)',
    scheduled: 'hsl(217, 91%, 60%)',
    published: 'hsl(142, 76%, 36%)',
    failed: 'hsl(0, 84%, 60%)',
};

/**
 * PRODUCTION NOTE: Platform-specific metrics - API Available Metrics Only
 * 
 * This function generates simulated data. In production, replace with actual API calls.
 * Only includes metrics that are ACTUALLY available from platform APIs:
 * 
 * FACEBOOK (Graph API - Page Insights):
 * - page_fans (followers), page_impressions, page_engaged_users, page_post_engagements
 * - post_impressions, post_clicks, post_reactions_by_type_total
 * 
 * INSTAGRAM (Graph API - Instagram Insights):
 * - follower_count, impressions, reach, profile_views
 * - likes, comments, saves, shares (story only)
 * - video_views (for video posts)
 * 
 * TIKTOK (Business API - Video Analytics):
 * - follower_count, video_views, likes, comments, shares
 * - profile_views, reach (limited)
 * Note: TikTok API has limited metrics compared to others
 * 
 * YOUTUBE (Data API v3 - Channel & Video Statistics):
 * - subscriberCount, viewCount, videoCount, commentCount, likeCount
 * - averageViewDuration, estimatedMinutesWatched
 * Note: YouTube removed dislike counts from API
 */
const generatePlatformMetrics = (platform: Platform, posts: Post[]) => {
    const platformPosts = posts.filter(p => p.platforms.includes(platform));
    const baseEngagement = Math.floor(Math.random() * 5000) + 1000;
    const baseReach = Math.floor(Math.random() * 100000) + 20000;

    // Base metrics available on ALL platforms
    const baseMetrics = {
        followers: Math.floor(Math.random() * 50000) + 10000, // ✅ All platforms
        reach: baseReach, // ✅ All platforms (some limitations on TikTok)
        impressions: Math.floor(Math.random() * 150000) + 30000, // ✅ Facebook, Instagram, YouTube
        engagement: baseEngagement, // ✅ Calculated from likes+comments+shares
        engagementRate: ((baseEngagement / baseReach) * 100).toFixed(2), // ✅ Calculated metric
        likes: Math.floor(Math.random() * 3000) + 500, // ✅ All platforms
        comments: Math.floor(Math.random() * 500) + 50, // ✅ All platforms
        posts: platformPosts.length,
    };

    // Platform-specific metrics based on actual API availability
    switch (platform) {
        case 'facebook':
            return {
                ...baseMetrics,
                shares: Math.floor(Math.random() * 800) + 100, // ✅ Available
                clicks: Math.floor(Math.random() * 2000) + 300, // ✅ Available (post_clicks)
                // Note: Facebook doesn't provide 'saves' metric
            };

        case 'instagram':
            return {
                ...baseMetrics,
                saves: Math.floor(Math.random() * 600) + 80, // ✅ Available
                profileViews: Math.floor(Math.random() * 1000) + 200, // ✅ Available (profile_views)
                videoViews: Math.floor(Math.random() * 50000) + 10000, // ✅ Available for video posts
                // Note: Instagram shares only available for stories
            };

        case 'tiktok':
            return {
                ...baseMetrics,
                shares: Math.floor(Math.random() * 800) + 100, // ✅ Available
                videoViews: Math.floor(Math.random() * 200000) + 50000, // ✅ Available
                profileViews: Math.floor(Math.random() * 1000) + 200, // ✅ Available
                // Note: TikTok has limited analytics compared to others
                // Impressions not reliably available on TikTok
                impressions: 0,
            };

        case 'youtube':
            return {
                ...baseMetrics,
                videoViews: Math.floor(Math.random() * 200000) + 50000, // ✅ Available (viewCount)
                avgWatchTime: `${Math.floor(Math.random() * 3) + 1}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`, // ✅ Available (averageViewDuration)
                subscribers: baseMetrics.followers, // ✅ YouTube uses 'subscribers' instead of 'followers'
                // Note: YouTube removed dislikes from API, shares not available
            };

        default:
            return baseMetrics;
    }
};

const COLORS = [
    'hsl(217, 91%, 60%)',
    'hsl(142, 76%, 36%)',
    'hsl(45, 93%, 47%)',
    'hsl(0, 84%, 60%)',
    'hsl(271, 91%, 65%)',
    'hsl(189, 94%, 43%)',
];


const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ posts }) => {
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

    const stats = useMemo(() => {
        // Return empty stats if no posts (handles empty state after hook call)
        if (!posts || posts.length === 0) {
            return {
                totalPosts: 0,
                platformData: [],
                statusData: [],
                statusCounts: {},
                timelineData: [],
                totalEngagement: 0,
                avgEngagement: 0,
                totalReach: 0,
                totalImpressions: 0,
                totalLikes: 0,
                totalComments: 0,
                totalShares: 0,
                totalClicks: 0,
                platformMetrics: [],
                engagementRateData: [],
                postingTimeData: [],
                contentTypeData: [],
                audienceGrowthData: [],
                platformComparison: [],
                topPosts: [],
            };
        }

        // Filter out Twitter and LinkedIn
        const allowedPlatforms: Platform[] = ['facebook', 'instagram', 'tiktok', 'youtube'];

        const statusCounts = posts.reduce((acc, post) => {
            acc[post.status] = (acc[post.status] || 0) + 1;
            return acc;
        }, {} as { [key in PostStatus]: number });

        const platformCounts = posts.reduce((acc, post) => {
            post.platforms.forEach(platform => {
                if (allowedPlatforms.includes(platform)) {
                    acc[platform] = (acc[platform] || 0) + 1;
                }
            });
            return acc;
        }, {} as { [key in Platform]: number });

        const platformData = Object.entries(platformCounts)
            .filter(([name]) => allowedPlatforms.includes(name as Platform))
            .map(([name, value]) => ({
                name: PLATFORMS.find(p => p.id === name)?.name || name,
                value: Number(value),
                fill: (name in CHART_COLORS ? CHART_COLORS[name as keyof typeof CHART_COLORS] : COLORS[0])
            }))
            .filter(item => item.value > 0);

        const statusData = (Object.keys(STATUS_CONFIG) as PostStatus[])
            .map(status => ({
                name: STATUS_CONFIG[status].label,
                value: statusCounts[status] || 0,
                fill: CHART_COLORS[status] || COLORS[0]
            }))
            .filter(item => item.value > 0);

        // Timeline data - posts created over time with engagement
        const timelineData = posts.reduce((acc, post) => {
            const date = new Date(post.createdAt);
            const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
            const existing = acc.find(item => item.date === monthYear);
            const engagement = post.analytics?.engagement || Math.floor(Math.random() * 500);
            const reach = post.analytics?.reach || Math.floor(Math.random() * 2000);

            if (existing) {
                existing.posts += 1;
                existing.engagement += engagement;
                existing.reach += reach;
            } else {
                acc.push({ date: monthYear, posts: 1, engagement, reach });
            }
            return acc;
        }, [] as { date: string; posts: number; engagement: number; reach: number }[]).slice(-6);

        // Engagement metrics
        const totalEngagement = posts.reduce((sum, post) => sum + (post.analytics?.engagement || Math.floor(Math.random() * 500)), 0);
        const avgEngagement = posts.length > 0 ? Math.round(totalEngagement / posts.length) : 0;
        const totalReach = posts.reduce((sum, post) => sum + (post.analytics?.reach || Math.floor(Math.random() * 2000)), 0);
        const totalImpressions = posts.reduce((sum, post) => sum + (post.analytics?.impressions || Math.floor(Math.random() * 3000)), 0);
        const totalLikes = posts.reduce((sum, post) => sum + (post.analytics?.likes || Math.floor(Math.random() * 200)), 0);
        const totalComments = posts.reduce((sum, post) => sum + (post.analytics?.comments || Math.floor(Math.random() * 50)), 0);
        const totalShares = posts.reduce((sum, post) => sum + (post.analytics?.shares || Math.floor(Math.random() * 80)), 0);
        const totalClicks = posts.reduce((sum, post) => sum + (post.analytics?.clicks || Math.floor(Math.random() * 150)), 0);

        // Platform-specific detailed metrics
        const platformMetrics = allowedPlatforms.map(platform => ({
            platform,
            name: PLATFORMS.find(p => p.id === platform)?.name || platform,
            ...generatePlatformMetrics(platform, posts),
            color: (platform in CHART_COLORS ? CHART_COLORS[platform as keyof typeof CHART_COLORS] : COLORS[0])
        })).filter(item => item.posts > 0);

        // Engagement rate over time
        const engagementRateData = timelineData.map(item => ({
            date: item.date,
            rate: item.reach > 0 ? ((item.engagement / item.reach) * 100).toFixed(2) : 0,
            engagement: item.engagement,
            reach: item.reach
        }));

        // Best posting times (hour of day analysis)
        const postingTimeData = Array.from({ length: 24 }, (_, hour) => {
            const postsAtHour = posts.filter(post => {
                const postHour = new Date(post.createdAt).getHours();
                return postHour === hour;
            });
            const avgEng = postsAtHour.length > 0
                ? postsAtHour.reduce((sum, p) => sum + (p.analytics?.engagement || Math.floor(Math.random() * 500)), 0) / postsAtHour.length
                : 0;

            return {
                hour: `${hour.toString().padStart(2, '0')}:00`,
                posts: postsAtHour.length,
                avgEngagement: Math.round(avgEng),
                fill: avgEng > 300 ? 'hsl(142, 76%, 36%)' : avgEng > 150 ? 'hsl(45, 93%, 47%)' : 'hsl(215, 20%, 65%)'
            };
        }).filter(item => item.posts > 0);

        // Content type performance
        const contentTypeData = [
            { type: 'Image Posts', posts: Math.floor(posts.length * 0.4), engagement: Math.floor(Math.random() * 3000) + 1000, reach: Math.floor(Math.random() * 10000) + 5000 },
            { type: 'Video Posts', posts: Math.floor(posts.length * 0.3), engagement: Math.floor(Math.random() * 5000) + 2000, reach: Math.floor(Math.random() * 15000) + 8000 },
            { type: 'Carousel', posts: Math.floor(posts.length * 0.2), engagement: Math.floor(Math.random() * 4000) + 1500, reach: Math.floor(Math.random() * 12000) + 6000 },
            { type: 'Text Only', posts: Math.floor(posts.length * 0.1), engagement: Math.floor(Math.random() * 2000) + 500, reach: Math.floor(Math.random() * 8000) + 3000 },
        ];

        // Audience growth simulation
        const audienceGrowthData = Array.from({ length: 6 }, (_, i) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (5 - i));
            return {
                month: date.toLocaleString('default', { month: 'short' }),
                facebook: Math.floor(Math.random() * 5000) + 10000 + (i * 1000),
                instagram: Math.floor(Math.random() * 8000) + 15000 + (i * 1500),
                tiktok: Math.floor(Math.random() * 10000) + 20000 + (i * 2000),
                youtube: Math.floor(Math.random() * 3000) + 8000 + (i * 800),
            };
        });

        // Platform comparison radar
        const platformComparison = platformMetrics.map(pm => ({
            platform: pm.name,
            engagement: parseFloat(pm.engagementRate),
            reach: (pm.reach / 1000),
            posts: pm.posts * 10,
            quality: Math.floor(Math.random() * 40) + 60,
        }));

        // Top performing posts
        const topPosts = [...posts]
            .sort((a, b) => (b.analytics?.engagement || 0) - (a.analytics?.engagement || 0))
            .slice(0, 5)
            .map(post => ({
                id: post.id,
                topic: post.topic,
                platforms: post.platforms.filter(p => allowedPlatforms.includes(p)),
                engagement: post.analytics?.engagement || Math.floor(Math.random() * 1000),
                reach: post.analytics?.reach || Math.floor(Math.random() * 5000),
                date: new Date(post.createdAt).toLocaleDateString(),
            }));

        return {
            totalPosts: posts.length,
            platformData,
            statusData,
            statusCounts,
            timelineData,
            totalEngagement,
            avgEngagement,
            totalReach,
            totalImpressions,
            totalLikes,
            totalComments,
            totalShares,
            totalClicks,
            platformMetrics,
            engagementRateData,
            postingTimeData,
            contentTypeData,
            audienceGrowthData,
            platformComparison,
            topPosts,
        };
    }, [posts]);

    const StatCard: React.FC<{
        title: string;
        value: number | string;
        icon: React.ReactNode;
        trend?: number;
        description?: string;
    }> = ({ title, value, icon, trend, description }) => (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {trend !== undefined && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        {trend > 0 ? (
                            <><TrendingUp className="h-3 w-3 text-green-500" /> +{trend}%</>
                        ) : trend < 0 ? (
                            <><TrendingDown className="h-3 w-3 text-red-500" /> {trend}%</>
                        ) : null}
                        {description || 'from last period'}
                    </p>
                )}
            </CardContent>
        </Card>
    );

    const chartConfig = {
        posts: { label: 'Posts', color: 'hsl(217, 91%, 60%)' },
        engagement: { label: 'Engagement', color: 'hsl(142, 76%, 36%)' },
        reach: { label: 'Reach', color: 'hsl(45, 93%, 47%)' },
    };

    return (
        <div className="space-y-6 p-6">
            {/* Production-ready: Handle empty state */}
            {stats.totalPosts === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
                    <BarChart3 className="h-16 w-16 text-muted-foreground/50" />
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-semibold">No Analytics Data Yet</h3>
                        <p className="text-muted-foreground max-w-md">
                            Start creating and publishing content to see your performance metrics and insights here.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Social Media Analytics</h2>
                            <p className="text-muted-foreground mt-1">In-depth performance insights for Facebook, Instagram, TikTok & YouTube</p>

                            <p className="text-muted-foreground mt-1">In-depth performance insights for Facebook, Instagram, TikTok & YouTube</p>
                        </div>
                        <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as '7d' | '30d' | 'all')}>
                            <TabsList>
                                <TabsTrigger value="7d">7 Days</TabsTrigger>
                                <TabsTrigger value="30d">30 Days</TabsTrigger>
                                <TabsTrigger value="all">All Time</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Platform Distribution */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Platform Distribution</CardTitle>
                                <CardDescription>Content distribution across platforms</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.platformData.length > 0 ? (
                                    <ChartContainer config={chartConfig} className="h-[300px]">
                                        <PieChart>
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Pie
                                                data={stats.platformData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={100}
                                                label={(entry) => `${entry.name}: ${entry.value}`}
                                                labelLine={false}
                                            >
                                                {stats.platformData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <ChartLegend content={<ChartLegendContent />} />
                                        </PieChart>
                                    </ChartContainer>
                                ) : (
                                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                        No data available
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Post Status Overview */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Post Status Overview</CardTitle>
                                <CardDescription>Current status of all posts</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.statusData.length > 0 ? (
                                    <ChartContainer config={chartConfig} className="h-[300px]">
                                        <BarChart data={stats.statusData} layout="horizontal" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                stroke="hsl(var(--muted-foreground))"
                                                width={120}
                                                tick={{ fontSize: 12 }}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                                                {stats.statusData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ChartContainer>
                                ) : (
                                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                        No data available
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Engagement Rate Trend & Audience Growth */}
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Engagement Rate Trend</CardTitle>
                                <CardDescription>Engagement percentage over time</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.engagementRateData.length > 0 ? (
                                    <ChartContainer config={chartConfig} className="h-[300px]">
                                        <LineChart data={stats.engagementRateData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis
                                                dataKey="date"
                                                stroke="hsl(var(--muted-foreground))"
                                                tick={{ fontSize: 12 }}
                                            />
                                            <YAxis stroke="hsl(var(--muted-foreground))" />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Line
                                                type="monotone"
                                                dataKey="rate"
                                                stroke="hsl(142, 76%, 36%)"
                                                strokeWidth={3}
                                                dot={{ fill: 'hsl(142, 76%, 36%)', r: 4 }}
                                            />
                                        </LineChart>
                                    </ChartContainer>
                                ) : (
                                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                        No engagement rate data
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Audience Growth</CardTitle>
                                <CardDescription>Follower growth across platforms</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={chartConfig} className="h-[300px]">
                                    <LineChart data={stats.audienceGrowthData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="month"
                                            stroke="hsl(var(--muted-foreground))"
                                            tick={{ fontSize: 12 }}
                                        />
                                        <YAxis stroke="hsl(var(--muted-foreground))" />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <ChartLegend content={<ChartLegendContent />} />
                                        <Line type="monotone" dataKey="facebook" stroke="hsl(221, 44%, 41%)" strokeWidth={2} />
                                        <Line type="monotone" dataKey="instagram" stroke="hsl(329, 70%, 58%)" strokeWidth={2} />
                                        <Line type="monotone" dataKey="tiktok" stroke="hsl(0, 0%, 0%)" strokeWidth={2} />
                                        <Line type="monotone" dataKey="youtube" stroke="hsl(0, 100%, 50%)" strokeWidth={2} />
                                    </LineChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Content Type Performance & Best Posting Times */}
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Content Type Performance</CardTitle>
                                <CardDescription>Engagement by content format</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={chartConfig} className="h-[300px]">
                                    <BarChart data={stats.contentTypeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="type"
                                            stroke="hsl(var(--muted-foreground))"
                                            tick={{ fontSize: 11 }}
                                        />
                                        <YAxis stroke="hsl(var(--muted-foreground))" />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <ChartLegend content={<ChartLegendContent />} />
                                        <Bar dataKey="engagement" fill="hsl(142, 76%, 36%)" radius={[8, 8, 0, 0]} />
                                        <Bar dataKey="reach" fill="hsl(45, 93%, 47%)" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Best Posting Times</CardTitle>
                                <CardDescription>Optimal hours for maximum engagement</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.postingTimeData.length > 0 ? (
                                    <ChartContainer config={chartConfig} className="h-[300px]">
                                        <BarChart data={stats.postingTimeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis
                                                dataKey="hour"
                                                stroke="hsl(var(--muted-foreground))"
                                                tick={{ fontSize: 10 }}
                                            />
                                            <YAxis stroke="hsl(var(--muted-foreground))" />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Bar dataKey="avgEngagement" radius={[8, 8, 0, 0]}>
                                                {stats.postingTimeData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ChartContainer>
                                ) : (
                                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                        No posting time data
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Content Timeline & Platform Comparison */}
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Content Timeline</CardTitle>
                                <CardDescription>Posts, engagement & reach over time</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.timelineData.length > 0 ? (
                                    <ChartContainer config={chartConfig} className="h-[300px]">
                                        <ComposedChart data={stats.timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis
                                                dataKey="date"
                                                stroke="hsl(var(--muted-foreground))"
                                                tick={{ fontSize: 12 }}
                                            />
                                            <YAxis stroke="hsl(var(--muted-foreground))" />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <Bar dataKey="posts" fill="hsl(217, 91%, 60%)" radius={[8, 8, 0, 0]} />
                                            <Line type="monotone" dataKey="engagement" stroke="hsl(142, 76%, 36%)" strokeWidth={2} />
                                            <Line type="monotone" dataKey="reach" stroke="hsl(45, 93%, 47%)" strokeWidth={2} />
                                        </ComposedChart>
                                    </ChartContainer>
                                ) : (
                                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                        No timeline data
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Platform Comparison</CardTitle>
                                <CardDescription>Multi-dimensional performance analysis</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.platformComparison.length > 0 ? (
                                    <ChartContainer config={chartConfig} className="h-[300px]">
                                        <RadarChart data={stats.platformComparison}>
                                            <PolarGrid stroke="hsl(var(--muted))" />
                                            <PolarAngleAxis
                                                dataKey="platform"
                                                stroke="hsl(var(--muted-foreground))"
                                                tick={{ fontSize: 12 }}
                                            />
                                            <PolarRadiusAxis stroke="hsl(var(--muted-foreground))" />
                                            <Radar
                                                name="Engagement"
                                                dataKey="engagement"
                                                stroke="hsl(142, 76%, 36%)"
                                                fill="hsl(142, 76%, 36%)"
                                                fillOpacity={0.6}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                        </RadarChart>
                                    </ChartContainer>
                                ) : (
                                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                        No comparison data
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
};

export default AnalyticsDashboard;