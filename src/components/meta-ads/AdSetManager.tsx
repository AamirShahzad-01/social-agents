'use client';

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Target,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  Play,
  Pause,
  Edit,
  MoreHorizontal,
  X,
  ChevronRight,
  Globe,
  Smartphone,
  Monitor,
  Zap,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type {
  AdSet,
  Campaign,
  AdSetFormData,
  TargetingSpec,
  OptimizationGoal,
  BillingEvent,
  AdSetStatus,
  BidStrategy,
} from '@/types/metaAds';
import { OBJECTIVE_OPTIMIZATION_GOALS, OBJECTIVE_CONFIGS, PLACEMENTS, BID_STRATEGIES } from '@/types/metaAds';

interface AdSetManagerProps {
  adSets: AdSet[];
  campaigns: Campaign[];
  onRefresh: () => void;
  showCreate?: boolean;
  onShowCreateChange?: (show: boolean) => void;
  preselectedCampaignId?: string;
}

// Fallback for unknown objectives
const DEFAULT_OPTIMIZATION_GOALS = [
  { value: 'LINK_CLICKS', label: 'Link Clicks', description: 'Get people to click your link' },
  { value: 'REACH', label: 'Reach', description: 'Show ads to maximum people' },
];

// Local placements for AdSetManager (uses id/label format for UI)
const LOCAL_PLACEMENTS = {
  facebook: [
    { id: 'feed', label: 'Facebook Feed' },
    { id: 'story', label: 'Facebook Stories' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'video_feeds', label: 'Video Feeds' },
    { id: 'right_hand_column', label: 'Right Column' },
    { id: 'search', label: 'Search Results' },
    { id: 'instream_video', label: 'In-Stream Video' },
  ],
  instagram: [
    { id: 'stream', label: 'Instagram Feed' },
    { id: 'story', label: 'Instagram Stories' },
    { id: 'reels', label: 'Instagram Reels' },
    { id: 'explore', label: 'Explore' },
    { id: 'ig_search', label: 'Search Results' },
  ],
};

const initialFormData: AdSetFormData = {
  name: '',
  campaign_id: '',
  status: 'PAUSED',
  optimization_goal: 'LINK_CLICKS',
  billing_event: 'IMPRESSIONS',
  budget_type: 'daily',
  budget_amount: 10,
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // Default - no bid amount needed
  advantage_audience: true, // v24.0 2026 default: Enable Advantage+ Audience
  advantage_placements: true, // v24.0 2026 default: Advantage+ Placements (Automatic)
  // v24.0 2026 Required Parameters (Jan 6, 2026+)
  is_adset_budget_sharing_enabled: true, // Default: True for Advantage+ campaigns (allows up to 20% budget sharing)
  placement_soft_opt_out: false, // Default: False for Advantage+ Placements compliance
  targeting: {
    age_min: 18,
    age_max: 65,
    genders: [],
    geo_locations: { countries: ['US'] },
    device_platforms: ['mobile', 'desktop'],
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed', 'story'],
    instagram_positions: ['stream', 'story', 'reels'],
  },
  // Attribution Spec (v24.0 2026): Updated windows per Jan 12, 2026 changes
  // View-through deprecated: 7-day and 28-day view windows removed
  // Only 1-day view-through remains allowed
  attribution_spec: [
    { event_type: 'CLICK_THROUGH', window_days: 7 },
    { event_type: 'VIEW_THROUGH', window_days: 1 }, // Only 1-day view allowed per 2026 standards
  ],
};

