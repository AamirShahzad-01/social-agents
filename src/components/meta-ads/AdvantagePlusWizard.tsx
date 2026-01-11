'use client';

import React, { useState, useEffect } from 'react';
import {
    Sparkles,
    ChevronRight,
    ChevronLeft,
    Check,
    DollarSign,
    Target,
    Layout,
    Zap,
    MapPin,
    AlertCircle,
    Loader2,
    CheckCircle2,
    XCircle,
    Info,
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { BID_STRATEGIES, COUNTRIES } from '@/types/metaAds';

// Advantage+ Campaign Objectives (v24.0 2026) - All 6 OUTCOME objectives supported
const ADVANTAGE_OBJECTIVES = [
    {
        value: 'OUTCOME_SALES',
        label: 'Sales',
        icon: '🛒',
        description: 'Drive purchases on your website or app',
        advantageLabel: 'Advantage+ Sales Campaign',
        supportsAdvantage: true,
    },
    {
        value: 'OUTCOME_APP_PROMOTION',
        label: 'App Promotion',
        icon: '📱',
        description: 'Get more app installs and in-app actions',
        advantageLabel: 'Advantage+ App Campaign',
        supportsAdvantage: true,
    },
    {
        value: 'OUTCOME_LEADS',
        label: 'Leads',
        icon: '📋',
        description: 'Collect leads via forms or messaging',
        advantageLabel: 'Advantage+ Leads Campaign',
        supportsAdvantage: true,
    },
    {
        value: 'OUTCOME_TRAFFIC',
        label: 'Traffic',
        icon: '🌐',
        description: 'Send people to a destination like a website or app',
        advantageLabel: 'Traffic Campaign',
        supportsAdvantage: false,
    },
    {
        value: 'OUTCOME_ENGAGEMENT',
        label: 'Engagement',
        icon: '❤️',
        description: 'Get more messages, video views, post engagement, or Page likes',
        advantageLabel: 'Engagement Campaign',
        supportsAdvantage: false,
    },
    {
        value: 'OUTCOME_AWARENESS',
        label: 'Awareness',
        icon: '👁️',
        description: 'Show ads to people most likely to remember them',
        advantageLabel: 'Awareness Campaign',
        supportsAdvantage: false,
    },
];

interface AdvantagePlusWizardProps {
    onClose: () => void;
    onSuccess: (campaign: any) => void;
}

interface WizardFormData {
    name: string;
    objective: string;
    dailyBudget: number;
    lifetimeBudget: number | null;
    budgetType: 'daily' | 'lifetime';
    bidStrategy: string;
    bidAmount: number | null;
    roasFloor: number | null;
    countries: string[];
    startTime: string | null;  // ISO datetime string for v24.0 2026
    endTime: string | null;    // ISO datetime string for v24.0 2026 (required for lifetime budget)
    pixelId: string | null;    // For conversion tracking (promoted_object)
    customEventType: string | null;  // For conversion tracking
    status: 'ACTIVE' | 'PAUSED';
}

interface AdvantageValidation {
    is_eligible: boolean;
    expected_advantage_state: string;
    requirements_met: {
        campaign_budget: boolean;
        advantage_audience: boolean;
        advantage_placements: boolean;
        no_special_ad_categories: boolean;
    };
    recommendations: string[];
}

export default function AdvantagePlusWizard({ onClose, onSuccess }: AdvantagePlusWizardProps) {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validation, setValidation] = useState<AdvantageValidation | null>(null);

    const [formData, setFormData] = useState<WizardFormData>({
        name: '',
        objective: 'OUTCOME_SALES',
        dailyBudget: 50,
        lifetimeBudget: null,
        budgetType: 'daily',
        bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
        bidAmount: null,
        roasFloor: null,
        countries: ['US'],
        startTime: null,
        endTime: null,
        pixelId: null,
        customEventType: null,
        status: 'PAUSED',
    });

    const totalSteps = 4;

    // Validate advantage eligibility when config changes (v24.0 2026 API)
    useEffect(() => {
        const validateConfig = async () => {
            try {
                const response = await fetch('/api/v1/meta-ads/campaigns/validate-advantage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        objective: formData.objective,
                        has_campaign_budget: true,
                        has_advantage_audience: true,
                        has_placement_exclusions: false,
                        special_ad_categories: [],
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    setValidation(data);
                }
            } catch (err) {
                console.error('Validation failed:', err);
            }
        };

        validateConfig();
    }, [formData.objective]);

    const handleNext = () => {
        if (step < totalSteps) {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            // Build promoted_object for conversion tracking (v24.0 2026)
            const promotedObject = formData.pixelId && formData.customEventType
                ? {
                    pixel_id: formData.pixelId,
                    custom_event_type: formData.customEventType,
                }
                : null;

            const payload: any = {
                name: formData.name,
                objective: formData.objective,
                status: formData.status,
                daily_budget: formData.budgetType === 'daily' ? formData.dailyBudget * 100 : null,
                lifetime_budget: formData.budgetType === 'lifetime' && formData.lifetimeBudget
                    ? formData.lifetimeBudget * 100
                    : null,
                bid_strategy: formData.bidStrategy,
                bid_amount: formData.bidAmount ? formData.bidAmount * 100 : null,
                roas_average_floor: formData.roasFloor,
                geo_locations: {
                    countries: formData.countries,
                },
                special_ad_categories: [],
            };

            // Add start_time and end_time for scheduling (v24.0 2026)
            if (formData.startTime) {
                payload.start_time = formData.startTime;
            }
            if (formData.endTime) {
                payload.end_time = formData.endTime;
            }

            // Add promoted_object for conversion tracking (v24.0 2026)
            if (promotedObject) {
                payload.promoted_object = promotedObject;
            }

            const response = await fetch('/api/v1/meta-ads/campaigns/advantage-plus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                const data = await response.json();
                onSuccess(data);
            } else {
                const errorData = await response.json();
                setError(errorData.detail || 'Failed to create campaign');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const canProceed = () => {
        switch (step) {
            case 1:
                return formData.name.length > 0 && formData.objective;
            case 2:
                // Validate budget and end_time requirement for lifetime budget (v24.0 2026)
                const hasValidBudget = formData.dailyBudget > 0 || (formData.lifetimeBudget && formData.lifetimeBudget > 0);
                const hasValidLifetimeBudget = formData.budgetType === 'daily' || (formData.budgetType === 'lifetime' && formData.lifetimeBudget && formData.endTime);
                return hasValidBudget && hasValidLifetimeBudget;
            case 3:
                return formData.countries.length > 0;
            case 4:
                return true;
            default:
                return false;
        }
    };

    const selectedObjective = ADVANTAGE_OBJECTIVES.find(o => o.value === formData.objective);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto scrollbar-hide">
                <CardHeader className="pb-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Zap className="w-5 h-5" />
                            <div>
                                <CardTitle className="text-lg text-white">Create Advantage+ Campaign</CardTitle>
                                <CardDescription className="text-white/80 text-sm">
                                    AI-powered campaign optimization
                                </CardDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
                            ✕
                        </Button>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-2 mt-4">
                        {[1, 2, 3, 4].map((s) => (
                            <React.Fragment key={s}>
                                <div
                                    className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                                        s < step
                                            ? "bg-white text-amber-600"
                                            : s === step
                                                ? "bg-white text-amber-600"
                                                : "bg-white/30 text-white/80"
                                    )}
                                >
                                    {s < step ? <Check className="w-4 h-4" /> : s}
                                </div>
                                {s < 4 && (
                                    <div
                                        className={cn(
                                            "flex-1 h-1 rounded-full",
                                            s < step ? "bg-white" : "bg-white/30"
                                        )}
                                    />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </CardHeader>

                <CardContent className="p-6">
                    {/* Advantage+ Status Badge */}
                    {validation && (
                        <div className={cn(
                            "flex items-center gap-2 p-3 rounded-lg mb-6",
                            validation.is_eligible
                                ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900"
                                : "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900"
                        )}>
                            {validation.is_eligible ? (
                                <>
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                        ✨ Advantage+ Eligible: {selectedObjective?.advantageLabel}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Info className="w-5 h-5 text-yellow-600" />
                                    <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                                        Some Advantage+ features may be limited
                                    </span>
                                </>
                            )}
                        </div>
                    )}

                    {/* Step 1: Campaign Basics */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                    <Zap className="w-5 h-5 text-primary" />
                                    Campaign Basics
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="name">Campaign Name</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="My Advantage+ Campaign"
                                            className="mt-1"
                                        />
                                    </div>

                                    <div>
                                        <Label>Campaign Objective</Label>
                                        <div className="grid gap-3 mt-2">
                                            {ADVANTAGE_OBJECTIVES.map((obj) => (
                                                <div
                                                    key={obj.value}
                                                    className={cn(
                                                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                                                        formData.objective === obj.value
                                                            ? "border-primary bg-primary/5"
                                                            : "border-muted hover:border-primary/50"
                                                    )}
                                                    onClick={() => setFormData({ ...formData, objective: obj.value })}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{obj.icon}</span>
                                                        <div className="flex-1">
                                                            <p className="font-medium">{obj.label}</p>
                                                            <p className="text-sm text-muted-foreground">{obj.description}</p>
                                                        </div>
                                                        {formData.objective === obj.value && (
                                                            <CheckCircle2 className="w-5 h-5 text-primary" />
                                                        )}
                                                    </div>
                                                    <div className="mt-2 text-xs text-primary font-medium">
                                                        → {obj.advantageLabel}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Budget & Bidding */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                <DollarSign className="w-5 h-5 text-primary" />
                                Budget & Bidding
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <Label>Budget Type</Label>
                                    <div className="flex gap-4 mt-2">
                                        <Button
                                            type="button"
                                            variant={formData.budgetType === 'daily' ? 'default' : 'outline'}
                                            onClick={() => setFormData({ ...formData, budgetType: 'daily' })}
                                        >
                                            Daily Budget
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={formData.budgetType === 'lifetime' ? 'default' : 'outline'}
                                            onClick={() => setFormData({ ...formData, budgetType: 'lifetime' })}
                                        >
                                            Lifetime Budget
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="budget">
                                        {formData.budgetType === 'daily' ? 'Daily Budget' : 'Lifetime Budget'}
                                    </Label>
                                    <div className="relative mt-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <Input
                                            id="budget"
                                            type="number"
                                            value={formData.budgetType === 'daily' ? formData.dailyBudget : formData.lifetimeBudget || ''}
                                            onChange={(e) => {
                                                const value = parseFloat(e.target.value) || 0;
                                                if (formData.budgetType === 'daily') {
                                                    setFormData({ ...formData, dailyBudget: value });
                                                } else {
                                                    setFormData({ ...formData, lifetimeBudget: value });
                                                }
                                            }}
                                            className="pl-8"
                                            min={1}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Meta may spend up to 75% more on high-opportunity days
                                    </p>
                                </div>

                                <div>
                                    <Label>Bid Strategy</Label>
                                    <div className="grid gap-3 mt-2">
                                        {BID_STRATEGIES.map((strategy) => (
                                            <div
                                                key={strategy.value}
                                                className={cn(
                                                    "p-3 rounded-lg border-2 cursor-pointer transition-all",
                                                    formData.bidStrategy === strategy.value
                                                        ? "border-primary bg-primary/5"
                                                        : "border-muted hover:border-primary/50"
                                                )}
                                                onClick={() => setFormData({ ...formData, bidStrategy: strategy.value })}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-medium flex items-center gap-2">
                                                            {strategy.label}
                                                            {strategy.recommended && (
                                                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                                                    Recommended
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">{strategy.description}</p>
                                                    </div>
                                                    {formData.bidStrategy === strategy.value && (
                                                        <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {(formData.bidStrategy === 'COST_CAP' || formData.bidStrategy === 'LOWEST_COST_WITH_BID_CAP') && (
                                    <div>
                                        <Label htmlFor="bidAmount">
                                            {formData.bidStrategy === 'COST_CAP' ? 'Cost Cap Amount' : 'Bid Cap Amount'}
                                        </Label>
                                        <div className="relative mt-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                            <Input
                                                id="bidAmount"
                                                type="number"
                                                value={formData.bidAmount || ''}
                                                onChange={(e) => setFormData({ ...formData, bidAmount: parseFloat(e.target.value) || null })}
                                                className="pl-8"
                                                placeholder="10.00"
                                                required
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formData.bidStrategy === 'COST_CAP' ? 'Target average cost per result' : 'Maximum bid across all auctions'}
                                        </p>
                                    </div>
                                )}

                                {formData.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && (
                                    <div>
                                        <Label htmlFor="roasFloor">Minimum ROAS</Label>
                                        <Input
                                            id="roasFloor"
                                            type="number"
                                            value={formData.roasFloor || ''}
                                            onChange={(e) => setFormData({ ...formData, roasFloor: parseFloat(e.target.value) || null })}
                                            className="mt-1"
                                            placeholder="2.0"
                                            step="0.1"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Target return on ad spend (e.g., 2.0 = $2 revenue per $1 spent)
                                        </p>
                                    </div>
                                )}

                                {/* Scheduling (v24.0 2026) - Optional for daily budget, required for lifetime budget */}
                                <div className="pt-4 border-t">
                                    <Label className="text-base font-semibold">Campaign Schedule (Optional)</Label>
                                    <p className="text-xs text-muted-foreground mb-3">
                                        Set when your campaign should start and end. End date is required for lifetime budgets.
                                    </p>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="startTime">Start Date & Time</Label>
                                            <Input
                                                id="startTime"
                                                type="datetime-local"
                                                value={formData.startTime || ''}
                                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="endTime">
                                                End Date & Time
                                                {formData.budgetType === 'lifetime' && (
                                                    <span className="text-red-500 ml-1">*</span>
                                                )}
                                            </Label>
                                            <Input
                                                id="endTime"
                                                type="datetime-local"
                                                value={formData.endTime || ''}
                                                onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                                                className="mt-1"
                                                required={formData.budgetType === 'lifetime'}
                                            />
                                            {formData.budgetType === 'lifetime' && !formData.endTime && (
                                                <p className="text-xs text-red-500 mt-1">Required for lifetime budget campaigns</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Conversion Tracking (v24.0 2026) - Optional */}
                                <div className="pt-4 border-t">
                                    <Label className="text-base font-semibold">Conversion Tracking (Optional)</Label>
                                    <p className="text-xs text-muted-foreground mb-3">
                                        Track conversions with Meta Pixel and custom events. Recommended for OUTCOME_SALES campaigns.
                                    </p>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="pixelId">Meta Pixel ID</Label>
                                            <Input
                                                id="pixelId"
                                                type="text"
                                                value={formData.pixelId || ''}
                                                onChange={(e) => setFormData({ ...formData, pixelId: e.target.value || null })}
                                                className="mt-1"
                                                placeholder="123456789"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="customEventType">Custom Event Type</Label>
                                            <Input
                                                id="customEventType"
                                                type="text"
                                                value={formData.customEventType || ''}
                                                onChange={(e) => setFormData({ ...formData, customEventType: e.target.value || null })}
                                                className="mt-1"
                                                placeholder="PURCHASE, ADD_TO_CART, etc."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Audience (Geo Only for Advantage+) */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                <MapPin className="w-5 h-5 text-primary" />
                                Geographic Targeting
                            </h3>

                            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900 mb-4">
                                <div className="flex items-start gap-2">
                                    <Info className="w-5 h-5 text-foreground flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium">
                                            Advantage+ Audience
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Meta's AI will find the best audience within your selected countries.
                                            More targeting options may reduce Advantage+ benefits.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label>Target Countries</Label>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {COUNTRIES.map((country) => (
                                        <div
                                            key={country.code}
                                            className={cn(
                                                "p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-2",
                                                formData.countries.includes(country.code)
                                                    ? "border-primary bg-primary/5"
                                                    : "border-muted hover:border-primary/50"
                                            )}
                                            onClick={() => {
                                                const countries = formData.countries.includes(country.code)
                                                    ? formData.countries.filter(c => c !== country.code)
                                                    : [...formData.countries, country.code];
                                                setFormData({ ...formData, countries });
                                            }}
                                        >
                                            {formData.countries.includes(country.code) ? (
                                                <CheckCircle2 className="w-4 h-4 text-primary" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border" />
                                            )}
                                            <span className="text-sm">{country.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Review & Submit */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                <Check className="w-5 h-5 text-primary" />
                                Review & Create
                            </h3>

                            {/* Advantage+ Three Automation Levers Visualization (v24.0 2026) */}
                            {selectedObjective?.supportsAdvantage && (
                                <Card className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-900">
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Sparkles className="w-5 h-5 text-amber-600" />
                                            Advantage+ Automation Levers (v24.0 2026)
                                        </CardTitle>
                                        <CardDescription>
                                            Three automation levers will be enabled for optimal performance
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {/* Lever 1: Campaign Budget */}
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-black/20">
                                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">Lever 1: Advantage+ Campaign Budget</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Budget set at campaign level - Meta optimizes distribution across ad sets
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {/* Lever 2: Advantage+ Audience */}
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-black/20">
                                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">Lever 2: Advantage+ Audience</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Meta's AI finds the best audience within your selected countries: {formData.countries.join(', ')}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {/* Lever 3: Advantage+ Placements */}
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-black/20">
                                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">Lever 3: Advantage+ Placements</p>
                                                <p className="text-xs text-muted-foreground">
                                                    No placement exclusions - Meta optimizes across all available placements
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="bg-muted/30">
                                        <CardContent className="p-4">
                                            <p className="text-sm text-muted-foreground">Campaign Name</p>
                                            <p className="font-medium">{formData.name || 'Unnamed Campaign'}</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-muted/30">
                                        <CardContent className="p-4">
                                            <p className="text-sm text-muted-foreground">Objective</p>
                                            <p className="font-medium">{selectedObjective?.label}</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-muted/30">
                                        <CardContent className="p-4">
                                            <p className="text-sm text-muted-foreground">Budget</p>
                                            <p className="font-medium">
                                                ${formData.budgetType === 'daily' ? formData.dailyBudget : formData.lifetimeBudget}/
                                                {formData.budgetType === 'daily' ? 'day' : 'total'}
                                            </p>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-muted/30">
                                        <CardContent className="p-4">
                                            <p className="text-sm text-muted-foreground">Countries</p>
                                            <p className="font-medium">{formData.countries.join(', ')}</p>
                                        </CardContent>
                                    </Card>
                                    {formData.startTime && (
                                        <Card className="bg-muted/30">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-muted-foreground">Start Time</p>
                                                <p className="font-medium">{new Date(formData.startTime).toLocaleString()}</p>
                                            </CardContent>
                                        </Card>
                                    )}
                                    {formData.endTime && (
                                        <Card className="bg-muted/30">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-muted-foreground">End Time</p>
                                                <p className="font-medium">{new Date(formData.endTime).toLocaleString()}</p>
                                            </CardContent>
                                        </Card>
                                    )}
                                    {formData.pixelId && (
                                        <Card className="bg-muted/30">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-muted-foreground">Pixel ID</p>
                                                <p className="font-medium">{formData.pixelId}</p>
                                            </CardContent>
                                        </Card>
                                    )}
                                    {formData.customEventType && (
                                        <Card className="bg-muted/30">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-muted-foreground">Event Type</p>
                                                <p className="font-medium">{formData.customEventType}</p>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>

                                <div>
                                    <Label>Campaign Status</Label>
                                    <div className="flex items-center gap-4 mt-2">
                                        <Switch
                                            checked={formData.status === 'ACTIVE'}
                                            onCheckedChange={(checked) =>
                                                setFormData({ ...formData, status: checked ? 'ACTIVE' : 'PAUSED' })
                                            }
                                        />
                                        <span className={formData.status === 'ACTIVE' ? 'text-green-600' : 'text-muted-foreground'}>
                                            {formData.status === 'ACTIVE' ? 'Start Active' : 'Start Paused'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        You can activate the campaign later from the dashboard
                                    </p>
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 border border-red-200 dark:border-red-900">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm">{error}</span>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>

                <CardFooter className="border-t p-4 flex justify-between">
                    <Button
                        variant="outline"
                        onClick={step === 1 ? onClose : handleBack}
                    >
                        {step === 1 ? 'Cancel' : (
                            <>
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                Back
                            </>
                        )}
                    </Button>

                    {step < totalSteps ? (
                        <Button onClick={handleNext} disabled={!canProceed()}>
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !canProceed()}
                            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4 mr-2" />
                                    Create Campaign
                                </>
                            )}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div >
    );
}
