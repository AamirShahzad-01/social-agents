'use client';

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Users,
  UserPlus,
  Globe,
  Upload,
  Target,
  Sparkles,
  X,
  ChevronRight,
  Eye,
  Edit,
  Trash2,
  Copy,
  MoreHorizontal,
  Database,
  Link,
  Smartphone,
  FileText,
  Instagram,
  ShoppingBag,
  AlertTriangle,
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
import type { CustomAudience, AudienceSubtype, LookalikeSpec } from '@/types/metaAds';

interface AudienceManagerProps {
  audiences: CustomAudience[];
  onRefresh: () => void;
}

// Audience sources - per Meta v25.0+ docs
const AUDIENCE_SOURCES = [
  {
    id: 'website',
    label: 'Website',
    description: 'People who visited your website',
    icon: Globe,
    subtype: 'WEBSITE' as AudienceSubtype,
  },
  {
    id: 'customer_list',
    label: 'Customer List',
    description: 'Upload your customer data',
    icon: Upload,
    subtype: 'CUSTOM' as AudienceSubtype,
  },
  {
    id: 'app_activity',
    label: 'App Activity',
    description: 'People who used your app',
    icon: Smartphone,
    subtype: 'APP' as AudienceSubtype,
  },
  {
    id: 'engagement',
    label: 'Page Engagement',
    description: 'People who engaged with your Facebook Page',
    icon: Target,
    subtype: 'ENGAGEMENT' as AudienceSubtype,
  },
  {
    id: 'video',
    label: 'Video',
    description: 'People who watched your videos',
    icon: Eye,
    subtype: 'VIDEO' as AudienceSubtype,
  },
  {
    id: 'lead_form',
    label: 'Lead Form',
    description: 'People who interacted with your lead forms',
    icon: FileText,
    subtype: 'LEAD_AD' as AudienceSubtype,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'People who engaged with your Instagram profile',
    icon: Instagram,
    subtype: 'ENGAGEMENT' as AudienceSubtype,
  },
  {
    id: 'shopping',
    label: 'Shopping',
    description: 'People who engaged with your Facebook or Instagram Shop',
    icon: ShoppingBag,
    subtype: 'ENGAGEMENT' as AudienceSubtype,
  },
];

const WEBSITE_EVENTS = [
  { value: 'ALL_VISITORS', label: 'All Website Visitors' },
  { value: 'PURCHASE', label: 'Purchasers' },
  { value: 'ADD_TO_CART', label: 'Added to Cart' },
  { value: 'LEAD', label: 'Leads' },
  { value: 'PAGE_VISITORS', label: 'Specific Page Visitors' },
];

const ENGAGEMENT_EVENTS = [
  { value: 'page_engaged', label: 'Everyone who engaged with your Page' },
  { value: 'page_visited', label: 'Anyone who visited your Page' },
  { value: 'page_liked', label: 'People who currently like or follow your Page' },
  { value: 'post_engagement', label: 'People who engaged with any post or ad' },
];

const LEAD_FORM_EVENTS = [
  { value: 'lead_generation_submitted', label: 'People who opened and submitted form' },
  { value: 'lead_generation_opened', label: 'People who opened but didn\'t submit' },
  { value: 'lead_generation_dropoff', label: 'People who opened and left' },
];