export default function AdSetManager({ adSets, campaigns, onRefresh, showCreate, onShowCreateChange, preselectedCampaignId }: AdSetManagerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAdSet, setEditingAdSet] = useState<AdSet | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<AdSetFormData>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState<AdSetFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync with external showCreate prop
  React.useEffect(() => {
    if (showCreate !== undefined) {
      setShowCreateModal(showCreate);
    }
  }, [showCreate]);

  // Pre-select campaign if provided
  React.useEffect(() => {
    if (preselectedCampaignId && showCreate) {
      setFormData(prev => ({ ...prev, campaign_id: preselectedCampaignId }));
    }
  }, [preselectedCampaignId, showCreate]);

  const handleModalChange = (show: boolean) => {
    setShowCreateModal(show);
    onShowCreateChange?.(show);
  };

  const filteredAdSets = adSets.filter(adSet => {
    const matchesSearch = adSet.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || adSet.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateAdSet = async () => {
    setIsSubmitting(true);
    try {
      // Check if campaign uses CBO - if so, don't send budget fields
      const selectedCampaign = campaigns.find(c => c.id === formData.campaign_id);
      const campaignUsesCBO = !!(selectedCampaign?.daily_budget || selectedCampaign?.lifetime_budget);
      
      // Prepare form data - exclude budget if CBO is active
      const submitData = { ...formData };
      if (campaignUsesCBO) {
        delete submitData.budget_type;
        delete submitData.budget_amount;
      }
      
      const response = await fetch('/api/v1/meta-ads/adsets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        handleModalChange(false);
        setFormData(initialFormData);
        onRefresh();
      } else {
        // Show error to user
        alert(`Failed to create ad set: ${data.message || data.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Failed to create ad set. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (adSetId: string, newStatus: AdSetStatus) => {
    try {
      await fetch(`/api/v1/meta-ads/adsets/${adSetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      onRefresh();
    } catch (error) {
    }
  };

  const handleEditAdSet = (adSet: AdSet) => {
    setEditingAdSet(adSet);
    setEditFormData({
      name: adSet.name,
      status: adSet.status,
      budget_type: adSet.daily_budget ? 'daily' : 'lifetime',
      budget_amount: adSet.daily_budget ? adSet.daily_budget / 100 : (adSet.lifetime_budget ? adSet.lifetime_budget / 100 : 0),
      bid_amount: adSet.bid_amount ? adSet.bid_amount / 100 : undefined,
      advantage_audience: adSet.advantage_audience,
      is_adset_budget_sharing_enabled: adSet.is_adset_budget_sharing_enabled ?? true,
      placement_soft_opt_out: adSet.placement_soft_opt_out ?? false,
      attribution_spec: adSet.attribution_spec || [
        { event_type: 'CLICK_THROUGH', window_days: 7 },
        { event_type: 'VIEW_THROUGH', window_days: 1 },
      ],
    });
  };

  const handleUpdateAdSet = async () => {
    if (!editingAdSet) return;
    setIsUpdating(true);
    try {
      const updateData: any = {
        name: editFormData.name,
        status: editFormData.status,
        budget_type: editFormData.budget_type,
        budget_amount: editFormData.budget_amount,
        bid_amount: editFormData.bid_amount,
        advantage_audience: editFormData.advantage_audience,
        is_adset_budget_sharing_enabled: editFormData.is_adset_budget_sharing_enabled,
        placement_soft_opt_out: editFormData.placement_soft_opt_out,
        attribution_spec: editFormData.attribution_spec,
      };

      const response = await fetch(`/api/v1/meta-ads/adsets/${editingAdSet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEditingAdSet(null);
        setEditFormData({});
        onRefresh();
      } else {
        alert(`Failed to update ad set: ${data.detail || data.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Failed to update ad set. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Ad Sets</h2>
          <p className="text-muted-foreground">Configure targeting, budget, and placements</p>
        </div>
        <Button
          onClick={() => handleModalChange(true)}
          className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Ad Set
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search ad sets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ad Sets Grid */}
      {filteredAdSets.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAdSets.map((adSet) => (
            <AdSetCard
              key={adSet.id}
              adSet={adSet}
              campaign={campaigns.find(c => c.id === adSet.campaign_id)}
              onStatusChange={handleStatusChange}
              onEdit={handleEditAdSet}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Target className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No ad sets found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery ? 'Try adjusting your search' : 'Create your first ad set to define targeting'}
              </p>
              <Button onClick={() => handleModalChange(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Ad Set
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Ad Set Modal */}
      {showCreateModal && (
        <CreateAdSetModal
          formData={formData}
          setFormData={setFormData}
          campaigns={campaigns}
          onClose={() => {
            handleModalChange(false);
            setFormData(initialFormData);
          }}
          onSubmit={handleCreateAdSet}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Edit Ad Set Modal */}
      {editingAdSet && (
        <EditAdSetModal
          adSet={editingAdSet}
          formData={editFormData}
          setFormData={setEditFormData}
          campaign={campaigns.find(c => c.id === editingAdSet.campaign_id)}
          onClose={() => {
            setEditingAdSet(null);
            setEditFormData({});
          }}
          onSubmit={handleUpdateAdSet}
          isSubmitting={isUpdating}
        />
      )}
    </div>
  );
}

function AdSetCard({
  adSet,
  campaign,
  onStatusChange,
  onEdit,
}: {
  adSet: AdSet;
  campaign?: Campaign;
  onStatusChange: (id: string, status: AdSetStatus) => void;
  onEdit?: (adSet: AdSet) => void;
}) {
  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    DELETED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    ARCHIVED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };

  const targeting = adSet.targeting;
  const locations = targeting?.geo_locations?.countries?.join(', ') || 'All';
  const ageRange = `${targeting?.age_min || 18}-${targeting?.age_max || 65}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base">{adSet.name}</CardTitle>
              <CardDescription className="text-xs">
                {campaign?.name || 'No campaign'}
              </CardDescription>
            </div>
          </div>
          <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusColors[adSet.status])}>
            {adSet.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Targeting Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Location:</span>
            <span className="font-medium">{locations}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Age:</span>
            <span className="font-medium">{ageRange}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Budget:</span>
            <span className="font-medium">
              ${adSet.daily_budget ? (adSet.daily_budget / 100).toFixed(2) : '0'}/day
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Goal:</span>
            <span className="font-medium">{adSet.optimization_goal.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Metrics */}
        {adSet.insights && (
          <div className="grid grid-cols-4 gap-2 pt-3 border-t">
            <div className="text-center">
              <p className="text-lg font-bold">{formatNumber(adSet.insights.impressions)}</p>
              <p className="text-xs text-muted-foreground">Impressions</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{formatNumber(adSet.insights.reach)}</p>
              <p className="text-xs text-muted-foreground">Reach</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{formatNumber(adSet.insights.clicks)}</p>
              <p className="text-xs text-muted-foreground">Clicks</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">${adSet.insights.spend.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Spend</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          {adSet.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={() => onStatusChange(adSet.id, 'PAUSED')}
            >
              <Pause className="w-4 h-4" />
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={() => onStatusChange(adSet.id, 'ACTIVE')}
            >
              <Play className="w-4 h-4" />
              Activate
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 gap-2"
            onClick={() => onEdit?.(adSet)}
          >
            <Edit className="w-4 h-4" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateAdSetModal({
  formData,
  setFormData,
  campaigns,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  formData: AdSetFormData;
  setFormData: React.Dispatch<React.SetStateAction<AdSetFormData>>;
  campaigns: Campaign[];
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [step, setStep] = useState(1);

  const updateTargeting = (updates: Partial<TargetingSpec>) => {
    setFormData(prev => ({
      ...prev,
      targeting: { ...prev.targeting, ...updates },
    }));
  };

  // Check if selected campaign uses Campaign Budget Optimization (CBO)
  const selectedCampaign = campaigns.find(c => c.id === formData.campaign_id);
  const campaignUsesCBO = !!(selectedCampaign?.daily_budget || selectedCampaign?.lifetime_budget);

  // Check if campaign's bid_strategy requires bid_amount
  const strategiesRequiringBidAmount = ['LOWEST_COST_WITH_BID_CAP', 'COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS'];
  const campaignRequiresBidAmount = selectedCampaign?.bid_strategy &&
    strategiesRequiringBidAmount.includes(selectedCampaign.bid_strategy);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden mx-4 scrollbar-hide">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5" />
              <div>
                <h2 className="text-xl font-bold text-white">Create Ad Set</h2>
                <p className="text-sm text-white/80">
                  Step {step} of 4 - {
                    step === 1 ? 'Basic Info' :
                      step === 2 ? 'Targeting' :
                        step === 3 ? 'Placements' :
                          'Budget & Schedule'
                  }
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Bar inside Header */}
          <div className="flex gap-2 mt-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  s <= step ? "bg-white" : "bg-white/30"
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[55vh]">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="adset-name">Ad Set Name</Label>
                <Input
                  id="adset-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter ad set name"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Campaign</Label>
                <Select
                  value={formData.campaign_id}
                  onValueChange={(value) => {
                    // Find the selected campaign and set objective-specific defaults
                    const selectedCampaign = campaigns.find(c => c.id === value);
                    const objectiveConfig = selectedCampaign?.objective 
                      ? OBJECTIVE_CONFIGS[selectedCampaign.objective]
                      : null;
                    
                    // Check if campaign uses CBO
                    const campaignUsesCBO = !!(selectedCampaign?.daily_budget || selectedCampaign?.lifetime_budget);
                    
                    // Set default optimization goal from objective config
                    const defaultGoals = selectedCampaign?.objective
                      ? (OBJECTIVE_OPTIMIZATION_GOALS[selectedCampaign.objective] || DEFAULT_OPTIMIZATION_GOALS)
                      : DEFAULT_OPTIMIZATION_GOALS;
                    const defaultGoal = objectiveConfig?.defaultOptimizationGoal || defaultGoals[0]?.value || 'LINK_CLICKS';
                    
                    // Set default bid strategy from objective config
                    const defaultBidStrategy = objectiveConfig?.recommendedBidStrategy || 'LOWEST_COST_WITHOUT_CAP';
                    
                    // v24.0 2026: Set default budget sharing for Advantage+ campaigns
                    const isAdvantagePlus = selectedCampaign?.advantage_state_info && 
                                            selectedCampaign.advantage_state_info.advantage_state !== 'DISABLED';
                    const defaultBudgetSharing = isAdvantagePlus ? true : (formData.is_adset_budget_sharing_enabled ?? true);
                    
                    // Set default placement_soft_opt_out based on objective (only for Sales/Leads)
                    const defaultPlacementSoftOptOut = objectiveConfig?.supportsPlacementSoftOptOut ? false : undefined;

                    setFormData(prev => ({
                      ...prev,
                      campaign_id: value,
                      optimization_goal: defaultGoal as OptimizationGoal,
                      bid_strategy: defaultBidStrategy as BidStrategy,
                      // v24.0 2026: Enable budget sharing by default for Advantage+ campaigns
                      is_adset_budget_sharing_enabled: defaultBudgetSharing,
                      // Only set placement_soft_opt_out if supported by objective
                      ...(objectiveConfig?.supportsPlacementSoftOptOut !== undefined && {
                        placement_soft_opt_out: defaultPlacementSoftOptOut
                      }),
                      // Clear budget if campaign uses CBO
                      ...(campaignUsesCBO ? {
                        budget_type: undefined,
                        budget_amount: undefined
                      } : {})
                    }));
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.objective?.replace('OUTCOME_', '')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Optimization Goal</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Available goals based on your campaign objective
                </p>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {(() => {
                    const selectedCampaign = campaigns.find(c => c.id === formData.campaign_id);
                    const goals = selectedCampaign?.objective
                      ? (OBJECTIVE_OPTIMIZATION_GOALS[selectedCampaign.objective] || DEFAULT_OPTIMIZATION_GOALS)
                      : DEFAULT_OPTIMIZATION_GOALS;
                    return goals.map((goal: { value: string; label: string; description: string }) => (
                      <button
                        key={goal.value}
                        onClick={() => setFormData(prev => ({ ...prev, optimization_goal: goal.value as OptimizationGoal }))}
                        className={cn(
                          "p-3 rounded-xl border-2 text-left transition-all",
                          formData.optimization_goal === goal.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <p className="font-medium text-sm">{goal.label}</p>
                        <p className="text-xs text-muted-foreground">{goal.description}</p>
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {/* v24.0 2026 Advantage+ Audience Toggle */}
              <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-orange-100 dark:border-orange-900">
                      <Target className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Advantage+ Audience</p>
                      <p className="text-sm text-muted-foreground">
                        Let Meta's AI find the best audience. Targeting becomes advisory.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, advantage_audience: !prev.advantage_audience }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      formData.advantage_audience ? "bg-orange-500" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      formData.advantage_audience ? "translate-x-7" : "translate-x-1"
                    )} />
                  </button>
                </div>
                {formData.advantage_audience && (
                  <div className="mt-3 pl-12 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    Advantage+ Audience is active. Targeting is used as advisory signals.
                  </div>
                )}
              </div>

              {/* Location */}
              <div>
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Locations
                </Label>
                <Input
                  placeholder="Search for countries, regions, or cities..."
                  className="mt-2"
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {['US', 'CA', 'GB', 'AU', 'DE', 'FR'].map((country) => (
                    <button
                      key={country}
                      onClick={() => {
                        const countries = formData.targeting.geo_locations?.countries || [];
                        const newCountries = countries.includes(country)
                          ? countries.filter(c => c !== country)
                          : [...countries, country];
                        updateTargeting({
                          geo_locations: { ...formData.targeting.geo_locations, countries: newCountries }
                        });
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        formData.targeting.geo_locations?.countries?.includes(country)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {country}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age & Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Age Range</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      value={formData.targeting.age_min || 18}
                      onChange={(e) => updateTargeting({ age_min: parseInt(e.target.value) })}
                      min={13}
                      max={65}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="number"
                      value={formData.targeting.age_max || 65}
                      onChange={(e) => updateTargeting({ age_max: parseInt(e.target.value) })}
                      min={13}
                      max={65}
                      className="w-20"
                    />
                  </div>
                </div>
                <div>
                  <Label>Gender</Label>
                  <div className="flex gap-2 mt-2">
                    {[
                      { value: [], label: 'All' },
                      { value: [1], label: 'Male' },
                      { value: [2], label: 'Female' },
                    ].map((option) => (
                      <button
                        key={option.label}
                        onClick={() => updateTargeting({ genders: option.value as (1 | 2)[] })}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1",
                          JSON.stringify(formData.targeting.genders) === JSON.stringify(option.value)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interests */}
              <div>
                <Label className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Detailed Targeting (Interests & Behaviors)
                </Label>
                <Input
                  placeholder="Search interests, behaviors, demographics..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Add interests like "Technology", "Fitness", "Travel" to narrow your audience
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {/* v24.0 2026 Advantage+ Placements Toggle */}
              <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-orange-100 dark:border-orange-900">
                      <Globe className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Advantage+ Placements</p>
                      <p className="text-sm text-muted-foreground">
                        Maximize your budget across all Meta platforms.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, advantage_placements: !prev.advantage_placements }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      formData.advantage_placements ? "bg-orange-500" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      formData.advantage_placements ? "translate-x-7" : "translate-x-1"
                    )} />
                  </button>
                </div>
                {formData.advantage_placements && (
                  <div className="mt-3 pl-12 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    Recommended. Meta's AI will automatically allocate budget.
                  </div>
                )}
              </div>

              {!formData.advantage_placements && (
                <>
                  {/* Device Platforms */}
                  <div>
                    <Label className="flex items-center gap-2 mb-3">
                      <Smartphone className="w-4 h-4" />
                      Device Platforms
                    </Label>
                    <div className="flex gap-3">
                      {[
                        { value: 'mobile', label: 'Mobile', icon: Smartphone },
                        { value: 'desktop', label: 'Desktop', icon: Monitor },
                      ].map((device) => (
                        <button
                          key={device.value}
                          onClick={() => {
                            const platforms = formData.targeting.device_platforms || [];
                            const newPlatforms = platforms.includes(device.value as 'mobile' | 'desktop')
                              ? platforms.filter(p => p !== device.value)
                              : [...platforms, device.value as 'mobile' | 'desktop'];
                            updateTargeting({ device_platforms: newPlatforms });
                          }}
                          className={cn(
                            "flex-1 p-4 rounded-xl border-2 transition-all",
                            formData.targeting.device_platforms?.includes(device.value as 'mobile' | 'desktop')
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <device.icon className="w-6 h-6 mx-auto mb-2" />
                          <p className="font-medium text-sm">{device.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Placements */}
                  <div>
                    <Label className="flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4" />
                      Placements
                    </Label>
                    <div className="space-y-4">
                      {/* Facebook Placements */}
                      <div className="p-4 rounded-xl bg-muted/50">
                        <p className="font-medium mb-3 flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center text-white text-xs">f</span>
                          Facebook
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {LOCAL_PLACEMENTS.facebook.map((placement) => (
                            <button
                              key={placement.id}
                              onClick={() => {
                                const positions = formData.targeting.facebook_positions || [];
                                const newPositions = positions.includes(placement.id)
                                  ? positions.filter(p => p !== placement.id)
                                  : [...positions, placement.id];
                                updateTargeting({ facebook_positions: newPositions });
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                                formData.targeting.facebook_positions?.includes(placement.id)
                                  ? "bg-blue-500 text-white"
                                  : "bg-background hover:bg-muted"
                              )}
                            >
                              {placement.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Instagram Placements */}
                      <div className="p-4 rounded-xl bg-muted/50">
                        <p className="font-medium mb-3 flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs">ig</span>
                          Instagram
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {LOCAL_PLACEMENTS.instagram.map((placement) => (
                            <button
                              key={placement.id}
                              onClick={() => {
                                const positions = formData.targeting.instagram_positions || [];
                                const newPositions = positions.includes(placement.id)
                                  ? positions.filter(p => p !== placement.id)
                                  : [...positions, placement.id];
                                updateTargeting({ instagram_positions: newPositions });
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                                formData.targeting.instagram_positions?.includes(placement.id)
                                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                                  : "bg-background hover:bg-muted"
                              )}
                            >
                              {placement.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {/* CBO Notice */}
              {campaignUsesCBO && (
                <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-900/50">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm mt-0.5 border border-orange-100 dark:border-orange-900">
                      <DollarSign className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Campaign Budget Optimization Enabled</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This campaign uses a campaign-level budget (${((selectedCampaign?.daily_budget || selectedCampaign?.lifetime_budget || 0) / 100).toFixed(2)}/day).
                        The budget will be automatically distributed across ad sets.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign Bid Strategy Notice */}
              {campaignRequiresBidAmount && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-100">Bid Amount Required</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        This campaign uses <strong>{selectedCampaign?.bid_strategy?.replace(/_/g, ' ')}</strong> bid strategy.
                        You must provide a bid amount for this ad set.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Budget - only show if campaign doesn't use CBO */}
              {!campaignUsesCBO && (
                <>
                  <div>
                    <Label>Budget Type</Label>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, budget_type: 'daily' }))}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all",
                          formData.budget_type === 'daily'
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <Calendar className="w-5 h-5 mb-2 text-primary" />
                        <p className="font-medium">Daily Budget</p>
                        <p className="text-xs text-muted-foreground">Spend up to this amount each day</p>
                      </button>
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, budget_type: 'lifetime' }))}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all",
                          formData.budget_type === 'lifetime'
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <DollarSign className="w-5 h-5 mb-2 text-primary" />
                        <p className="font-medium">Lifetime Budget</p>
                        <p className="text-xs text-muted-foreground">Spend over the ad set duration</p>
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="budget-amount">
                      {formData.budget_type === 'daily' ? 'Daily' : 'Lifetime'} Budget (USD)
                    </Label>
                    <div className="relative mt-2">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="budget-amount"
                        type="number"
                        value={formData.budget_amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, budget_amount: parseFloat(e.target.value) || 0 }))}
                        className="pl-10"
                        min={1}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Bid Strategy - Only show if campaign doesn't use CBO */}
              {!campaignUsesCBO && (() => {
                // Get objective-specific bid strategies
                const objectiveConfig = selectedCampaign?.objective 
                  ? OBJECTIVE_CONFIGS[selectedCampaign.objective]
                  : null;
                const availableBidStrategies = objectiveConfig?.bidStrategies || BID_STRATEGIES.map(s => s.value);
                const filteredStrategies = BID_STRATEGIES.filter(s => availableBidStrategies.includes(s.value));
                
                return (
                  <div>
                    <Label>Bid Strategy</Label>
                    <Select
                      value={formData.bid_strategy || objectiveConfig?.recommendedBidStrategy || 'LOWEST_COST_WITHOUT_CAP'}
                      onValueChange={(value) => setFormData(prev => ({
                        ...prev,
                        bid_strategy: value as BidStrategy,
                        // Clear bid_amount if switching to lowest cost
                        bid_amount: value === 'LOWEST_COST_WITHOUT_CAP' ? undefined : prev.bid_amount
                      }))}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredStrategies.map(strategy => (
                          <SelectItem key={strategy.value} value={strategy.value}>
                            {strategy.label}{strategy.recommended ? ' (Recommended)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.bid_strategy === 'LOWEST_COST_WITH_BID_CAP'
                        ? 'Set a maximum bid for each optimization event'
                        : formData.bid_strategy === 'COST_CAP'
                          ? 'Set an average cost target per optimization event'
                          : formData.bid_strategy === 'LOWEST_COST_WITH_MIN_ROAS'
                            ? 'Set a minimum return on ad spend (ROAS)'
                            : 'Get the most results at the lowest cost'}
                    </p>
                  </div>
                );
              })()}

              {/* Show campaign bid strategy info when CBO is used */}
              {campaignUsesCBO && (
                <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-900/50">
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Campaign Budget Optimization Active
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bid strategy is managed at campaign level: <span className="font-semibold text-orange-500">
                      {selectedCampaign?.bid_strategy?.replace(/_/g, ' ') || 'Lowest Cost'}
                    </span>
                  </p>
                </div>
              )}

              {/* Bid Amount - show when campaign or ad set strategy requires it */}
              {(campaignRequiresBidAmount || (formData.bid_strategy && formData.bid_strategy !== 'LOWEST_COST_WITHOUT_CAP')) && (
                <div>
                  <Label htmlFor="bid-amount">
                    {(selectedCampaign?.bid_strategy === 'LOWEST_COST_WITH_BID_CAP' || formData.bid_strategy === 'LOWEST_COST_WITH_BID_CAP')
                      ? 'Bid Cap'
                      : 'Cost Cap'} (USD) <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative mt-2">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="bid-amount"
                      type="number"
                      value={formData.bid_amount || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, bid_amount: parseFloat(e.target.value) || undefined }))}
                      className="pl-10"
                      min={0.01}
                      step={0.01}
                      placeholder="e.g., 5.00"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.bid_strategy === 'LOWEST_COST_WITH_BID_CAP'
                      ? 'Maximum amount you\'ll pay per result'
                      : 'Average amount you want to pay per result'}
                  </p>
                </div>
              )}

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="datetime-local"
                    value={formData.start_time || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formData.end_time || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Attribution Settings (v24.0 2026) */}
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4" />
                  <Label>Attribution Settings (v24.0 2026)</Label>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 rounded-full">UPDATED</span>
                </div>
                <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-900/50 mb-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">
                      <strong>Jan 12, 2026 Update:</strong> 7-day and 28-day view-through windows are deprecated. Only 1-day view-through is allowed per v24.0 2026 standards.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Click-Through Window</Label>
                    <Select
                      value={formData.attribution_spec?.find(s => s.event_type === 'CLICK_THROUGH')?.window_days.toString() || '7'}
                      onValueChange={(val) => {
                        const days = parseInt(val) as 1 | 7 | 28;
                        const others = formData.attribution_spec?.filter(s => s.event_type !== 'CLICK_THROUGH') || [];
                        setFormData(prev => ({ ...prev, attribution_spec: [...others, { event_type: 'CLICK_THROUGH', window_days: days }] }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Day</SelectItem>
                        <SelectItem value="7">7 Days (Recommended)</SelectItem>
                        <SelectItem value="28">28 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Click-through attribution supports 1, 7, or 28 days
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">View-Through Window</Label>
                    <div className="p-2 rounded border bg-muted/50 text-sm font-medium">
                      1 Day (Required per 2026 standards)
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ✓ v24.0 2026 Compliance: View-through limited to 1 day only (7-day and 28-day deprecated)
                    </p>
                  </div>
                </div>
              </div>

              {/* v24.0 2026 Advanced Settings */}
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <Label>Advanced Settings (v24.0 2026)</Label>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full">2026</span>
                </div>

                {/* Budget Sharing Toggle */}
                <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-blue-100 dark:border-blue-900">
                        <DollarSign className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Budget Sharing</p>
                        <p className="text-sm text-muted-foreground">
                          Allow up to 20% budget sharing between ad sets (Recommended for Advantage+ campaigns)
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, is_adset_budget_sharing_enabled: !prev.is_adset_budget_sharing_enabled }))}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        formData.is_adset_budget_sharing_enabled ? "bg-blue-500" : "bg-muted"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        formData.is_adset_budget_sharing_enabled ? "translate-x-7" : "translate-x-1"
                      )} />
                    </button>
                  </div>
                  {formData.is_adset_budget_sharing_enabled && (
                    <div className="mt-3 pl-12 flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Meta can reallocate up to 20% of budget to higher-performing ad sets for better optimization
                    </div>
                  )}
                  {!formData.is_adset_budget_sharing_enabled && selectedCampaign?.advantage_state_info && selectedCampaign.advantage_state_info.advantage_state !== 'DISABLED' && (
                    <div className="mt-3 pl-12 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-3 h-3" />
                      Recommended: Enable budget sharing for Advantage+ campaigns
                    </div>
                  )}
                </div>

                {/* Placement Soft Opt-Out Toggle - Only for Sales/Leads */}
                {selectedCampaign?.objective && OBJECTIVE_CONFIGS[selectedCampaign.objective]?.supportsPlacementSoftOptOut && (
                  <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200/50 dark:border-purple-900/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-purple-100 dark:border-purple-900">
                          <Globe className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Placement Soft Opt-Out</p>
                          <p className="text-sm text-muted-foreground">
                            Allow 5% spend on excluded placements for optimization
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, placement_soft_opt_out: !prev.placement_soft_opt_out }))}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          formData.placement_soft_opt_out ? "bg-purple-500" : "bg-muted"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                          formData.placement_soft_opt_out ? "translate-x-7" : "translate-x-1"
                        )} />
                      </button>
                    </div>
                    {formData.placement_soft_opt_out && (
                      <div className="mt-3 pl-12 flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        Meta may spend up to 5% on excluded placements to improve results
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-muted/30">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          <Button
            onClick={() => step < 4 ? setStep(step + 1) : onSubmit()}
            disabled={
              isSubmitting ||
              (step === 1 && (!formData.name || !formData.campaign_id)) ||
              (step === 4 && (
                // Require bid_amount if campaign's bid_strategy needs it
                (campaignRequiresBidAmount && !formData.bid_amount) ||
                // Or if ad set's bid_strategy needs it
                (formData.bid_strategy &&
                  formData.bid_strategy !== 'LOWEST_COST_WITHOUT_CAP' &&
                  !formData.bid_amount)
              ))
            }
            className="gap-2"
          >
            {step < 4 ? (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            ) : isSubmitting ? 'Creating...' : 'Create Ad Set'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function EditAdSetModal({
  adSet,
  formData,
  setFormData,
  campaign,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  adSet: AdSet;
  formData: Partial<AdSetFormData>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<AdSetFormData>>>;
  campaign?: Campaign;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4 scrollbar-hide">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white p-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Edit className="w-5 h-5" />
              <div>
                <h2 className="text-xl font-bold text-white">Edit Ad Set</h2>
                <p className="text-sm text-white/80">Update ad set settings (v24.0 2026)</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Ad Set Name</Label>
              <Input
                id="edit-name"
                value={formData.name || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={formData.status || 'PAUSED'}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as AdSetStatus }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Budget Type</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  onClick={() => setFormData(prev => ({ ...prev, budget_type: 'daily' }))}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    formData.budget_type === 'daily'
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <p className="font-semibold">Daily Budget</p>
                  <p className="text-sm text-muted-foreground">Set a daily spending limit</p>
                </button>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, budget_type: 'lifetime' }))}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    formData.budget_type === 'lifetime'
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <p className="font-semibold">Lifetime Budget</p>
                  <p className="text-sm text-muted-foreground">Set total budget for campaign</p>
                </button>
              </div>
              {formData.budget_type && (
                <div className="mt-2">
                  <Label htmlFor="edit-budget">Budget Amount ($)</Label>
                  <Input
                    id="edit-budget"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.budget_amount || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, budget_amount: parseFloat(e.target.value) || 0 }))}
                    className="mt-2"
                  />
                </div>
              )}
            </div>
          </div>

          {/* v24.0 2026 Advanced Settings */}
          <div className="pt-4 border-t space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" />
              <Label>Advanced Settings (v24.0 2026)</Label>
            </div>

            {/* Budget Sharing Toggle */}
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-blue-100 dark:border-blue-900">
                    <DollarSign className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Budget Sharing</p>
                    <p className="text-sm text-muted-foreground">
                      Allow up to 20% budget sharing between ad sets
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, is_adset_budget_sharing_enabled: !(prev.is_adset_budget_sharing_enabled ?? true) }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    (formData.is_adset_budget_sharing_enabled ?? true) ? "bg-blue-500" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    (formData.is_adset_budget_sharing_enabled ?? true) ? "translate-x-7" : "translate-x-1"
                  )} />
                </button>
              </div>
            </div>

            {/* Placement Soft Opt-Out - Only for Sales/Leads */}
            {campaign?.objective && OBJECTIVE_CONFIGS[campaign.objective]?.supportsPlacementSoftOptOut && (
              <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200/50 dark:border-purple-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-purple-100 dark:border-purple-900">
                      <Globe className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Placement Soft Opt-Out</p>
                      <p className="text-sm text-muted-foreground">
                        Allow 5% spend on excluded placements
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, placement_soft_opt_out: !(prev.placement_soft_opt_out ?? false) }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      (formData.placement_soft_opt_out ?? false) ? "bg-purple-500" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      (formData.placement_soft_opt_out ?? false) ? "translate-x-7" : "translate-x-1"
                    )} />
                  </button>
                </div>
              </div>
            )}

            {/* Attribution Settings (v24.0 2026) */}
            <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-900/50">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4" />
                <Label>Attribution Settings (v24.0 2026)</Label>
              </div>
              <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-900/50 mb-4">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-300">
                    <strong>Jan 12, 2026 Update:</strong> View-through limited to 1 day only per v24.0 2026 standards.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Click-Through Window</Label>
                  <Select
                    value={formData.attribution_spec?.find(s => s.event_type === 'CLICK_THROUGH')?.window_days.toString() || '7'}
                    onValueChange={(val) => {
                      const days = parseInt(val) as 1 | 7 | 28;
                      const others = formData.attribution_spec?.filter(s => s.event_type !== 'CLICK_THROUGH') || [];
                      setFormData(prev => ({ ...prev, attribution_spec: [...others, { event_type: 'CLICK_THROUGH', window_days: days }] }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Day</SelectItem>
                      <SelectItem value="7">7 Days</SelectItem>
                      <SelectItem value="28">28 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">View-Through Window</Label>
                  <div className="p-2 rounded border bg-muted/50 text-sm font-medium">
                    1 Day (Required per 2026 standards)
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    ✓ v24.0 2026 Compliance: View-through limited to 1 day only
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !formData.name}>
            {isSubmitting ? 'Updating...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
