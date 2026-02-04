'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
    BarChart3,
    Users,
    MapPin,
    Smartphone,
    Monitor,
    TrendingUp,
    TrendingDown,
    RefreshCw,
    Loader2,
    PieChart,
    AlertCircle,
    Facebook,
    Grid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
    META_ADS_CACHE_PREFIX,
    buildMetaAdsCacheKey,
    getCachedData,
    setCachedData,
} from '@/lib/meta-ads-cache';

// Breakdown types
const BREAKDOWN_TYPES = [
    { value: 'age', label: 'Age', icon: Users, description: 'Performance by age group' },
    { value: 'gender', label: 'Gender', icon: Users, description: 'Performance by gender' },
    { value: 'age,gender', label: 'Age & Gender', icon: Users, description: 'Combined breakdown' },
    { value: 'country', label: 'Country', icon: MapPin, description: 'Performance by country' },
    { value: 'publisher_platform', label: 'Platform', icon: Facebook, description: 'Facebook, Instagram, etc.' },
    { value: 'platform_position', label: 'Placement', icon: Grid, description: 'Feed, Stories, Reels' },
    { value: 'device_platform', label: 'Device', icon: Smartphone, description: 'Mobile vs Desktop' },
];

const DATE_PRESETS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7d', label: 'Last 7 Days' },
    { value: 'last_14d', label: 'Last 14 Days' },
    { value: 'last_30d', label: 'Last 30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
];

interface BreakdownData {
    // Breakdown dimension values
    age?: string;
    gender?: string;
    country?: string;
    publisher_platform?: string;
    platform_position?: string;
    device_platform?: string;
    impression_device?: string;
    // Metrics
    impressions?: string | number;
    reach?: string | number;
    clicks?: string | number;
    spend?: string | number;
    cpc?: string | number;
    cpm?: string | number;
    ctr?: string | number;
    actions?: Array<{ action_type: string; value: string }>;
    conversions?: number;
}

interface AnalyticsBreakdownProps {
    campaignId?: string;
    onRefresh?: () => void;
    cacheScopeId?: string;
}

