'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Building2,
    Globe,
    Loader2,
    AlertCircle,
    Edit2,
    Save,
    X,
    RefreshCw,
    CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
    META_ADS_CACHE_PREFIX,
    buildMetaAdsCacheKey,
    getCachedData,
    setCachedData,
} from '@/lib/meta-ads-cache';

interface SettingsGeneralProps {
    onRefresh?: () => void;
    cacheScopeId?: string;
}

interface AccountSettings {
    id: string;
    name: string;
    account_id: string;
    account_status: number;
    currency: string;
    timezone_name: string;
    timezone_id: number;
    business_name?: string;
    business_city?: string;
    business_country_code?: string;
    created_time: string;
    is_personal: boolean;
}

const ACCOUNT_STATUS_MAP: Record<number, { label: string; color: string }> = {
    1: { label: 'Active', color: 'text-green-600 bg-green-50' },
    2: { label: 'Disabled', color: 'text-red-600 bg-red-50' },
    3: { label: 'Unsettled', color: 'text-amber-600 bg-amber-50' },
    7: { label: 'Pending Review', color: 'text-blue-600 bg-blue-50' },
};

export default function SettingsGeneral({ onRefresh, cacheScopeId }: SettingsGeneralProps) {
    const [settings, setSettings] = useState<AccountSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const cacheScope = cacheScopeId || 'default';
    const settingsCacheKey = useMemo(
        () => buildMetaAdsCacheKey('settings_general', cacheScope),
        [cacheScope]
    );

    useEffect(() => {
        const cached = getCachedData<AccountSettings>(settingsCacheKey);
        if (cached) {
            setSettings(cached);
            setEditName(cached.name || '');
            setIsLoading(false);
            return;
        }
        fetchSettings();
    }, [settingsCacheKey]);

    const fetchSettings = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/v1/meta-ads/accounts/settings');
            if (response.ok) {
                const data = await response.json();
                setSettings(data);
                setEditName(data.name || '');
                setCachedData(
                    settingsCacheKey,
                    data,
                    `${META_ADS_CACHE_PREFIX}_settings_${cacheScope}`
                );
            } else {
                setError('Failed to load settings');
            }
        } catch {
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            const response = await fetch('/api/v1/meta-ads/accounts/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName }),
            });
            if (response.ok) {
                await fetchSettings();
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

    const accountStatus = settings?.account_status ? ACCOUNT_STATUS_MAP[settings.account_status] : null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white">
                        <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">General Settings</h2>
                        <p className="text-xs text-muted-foreground">Account name, status, and region</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchSettings}>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Account Overview */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-teal-500" />
                                Account Overview
                            </CardTitle>
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
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-xs text-muted-foreground">Account Name</Label>
                            {isEditing ? (
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 h-9" />
                            ) : (
                                <p className="text-sm font-medium mt-0.5">{settings?.name || 'N/A'}</p>
                            )}
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Account ID</Label>
                            <p className="text-sm font-mono mt-0.5">{settings?.account_id || settings?.id}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Status</Label>
                            <div className="mt-0.5">
                                {accountStatus && (
                                    <span className={cn("text-xs font-medium px-2 py-1 rounded-full", accountStatus.color)}>
                                        {accountStatus.label}
                                    </span>
                                )}
                            </div>
                        </div>
                        {settings?.business_name && (
                            <div>
                                <Label className="text-xs text-muted-foreground">Business</Label>
                                <p className="text-sm font-medium mt-0.5">{settings.business_name}</p>
                            </div>
                        )}
                        <div>
                            <Label className="text-xs text-muted-foreground">Created</Label>
                            <p className="text-sm mt-0.5">
                                {settings?.created_time ? new Date(settings.created_time).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Timezone & Region */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Globe className="w-4 h-4 text-blue-500" />
                            Timezone & Region
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-xs text-muted-foreground">Timezone</Label>
                            <p className="text-sm font-medium mt-0.5">{settings?.timezone_name || 'N/A'}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Timezone ID</Label>
                            <p className="text-sm font-mono mt-0.5">{settings?.timezone_id || 'N/A'}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Currency</Label>
                            <p className="text-sm font-medium mt-0.5">{settings?.currency || 'USD'}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
