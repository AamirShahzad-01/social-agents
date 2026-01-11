'use client';

import React from 'react';
import { Sparkles, Check, AlertCircle, XCircle, Info, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * v25.0+ Advantage+ State Info Interface
 * 
 * Matches the Meta Marketing API v25.0+ advantage_state_info structure.
 * All fields are returned from the API as ENABLED or DISABLED.
 */
export interface AdvantageStateInfo {
    advantage_state: 'ADVANTAGE_PLUS_SALES' | 'ADVANTAGE_PLUS_APP' | 'ADVANTAGE_PLUS_LEADS' | 'DISABLED' | string;
    advantage_budget_state: 'ENABLED' | 'DISABLED';
    advantage_audience_state: 'ENABLED' | 'DISABLED';
    advantage_placement_state: 'ENABLED' | 'DISABLED';
}

interface AdvantageStateIndicatorProps {
    advantageState?: AdvantageStateInfo;
    size?: 'sm' | 'md' | 'lg';
    showDetails?: boolean;
    className?: string;
}

// v24.0 2026 State configuration mapping
const STATE_CONFIG: Record<string, {
    label: string;
    shortLabel: string;
    color: string;
    textColor: string;
    icon: typeof Sparkles;
}> = {
    ADVANTAGE_PLUS_SALES: {
        label: 'Advantage+ Sales',
        shortLabel: 'A+ Sales',
        color: 'bg-gradient-to-r from-blue-500 to-purple-600',
        textColor: 'text-white',
        icon: Sparkles,
    },
    ADVANTAGE_PLUS_APP: {
        label: 'Advantage+ App',
        shortLabel: 'A+ App',
        color: 'bg-gradient-to-r from-green-500 to-teal-600',
        textColor: 'text-white',
        icon: Sparkles,
    },
    ADVANTAGE_PLUS_LEADS: {
        label: 'Advantage+ Leads',
        shortLabel: 'A+ Leads',
        color: 'bg-gradient-to-r from-orange-500 to-amber-600',
        textColor: 'text-white',
        icon: Sparkles,
    },
    DISABLED: {
        label: 'Manual Campaign',
        shortLabel: 'Manual',
        color: 'bg-muted',
        textColor: 'text-muted-foreground',
        icon: Info,
    },
};

// Automation lever labels for v24.0 2026
const LEVER_LABELS: Record<string, { name: string; description: string }> = {
    advantage_budget_state: {
        name: 'Advantage+ Budget',
        description: 'Campaign-level budget optimization',
    },
    advantage_audience_state: {
        name: 'Advantage+ Audience',
        description: 'AI-powered audience targeting',
    },
    advantage_placement_state: {
        name: 'Advantage+ Placements',
        description: 'Automatic placement optimization',
    },
};

/**
 * AdvantageStateIndicator - v24.0 2026 Compliant
 * 
 * Displays the Advantage+ state of a campaign based on the three automation levers:
 * - Advantage+ Campaign Budget (budget at campaign level)
 * - Advantage+ Audience (targeting_automation.advantage_audience = 1)
 * - Advantage+ Placements (no placement exclusions)
 */
export default function AdvantageStateIndicator({
    advantageState,
    size = 'md',
    showDetails = false,
    className,
}: AdvantageStateIndicatorProps) {
    if (!advantageState) {
        return null;
    }

    const isAdvantagePlus = advantageState.advantage_state !== 'DISABLED';
    const config = STATE_CONFIG[advantageState.advantage_state] || STATE_CONFIG.DISABLED;
    const Icon = config.icon;

    // Gather automation lever states
    const levers = [
        { key: 'advantage_budget_state', enabled: advantageState.advantage_budget_state === 'ENABLED' },
        { key: 'advantage_audience_state', enabled: advantageState.advantage_audience_state === 'ENABLED' },
        { key: 'advantage_placement_state', enabled: advantageState.advantage_placement_state === 'ENABLED' },
    ];

    const enabledCount = levers.filter(l => l.enabled).length;
    const missingLevers = levers.filter(l => !l.enabled);

    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5 gap-1',
        md: 'text-sm px-2.5 py-1 gap-1.5',
        lg: 'text-base px-3 py-1.5 gap-2',
    };

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    };

    const badge = (
        <div
            className={cn(
                'inline-flex items-center rounded-full font-medium',
                config.color,
                config.textColor,
                sizeClasses[size],
                className
            )}
        >
            <Icon className={iconSizes[size]} />
            <span>{size === 'sm' ? config.shortLabel : config.label}</span>
        </div>
    );

    if (!showDetails) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>{badge}</TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs p-3">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4" />
                                <span className="font-semibold">{config.label}</span>
                            </div>

                            {isAdvantagePlus ? (
                                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                    <Check className="w-4 h-4" />
                                    <span className="text-sm">All 3 automation levers enabled</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        Automation Levers ({enabledCount}/3 enabled):
                                    </p>
                                    {levers.map(({ key, enabled }) => (
                                        <div key={key} className="flex items-center gap-2 text-sm">
                                            {enabled ? (
                                                <Check className="w-3.5 h-3.5 text-green-500" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                                            )}
                                            <span className={enabled ? 'text-green-600' : 'text-muted-foreground'}>
                                                {LEVER_LABELS[key].name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Detailed view for campaign detail pages
    return (
        <div className={cn('space-y-4', className)}>
            <div className="flex items-center gap-3">
                {badge}
                {isAdvantagePlus && (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        AI Optimized
                    </span>
                )}
            </div>

            <div className="grid gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Automation Levers (v24.0 2026)
                </p>
                {levers.map(({ key, enabled }) => (
                    <div
                        key={key}
                        className={cn(
                            'flex items-center justify-between p-3 rounded-lg border',
                            enabled
                                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                                : 'bg-muted/30 border-muted'
                        )}
                    >
                        <div className="flex items-center gap-3">
                            {enabled ? (
                                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                                <XCircle className="w-4 h-4 text-muted-foreground" />
                            )}
                            <div>
                                <p className={cn(
                                    'text-sm font-medium',
                                    enabled ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'
                                )}>
                                    {LEVER_LABELS[key].name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {LEVER_LABELS[key].description}
                                </p>
                            </div>
                        </div>
                        <span className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded',
                            enabled
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                : 'bg-muted text-muted-foreground'
                        )}>
                            {enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                    </div>
                ))}
            </div>

            {missingLevers.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                Enable full Advantage+ benefits
                            </p>
                            <ul className="mt-1 text-sm text-amber-600 dark:text-amber-400 space-y-0.5">
                                {missingLevers.map(({ key }) => (
                                    <li key={key}>• {LEVER_LABELS[key].name}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

