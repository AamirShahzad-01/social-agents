'use client';

import React, { useState, useEffect } from 'react';
import {
    Users,
    Plus,
    UserPlus,
    Copy,
    Loader2,
    Target,
    Globe,
    Percent,
    Trash2,
    Info,
    CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface Audience {
    id: string;
    name: string;
    subtype: string;
    approximate_count?: number;
    description?: string;
    lookalike_spec?: any;
}

interface LookalikeRatio {
    value: number;
    label: string;
    description: string;
}

interface AudienceBuilderProps {
    onRefresh?: () => void;
}

export default function AudienceBuilder({ onRefresh }: AudienceBuilderProps) {
    const [audiences, setAudiences] = useState<Audience[]>([]);
    const [ratios, setRatios] = useState<LookalikeRatio[]>([]);
    const [pixels, setPixels] = useState<{ id: string, name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showLookalikeModal, setShowLookalikeModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Form state
    const [audienceName, setAudienceName] = useState('');
    const [audienceSubtype, setAudienceSubtype] = useState('WEBSITE');
    const [retentionDays, setRetentionDays] = useState(30);
    const [selectedPixel, setSelectedPixel] = useState('');

    // Lookalike form
    const [lookalikeName, setLookalikeName] = useState('');
    const [sourceAudienceId, setSourceAudienceId] = useState('');
    const [lookalikeRatio, setLookalikeRatio] = useState(0.01);
    const [targetCountries, setTargetCountries] = useState('US');

    useEffect(() => {
        fetchAudiences();
        fetchRatios();
        fetchPixels();
    }, []);

    const fetchAudiences = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/v1/meta-ads/audiences');
            if (response.ok) {
                const data = await response.json();
                setAudiences(data.audiences || []);
            }
        } catch (err) {
            console.error('Failed to fetch audiences:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRatios = async () => {
        try {
            const response = await fetch('/api/v1/meta-ads/audiences/lookalike-ratios');
            if (response.ok) {
                const data = await response.json();
                setRatios(data.ratios || []);
            }
        } catch (err) {
            console.error('Failed to fetch ratios:', err);
        }
    };

    const fetchPixels = async () => {
        try {
            const response = await fetch('/api/v1/meta-ads/pixels');
            if (response.ok) {
                const data = await response.json();
                setPixels(data.pixels || []);
                if (data.pixels && data.pixels.length > 0) {
                    setSelectedPixel(data.pixels[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch pixels:', err);
        }
    };

    const handleCreateAudience = async () => {
        if (!audienceName) return;
        if (audienceSubtype === 'WEBSITE' && !selectedPixel) {
            alert('Please select a pixel for Website audiences');
            return;
        }

        setIsCreating(true);
        try {
            const payload: any = {
                name: audienceName,
                subtype: audienceSubtype,
                retention_days: retentionDays
            };

            // Construct rule for WEBSITE audiences
            if (audienceSubtype === 'WEBSITE' && selectedPixel) {
                payload.rule = {
                    inclusions: {
                        operator: "or",
                        rules: [{
                            event_sources: [{
                                type: "pixel",
                                id: selectedPixel
                            }],
                            retention_seconds: retentionDays * 86400,
                            filter: {
                                operator: "and",
                                filters: [{
                                    field: "url",
                                    operator: "i_contains",
                                    value: ""
                                }]
                            }
                        }]
                    }
                };
            }

            const response = await fetch('/api/v1/meta-ads/audiences/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setShowCreateModal(false);
                setAudienceName('');
                fetchAudiences();
                onRefresh?.();
            } else {
                const error = await response.json();
                alert(`Error: ${error.detail || 'Failed to create audience'}`);
            }
        } catch (err) {
            console.error('Failed to create audience:', err);
            alert('Failed to create audience. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateLookalike = async () => {
        if (!lookalikeName || !sourceAudienceId) return;

        setIsCreating(true);
        try {
            const response = await fetch('/api/v1/meta-ads/audiences/lookalike', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: lookalikeName,
                    source_audience_id: sourceAudienceId,
                    target_countries: targetCountries.split(',').map(c => c.trim()),
                    ratio: lookalikeRatio
                })
            });

            if (response.ok) {
                setShowLookalikeModal(false);
                setLookalikeName('');
                setSourceAudienceId('');
                fetchAudiences();
                onRefresh?.();
            }
        } catch (err) {
            console.error('Failed to create lookalike:', err);
        } finally {
            setIsCreating(false);
        }
    };

    const formatCount = (count?: number) => {
        if (!count) return 'Calculating...';
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    const SUBTYPES = [
        { value: 'WEBSITE', label: 'Website Visitors' },
        { value: 'ENGAGEMENT', label: 'Engagement' },
        { value: 'CUSTOMER_FILE', label: 'Customer List' },
        { value: 'APP', label: 'App Activity' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-cyan-500" />
                        Audience Builder
                    </h2>
                    <p className="text-muted-foreground">Create and manage custom audiences</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowLookalikeModal(true)}
                        className="gap-2"
                    >
                        <Copy className="w-4 h-4" />
                        Lookalike
                    </Button>
                    <Button
                        onClick={() => setShowCreateModal(true)}
                        className="gap-2 bg-gradient-to-r from-cyan-500 to-teal-600"
                    >
                        <Plus className="w-4 h-4" />
                        Custom Audience
                    </Button>
                </div>
            </div>

            {/* Audiences Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            ) : audiences.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Users className="w-12 h-12 text-muted-foreground mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No Audiences Yet</h3>
                        <p className="text-muted-foreground text-center max-w-md mb-4">
                            Create custom audiences to target specific user groups.
                        </p>
                        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Create Your First Audience
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {audiences.map((audience) => (
                        <Card key={audience.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-base">{audience.name}</CardTitle>
                                        <CardDescription className="flex items-center gap-1 mt-1">
                                            {audience.lookalike_spec ? (
                                                <Copy className="w-3 h-3" />
                                            ) : (
                                                <Target className="w-3 h-3" />
                                            )}
                                            {audience.subtype?.replace(/_/g, ' ') || 'Custom'}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 text-2xl font-bold">
                                    <Users className="w-5 h-5 text-muted-foreground" />
                                    {formatCount(audience.approximate_count)}
                                </div>
                                {audience.lookalike_spec && (
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        {audience.lookalike_spec.ratio * 100}% Lookalike
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Custom Audience Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-cyan-500" />
                                Create Custom Audience
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Audience Name</Label>
                                <Input
                                    value={audienceName}
                                    onChange={(e) => setAudienceName(e.target.value)}
                                    placeholder="Website Visitors - Last 30 Days"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Source Type</Label>
                                <Select value={audienceSubtype} onValueChange={setAudienceSubtype}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SUBTYPES.map(type => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {audienceSubtype === 'WEBSITE' && (
                                <div>
                                    <Label>Meta Pixel</Label>
                                    <Select value={selectedPixel} onValueChange={setSelectedPixel}>
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="Select a pixel" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {pixels.map(pixel => (
                                                <SelectItem key={pixel.id} value={pixel.id}>
                                                    {pixel.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {pixels.length === 0 && (
                                        <p className="text-xs text-amber-600 mt-1">
                                            No pixels found. Please create a pixel in Meta Business Manager first.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div>
                                <Label>Retention Period: {retentionDays} days</Label>
                                <Slider
                                    value={[retentionDays]}
                                    onValueChange={(v) => setRetentionDays(v[0])}
                                    min={1}
                                    max={365}
                                    step={1}
                                    className="mt-2"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreateAudience} disabled={isCreating || !audienceName}>
                                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Create Lookalike Modal */}
            {showLookalikeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Copy className="w-5 h-5 text-purple-500" />
                                Create Lookalike Audience
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Lookalike Name</Label>
                                <Input
                                    value={lookalikeName}
                                    onChange={(e) => setLookalikeName(e.target.value)}
                                    placeholder="Lookalike - Top Customers 1%"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Source Audience</Label>
                                <Select value={sourceAudienceId} onValueChange={setSourceAudienceId}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="Select source audience" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {audiences.filter(a => !a.lookalike_spec).map(audience => (
                                            <SelectItem key={audience.id} value={audience.id}>
                                                {audience.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Target Countries</Label>
                                <Input
                                    value={targetCountries}
                                    onChange={(e) => setTargetCountries(e.target.value)}
                                    placeholder="US, CA, UK"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Audience Size: {(lookalikeRatio * 100).toFixed(0)}%</Label>
                                <div className="flex items-center gap-4 mt-2">
                                    <span className="text-xs text-muted-foreground">Most Similar</span>
                                    <Slider
                                        value={[lookalikeRatio * 100]}
                                        onValueChange={(v) => setLookalikeRatio(v[0] / 100)}
                                        min={1}
                                        max={20}
                                        step={1}
                                        className="flex-1"
                                    />
                                    <span className="text-xs text-muted-foreground">Larger Reach</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowLookalikeModal(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateLookalike}
                                disabled={isCreating || !lookalikeName || !sourceAudienceId}
                                className="bg-gradient-to-r from-purple-500 to-pink-600"
                            >
                                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Lookalike'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}
