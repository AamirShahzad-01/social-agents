'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    Loader2,
    AlertCircle,
    RefreshCw,
    Shield,
    UserPlus,
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

interface SettingsTeamProps {
    onRefresh?: () => void;
    cacheScopeId?: string;
}

interface TeamMember {
    id: string;
    name: string;
    role: string;
    permissions: string[];
}

export default function SettingsTeam({ onRefresh, cacheScopeId }: SettingsTeamProps) {
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const cacheScope = cacheScopeId || 'default';
    const teamCacheKey = useMemo(
        () => buildMetaAdsCacheKey('settings_team', cacheScope),
        [cacheScope]
    );

    useEffect(() => {
        const cached = getCachedData<TeamMember[]>(teamCacheKey);
        if (cached) {
            setTeam(cached);
            setIsLoading(false);
            return;
        }
        fetchTeam();
    }, [teamCacheKey]);

    const fetchTeam = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/v1/meta-ads/team/access');
            if (response.ok) {
                const data = await response.json();
                const nextTeam = data.users || [];
                setTeam(nextTeam);
                setCachedData(
                    teamCacheKey,
                    nextTeam,
                    `${META_ADS_CACHE_PREFIX}_settings_${cacheScope}`
                );
            } else {
                setError('Failed to load team data');
            }
        } catch {
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const getRoleColor = (role: string) => {
        switch (role?.toUpperCase()) {
            case 'ADMIN':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
            case 'ANALYST':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'ADVERTISER':
                return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
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
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Team Access</h2>
                        <p className="text-xs text-muted-foreground">Manage team members and permissions</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchTeam}>
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                        Refresh
                    </Button>
                    <Button size="sm" className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                        <UserPlus className="w-4 h-4 mr-1.5" />
                        Invite Member
                    </Button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Team Members */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4 text-purple-500" />
                        Team Members ({team.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Users with access to this ad account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {team.length > 0 ? (
                        <div className="space-y-3">
                            {team.map((member) => (
                                <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{member.name}</p>
                                            <p className="text-xs text-muted-foreground">ID: {member.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", getRoleColor(member.role))}>
                                            {member.role || 'Member'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                            <p className="text-sm font-medium">No team members found</p>
                            <p className="text-xs text-muted-foreground mt-1">Invite team members to collaborate on this ad account</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
