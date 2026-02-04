'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    DollarSign,
    Loader2,
    AlertCircle,
    RefreshCw,
    CreditCard,
    TrendingUp,
    Edit2,
    Save,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    META_ADS_CACHE_PREFIX,
    buildMetaAdsCacheKey,
    getCachedData,
    setCachedData,
} from '@/lib/meta-ads-cache';

interface SettingsBillingProps {
    onRefresh?: () => void;
    cacheScopeId?: string;
}

interface BillingData {
    currency: string;
    spend_cap: number | null;
    amount_spent: string;
    balance: string;
    min_daily_budget: number;
    spend_cap_formatted?: string;
    amount_spent_formatted?: string;
    balance_formatted?: string;
}

export default function SettingsBilling({ onRefresh, cacheScopeId }: SettingsBillingProps) {
    const [billing, setBilling] = useState<BillingData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editSpendCap, setEditSpendCap] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const cacheScope = cacheScopeId || 'default';
    const billingCacheKey = useMemo(
        () => buildMetaAdsCacheKey('settings_billing', cacheScope),
        [cacheScope]
    );

    useEffect(() => {
        const cached = getCachedData<BillingData>(billingCacheKey);
        if (cached) {
            setBilling(cached);
            setEditSpendCap(cached.spend_cap ? cached.spend_cap / 100 : null);
            setIsLoading(false);
            return;
        }
        fetchBilling();
    }, [billingCacheKey]);

    const fetchBilling = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/v1/meta-ads/accounts/settings');
            if (response.ok) {
                const data = await response.json();
                setBilling(data);
                setEditSpendCap(data.spend_cap ? data.spend_cap / 100 : null);
                setCachedData(
                    billingCacheKey,
                    data,
                    `${META_ADS_CACHE_PREFIX}_settings_${cacheScope}`
                );
            } else {
                setError('Failed to load billing data');
            }
        } catch {
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/v1/meta-ads/accounts/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spend_cap: editSpendCap }),
            });
            if (response.ok) {
                await fetchBilling();
                setIsEditing(false);
                onRefresh?.();
            } else {
                setError('Failed to save');
            }
        } catch {
            setError('Network error');
        } finally {
            setIsSaving(false);
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
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-green-500 to-green-600 text-white">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Billing & Spending</h2>
                        <p className="text-xs text-muted-foreground">Manage spend caps and view balance</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchBilling}>
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Billing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Spent */}
                <Card className="border-green-200 dark:border-green-900/50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                                <TrendingUp className="w-4 h-4 text-green-600" />
                            </div>
                            <span className="text-xs text-muted-foreground">Total Spent</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600">
                            {billing?.amount_spent_formatted || '$0.00'}
                        </p>
                    </CardContent>
                </Card>

                {/* Current Balance */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                <CreditCard className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-xs text-muted-foreground">Balance</span>
                        </div>
                        <p className="text-2xl font-bold">
                            {billing?.balance_formatted || '$0.00'}
                        </p>
                    </CardContent>
                </Card>

                {/* Min Daily Budget */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                                <DollarSign className="w-4 h-4 text-amber-600" />
                            </div>
                            <span className="text-xs text-muted-foreground">Min Daily Budget</span>
                        </div>
                        <p className="text-2xl font-bold">
                            ${billing?.min_daily_budget ? (billing.min_daily_budget / 100).toFixed(2) : '1.00'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Spend Cap Management */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-green-500" />
                                Spend Cap
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Set a maximum spending limit for this account
                            </CardDescription>
                        </div>
                        {!isEditing ? (
                            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                                Edit
                            </Button>
                        ) : (
                            <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                                    Save
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {isEditing ? (
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-medium">$</span>
                            <Input
                                type="number"
                                value={editSpendCap ?? ''}
                                onChange={(e) => setEditSpendCap(e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="No limit"
                                className="max-w-xs h-10"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <p className="text-3xl font-bold">
                                {billing?.spend_cap_formatted || 'No limit'}
                            </p>
                            {billing?.spend_cap && (
                                <span className="text-xs text-muted-foreground">
                                    ({billing.currency})
                                </span>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
