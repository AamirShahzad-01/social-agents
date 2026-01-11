'use client';

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Play,
  Pause,
  Trash2,
  Edit,
  Copy,
  TrendingUp,
  TrendingDown,
  Megaphone,
  ChevronDown,
  ChevronRight,
  Calendar,
  DollarSign,
  Eye,
  MousePointerClick,
  X,
  Target,
  Image,
  Layers,
  CheckSquare,
  Square,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type {
  Campaign,
  CampaignFormData,
  CampaignObjective,
  CampaignStatus,
  BidStrategy,
  SpecialAdCategory,
  AdvantageStateInfo,
} from '@/types/metaAds';
import { CAMPAIGN_OBJECTIVES, BID_STRATEGIES } from '@/types/metaAds';
import AdvantageStateIndicator from './AdvantageStateIndicator';
import AdvantagePlusWizard from './AdvantagePlusWizard';

interface CampaignManagerProps {
  campaigns: Campaign[];
  adSets?: any[];
  ads?: any[];
  onRefresh: () => void;
  showCreate?: boolean;
  onShowCreateChange?: (show: boolean) => void;
  onCreateAdSet?: (campaignId: string) => void;
  onCreateAd?: (adSetId: string) => void;
}

// Default form data for edit modal (Create uses AdvantagePlusWizard)
const initialFormData: CampaignFormData = {
  name: '',
  objective: 'OUTCOME_TRAFFIC',
  status: 'PAUSED',
  buying_type: 'AUCTION',
  budget_type: 'daily',
  budget_amount: 20,
  special_ad_categories: [],
  is_campaign_budget_optimization: true,
};