export default function AudienceManager({ audiences, onRefresh }: AudienceManagerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'custom' | 'lookalike' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAudiences = audiences.filter(audience =>
    audience.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const customAudiences = filteredAudiences.filter(a => a.subtype !== 'LOOKALIKE');
  const lookalikeAudiences = filteredAudiences.filter(a => a.subtype === 'LOOKALIKE');

  return (
    <div className="space-y-6">
      {/* Header - Clean & Professional */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <Users className="w-4 h-4" />
            </div>
            Audiences
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Create and manage custom and lookalike audiences</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => {
              setCreateType('lookalike');
              setShowCreateModal(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Lookalike</span>
          </Button>
          <Button
            size="sm"
            className="h-9 gap-2 text-white"
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)' }}
            onClick={() => {
              setCreateType('custom');
              setShowCreateModal(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Audience</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search audiences..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 pl-9 text-sm"
        />
      </div>

      {/* Custom Audiences */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Custom Audiences ({customAudiences.length})
        </h3>
        {customAudiences.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customAudiences.map((audience) => (
              <AudienceCard key={audience.id} audience={audience} onRefresh={onRefresh} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No custom audiences</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a custom audience to target specific groups of people
                </p>
                <Button
                  onClick={() => {
                    setCreateType('custom');
                    setShowCreateModal(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Custom Audience
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lookalike Audiences */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-purple-500" />
          Lookalike Audiences ({lookalikeAudiences.length})
        </h3>
        {lookalikeAudiences.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lookalikeAudiences.map((audience) => (
              <AudienceCard key={audience.id} audience={audience} onRefresh={onRefresh} isLookalike />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <UserPlus className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No lookalike audiences</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a lookalike audience to find people similar to your best customers
                </p>
                <Button
                  onClick={() => {
                    setCreateType('lookalike');
                    setShowCreateModal(true);
                  }}
                  variant="outline"
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Create Lookalike Audience
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && createType && (
        <CreateAudienceModal
          type={createType}
          existingAudiences={audiences}
          onClose={() => {
            setShowCreateModal(false);
            setCreateType(null);
          }}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function AudienceCard({
  audience,
  onRefresh,
  isLookalike = false,
}: {
  audience: CustomAudience;
  onRefresh: () => void;
  isLookalike?: boolean;
}) {
  const subtypeLabels: Record<string, string> = {
    CUSTOM: 'Customer List',
    WEBSITE: 'Website Visitors',
    APP: 'App Users',
    ENGAGEMENT: 'Engagement',
    VIDEO: 'Video Viewers',
    LOOKALIKE: 'Lookalike',
  };

  return (
    <Card className="border hover:shadow-md transition-all group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-white",
              isLookalike
                ? "bg-gradient-to-br from-purple-500 to-pink-500"
                : "bg-gradient-to-br from-blue-500 to-cyan-500"
            )}>
              {isLookalike ? <UserPlus className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-sm font-medium line-clamp-1">{audience.name}</p>
              <p className="text-xs text-muted-foreground">
                {subtypeLabels[audience.subtype] || audience.subtype}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>

        {/* Flagged audience warning - per Meta docs (operation_status 471) */}
        {audience.operation_status === 471 && (
          <div className="flex items-center gap-2 p-2 mb-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This audience is flagged and cannot be used in new campaigns
            </p>
          </div>
        )}

        {audience.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{audience.description}</p>
        )}

        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 mb-3">
          <div>
            <p className="text-lg font-bold">
              {audience.approximate_count
                ? formatNumber(audience.approximate_count)
                : '-'}
            </p>
            <p className="text-xs text-muted-foreground">Estimated Size</p>
          </div>
          {isLookalike && audience.lookalike_spec && (
            <div className="text-right">
              <p className="font-semibold text-sm">{(audience.lookalike_spec.ratio || 0.01) * 100}%</p>
              <p className="text-xs text-muted-foreground">Similarity</p>
            </div>
          )}
        </div>

        {audience.retention_days && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Database className="w-3 h-3" />
            <span>Retention: {audience.retention_days} days</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1">
            <Eye className="w-3 h-3" />
            View
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0">
            <Edit className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0">
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateAudienceModal({
  type,
  existingAudiences,
  onClose,
  onRefresh,
}: {
  type: 'custom' | 'lookalike';
  existingAudiences: CustomAudience[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [pixels, setPixels] = useState<{ id: string, name: string }[]>([]);
  const [selectedPixel, setSelectedPixel] = useState('');
  const [pages, setPages] = useState<{ id: string, name: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [apps, setApps] = useState<{ id: string, name: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subtype: 'WEBSITE' as AudienceSubtype,
    retention_days: 30,
    // Source specific
    event_type: 'ALL_VISITORS', // Website
    engagement_event: 'page_engaged', // Engagement/Page
    lead_event: 'lead_generation_submitted', // Lead Form
    customer_file_source: 'USER_PROVIDED_ONLY', // Customer File
    // Lookal like specific
    source_audience_id: '',
    country: 'US',
    ratio: 0.01,
    type: 'similarity' as 'similarity' | 'reach' | 'custom_ratio',
  });

  // Fetch pixels and pages on mount
  React.useEffect(() => {
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

    const fetchPages = async () => {
      try {
        const response = await fetch('/api/v1/meta-ads/pages');
        if (response.ok) {
          const data = await response.json();
          setPages(data.pages || []);
          if (data.pages && data.pages.length > 0) {
            setSelectedPage(data.pages[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch pages:', err);
      }
    };

    const fetchApps = async () => {
      try {
        const response = await fetch('/api/v1/meta-ads/apps');
        if (response.ok) {
          const data = await response.json();
          setApps(data.apps || []);
          if (data.apps && data.apps.length > 0) {
            setSelectedApp(data.apps[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch apps:', err);
      }
    };

    fetchPixels();
    fetchPages();
    fetchApps();
  }, []);

  // Smart Auto-Naming Hook - per Meta naming best practices
  React.useEffect(() => {
    if (nameManuallyEdited) return;

    let generatedName = '';

    if (type === 'lookalike') {
      const sourceName = existingAudiences.find(a => a.id === formData.source_audience_id)?.name || 'Source';
      const percentage = (formData.ratio * 100).toFixed(0);
      generatedName = `LAL ${percentage}% - ${formData.country} - ${sourceName}`;
    } else {
      // Custom Audience Naming: [Source] - [Criteria] - [Retention]
      let source = '';
      let criteria = '';
      const retention = `${formData.retention_days}D`;

      switch (formData.subtype) {
        case 'WEBSITE':
          source = 'Website';
          const websiteEvent = WEBSITE_EVENTS.find(e => e.value === formData.event_type)?.label || 'Visitors';
          criteria = websiteEvent.replace('People who ', '').replace('All ', '');
          break;
        case 'ENGAGEMENT':
          source = 'Page'; // Could be IG/Shopping depending on context, keeping simple for now
          const engageEvent = ENGAGEMENT_EVENTS.find(e => e.value === formData.engagement_event)?.label || 'Engagers';
          criteria = engageEvent.replace('People who ', '').replace('Everyone who ', '');
          break;
        case 'LEAD_AD':
          source = 'Lead Form';
          const leadEvent = LEAD_FORM_EVENTS.find(e => e.value === formData.lead_event)?.label || 'Submitted';
          criteria = leadEvent.replace('People who ', '');
          break;
        case 'CUSTOM':
          source = 'Customer List';
          criteria = formData.customer_file_source === 'USER_PROVIDED_ONLY' ? 'Direct' : 'Partner';
          break;
        case 'VIDEO':
          source = 'Video';
          criteria = 'Viewers';
          break;
        default:
          source = formData.subtype;
          criteria = 'All';
      }

      generatedName = `${source} - ${criteria} - ${retention}`;
    }

    setFormData(prev => ({ ...prev, name: generatedName }));
  }, [
    type,
    nameManuallyEdited,
    formData.subtype,
    formData.retention_days,
    formData.event_type,
    formData.engagement_event,
    formData.lead_event,
    formData.customer_file_source,
    formData.source_audience_id,
    formData.country,
    formData.ratio,
    existingAudiences
  ]);

  const handleSubmit = async () => {
    // Validate WEBSITE audiences have a pixel
    if (type === 'custom' && formData.subtype === 'WEBSITE' && !selectedPixel) {
      alert('Please select a pixel for Website audiences');
      return;
    }

    // Validate page-based audiences have a page
    if (type === 'custom' && ['ENGAGEMENT', 'VIDEO', 'LEAD_AD'].includes(formData.subtype) && !selectedPage) {
      alert('Please select a Facebook page for this audience type');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = type === 'custom' ? '/api/v1/meta-ads/audiences/custom' : '/api/v1/meta-ads/audiences/lookalike';

      let payload: any = { ...formData };

      // Construct rule for WEBSITE audiences
      if (type === 'custom' && formData.subtype === 'WEBSITE' && selectedPixel) {
        payload.rule = {
          inclusions: {
            operator: "or",
            rules: [{
              event_sources: [{ type: "pixel", id: selectedPixel }],
              retention_seconds: formData.retention_days * 86400,
              filter: {
                operator: "and",
                filters: [{ field: "url", operator: "i_contains", value: "" }]
              }
            }]
          }
        };
      }

      // Construct rule for ENGAGEMENT audiences
      if (type === 'custom' && formData.subtype === 'ENGAGEMENT' && selectedPage) {
        payload.rule = {
          inclusions: {
            operator: "or",
            rules: [{
              event_sources: [{ type: "page", id: selectedPage }],
              retention_seconds: formData.retention_days * 86400,
              filter: {
                operator: "eq",
                field: "event",
                value: formData.engagement_event
              }
            }]
          }
        };
      }

      // Construct rule for LEAD_AD audiences
      if (type === 'custom' && formData.subtype === 'LEAD_AD' && selectedPage) {
        payload.rule = {
          inclusions: {
            operator: "or",
            rules: [{
              event_sources: [{ type: "page", id: selectedPage }],
              retention_seconds: formData.retention_days * 86400,
              filter: {
                operator: "eq",
                field: "event",
                value: formData.lead_event
              }
            }]
          }
        };
      }

      // Construct rule for VIDEO audiences (simplified - using page as source)
      if (type === 'custom' && formData.subtype === 'VIDEO' && selectedPage) {
        payload.rule = {
          inclusions: {
            operator: "or",
            rules: [{
              event_sources: [{ type: "page", id: selectedPage }],
              retention_seconds: formData.retention_days * 86400,
              filter: {
                operator: "eq",
                field: "event",
                value: "video_view"  // Simplified - could add video engagement levels selector
              }
            }]
          }
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onClose();
        onRefresh();
      } else {
        const error = await response.json();
        alert(`Error: ${error.detail || 'Failed to create audience'}`);
      }
    } catch (error) {
      console.error('Error creating audience:', error);
      alert('Failed to create audience. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSteps = type === 'custom' ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">
              Create {type === 'custom' ? 'Custom' : 'Lookalike'} Audience
            </h2>
            <p className="text-sm text-muted-foreground">Step {step} of {totalSteps}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Progress */}
        <div className="px-6 pt-4">
          <div className="flex gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i + 1 <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[55vh]">
          {type === 'custom' ? (
            <>
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <Label className="text-base font-semibold mb-4 block">Choose Audience Source</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {AUDIENCE_SOURCES.map((source) => (
                        <button
                          key={source.id}
                          onClick={() => setFormData(prev => ({ ...prev, subtype: source.subtype }))}
                          className={cn(
                            "p-4 rounded-xl border-2 text-left transition-all",
                            formData.subtype === source.subtype
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <source.icon className="w-6 h-6 mb-2 text-primary" />
                          <p className="font-medium">{source.label}</p>
                          <p className="text-xs text-muted-foreground">{source.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  {/* Dynamic Source Configuration - per Meta docs */}
                  {formData.subtype === 'WEBSITE' && (
                    <>
                      <div>
                        <Label>Meta Pixel</Label>
                        <Select value={selectedPixel} onValueChange={setSelectedPixel}>
                          <SelectTrigger className="mt-2">
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
                      <div>
                        <Label>Website Event</Label>
                        <Select
                          value={formData.event_type}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, event_type: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WEBSITE_EVENTS.map(e => (
                              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {formData.subtype === 'ENGAGEMENT' && (
                    <>
                      <div>
                        <Label>Facebook Page</Label>
                        <Select value={selectedPage} onValueChange={setSelectedPage}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select a page" />
                          </SelectTrigger>
                          <SelectContent>
                            {pages.map(page => (
                              <SelectItem key={page.id} value={page.id}>
                                {page.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pages.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">
                            No pages found. Please manage pages in Meta Business Manager.
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>Engagement Type</Label>
                        <Select
                          value={formData.engagement_event}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, engagement_event: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENGAGEMENT_EVENTS.map(e => (
                              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {formData.subtype === 'LEAD_AD' && (
                    <>
                      <div>
                        <Label>Facebook Page</Label>
                        <Select value={selectedPage} onValueChange={setSelectedPage}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select a page" />
                          </SelectTrigger>
                          <SelectContent>
                            {pages.map(page => (
                              <SelectItem key={page.id} value={page.id}>
                                {page.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pages.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">
                            No pages found. Please manage pages in Meta Business Manager.
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>Lead Form Event</Label>
                        <Select
                          value={formData.lead_event}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, lead_event: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_FORM_EVENTS.map(e => (
                              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {formData.subtype === 'CUSTOM' && (
                    <div>
                      <Label>Data Source</Label>
                      <Select
                        value={formData.customer_file_source}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, customer_file_source: value }))}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USER_PROVIDED_ONLY">Direct from Customers</SelectItem>
                          <SelectItem value="PARTNER_PROVIDED_ONLY">From Partners/Agencies</SelectItem>
                          <SelectItem value="BOTH_USER_AND_PARTNER_PROVIDED">Both Sources</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="audience-name">Audience Name</Label>
                    <Input
                      id="audience-name"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, name: e.target.value }));
                        setNameManuallyEdited(true);
                      }}
                      placeholder="Enter audience name"
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {nameManuallyEdited ? 'Manual name override active' : 'Auto-generated based on best practices'}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="audience-description">Description (Optional)</Label>
                    <Textarea
                      id="audience-description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe this audience"
                      rows={3}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label>Retention Period</Label>
                    <Select
                      value={formData.retention_days.toString()}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, retention_days: parseInt(value) }))}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">180 days</SelectItem>
                        <SelectItem value="365">365 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                      How long people stay in this audience after meeting the criteria
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <Label className="text-base font-semibold mb-4 block">Select Source Audience</Label>
                    <p className="text-sm text-muted-foreground mb-4">
                      Choose a custom audience to base your lookalike on
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {existingAudiences.filter(a => a.subtype !== 'LOOKALIKE').map((audience) => (
                        <button
                          key={audience.id}
                          onClick={() => setFormData(prev => ({ ...prev, source_audience_id: audience.id }))}
                          className={cn(
                            "w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3",
                            formData.source_audience_id === audience.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                            <Users className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{audience.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {audience.approximate_count ? formatNumber(audience.approximate_count) : '-'} people
                            </p>
                          </div>
                        </button>
                      ))}
                      {existingAudiences.filter(a => a.subtype !== 'LOOKALIKE').length === 0 && (
                        <div className="text-center py-8">
                          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                          <p className="text-muted-foreground">No source audiences available</p>
                          <p className="text-sm text-muted-foreground">Create a custom audience first</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <Label>Target Country</Label>
                    <Select
                      value={formData.country}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="AU">Australia</SelectItem>
                        <SelectItem value="DE">Germany</SelectItem>
                        <SelectItem value="FR">France</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Audience Size</Label>
                    <p className="text-sm text-muted-foreground mb-4">
                      Smaller audiences are more similar to your source. Larger audiences have greater reach.
                    </p>
                    <div className="space-y-4">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={formData.ratio * 100}
                        onChange={(e) => setFormData(prev => ({ ...prev, ratio: parseInt(e.target.value) / 100 }))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">More Similar</span>
                        <span className="font-semibold">{formData.ratio * 100}%</span>
                        <span className="text-muted-foreground">Greater Reach</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="lookalike-name">Audience Name</Label>
                    <Input
                      id="lookalike-name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter audience name"
                      className="mt-2"
                    />
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Source Audience</span>
                        <span className="font-medium">
                          {existingAudiences.find(a => a.id === formData.source_audience_id)?.name || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target Country</span>
                        <span className="font-medium">{formData.country}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Audience Size</span>
                        <span className="font-medium">{formData.ratio * 100}%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
                    <p className="text-sm text-purple-800 dark:text-purple-200">
                      <strong>Note:</strong> Lookalike audiences typically take 1-6 hours to populate.
                      You'll be able to use it in your campaigns once it's ready.
                    </p>
                  </div>
                </div>
              )}
            </>
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
            onClick={() => step < totalSteps ? setStep(step + 1) : handleSubmit()}
            disabled={
              isSubmitting ||
              (type === 'custom' && step === 2 && !formData.name) ||
              (type === 'lookalike' && step === 1 && !formData.source_audience_id) ||
              (type === 'lookalike' && step === 3 && !formData.name)
            }
            className="gap-2"
          >
            {step < totalSteps ? (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            ) : isSubmitting ? 'Creating...' : 'Create Audience'}
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
