'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Bell,
    Loader2,
    AlertCircle,
    RefreshCw,
    Zap,
    ChevronRight,
    Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
    META_ADS_CACHE_PREFIX,
    buildMetaAdsCacheKey,
    getCachedData,
    setCachedData,
} from '@/lib/meta-ads-cache';

interface SettingsNotificationsProps {
    onRefresh?: () => void;
    cacheScopeId?: string;
}

interface NotificationRule {
    id: string;
    name: string;
    status: string;
    execution_spec?: {
        execution_type?: string;
    };
}

export default function SettingsNotifications({ onRefresh, cacheScopeId }: SettingsNotificationsProps) {
    const [notifications, setNotifications] = useState<NotificationRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const cacheScope = cacheScopeId || 'default';
    const notificationsCacheKey = useMemo(
        () => buildMetaAdsCacheKey('settings_notifications', cacheScope),
        [cacheScope]
    );

    useEffect(() => {
        const cached = getCachedData<NotificationRule[]>(notificationsCacheKey);
        if (cached) {
            setNotifications(cached);
            setIsLoading(false);
            return;
        }
        fetchNotifications();
    }, [notificationsCacheKey]);

    const fetchNotifications = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/v1/meta-ads/notifications/settings');
            if (response.ok) {
                const data = await response.json();
                const nextNotifications = data.notification_rules || [];
                setNotifications(nextNotifications);
                setCachedData(
                    notificationsCacheKey,
                    nextNotifications,
                    `${META_ADS_CACHE_PREFIX}_settings_${cacheScope}`
                );
            } else {
                setError('Failed to load notifications');
            }
        } catch {
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                        <Bell className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Notifications</h2>
                        <p className="text-xs text-muted-foreground">Alert rules and notification settings</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchNotifications}>
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                        Refresh
                    </Button>
                    <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Create Rule
                    </Button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Notification Rules */}
            <Card className="border-amber-200/50 dark:border-amber-900/30">
                <CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-t-lg">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                                <Zap className="w-3.5 h-3.5" />
                            </div>
                            <span>Notification Rules</span>
                            <span className="ml-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {notifications.length}
                            </span>
                        </CardTitle>
                    </div>
                    <CardDescription className="text-xs mt-1.5">
                        Automation rules configured for real-time alerts
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                    {notifications.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {notifications.map((rule) => (
                                <div
                                    key={rule.id}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md cursor-pointer group",
                                        rule.status === 'ENABLED'
                                            ? 'border-green-200 bg-green-50/50 hover:border-green-300 dark:border-green-800/50 dark:bg-green-950/20'
                                            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/20'
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "p-2 rounded-lg",
                                            rule.status === 'ENABLED'
                                                ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                        )}>
                                            <Bell className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                                {rule.name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full",
                                                    rule.status === 'ENABLED'
                                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                )}>
                                                    <span className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        rule.status === 'ENABLED' ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                                                    )} />
                                                    {rule.status === 'ENABLED' ? 'Active' : 'Paused'}
                                                </span>
                                                {rule.execution_spec?.execution_type && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        • {rule.execution_spec.execution_type}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 px-6 rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/10">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center">
                                <Bell className="w-7 h-7 text-amber-500" />
                            </div>
                            <p className="text-sm font-medium">No notification rules configured</p>
                            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
                                Create automation rules to receive alerts when campaigns hit specific thresholds
                            </p>
                            <Button variant="outline" size="sm" className="mt-4 gap-1.5 border-amber-300 hover:bg-amber-50 text-amber-700">
                                <Zap className="w-3.5 h-3.5" />
                                Create Your First Rule
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