export default function CampaignManager({ campaigns = [], adSets = [], ads = [], onRefresh, showCreate, onShowCreateChange, onCreateAdSet, onCreateAd }: CampaignManagerProps) {
  const [showAdvantageWizard, setShowAdvantageWizard] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Sync with external showCreate prop - opens Advantage+ wizard (v24.0 2026)
  React.useEffect(() => {
    if (showCreate !== undefined) {
      setShowAdvantageWizard(showCreate);
    }
  }, [showCreate]);

  const handleWizardChange = (show: boolean) => {
    setShowAdvantageWizard(show);
    onShowCreateChange?.(show);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Form data used only for editing existing campaigns
  const [editFormData, setEditFormData] = useState<CampaignFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Bulk selection state
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);



  // If a campaign is selected, show its detail view
  if (selectedCampaign) {
    const campaignAdSets = adSets.filter(as => as.campaign_id === selectedCampaign.id);
    const campaignAds = ads.filter(ad => campaignAdSets.some(as => as.id === ad.adset_id));

    return (
      <CampaignDetailView
        campaign={selectedCampaign}
        adSets={campaignAdSets}
        ads={campaignAds}
        onBack={() => setSelectedCampaign(null)}
        onRefresh={onRefresh}
        onCreateAdSet={onCreateAdSet}
        onCreateAd={onCreateAd}
      />
    );
  }

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    return matchesSearch && matchesStatus;
  });



  const handleStatusChange = async (campaignId: string, newStatus: CampaignStatus) => {
    try {
      const response = await fetch(`/api/v1/meta-ads/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        toast.success(`Campaign ${newStatus === 'ACTIVE' ? 'activated' : 'paused'} successfully`);
        onRefresh();
      } else {
        const data = await response.json();
        toast.error(`Failed to update campaign: ${data.detail || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error('Failed to update campaign status');
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setEditFormData({
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      buying_type: campaign.buying_type || 'AUCTION',
      budget_type: campaign.daily_budget ? 'daily' : 'lifetime',
      budget_amount: campaign.daily_budget ? campaign.daily_budget / 100 : campaign.lifetime_budget ? campaign.lifetime_budget / 100 : 20,
      special_ad_categories: campaign.special_ad_categories || [],
      is_campaign_budget_optimization: campaign.is_campaign_budget_optimization ?? true,
    });
    setShowEditModal(true);
  };

  const handleUpdateCampaign = async () => {
    if (!editingCampaign) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/meta-ads/campaigns/${editingCampaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      if (response.ok) {
        toast.success('Campaign updated successfully');
        setShowEditModal(false);
        setEditingCampaign(null);
        setEditFormData(initialFormData);
        onRefresh();
      } else {
        const data = await response.json();
        toast.error(`Failed to update campaign: ${data.detail || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error('Failed to update campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicateCampaign = async (campaign: Campaign) => {
    try {
      const response = await fetch(`/api/v1/meta-ads/campaigns/${campaign.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: `${campaign.name} (Copy)`,
        }),
      });

      if (response.ok) {
        toast.success('Campaign duplicated successfully');
        onRefresh();
      } else {
        const data = await response.json();
        toast.error(`Failed to duplicate campaign: ${data.detail || data.error || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error('Failed to duplicate campaign');
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (!confirm(`Are you sure you want to delete "${campaign.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/v1/meta-ads/campaigns/${campaign.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        toast.success('Campaign deleted successfully');
        onRefresh();
      } else {
        const data = await response.json();
        toast.error(`Failed to delete campaign: ${data.detail || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error('Failed to delete campaign');
    }
  };

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedCampaignIds.size === filteredCampaigns.length) {
      setSelectedCampaignIds(new Set());
    } else {
      setSelectedCampaignIds(new Set(filteredCampaigns.map(c => c.id)));
    }
  };

  const handleSelectCampaign = (campaignId: string) => {
    const newSelected = new Set(selectedCampaignIds);
    if (newSelected.has(campaignId)) {
      newSelected.delete(campaignId);
    } else {
      newSelected.add(campaignId);
    }
    setSelectedCampaignIds(newSelected);
  };

  const handleBulkAction = async (action: 'PAUSE' | 'ACTIVATE' | 'DELETE' | 'ARCHIVE') => {
    if (selectedCampaignIds.size === 0) return;

    if (action === 'DELETE' && !confirm(`Are you sure you want to delete ${selectedCampaignIds.size} campaign(s)?`)) {
      return;
    }

    setIsBulkUpdating(true);
    try {
      const response = await fetch('/api/v1/meta-ads/campaigns/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedCampaignIds),
          action: action,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        toast.success(`${data.processed} campaign(s) ${action.toLowerCase()}d successfully`);
        setSelectedCampaignIds(new Set());
        onRefresh();
      } else {
        toast.error(`Bulk action failed: ${data.failed || 0} failed`);
      }
    } catch (error) {
      toast.error('Bulk action failed');
      console.error('Bulk action failed:', error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const isAllSelected = filteredCampaigns.length > 0 && selectedCampaignIds.size === filteredCampaigns.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <p className="text-sm text-muted-foreground">Manage your advertising campaigns</p>
        </div>
        <Button
          onClick={() => handleWizardChange(true)}
          size="sm"
          className="h-9 gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md"
        >
          <Sparkles className="w-4 h-4" />
          Create Campaign
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCampaignIds.size > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedCampaignIds.size} campaign{selectedCampaignIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction('ACTIVATE')}
                disabled={isBulkUpdating}
                className="gap-1"
              >
                {isBulkUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Activate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction('PAUSE')}
                disabled={isBulkUpdating}
                className="gap-1"
              >
                {isBulkUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction('ARCHIVE')}
                disabled={isBulkUpdating}
                className="gap-1"
              >
                {isBulkUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                Archive
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction('DELETE')}
                disabled={isBulkUpdating}
                className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {isBulkUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCampaignIds(new Set())}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaigns Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-3 w-10">
                  <button
                    onClick={handleSelectAll}
                    className="w-4 h-4 flex items-center justify-center"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Campaign</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Budget</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Spend</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Impr.</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Clicks</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">CTR</th>
                <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.length > 0 ? (
                filteredCampaigns.map((campaign) => (
                  <CampaignRow
                    key={campaign.id}
                    campaign={campaign}
                    adSets={adSets.filter(as => as.campaign_id === campaign.id)}
                    ads={ads}
                    isSelected={selectedCampaignIds.has(campaign.id)}
                    onToggleSelect={() => handleSelectCampaign(campaign.id)}
                    onSelect={() => setSelectedCampaign(campaign)}
                    onStatusChange={handleStatusChange}
                    onEdit={handleEditCampaign}
                    onDuplicate={handleDuplicateCampaign}
                    onDelete={handleDeleteCampaign}
                    onCreateAdSet={onCreateAdSet}
                    onCreateAd={onCreateAd}
                    onRefresh={onRefresh}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="p-4 rounded-full bg-muted mb-4">
                        <Megaphone className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold mb-1">No campaigns found</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {searchQuery ? 'Try adjusting your search' : 'Create your first campaign to get started'}
                      </p>
                      <Button onClick={() => handleWizardChange(true)} size="sm" className="h-9 gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md">
                        <Sparkles className="w-4 h-4" />
                        Create Campaign
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>



      {/* Edit Campaign Modal */}
      {showEditModal && editingCampaign && (
        <EditCampaignModal
          campaign={editingCampaign}
          formData={editFormData}
          setFormData={setEditFormData}
          onClose={() => {
            setShowEditModal(false);
            setEditingCampaign(null);
            setEditFormData(initialFormData);
          }}
          onSubmit={handleUpdateCampaign}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Advantage+ Campaign Wizard (v24.0 2026 Unified Experience) */}
      {showAdvantageWizard && (
        <AdvantagePlusWizard
          onClose={() => handleWizardChange(false)}
          onSuccess={() => {
            handleWizardChange(false);
            onRefresh();
          }}
        />
      )}
    </div >
  );
}

function CampaignRow({
  campaign,
  adSets,
  ads,
  isSelected,
  onToggleSelect,
  onSelect,
  onStatusChange,
  onEdit,
  onDuplicate,
  onDelete,
  onCreateAdSet,
  onCreateAd,
  onRefresh,
}: {
  campaign: Campaign;
  adSets: any[];
  ads: any[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onSelect: () => void;
  onStatusChange: (id: string, status: CampaignStatus) => void;
  onEdit: (campaign: Campaign) => void;
  onDuplicate: (campaign: Campaign) => void;
  onDelete: (campaign: Campaign) => void;
  onCreateAdSet?: (campaignId: string) => void;
  onCreateAd?: (adSetId: string) => void;
  onRefresh?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingAdSet, setEditingAdSet] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', status: 'PAUSED', daily_budget: '' });

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500 text-white',
    PAUSED: 'bg-slate-500 text-white',
    DELETED: 'bg-red-500 text-white',
    ARCHIVED: 'bg-slate-400 text-white',
  };

  const ctr = campaign.insights?.impressions
    ? ((campaign.insights.clicks / campaign.insights.impressions) * 100).toFixed(2)
    : '0.00';

  return (
    <>
      {/* Campaign Row */}
      <tr className={cn(
        "border-b hover:bg-muted/30 transition-colors",
        isSelected && "bg-primary/5",
        isExpanded && "bg-muted/20"
      )}>
        <td className="p-3 w-10">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className="w-4 h-4 flex items-center justify-center"
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <ChevronRight className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-90"
              )} />
            </button>
            <div className="flex items-center gap-2.5 cursor-pointer group" onClick={onSelect}>
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">{campaign.name}</p>
                  {/* v24.0 2026 Advantage+ Badge */}
                  {campaign.advantage_state_info && campaign.advantage_state_info.advantage_state !== 'DISABLED' && (
                    <AdvantageStateIndicator advantageState={campaign.advantage_state_info} size="sm" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {campaign.objective.replace('OUTCOME_', '')} • {adSets.length} Ad Set{adSets.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
        </td>
        <td className="p-3">
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
            statusColors[campaign.status]
          )}>
            {campaign.status === 'ACTIVE' ? 'Active' :
              campaign.status === 'PAUSED' ? 'Paused' :
                campaign.status === 'DELETED' ? 'Deleted' :
                  campaign.status === 'ARCHIVED' ? 'Archived' : campaign.status}
          </span>
        </td>
        <td className="p-3 text-right text-sm">
          ${campaign.daily_budget ? (campaign.daily_budget / 100).toFixed(0) : '0'}/day
        </td>
        <td className="p-3 text-right text-sm font-medium">
          ${(campaign.insights?.spend || 0).toFixed(2)}
        </td>
        <td className="p-3 text-right text-sm hidden md:table-cell">
          {formatNumber(campaign.insights?.impressions || 0)}
        </td>
        <td className="p-3 text-right text-sm hidden sm:table-cell">
          {formatNumber(campaign.insights?.clicks || 0)}
        </td>
        <td className="p-3 text-right text-sm hidden lg:table-cell">
          <span className={parseFloat(ctr) > 1.5 ? 'text-green-600' : 'text-muted-foreground'}>
            {ctr}%
          </span>
        </td>
        <td className="p-3 w-16">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onCreateAdSet?.(campaign.id)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Ad Set
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSelect}>
                <Layers className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => campaign.status === 'ACTIVE' ? onStatusChange(campaign.id, 'PAUSED') : onStatusChange(campaign.id, 'ACTIVE')}>
                {campaign.status === 'ACTIVE' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {campaign.status === 'ACTIVE' ? 'Pause' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(campaign)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(campaign)}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                const action = campaign.status === 'ARCHIVED' ? 'unarchive' : 'archive';
                try {
                  const res = await fetch(`/api/v1/meta-ads/campaigns/${campaign.id}/${action}`, {
                    method: 'POST'
                  });
                  const data = await res.json();
                  if (res.ok) {
                    toast.success(`Campaign ${action === 'archive' ? 'archived' : 'unarchived'} successfully`);
                    onRefresh?.();
                  } else {
                    const errorMsg = data?.error || data?.detail || `Failed to ${action} campaign`;
                    toast.error(errorMsg);
                  }
                } catch (err) {
                  console.error(`Error ${action}ing campaign:`, err);
                  toast.error(`Failed to ${action} campaign`);
                }
              }}>
                <Layers className="w-4 h-4 mr-2" />
                {campaign.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(campaign)} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {/* Expanded Ad Sets */}
      {isExpanded && adSets.length > 0 && adSets.map((adSet) => {
        const adSetAds = ads.filter(ad => ad.adset_id === adSet.id);
        const adSetCtr = adSet.insights?.impressions
          ? ((adSet.insights.clicks / adSet.insights.impressions) * 100).toFixed(2)
          : '0.00';
        return (
          <tr key={adSet.id} className="border-b bg-muted/10 hover:bg-muted/20">
            <td className="p-3"></td>
            <td className="p-3 pl-12">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white">
                  <Target className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{adSet.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {adSet.optimization_goal?.replace('_', ' ')} • {adSetAds.length} Ad{adSetAds.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </td>
            <td className="p-3">
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColors[adSet.status] || statusColors.PAUSED)}>
                {adSet.status}
              </span>
            </td>
            <td className="p-3 text-right text-sm text-muted-foreground">
              ${adSet.daily_budget ? (adSet.daily_budget / 100).toFixed(0) : '-'}/day
            </td>
            <td className="p-3 text-right text-sm">${(adSet.insights?.spend || 0).toFixed(2)}</td>
            <td className="p-3 text-right text-sm hidden md:table-cell">{formatNumber(adSet.insights?.impressions || 0)}</td>
            <td className="p-3 text-right text-sm hidden sm:table-cell">{formatNumber(adSet.insights?.clicks || 0)}</td>
            <td className="p-3 text-right text-sm hidden lg:table-cell">
              <span className={parseFloat(adSetCtr) > 1.5 ? 'text-green-600' : 'text-muted-foreground'}>
                {adSetCtr}%
              </span>
            </td>
            <td className="p-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onCreateAd?.(adSet.id)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Ad
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => {
                    const newStatus = adSet.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                    try {
                      const res = await fetch(`/api/v1/meta-ads/adsets/${adSet.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success(`Ad Set ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`);
                        onRefresh?.();
                      } else {
                        const errorMsg = data?.error || data?.detail || 'Failed to update ad set status';
                        toast.error(errorMsg);
                      }
                    } catch (err) {
                      console.error('Error updating ad set status:', err);
                      toast.error('Failed to update ad set status');
                    }
                  }}>
                    {adSet.status === 'ACTIVE' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {adSet.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setEditFormData({
                      name: adSet.name || '',
                      status: adSet.status || 'PAUSED',
                      daily_budget: adSet.daily_budget ? (adSet.daily_budget / 100).toString() : ''
                    });
                    setEditingAdSet(adSet);
                  }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    try {
                      const res = await fetch(`/api/v1/meta-ads/adsets/${adSet.id}/duplicate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ new_name: `${adSet.name} (Copy)` })
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success('Ad Set duplicated successfully');
                        onRefresh?.();
                      } else {
                        const errorMsg = data?.error || data?.detail || 'Failed to duplicate ad set';
                        toast.error(errorMsg);
                      }
                    } catch (err) {
                      console.error('Error duplicating ad set:', err);
                      toast.error('Failed to duplicate ad set');
                    }
                  }}>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    const action = adSet.status === 'ARCHIVED' ? 'unarchive' : 'archive';
                    try {
                      const res = await fetch(`/api/v1/meta-ads/adsets/${adSet.id}/${action}`, {
                        method: 'POST'
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success(`Ad Set ${action === 'archive' ? 'archived' : 'unarchived'}`);
                        onRefresh?.();
                      } else {
                        const errorMsg = data?.error || data?.detail || `Failed to ${action} ad set`;
                        toast.error(errorMsg);
                      }
                    } catch (err) {
                      console.error(`Error ${action}ing ad set:`, err);
                      toast.error(`Failed to ${action} ad set`);
                    }
                  }}>
                    <Layers className="w-4 h-4 mr-2" />
                    {adSet.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={async () => {
                      if (!confirm('Are you sure you want to delete this ad set? This action cannot be undone.')) return;
                      try {
                        const res = await fetch(`/api/v1/meta-ads/adsets/${adSet.id}`, {
                          method: 'DELETE'
                        });
                        if (res.ok || res.status === 204) {
                          toast.success('Ad Set deleted successfully');
                          onRefresh?.();
                        } else {
                          const data = await res.json().catch(() => ({}));
                          const errorMsg = data?.error || data?.detail || 'Failed to delete ad set';
                          toast.error(errorMsg);
                        }
                      } catch (err) {
                        console.error('Error deleting ad set:', err);
                        toast.error('Failed to delete ad set');
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        );
      })}

      {/* Empty Ad Sets message */}
      {isExpanded && adSets.length === 0 && (
        <tr className="border-b bg-muted/10">
          <td className="p-3"></td>
          <td colSpan={8} className="p-3 pl-12">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="w-4 h-4" />
              <span>No ad sets yet.</span>
              <button
                onClick={() => onCreateAdSet?.(campaign.id)}
                className="text-primary hover:underline"
              >
                Create one
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* Edit Ad Set Modal */}
      {editingAdSet && (
        <tr className="border-b">
          <td colSpan={10} className="p-0">
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
              <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Edit Ad Set</h3>
                  <button onClick={() => setEditingAdSet(null)} className="p-1 hover:bg-muted rounded">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="adset-name">Name</Label>
                    <Input
                      id="adset-name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="adset-status">Status</Label>
                    <Select
                      value={editFormData.status}
                      onValueChange={(value) => setEditFormData(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="PAUSED">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="adset-budget">Daily Budget ($)</Label>
                    <Input
                      id="adset-budget"
                      type="number"
                      value={editFormData.daily_budget}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, daily_budget: e.target.value }))}
                      placeholder="Enter daily budget"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="outline" onClick={() => setEditingAdSet(null)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={async () => {
                      try {
                        const updateData: any = { name: editFormData.name, status: editFormData.status };
                        if (editFormData.daily_budget) {
                          updateData.budget_amount = parseFloat(editFormData.daily_budget);
                        }
                        const res = await fetch(`/api/v1/meta-ads/adsets/${editingAdSet.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(updateData)
                        });
                        const data = await res.json();
                        if (res.ok) {
                          if (data.warning) {
                            toast.success('Ad Set updated');
                            toast(data.warning, { icon: '⚠️', duration: 6000 });
                          } else {
                            toast.success('Ad Set updated successfully');
                          }
                          setEditingAdSet(null);
                          onRefresh?.();
                        } else {
                          const errorMsg = data?.error || data?.detail || 'Failed to update ad set';
                          toast.error(errorMsg);
                        }
                      } catch (err) {
                        console.error('Error updating ad set:', err);
                        toast.error('Failed to update ad set');
                      }
                    }}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Campaign Detail View - shows all ad sets and ads for a single campaign
function CampaignDetailView({
  campaign,
  adSets,
  ads,
  onBack,
  onRefresh,
  onCreateAdSet,
  onCreateAd,
}: {
  campaign: Campaign;
  adSets: any[];
  ads: any[];
  onBack: () => void;
  onRefresh: () => void;
  onCreateAdSet?: (campaignId: string) => void;
  onCreateAd?: (adSetId: string) => void;
}) {
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500 text-white',
    PAUSED: 'bg-slate-500 text-white',
    DELETED: 'bg-red-500 text-white',
    ARCHIVED: 'bg-slate-400 text-white',
  };

  // Calculate campaign totals
  const totalSpend = adSets.reduce((sum, as) => sum + (as.insights?.spend || 0), 0) + (campaign.insights?.spend || 0);
  const totalImpressions = adSets.reduce((sum, as) => sum + (as.insights?.impressions || 0), 0) + (campaign.insights?.impressions || 0);
  const totalClicks = adSets.reduce((sum, as) => sum + (as.insights?.clicks || 0), 0) + (campaign.insights?.clicks || 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronRight className="w-5 h-5 rotate-180" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{campaign.name}</h2>
                {/* v24.0 2026 Advantage+ Badge */}
                {campaign.advantage_state_info && campaign.advantage_state_info.advantage_state !== 'DISABLED' && (
                  <AdvantageStateIndicator advantageState={campaign.advantage_state_info} size="md" />
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{campaign.objective.replace('OUTCOME_', '')}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[campaign.status])}>
                  {campaign.status}
                </span>
              </div>
            </div>
          </div>
        </div>
        <Button onClick={() => onCreateAdSet?.(campaign.id)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Ad Set
        </Button>
      </div>

      {/* v24.0 2026 Advantage+ State Card - Show detailed automation lever status */}
      {campaign.advantage_state_info && (
        <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
          <CardContent className="p-4">
            <AdvantageStateIndicator advantageState={campaign.advantage_state_info} showDetails />
          </CardContent>
        </Card>
      )}

      {/* Campaign Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Spend</p>
            <p className="text-2xl font-bold">${totalSpend.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Impressions</p>
            <p className="text-2xl font-bold">{formatNumber(totalImpressions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Clicks</p>
            <p className="text-2xl font-bold">{formatNumber(totalClicks)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">CTR</p>
            <p className="text-2xl font-bold">{ctr}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Ad Sets List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Ad Sets ({adSets.length})
              </CardTitle>
              <CardDescription>Manage ad sets within this campaign</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {adSets.length > 0 ? (
            <div className="space-y-4">
              {adSets.map((adSet) => {
                const adSetAds = ads.filter(a => a.adset_id === adSet.id);
                const adSetCtr = adSet.insights?.impressions
                  ? ((adSet.insights.clicks / adSet.insights.impressions) * 100).toFixed(2)
                  : '0.00';

                return (
                  <div key={adSet.id} className="border rounded-lg">
                    {/* Ad Set Header */}
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white">
                          <Target className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{adSet.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {adSet.optimization_goal?.replace(/_/g, ' ')} â€¢ {adSetAds.length} Ad{adSetAds.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Budget</p>
                          <p className="font-medium">${(adSet.daily_budget || 0) / 100}/day</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Spend</p>
                          <p className="font-medium">${(adSet.insights?.spend || 0).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Impressions</p>
                          <p className="font-medium">{formatNumber(adSet.insights?.impressions || 0)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Clicks</p>
                          <p className="font-medium">{formatNumber(adSet.insights?.clicks || 0)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">CTR</p>
                          <p className="font-medium">{adSetCtr}%</p>
                        </div>
                        <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusColors[adSet.status] || statusColors.PAUSED)}>
                          {adSet.status}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onCreateAd?.(adSet.id)}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Ad
                        </Button>
                      </div>
                    </div>

                    {/* Ads within this Ad Set */}
                    {adSetAds.length > 0 && (
                      <div className="border-t bg-muted/20 p-4">
                        <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                          <Image className="w-3 h-3" />
                          Ads in this Ad Set
                        </p>
                        <div className="grid gap-2">
                          {adSetAds.map((ad) => (
                            <div
                              key={ad.id}
                              className="flex items-center justify-between p-3 rounded-md bg-background border"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                                  <Image className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{ad.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Created {new Date(ad.created_time).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Spend</p>
                                  <p className="text-sm font-medium">${(ad.insights?.spend || 0).toFixed(2)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Impressions</p>
                                  <p className="text-sm font-medium">{formatNumber(ad.insights?.impressions || 0)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Clicks</p>
                                  <p className="text-sm font-medium">{formatNumber(ad.insights?.clicks || 0)}</p>
                                </div>
                                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[ad.status] || statusColors.PAUSED)}>
                                  {ad.status}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={async () => {
                                      const newStatus = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                                      try {
                                        const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ status: newStatus })
                                        });
                                        if (res.ok) {
                                          toast.success(`Ad ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`);
                                          onRefresh();
                                        } else {
                                          toast.error('Failed to update ad status');
                                        }
                                      } catch {
                                        toast.error('Failed to update ad status');
                                      }
                                    }}>
                                      {ad.status === 'ACTIVE' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                      {ad.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/preview`);
                                        if (res.ok) {
                                          const data = await res.json();
                                          if (data.preview?.previews?.[0]?.body) {
                                            const win = window.open('', '_blank', 'width=600,height=800');
                                            if (win) win.document.write(data.preview.previews[0].body);
                                          } else toast.error('No preview available');
                                        } else toast.error('Failed to get preview');
                                      } catch { toast.error('Failed to get preview'); }
                                    }}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      Preview
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/duplicate`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ new_name: `${ad.name} (Copy)` })
                                        });
                                        if (res.ok) { toast.success('Ad duplicated'); onRefresh(); }
                                        else toast.error('Failed to duplicate ad');
                                      } catch { toast.error('Failed to duplicate ad'); }
                                    }}>
                                      <Copy className="w-4 h-4 mr-2" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={async () => {
                                      const action = ad.status === 'ARCHIVED' ? 'unarchive' : 'archive';
                                      try {
                                        const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/${action}`, { method: 'POST' });
                                        if (res.ok) { toast.success(`Ad ${action}d`); onRefresh(); }
                                        else toast.error(`Failed to ${action} ad`);
                                      } catch { toast.error(`Failed to ${action} ad`); }
                                    }}>
                                      <Layers className="w-4 h-4 mr-2" />
                                      {ad.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600" onClick={async () => {
                                      if (!confirm('Delete this ad?')) return;
                                      try {
                                        const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}`, { method: 'DELETE' });
                                        if (res.ok) { toast.success('Ad deleted'); onRefresh(); }
                                        else toast.error('Failed to delete ad');
                                      } catch { toast.error('Failed to delete ad'); }
                                    }}>
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {adSetAds.length === 0 && (
                      <div className="border-t bg-muted/10 p-4 text-center">
                        <p className="text-sm text-muted-foreground">No ads yet</p>
                        <Button
                          size="sm"
                          variant="link"
                          onClick={() => onCreateAd?.(adSet.id)}
                        >
                          Create your first ad
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold mb-1">No ad sets yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first ad set to start running ads
              </p>
              <Button onClick={() => onCreateAdSet?.(campaign.id)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Ad Set
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Ad Set Row Component (nested within Campaign - kept for reference but not used in detail view)
function AdSetRow({
  adSet,
  ads,
  onCreateAd
}: {
  adSet: any;
  ads: any[];
  onCreateAd?: (adSetId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    DELETED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    ARCHIVED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };

  return (
    <div className="border rounded-lg bg-background">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <button className="p-1">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <p className="font-medium text-sm">{adSet.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              {adSet.optimization_goal?.replace('_', ' ')}
              <span className="bg-muted px-1.5 py-0.5 rounded">
                {ads.length} Ad{ads.length !== 1 ? 's' : ''}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <p className="font-medium">${(adSet.daily_budget || 0) / 100}/day</p>
          </div>
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[adSet.status] || statusColors.PAUSED)}>
            {adSet.status}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onCreateAd?.(adSet.id);
            }}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Ad
          </Button>
        </div>
      </div>

      {/* Expanded Ads */}
      {isExpanded && (
        <div className="border-t p-3 pl-12 bg-muted/10">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Image className="w-3 h-3" />
              Ads in this Ad Set
            </h5>
          </div>

          {ads.length > 0 ? (
            <div className="space-y-1">
              {ads.map((ad) => (
                <div
                  key={ad.id}
                  className="flex items-center justify-between p-2 rounded-md bg-background border"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                      <Image className="w-3 h-3" />
                    </div>
                    <span className="text-sm font-medium">{ad.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[ad.status] || statusColors.PAUSED)}>
                      {ad.status}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={async () => {
                          const newStatus = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                          try {
                            const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: newStatus })
                            });
                            if (res.ok) {
                              toast.success(`Ad ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`);
                            } else {
                              toast.error('Failed to update ad status');
                            }
                          } catch {
                            toast.error('Failed to update ad status');
                          }
                        }}>
                          {ad.status === 'ACTIVE' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                          {ad.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          try {
                            const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/preview`);
                            if (res.ok) {
                              const data = await res.json();
                              if (data.preview?.previews?.[0]?.body) {
                                const win = window.open('', '_blank', 'width=600,height=800');
                                if (win) {
                                  win.document.write(data.preview.previews[0].body);
                                }
                              } else {
                                toast.error('No preview available');
                              }
                            } else {
                              toast.error('Failed to get preview');
                            }
                          } catch {
                            toast.error('Failed to get preview');
                          }
                        }}>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          try {
                            const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/duplicate`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ new_name: `${ad.name} (Copy)` })
                            });
                            if (res.ok) {
                              toast.success('Ad duplicated');
                            } else {
                              toast.error('Failed to duplicate ad');
                            }
                          } catch {
                            toast.error('Failed to duplicate ad');
                          }
                        }}>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          const action = ad.status === 'ARCHIVED' ? 'unarchive' : 'archive';
                          try {
                            const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/${action}`, { method: 'POST' });
                            if (res.ok) {
                              toast.success(`Ad ${action === 'archive' ? 'archived' : 'unarchived'}`);
                            } else {
                              toast.error(`Failed to ${action} ad`);
                            }
                          } catch {
                            toast.error(`Failed to ${action} ad`);
                          }
                        }}>
                          <Layers className="w-4 h-4 mr-2" />
                          {ad.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={async () => {
                            if (!confirm('Delete this ad?')) return;
                            try {
                              const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}`, { method: 'DELETE' });
                              if (res.ok) {
                                toast.success('Ad deleted');
                              } else {
                                toast.error('Failed to delete ad');
                              }
                            } catch {
                              toast.error('Failed to delete ad');
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-xs">No ads yet</p>
              <Button
                size="sm"
                variant="link"
                onClick={() => onCreateAd?.(adSet.id)}
                className="text-xs h-6"
              >
                Create your first ad
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function EditCampaignModal({
  campaign,
  formData,
  setFormData,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  campaign: Campaign;
  formData: CampaignFormData;
  setFormData: React.Dispatch<React.SetStateAction<CampaignFormData>>;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">Edit Campaign</h2>
            <p className="text-sm text-muted-foreground">{campaign.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {/* Campaign Name */}
          <div>
            <Label htmlFor="edit-name">Campaign Name</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter campaign name"
              className="mt-2"
            />
          </div>

          {/* Status */}
          <div>
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as CampaignStatus }))}
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

          {/* Budget */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Budget Type</Label>
              <Select
                value={formData.budget_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, budget_type: value as 'daily' | 'lifetime' }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget Amount ($)</Label>
              <Input
                type="number"
                value={formData.budget_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, budget_amount: parseFloat(e.target.value) || 0 }))}
                min={1}
                className="mt-2"
              />
            </div>
          </div>

          {/* Campaign Budget Optimization */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">Campaign Budget Optimization</p>
              <p className="text-sm text-muted-foreground">
                Automatically distribute budget across ad sets
              </p>
            </div>
            <Button
              variant={formData.is_campaign_budget_optimization ? "default" : "outline"}
              size="sm"
              onClick={() => setFormData(prev => ({
                ...prev,
                is_campaign_budget_optimization: !prev.is_campaign_budget_optimization
              }))}
            >
              {formData.is_campaign_budget_optimization ? 'On' : 'Off'}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSubmitting || !formData.name}
            className="gap-2"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