export default function AnalyticsBreakdown({ campaignId, onRefresh, cacheScopeId }: AnalyticsBreakdownProps) {
    const [breakdownType, setBreakdownType] = useState<string>('age');
    const [datePreset, setDatePreset] = useState<string>('last_7d');
    const [level, setLevel] = useState<string>('account');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [breakdowns, setBreakdowns] = useState<BreakdownData[]>([]);
    const cacheScope = cacheScopeId || 'default';
    const breakdownCacheKey = useMemo(
        () => buildMetaAdsCacheKey(
            'breakdown',
            cacheScope,
            breakdownType,
            datePreset,
            campaignId || level
        ),
        [cacheScope, breakdownType, datePreset, campaignId, level]
    );

    // Fetch breakdown data
    const fetchBreakdown = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const endpoint = campaignId
                ? `/api/v1/meta-ads/insights/${campaignId}/breakdown`
                : `/api/v1/meta-ads/analytics/breakdown`;

            const params = new URLSearchParams({
                breakdown: breakdownType,
                date_preset: datePreset,
                ...(campaignId ? {} : { level }),
            });

            const response = await fetch(`${endpoint}?${params}`);

            if (response.ok) {
                const data = await response.json();
                const nextBreakdowns = data.breakdowns || [];
                setBreakdowns(nextBreakdowns);
                setCachedData(
                    breakdownCacheKey,
                    { breakdowns: nextBreakdowns },
                    `${META_ADS_CACHE_PREFIX}_breakdown_${cacheScope}`
                );
            } else {
                const errorData = await response.json();
                setError(errorData.detail || 'Failed to fetch breakdown data');
                setBreakdowns([]);
            }
        } catch (err) {
            setError('Network error fetching breakdown data');
            setBreakdowns([]);
        } finally {
            setLoading(false);
        }
    }, [breakdownCacheKey, breakdownType, cacheScope, datePreset, level, campaignId]);

    // Fetch on mount and when params change
    useEffect(() => {
        const cached = getCachedData<{ breakdowns: BreakdownData[] }>(breakdownCacheKey);
        if (cached) {
            setBreakdowns(cached.breakdowns || []);
            setLoading(false);
            setError(null);
            return;
        }
        fetchBreakdown();
    }, [breakdownCacheKey, fetchBreakdown]);

    // Get dimension label for display
    const getDimensionLabel = (data: BreakdownData): string => {
        if (breakdownType === 'age') return data.age || 'Unknown';
        if (breakdownType === 'gender') return formatGender(data.gender);
        if (breakdownType === 'age,gender') return `${data.age || 'N/A'} - ${formatGender(data.gender)}`;
        if (breakdownType === 'country') return data.country || 'Unknown';
        if (breakdownType === 'publisher_platform') return formatPlatform(data.publisher_platform);
        if (breakdownType === 'platform_position') return formatPlacement(data.platform_position);
        if (breakdownType === 'device_platform') return formatDevice(data.device_platform || data.impression_device);
        return 'Unknown';
    };

    // Calculate totals
    const totals = breakdowns.reduce<{ spend: number; impressions: number; clicks: number; reach: number }>((acc, b) => ({
        spend: acc.spend + parseFloat(String(b.spend || 0)),
        impressions: acc.impressions + parseInt(String(b.impressions || 0)),
        clicks: acc.clicks + parseInt(String(b.clicks || 0)),
        reach: acc.reach + parseInt(String(b.reach || 0)),
    }), { spend: 0, impressions: 0, clicks: 0, reach: 0 });

    // Sort by spend
    const sortedBreakdowns = [...breakdowns].sort((a, b) =>
        parseFloat(String(b.spend || 0)) - parseFloat(String(a.spend || 0))
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <PieChart className="w-5 h-5 text-primary" />
                            Performance Breakdown
                        </CardTitle>
                        <CardDescription>
                            Analyze performance by demographics, placements, and devices
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={breakdownType} onValueChange={setBreakdownType}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Breakdown" />
                            </SelectTrigger>
                            <SelectContent>
                                {BREAKDOWN_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                        <div className="flex items-center gap-2">
                                            <type.icon className="w-4 h-4" />
                                            {type.label}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={datePreset} onValueChange={setDatePreset}>
                            <SelectTrigger className="w-[130px]">
                                <SelectValue placeholder="Date" />
                            </SelectTrigger>
                            <SelectContent>
                                {DATE_PRESETS.map((preset) => (
                                    <SelectItem key={preset.value} value={preset.value}>
                                        {preset.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                                fetchBreakdown();
                                onRefresh?.();
                            }}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* Error State */}
                {error && (
                    <div className="flex items-center gap-2 p-4 mb-4 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 border border-red-200 dark:border-red-900">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                            <p className="text-sm text-muted-foreground">Loading breakdown data...</p>
                        </div>
                    </div>
                )}

                {/* Data Display */}
                {!loading && !error && (
                    <Tabs defaultValue="table" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="table">
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Table
                            </TabsTrigger>
                            <TabsTrigger value="chart">
                                <PieChart className="w-4 h-4 mr-2" />
                                Chart
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="table">
                            {breakdowns.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <PieChart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                                    <p className="font-medium">No breakdown data available</p>
                                    <p className="text-sm">Try a different date range or breakdown type</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b bg-muted/50">
                                                <th className="text-left p-3 font-medium text-muted-foreground">
                                                    {BREAKDOWN_TYPES.find(t => t.value === breakdownType)?.label || 'Dimension'}
                                                </th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">Spend</th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">% of Total</th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">Impressions</th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">Clicks</th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">CTR</th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">CPC</th>
                                                <th className="text-right p-3 font-medium text-muted-foreground">CPM</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedBreakdowns.map((b, index) => {
                                                const spend = parseFloat(String(b.spend || 0));
                                                const impressions = parseInt(String(b.impressions || 0));
                                                const clicks = parseInt(String(b.clicks || 0));
                                                const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                                                const cpc = clicks > 0 ? spend / clicks : 0;
                                                const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
                                                const spendPercent = totals.spend > 0 ? (spend / totals.spend) * 100 : 0;

                                                return (
                                                    <tr key={index} className="border-b hover:bg-muted/30 transition-colors">
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2">
                                                                {getBreakdownIcon(breakdownType, b)}
                                                                <span className="font-medium">{getDimensionLabel(b)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-medium">
                                                            ${spend.toFixed(2)}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-primary rounded-full"
                                                                        style={{ width: `${Math.min(spendPercent, 100)}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-sm">{spendPercent.toFixed(1)}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right">{formatNumber(impressions)}</td>
                                                        <td className="p-3 text-right">{formatNumber(clicks)}</td>
                                                        <td className="p-3 text-right">
                                                            <span className={cn(
                                                                "font-medium",
                                                                ctr > 2 ? "text-green-600" : ctr < 1 ? "text-red-500" : ""
                                                            )}>
                                                                {ctr.toFixed(2)}%
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right">${cpc.toFixed(2)}</td>
                                                        <td className="p-3 text-right">${cpm.toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-muted/50 font-semibold">
                                                <td className="p-3">Total</td>
                                                <td className="p-3 text-right">${totals.spend.toFixed(2)}</td>
                                                <td className="p-3 text-right">100%</td>
                                                <td className="p-3 text-right">{formatNumber(totals.impressions)}</td>
                                                <td className="p-3 text-right">{formatNumber(totals.clicks)}</td>
                                                <td className="p-3 text-right">
                                                    {totals.impressions > 0
                                                        ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
                                                        : '0.00'}%
                                                </td>
                                                <td className="p-3 text-right">
                                                    ${totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(2) : '0.00'}
                                                </td>
                                                <td className="p-3 text-right">
                                                    ${totals.impressions > 0
                                                        ? ((totals.spend / totals.impressions) * 1000).toFixed(2)
                                                        : '0.00'}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="chart">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Spend Distribution */}
                                <Card className="bg-muted/30">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Spend Distribution</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {sortedBreakdowns.slice(0, 6).map((b, index) => {
                                                const spend = parseFloat(String(b.spend || 0));
                                                const spendPercent = totals.spend > 0 ? (spend / totals.spend) * 100 : 0;

                                                return (
                                                    <div key={index} className="space-y-1">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-medium">{getDimensionLabel(b)}</span>
                                                            <span>${spend.toFixed(2)} ({spendPercent.toFixed(1)}%)</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full transition-all",
                                                                    getBarColor(index)
                                                                )}
                                                                style={{ width: `${Math.min(spendPercent, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* CTR Comparison */}
                                <Card className="bg-muted/30">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">CTR by {BREAKDOWN_TYPES.find(t => t.value === breakdownType)?.label}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {[...sortedBreakdowns]
                                                .sort((a, b) => {
                                                    const ctrA = parseInt(String(a.impressions || 0)) > 0
                                                        ? (parseInt(String(a.clicks || 0)) / parseInt(String(a.impressions || 0))) * 100
                                                        : 0;
                                                    const ctrB = parseInt(String(b.impressions || 0)) > 0
                                                        ? (parseInt(String(b.clicks || 0)) / parseInt(String(b.impressions || 0))) * 100
                                                        : 0;
                                                    return ctrB - ctrA;
                                                })
                                                .slice(0, 6)
                                                .map((b, index) => {
                                                    const impressions = parseInt(String(b.impressions || 0));
                                                    const clicks = parseInt(String(b.clicks || 0));
                                                    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                                                    const maxCtr = 5; // Scale to 5% max for visualization
                                                    const barWidth = (ctr / maxCtr) * 100;

                                                    return (
                                                        <div key={index} className="space-y-1">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="font-medium">{getDimensionLabel(b)}</span>
                                                                <span className={cn(
                                                                    ctr > 2 ? "text-green-600" : ctr < 1 ? "text-red-500" : ""
                                                                )}>
                                                                    {ctr.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        "h-full rounded-full transition-all",
                                                                        ctr > 2 ? "bg-green-500" : ctr < 1 ? "bg-red-400" : "bg-yellow-500"
                                                                    )}
                                                                    style={{ width: `${Math.min(barWidth, 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}

// Helper functions
function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

function formatGender(gender: string | undefined): string {
    if (!gender) return 'Unknown';
    if (gender === 'male' || gender === '1') return 'Male';
    if (gender === 'female' || gender === '2') return 'Female';
    return 'Unknown';
}

function formatPlatform(platform: string | undefined): string {
    if (!platform) return 'Unknown';
    const platforms: Record<string, string> = {
        facebook: 'Facebook',
        instagram: 'Instagram',
        messenger: 'Messenger',
        audience_network: 'Audience Network',
    };
    return platforms[platform.toLowerCase()] || platform;
}

function formatPlacement(placement: string | undefined): string {
    if (!placement) return 'Unknown';
    const placements: Record<string, string> = {
        feed: 'Feed',
        story: 'Stories',
        reels: 'Reels',
        search: 'Search',
        marketplace: 'Marketplace',
        video_feeds: 'Video Feeds',
        right_hand_column: 'Right Column',
        instant_article: 'Instant Articles',
        instream_video: 'In-Stream Video',
        rewarded_video: 'Rewarded Video',
        explore: 'Explore',
        explore_home: 'Explore Home',
    };
    return placements[placement.toLowerCase()] || placement;
}

function formatDevice(device: string | undefined): string {
    if (!device) return 'Unknown';
    const devices: Record<string, string> = {
        mobile: 'Mobile',
        desktop: 'Desktop',
        tablet: 'Tablet',
        mobile_web: 'Mobile Web',
        mobile_app: 'Mobile App',
    };
    return devices[device.toLowerCase()] || device;
}

function getBreakdownIcon(type: string, data: BreakdownData): React.ReactNode {
    const className = "w-4 h-4 text-muted-foreground";

    if (type === 'device_platform') {
        const device = data.device_platform || data.impression_device || '';
        return device.toLowerCase().includes('mobile')
            ? <Smartphone className={className} />
            : <Monitor className={className} />;
    }
    if (type === 'publisher_platform') {
        return <Facebook className={className} />;
    }
    if (type === 'country') {
        return <MapPin className={className} />;
    }
    if (type.includes('age') || type.includes('gender')) {
        return <Users className={className} />;
    }
    return <Grid className={className} />;
}

function getBarColor(index: number): string {
    const colors = [
        'bg-blue-500',
        'bg-purple-500',
        'bg-green-500',
        'bg-orange-500',
        'bg-pink-500',
        'bg-cyan-500',
    ];
    return colors[index % colors.length];
}
