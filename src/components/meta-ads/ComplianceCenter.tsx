'use client';

import React, { useState, useEffect } from 'react';
import {
    Shield,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Info,
    Loader2,
    Home,
    Briefcase,
    CreditCard,
    Vote,
    ChevronRight,
    History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Category icons
const CATEGORY_ICONS: Record<string, React.ElementType> = {
    HOUSING: Home,
    EMPLOYMENT: Briefcase,
    FINANCIAL_PRODUCTS_SERVICES: CreditCard,
    ISSUES_ELECTIONS_POLITICS: Vote,
};

interface Category {
    value: string;
    name: string;
    description: string;
    restrictions: {
        excluded_targeting?: string[];
        radius_max_miles?: number;
        age_min?: number;
        requires_disclaimer?: boolean;
        requires_authorization?: boolean;
        description?: string;
    };
}

interface ComplianceCheckResult {
    status: string;
    is_compliant: boolean;
    issues: Array<{
        category: string;
        severity: string;
        message: string;
    }>;
    warnings: string[];
}

interface ComplianceCenterProps {
    onRefresh?: () => void;
}

export default function ComplianceCenter({ onRefresh }: ComplianceCenterProps) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [checkResult, setCheckResult] = useState<ComplianceCheckResult | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/v1/meta-ads/compliance/categories');
            if (response.ok) {
                const data = await response.json();
                setCategories(data.categories || []);
            }
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleCategory = (value: string) => {
        setSelectedCategories(prev =>
            prev.includes(value)
                ? prev.filter(c => c !== value)
                : [...prev, value]
        );
    };

    const handleCheckCompliance = async () => {
        setIsChecking(true);
        try {
            const response = await fetch('/api/v1/meta-ads/compliance/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    special_ad_categories: selectedCategories,
                    targeting: {
                        age_min: 18,
                        age_max: 65,
                        genders: [0], // All genders
                    },
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setCheckResult(data);
            }
        } catch (err) {
            console.error('Failed to check compliance:', err);
        } finally {
            setIsChecking(false);
        }
    };

    const getCategoryIcon = (value: string) => {
        const Icon = CATEGORY_ICONS[value] || Shield;
        return Icon;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="w-6 h-6 text-blue-500" />
                        Compliance Center
                    </h2>
                    <p className="text-muted-foreground">Manage Special Ad Categories and restrictions</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Categories Selection */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Special Ad Categories</CardTitle>
                            <CardDescription>
                                Select categories that apply to your ads. Each has specific targeting restrictions.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {categories.map((category) => {
                                        const Icon = getCategoryIcon(category.value);
                                        const isSelected = selectedCategories.includes(category.value);

                                        return (
                                            <div
                                                key={category.value}
                                                className={cn(
                                                    "p-4 rounded-lg border transition-all",
                                                    isSelected
                                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                                                        : "border-muted hover:border-blue-300"
                                                )}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-start gap-3">
                                                        <div className={cn(
                                                            "p-2 rounded-lg",
                                                            isSelected ? "bg-blue-100 dark:bg-blue-900" : "bg-muted"
                                                        )}>
                                                            <Icon className={cn(
                                                                "w-5 h-5",
                                                                isSelected ? "text-blue-600" : "text-muted-foreground"
                                                            )} />
                                                        </div>
                                                        <div>
                                                            <h4 className="font-semibold">{category.name}</h4>
                                                            <p className="text-sm text-muted-foreground mt-1">
                                                                {category.description || category.restrictions?.description}
                                                            </p>

                                                            {/* Restrictions preview */}
                                                            {isSelected && category.restrictions && (
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    {category.restrictions.excluded_targeting?.slice(0, 3).map((t, i) => (
                                                                        <span
                                                                            key={i}
                                                                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                                        >
                                                                            No {t}
                                                                        </span>
                                                                    ))}
                                                                    {category.restrictions.age_min && (
                                                                        <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                                            Age {category.restrictions.age_min}+
                                                                        </span>
                                                                    )}
                                                                    {category.restrictions.requires_disclaimer && (
                                                                        <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                                                            Disclaimer required
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Switch
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleCategory(category.value)}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                onClick={handleCheckCompliance}
                                disabled={isChecking}
                                className="w-full"
                            >
                                {isChecking ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Checking...
                                    </>
                                ) : (
                                    'Check Compliance'
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Compliance Check Results */}
                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {checkResult?.is_compliant ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : checkResult ? (
                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                ) : (
                                    <Info className="w-5 h-5 text-blue-500" />
                                )}
                                Compliance Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!checkResult ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>Select categories and check compliance</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className={cn(
                                        "p-4 rounded-lg text-center",
                                        checkResult.is_compliant
                                            ? "bg-green-50 dark:bg-green-950/20"
                                            : "bg-amber-50 dark:bg-amber-950/20"
                                    )}>
                                        <span className={cn(
                                            "text-lg font-semibold",
                                            checkResult.is_compliant ? "text-green-600" : "text-amber-600"
                                        )}>
                                            {checkResult.is_compliant ? 'Compliant' : 'Needs Changes'}
                                        </span>
                                    </div>

                                    {checkResult.issues.length > 0 && (
                                        <div>
                                            <h4 className="font-medium mb-2 text-red-600">Issues</h4>
                                            <div className="space-y-2">
                                                {checkResult.issues.map((issue, i) => (
                                                    <div
                                                        key={i}
                                                        className="p-3 rounded bg-red-50 dark:bg-red-950/20 text-sm"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                                                            <span>{issue.message}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {checkResult.warnings.length > 0 && (
                                        <div>
                                            <h4 className="font-medium mb-2 text-amber-600">Warnings</h4>
                                            <div className="space-y-2">
                                                {checkResult.warnings.map((warning, i) => (
                                                    <div
                                                        key={i}
                                                        className="p-3 rounded bg-amber-50 dark:bg-amber-950/20 text-sm"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                                                            <span>{warning}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Info Card */}
                    <Card className="mt-4">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Info className="w-4 h-4" />
                                v24.0 2026 Compliance
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                This system is fully compliant with Meta Marketing API v24.0 2026.
                                All deprecated fields and features have been removed.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
