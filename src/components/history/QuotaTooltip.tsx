'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { Platform } from '@/types';
import { rateLimits, PlatformQuota } from '@/lib/python-backend/api';
import { AlertCircle, TrendingUp, Clock } from 'lucide-react';

interface QuotaTooltipProps {
    platform: Platform;
    workspaceId: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Tooltip that shows platform quota status on hover.
 * Wraps publish buttons to inform users of remaining daily posts.
 */
export function QuotaTooltip({ platform, workspaceId, children, className = '' }: QuotaTooltipProps) {
    const [quota, setQuota] = useState<PlatformQuota | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch quota on hover (with debounce)
    const fetchQuota = useCallback(async () => {
        if (!workspaceId) return;

        setIsLoading(true);
        try {
            const result = await rateLimits.getPlatformQuota(platform, workspaceId);
            setQuota({
                used: result.used,
                limit: result.limit,
                remaining: result.remaining,
                percentage: result.percentage,
                isExceeded: result.isExceeded,
                isWarning: result.isWarning,
                isCritical: result.isCritical,
                resetsAt: result.resetsAt,
                description: result.description,
            });
        } catch (error) {
            console.error('Failed to fetch quota:', error);
        } finally {
            setIsLoading(false);
        }
    }, [platform, workspaceId]);

    useEffect(() => {
        if (isHovering && !quota) {
            fetchQuota();
        }
    }, [isHovering, quota, fetchQuota]);

    // Quota status color
    const getStatusColor = () => {
        if (!quota) return 'bg-muted';
        if (quota.isExceeded || quota.isCritical) return 'bg-red-500';
        if (quota.isWarning) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    // Progress bar width
    const getProgressWidth = () => {
        if (!quota) return '0%';
        return `${Math.min(quota.percentage, 100)}%`;
    };

    // Time until reset
    const getResetTime = () => {
        if (!quota?.resetsAt) return '';
        const resetTime = new Date(quota.resetsAt);
        const now = new Date();
        const diffMs = resetTime.getTime() - now.getTime();

        if (diffMs <= 0) return 'Resetting soon';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    return (
        <div
            className={`relative inline-block ${className}`}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {children}

            {/* Tooltip */}
            {isHovering && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="bg-popover border border-border rounded-lg shadow-xl p-2.5 min-w-[180px]">
                        {/* Arrow */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-popover border-r border-b border-border rotate-45" />

                        {isLoading ? (
                            <div className="flex items-center justify-center py-2">
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : quota ? (
                            <div className="space-y-2">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground capitalize">{platform}</span>
                                    {quota.isExceeded && (
                                        <span className="text-[9px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded font-medium">
                                            LIMIT REACHED
                                        </span>
                                    )}
                                    {quota.isWarning && !quota.isExceeded && (
                                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded font-medium">
                                            80%+
                                        </span>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${getStatusColor()} transition-all duration-300`}
                                        style={{ width: getProgressWidth() }}
                                    />
                                </div>

                                {/* Stats */}
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground">
                                        <TrendingUp className="w-3 h-3 inline mr-0.5" />
                                        {quota.used}/{quota.limit} posts
                                    </span>
                                    <span className={quota.remaining > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                        {quota.remaining} left
                                    </span>
                                </div>

                                {/* Reset Time */}
                                <div className="flex items-center text-[9px] text-muted-foreground pt-1 border-t border-border">
                                    <Clock className="w-2.5 h-2.5 mr-1" />
                                    Resets in {getResetTime()}
                                </div>

                                {/* Warning Message */}
                                {quota.isExceeded && (
                                    <div className="flex items-start gap-1 text-[9px] text-red-500 pt-1">
                                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                        <span>Cannot publish. Limit resets at midnight UTC.</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[10px] text-muted-foreground text-center py-1">
                                No quota data
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default QuotaTooltip;
