'use client';

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Image,
  Video,
  FileText,
  Eye,
  Play,
  Pause,
  Edit,
  Copy,
  Trash2,
  ExternalLink,
  Upload,
  X,
  Sparkles,
  Link,
  Type,
  FolderOpen,
  ImagePlus,
  Layers,
  Zap,
  Globe,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Ad, AdSet, AdFormData, AdCreative, CallToActionType, AdStatus } from '@/types/metaAds';
import MediaLibraryPicker, { SelectedMedia } from './MediaLibraryPicker';

interface AdCreativeManagerProps {
  ads: Ad[];
  adSets: AdSet[];
  onRefresh: () => void;
  showCreate?: boolean;
  onShowCreateChange?: (show: boolean) => void;
  preselectedAdSetId?: string;
}

// Meta Marketing API v24.0+ - Call to Action Types
const CTA_OPTIONS = [
  // General
  { value: 'LEARN_MORE', label: 'Learn More', category: 'general' },
  { value: 'SEE_MORE', label: 'See More', category: 'general' },
  { value: 'WATCH_MORE', label: 'Watch More', category: 'video' },
  // E-commerce
  { value: 'SHOP_NOW', label: 'Shop Now', category: 'ecommerce' },
  { value: 'BUY_NOW', label: 'Buy Now', category: 'ecommerce' },
  { value: 'ORDER_NOW', label: 'Order Now', category: 'ecommerce' },
  { value: 'GET_OFFER', label: 'Get Offer', category: 'ecommerce' },
  { value: 'GET_PROMOTIONS', label: 'Get Promotions', category: 'ecommerce' },
  // Lead Generation
  { value: 'SIGN_UP', label: 'Sign Up', category: 'leads' },
  { value: 'SUBSCRIBE', label: 'Subscribe', category: 'leads' },
  { value: 'CONTACT_US', label: 'Contact Us', category: 'leads' },
  { value: 'GET_QUOTE', label: 'Get Quote', category: 'leads' },
  { value: 'APPLY_NOW', label: 'Apply Now', category: 'leads' },
  // App
  { value: 'DOWNLOAD', label: 'Download', category: 'app' },
  { value: 'INSTALL_APP', label: 'Install App', category: 'app' },
  { value: 'USE_APP', label: 'Use App', category: 'app' },
  { value: 'PLAY_GAME', label: 'Play Game', category: 'app' },
  // Messaging
  { value: 'SEND_MESSAGE', label: 'Send Message', category: 'messaging' },
  { value: 'MESSAGE_PAGE', label: 'Message Page', category: 'messaging' },
  { value: 'WHATSAPP_MESSAGE', label: 'WhatsApp', category: 'messaging' },
  // Local/Booking
  { value: 'CALL_NOW', label: 'Call Now', category: 'local' },
  { value: 'BOOK_TRAVEL', label: 'Book Now', category: 'booking' },
  { value: 'REQUEST_TIME', label: 'Request Time', category: 'booking' },
  { value: 'GET_DIRECTIONS', label: 'Get Directions', category: 'local' },
  { value: 'SEE_MENU', label: 'See Menu', category: 'local' },
  // Engagement
  { value: 'LIKE_PAGE', label: 'Like Page', category: 'engagement' },
  { value: 'DONATE_NOW', label: 'Donate Now', category: 'nonprofit' },
];

const initialFormData: AdFormData = {
  name: '',
  adset_id: '',
  status: 'PAUSED',
  creative: {
    title: '',
    body: '',
    call_to_action_type: 'LEARN_MORE',
    link_url: '',
    image_url: '',
    advantage_plus_creative: true,
    gen_ai_disclosure: false,
    format_automation: false,
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: 'OPT_IN' },
        image_enhancement: { enroll_status: 'OPT_IN' },
        video_auto_crop: { enroll_status: 'OPT_IN' },
        text_optimizations: { enroll_status: 'OPT_IN' },
        // v24.0 2026 Additional Features
        inline_comment: { enroll_status: 'OPT_IN' },
        expand_image: { enroll_status: 'OPT_IN' },
        dynamic_media: { enroll_status: 'OPT_IN' },
        add_stickers: { enroll_status: 'OPT_OUT' }, // Opt-out by default - may not fit all brands
        description_automation: { enroll_status: 'OPT_OUT' }, // Opt-out by default - brand control
      },
    },
    ad_disclaimer_spec: {
      title: '',
      body: '',
      is_fully_enforced: false,
    },
  },
};

export default function AdCreativeManager({ ads, adSets, onRefresh, showCreate, onShowCreateChange, preselectedAdSetId }: AdCreativeManagerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState<AdFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creativeType, setCreativeType] = useState<'image' | 'video' | 'carousel'>('image');

  // Sync with external showCreate prop
  React.useEffect(() => {
    if (showCreate !== undefined) {
      setShowCreateModal(showCreate);
    }
  }, [showCreate]);

  // Pre-select ad set if provided
  React.useEffect(() => {
    if (preselectedAdSetId && showCreate) {
      setFormData(prev => ({ ...prev, adset_id: preselectedAdSetId }));
    }
  }, [preselectedAdSetId, showCreate]);

  const handleModalChange = (show: boolean) => {
    setShowCreateModal(show);
    onShowCreateChange?.(show);
  };

  const filteredAds = ads.filter(ad => {
    const matchesSearch = ad.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ad.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateAd = async () => {
    setIsSubmitting(true);
    try {
      // Prepare request data - carousel items should already be in formData.creative.carousel_items
      // from the CreateAdModal component
      const requestData = { ...formData };

      const response = await fetch('/api/v1/meta-ads/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Ad created successfully!');
        handleModalChange(false);
        setFormData(initialFormData);
        onRefresh();
      } else {
        // Handle error response
        const errorMessage = data.error || 'Failed to create ad';
        const errorDetails = data.details
          ? (Array.isArray(data.details)
            ? data.details.map((d: any) => `${d.path}: ${d.message}`).join(', ')
            : data.details)
          : data.message || 'Unknown error';

        toast.error(`${errorMessage}: ${errorDetails}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create ad';
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (adId: string, newStatus: AdStatus) => {
    try {
      const response = await fetch(`/api/v1/meta-ads/ads/${adId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        toast.success(`Ad ${newStatus.toLowerCase()} successfully`);
        onRefresh();
      } else {
        const data = await response.json();
        const errorMessage = data.error || 'Failed to update ad status';
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error('Failed to update ad status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Ads</h2>
          <p className="text-muted-foreground">Create and manage your ad creatives</p>
        </div>
        <Button
          onClick={() => handleModalChange(true)}
          className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Ad
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search ads..."
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
                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                <SelectItem value="DISAPPROVED">Disapproved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ads Grid */}
      {filteredAds.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              adSet={adSets.find(a => a.id === ad.adset_id)}
              onStatusChange={handleStatusChange}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Image className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No ads found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery ? 'Try adjusting your search' : 'Create your first ad to start advertising'}
              </p>
              <Button onClick={() => handleModalChange(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Ad
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Ad Modal */}
      {showCreateModal && (
        <CreateAdModal
          formData={formData}
          setFormData={setFormData}
          adSets={adSets}
          creativeType={creativeType}
          setCreativeType={setCreativeType}
          onClose={() => {
            handleModalChange(false);
            setFormData(initialFormData);
          }}
          onSubmit={async () => {
            // Carousel items are already added to formData by CreateAdModal before calling onSubmit
            await handleCreateAd();
          }}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

function AdCard({
  ad,
  adSet,
  onStatusChange,
  onRefresh,
}: {
  ad: Ad;
  adSet?: AdSet;
  onStatusChange: (id: string, status: AdStatus) => void;
  onRefresh?: () => void;
}) {
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    PENDING_REVIEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    DISAPPROVED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    DELETED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
    ARCHIVED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };

  const handlePreview = async () => {
    try {
      const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/preview`);
      const data = await res.json();
      if (res.ok && data.preview?.previews?.[0]?.body) {
        const win = window.open('', '_blank', 'width=600,height=800');
        if (win) {
          win.document.write(data.preview.previews[0].body);
        }
      } else {
        toast.error(data?.error || 'No preview available');
      }
    } catch (err) {
      console.error('Error getting preview:', err);
      toast.error('Failed to get ad preview');
    }
  };

  const handleDuplicate = async () => {
    try {
      const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: `${ad.name} (Copy)` })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Ad duplicated successfully');
        onRefresh?.();
      } else {
        const errorMsg = data?.error || data?.detail || 'Failed to duplicate ad';
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error duplicating ad:', err);
      toast.error('Failed to duplicate ad');
    }
  };

  const handleArchive = async () => {
    const action = ad.status === 'ARCHIVED' ? 'unarchive' : 'archive';
    try {
      const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}/${action}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Ad ${action === 'archive' ? 'archived' : 'unarchived'} successfully`);
        onRefresh?.();
      } else {
        const errorMsg = data?.error || data?.detail || `Failed to ${action} ad`;
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error(`Error ${action}ing ad:`, err);
      toast.error(`Failed to ${action} ad`);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this ad? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/v1/meta-ads/ads/${ad.id}`, {
        method: 'DELETE'
      });
      if (res.ok || res.status === 204) {
        toast.success('Ad deleted successfully');
        onRefresh?.();
      } else {
        const data = await res.json().catch(() => ({}));
        const errorMsg = data?.error || data?.detail || 'Failed to delete ad';
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error deleting ad:', err);
      toast.error('Failed to delete ad');
    }
  };

  return (
    <Card className="overflow-hidden group">
      {/* Preview */}
      <div className="relative aspect-video bg-muted">
        {ad.creative.image_url ? (
          <img
            src={ad.creative.image_url}
            alt={ad.name}
            className="w-full h-full object-cover"
          />
        ) : ad.creative.video_id ? (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-12 h-12 text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" className="gap-1" onClick={handlePreview}>
            <Eye className="w-4 h-4" />
            Preview
          </Button>
        </div>
        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColors[ad.status] || statusColors.PAUSED)}>
            {ad.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold truncate flex-1">{ad.name}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handlePreview}>
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onStatusChange(ad.id, ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}>
                {ad.status === 'ACTIVE' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {ad.status === 'ACTIVE' ? 'Pause' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleArchive}>
                <Layers className="w-4 h-4 mr-2" />
                {ad.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-sm text-muted-foreground mb-3 truncate">
          {adSet?.name || 'No ad set'}
        </p>

        {/* Creative Preview */}
        {ad.creative.title && (
          <p className="text-sm font-medium mb-1 truncate">{ad.creative.title}</p>
        )}
        {ad.creative.body && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{ad.creative.body}</p>
        )}

        {/* Metrics */}
        {ad.insights && (
          <div className="grid grid-cols-3 gap-2 py-3 border-t border-b mb-3">
            <div className="text-center">
              <p className="font-bold">{formatNumber(ad.insights.impressions)}</p>
              <p className="text-xs text-muted-foreground">Impr.</p>
            </div>
            <div className="text-center">
              <p className="font-bold">{formatNumber(ad.insights.clicks)}</p>
              <p className="text-xs text-muted-foreground">Clicks</p>
            </div>
            <div className="text-center">
              <p className="font-bold">{ad.insights.ctr.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">CTR</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {ad.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              onClick={() => onStatusChange(ad.id, 'PAUSED')}
            >
              <Pause className="w-3 h-3" />
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              onClick={() => onStatusChange(ad.id, 'ACTIVE')}
            >
              <Play className="w-3 h-3" />
              Activate
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={handleDuplicate}>
            <Copy className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handlePreview}>
            <Eye className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateAdModal({
  formData,
  setFormData,
  adSets,
  creativeType,
  setCreativeType,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  formData: AdFormData;
  setFormData: React.Dispatch<React.SetStateAction<AdFormData>>;
  adSets: AdSet[];
  creativeType: 'image' | 'video' | 'carousel';
  setCreativeType: React.Dispatch<React.SetStateAction<'image' | 'video' | 'carousel'>>;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [step, setStep] = useState(1);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [thumbnailPickerOpen, setThumbnailPickerOpen] = useState(false);
  const [carouselMedia, setCarouselMedia] = useState<SelectedMedia[]>([]);

  const updateCreative = (updates: Partial<AdCreative>) => {
    setFormData(prev => ({
      ...prev,
      creative: { ...prev.creative, ...updates },
    }));
  };

  const handleMediaSelect = (media: SelectedMedia | SelectedMedia[]) => {
    if (Array.isArray(media)) {
      // Carousel - multiple items
      setCarouselMedia(media);
      if (media.length > 0) {
        updateCreative({ image_url: media[0].url });
      }
    } else {
      // Single item - image or video
      if (media.type === 'video') {
        updateCreative({
          image_url: media.url, // Used as thumbnail/preview
          video_url: media.url, // Backend will upload this to Meta
          video_id: media.id, // If already uploaded to Meta
        });
      } else {
        updateCreative({
          image_url: media.url,
          video_id: undefined,
          video_url: undefined,
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] mx-4 flex flex-col overflow-hidden scrollbar-hide">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-6 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5" />
              <div>
                <h2 className="text-xl font-bold text-white">Create Ad</h2>
                <p className="text-sm text-white/80">Step {step} of 3</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Bar inside Header */}
          <div className="flex gap-2 mt-4">
            {[1, 2, 3].map((s) => (
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
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="ad-name">Ad Name</Label>
                <Input
                  id="ad-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter ad name"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Ad Set</Label>
                <Select
                  value={formData.adset_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, adset_id: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select an ad set" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]" position="popper" sideOffset={4}>
                    {adSets.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No ad sets available
                      </SelectItem>
                    ) : (
                      adSets.map((adSet) => (
                        <SelectItem key={adSet.id} value={adSet.id}>
                          {adSet.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Creative Type</Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {[
                    { value: 'image', label: 'Single Image', icon: Image },
                    { value: 'video', label: 'Video', icon: Video },
                    { value: 'carousel', label: 'Carousel', icon: Layers },
                  ].map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setCreativeType(type.value as 'image' | 'video' | 'carousel')}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-center",
                        creativeType === type.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <type.icon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-medium text-sm">{type.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-6">
              {/* Creative Form */}
              <div className="space-y-4">
                {/* Advantage+ Creative Toggle (v24.0 2026) */}
                <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-orange-100 dark:border-orange-900">
                        <Sparkles className="w-5 h-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Advantage+ Creative</p>
                        <p className="text-sm text-muted-foreground">
                          AI-powered Standard Enhancements.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateCreative({ advantage_plus_creative: !formData.creative.advantage_plus_creative })}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        formData.creative.advantage_plus_creative ? "bg-orange-500" : "bg-muted"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        formData.creative.advantage_plus_creative ? "translate-x-7" : "translate-x-1"
                      )} />
                    </button>
                  </div>
                </div>

                {/* Gen AI Disclosure (v25.0+) */}
                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/40">
                  <Checkbox
                    id="gen_ai_disclosure"
                    checked={formData.creative.gen_ai_disclosure}
                    onCheckedChange={(checked) => updateCreative({ gen_ai_disclosure: checked === true })}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="gen_ai_disclosure">
                      Gen AI Disclosure
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Mandatory for 2026 if AI content is used.
                    </p>
                  </div>
                </div>

                {/* Granular Advantage+ Enhancements (v25.0+) */}
                {formData.creative.advantage_plus_creative && (
                  <div className="ml-6 space-y-3 p-4 border-l-2 border-blue-200 dark:border-blue-900 bg-blue-50/10 rounded-r-xl">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase">AI Enhancement Levers (v25.0 2026)</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: 'standard_enhancements', label: 'Standard', description: 'Bundle of basic optimizations' },
                        { key: 'image_enhancement', label: 'Image Touch-ups', description: 'Enhance image appearance' },
                        { key: 'video_auto_crop', label: 'Video Auto-crop', description: 'Auto aspect ratio adjust' },
                        { key: 'text_optimizations', label: 'Text Optimize', description: 'Optimize ad copy' },
                        { key: 'inline_comment', label: 'Inline Comments', description: 'Show relevant comments' },
                        { key: 'expand_image', label: 'Expand Image', description: 'AI-powered expansion' },
                        { key: 'dynamic_media', label: 'Dynamic Media', description: 'Videos + images mix' },
                        { key: 'add_stickers', label: 'Add Stickers', description: 'AI-generated stickers' },
                        { key: 'description_automation', label: 'Auto Descriptions', description: 'Generate copy' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background border">
                          <span className="text-xs font-medium">{item.label}</span>
                          <button
                            onClick={() => {
                              const current = formData.creative.degrees_of_freedom_spec?.creative_features_spec?.[item.key as keyof typeof formData.creative.degrees_of_freedom_spec.creative_features_spec]?.enroll_status || 'OPT_IN';
                              updateCreative({
                                degrees_of_freedom_spec: {
                                  ...formData.creative.degrees_of_freedom_spec,
                                  creative_features_spec: {
                                    ...formData.creative.degrees_of_freedom_spec?.creative_features_spec,
                                    [item.key]: { enroll_status: current === 'OPT_IN' ? 'OPT_OUT' : 'OPT_IN' }
                                  }
                                }
                              });
                            }}
                            className={cn(
                              "w-8 h-4 rounded-full transition-colors relative",
                              formData.creative.degrees_of_freedom_spec?.creative_features_spec?.[item.key as keyof typeof formData.creative.degrees_of_freedom_spec.creative_features_spec]?.enroll_status === 'OPT_IN'
                                ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-600"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                              formData.creative.degrees_of_freedom_spec?.creative_features_spec?.[item.key as keyof typeof formData.creative.degrees_of_freedom_spec.creative_features_spec]?.enroll_status === 'OPT_IN'
                                ? "translate-x-4.5" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ad Disclaimer Spec (v25.0+) */}
                <div className="space-y-4 p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-background shadow-sm border border-orange-100 dark:border-orange-900">
                      <FileText className="w-4 h-4 text-orange-500" />
                    </div>
                    <Label className="font-semibold text-foreground">Ad Disclaimer (Legal/Political)</Label>
                  </div>
                  <div className="space-y-3 pl-11">
                    <Input
                      placeholder="Disclaimer Title"
                      value={formData.creative.ad_disclaimer_spec?.title || ''}
                      onChange={(e) => updateCreative({
                        ad_disclaimer_spec: { ...formData.creative.ad_disclaimer_spec!, title: e.target.value }
                      })}
                      className="text-sm bg-background border-orange-100 dark:border-orange-900/50"
                    />
                    <Textarea
                      placeholder="Disclaimer Body"
                      value={formData.creative.ad_disclaimer_spec?.body || ''}
                      onChange={(e) => updateCreative({
                        ad_disclaimer_spec: { ...formData.creative.ad_disclaimer_spec!, body: e.target.value }
                      })}
                      className="text-sm bg-background border-orange-100 dark:border-orange-900/50"
                      rows={2}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="disclaimer-enforcement"
                        checked={formData.creative.ad_disclaimer_spec?.is_fully_enforced || false}
                        onCheckedChange={(checked) => updateCreative({
                          ad_disclaimer_spec: { ...formData.creative.ad_disclaimer_spec!, is_fully_enforced: checked === true }
                        })}
                      />
                      <Label htmlFor="disclaimer-enforcement" className="text-[11px] text-muted-foreground">
                        Enforce disclaimer display in all placements
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Format Automation (v25.0+) - Only for Carousel/Catalog */}
                {creativeType === 'carousel' && (
                  <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/40">
                    <Checkbox
                      id="format_automation"
                      checked={formData.creative.format_automation}
                      onCheckedChange={(checked) => updateCreative({ format_automation: checked === true })}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor="format_automation"
                        className="text-sm font-medium leading-none"
                      >
                        Format Automation
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically transform carousel to collection for better performance.
                      </p>
                    </div>
                  </div>
                )}
                <div>
                  <Label>Media</Label>
                  <div className="mt-2 space-y-3">
                    {/* Media Preview */}
                    {(formData.creative.image_url || carouselMedia.length > 0) ? (
                      <div className="relative rounded-xl overflow-hidden border bg-muted">
                        {creativeType === 'carousel' && carouselMedia.length > 0 ? (
                          <div className="grid grid-cols-3 gap-1 p-2">
                            {carouselMedia.map((media, idx) => (
                              <div key={media.id} className="relative aspect-square rounded-lg overflow-hidden">
                                {media.type === 'image' ? (
                                  <img src={media.url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <video src={media.url} className="w-full h-full object-cover" muted />
                                )}
                                <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                  {idx + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="aspect-video">
                            <img
                              src={formData.creative.image_url}
                              alt="Preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <button
                          onClick={() => {
                            updateCreative({ image_url: '' });
                            setCarouselMedia([]);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => setMediaPickerOpen(true)}
                      >
                        <FolderOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm font-medium mb-1">Select from Media Library</p>
                        <p className="text-xs text-muted-foreground">
                          Choose {creativeType === 'carousel' ? 'multiple images/videos' : creativeType === 'video' ? 'a video' : 'an image'} from your library
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => setMediaPickerOpen(true)}
                      >
                        <FolderOpen className="w-4 h-4" />
                        {formData.creative.image_url ? 'Change Media' : 'Browse Library'}
                      </Button>
                    </div>

                    {/* URL Input - use video_url for video, image_url for others */}
                    <div className="relative">
                      <Input
                        type="url"
                        placeholder={
                          creativeType === 'video'
                            ? 'Or paste video URL directly'
                            : creativeType === 'carousel'
                              ? 'Or paste first image URL directly'
                              : 'Or paste image URL directly'
                        }
                        value={creativeType === 'video'
                          ? (formData.creative.video_url || formData.creative.image_url || '')
                          : (formData.creative.image_url || '')}
                        onChange={(e) => {
                          if (creativeType === 'video') {
                            updateCreative({
                              video_url: e.target.value,
                              image_url: e.target.value // Also set as preview
                            });
                          } else {
                            updateCreative({ image_url: e.target.value });
                          }
                        }}
                        className="pr-10"
                      />
                      {(formData.creative.image_url || formData.creative.video_url) && (
                        <button
                          onClick={() => updateCreative({
                            image_url: '',
                            video_url: undefined
                          })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>

                    {/* Video Thumbnail Upload - Only show for video type */}
                    {creativeType === 'video' && (
                      <div className="mt-4 p-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Image className="w-4 h-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Video Thumbnail (Optional)</Label>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          Upload a custom thumbnail image for your video. If not provided, Meta will auto-generate one.
                        </p>

                        {/* Thumbnail Preview */}
                        {formData.creative.thumbnail_url && (
                          <div className="mb-3 rounded-lg overflow-hidden border relative group" style={{ aspectRatio: '16/9', maxWidth: '200px' }}>
                            <img
                              src={formData.creative.thumbnail_url}
                              alt="Thumbnail preview"
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => updateCreative({ thumbnail_url: '' })}
                              className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        )}

                        {/* Browse Library Button */}
                        <div className="flex gap-2 mb-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-2"
                            onClick={() => setThumbnailPickerOpen(true)}
                          >
                            <FolderOpen className="w-4 h-4" />
                            {formData.creative.thumbnail_url ? 'Change Thumbnail' : 'Browse Library'}
                          </Button>
                        </div>

                        {/* URL Input */}
                        <div className="relative">
                          <Input
                            type="url"
                            placeholder="Or paste thumbnail URL directly"
                            value={formData.creative.thumbnail_url || ''}
                            onChange={(e) => updateCreative({ thumbnail_url: e.target.value })}
                            className="pr-10 text-sm"
                          />
                          {formData.creative.thumbnail_url && (
                            <button
                              onClick={() => updateCreative({ thumbnail_url: '' })}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="headline">Headline</Label>
                  <Input
                    id="headline"
                    value={formData.creative.title || ''}
                    onChange={(e) => updateCreative({ title: e.target.value })}
                    placeholder="Enter headline (max 40 characters)"
                    maxLength={40}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {(formData.creative.title || '').length}/40
                  </p>
                </div>

                <div>
                  <Label htmlFor="primary-text">Primary Text</Label>
                  <Textarea
                    id="primary-text"
                    value={formData.creative.body || ''}
                    onChange={(e) => updateCreative({ body: e.target.value })}
                    placeholder="Enter primary text (max 125 characters recommended)"
                    rows={3}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {(formData.creative.body || '').length} characters
                  </p>
                </div>

                <div>
                  <Label htmlFor="link-url">Destination URL</Label>
                  <div className="relative mt-2">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="link-url"
                      value={formData.creative.link_url || ''}
                      onChange={(e) => updateCreative({ link_url: e.target.value })}
                      placeholder="https://example.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label>Call to Action</Label>
                  <Select
                    value={formData.creative.call_to_action_type || 'LEARN_MORE'}
                    onValueChange={(value) => updateCreative({ call_to_action_type: value as CallToActionType })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map((cta) => (
                        <SelectItem key={cta.value} value={cta.value}>
                          {cta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <div className="p-1 rounded bg-orange-500/10">
                    <Eye className="w-4 h-4 text-orange-500" />
                  </div>
                  <Label className="font-bold text-base">Ad Preview</Label>
                </div>
                <div className="border rounded-xl overflow-hidden bg-white dark:bg-gray-950 shadow-sm">
                  {/* Facebook Post Preview Styling */}
                  <div className="p-3 border-b flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm flex items-center justify-center text-white">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Your Page Name</p>
                        <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          Sponsored • <Globe className="w-3 h-3" />
                        </p>
                      </div>
                    </div>
                    <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="px-3 py-2 text-sm">
                    {formData.creative.body ? (
                      <p>{formData.creative.body}</p>
                    ) : (
                      <p className="text-muted-foreground italic">Add primary text to see it here...</p>
                    )}
                  </div>
                  <div className="aspect-video bg-muted flex items-center justify-center relative overflow-hidden">
                    {creativeType === 'carousel' && carouselMedia.length > 0 ? (
                      // CAROUSEL PREVIEW: Show first image with carousel indicator
                      <div className="w-full h-full relative">
                        <img
                          src={carouselMedia[0].url}
                          alt="Carousel Preview"
                          className="w-full h-full object-cover"
                        />
                        {/* Carousel indicator dots */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {carouselMedia.map((_, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "w-2 h-2 rounded-full",
                                idx === 0 ? "bg-white" : "bg-white/50"
                              )}
                            />
                          ))}
                        </div>
                        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                          1/{carouselMedia.length}
                        </div>
                      </div>
                    ) : creativeType === 'video' && (formData.creative.thumbnail_url || formData.creative.image_url) ? (
                      // VIDEO PREVIEW: Show custom thumbnail or video URL with play button overlay
                      <div className="w-full h-full relative">
                        <img
                          src={formData.creative.thumbnail_url || formData.creative.image_url}
                          alt="Video Thumbnail"
                          className="w-full h-full object-cover"
                        />
                        {/* Play button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <Play className="w-8 h-8 text-gray-800 ml-1" fill="currentColor" />
                          </div>
                        </div>
                      </div>
                    ) : formData.creative.image_url ? (
                      // SINGLE IMAGE PREVIEW
                      <img
                        src={formData.creative.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-center">
                        {creativeType === 'video' ? (
                          <Video className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                        ) : creativeType === 'carousel' ? (
                          <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                        ) : (
                          <Image className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                        )}
                        <p className="text-sm text-muted-foreground">
                          {creativeType === 'carousel' ? 'Add carousel media to preview' :
                            creativeType === 'video' ? 'Add video to preview' :
                              'Add media to preview'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-muted/40 backdrop-blur-sm">
                    <p className="text-[10px] text-orange-600/80 dark:text-orange-400/80 font-bold uppercase tracking-wider mb-1">
                      {(() => {
                        const url = formData.creative.link_url;
                        if (!url) return 'YOUR-WEBSITE.COM';
                        try {
                          // Handle cases like "google.com" by prepending https if no protocol
                          const urlToParse = url.includes('://') ? url : `https://${url}`;
                          return new URL(urlToParse).hostname;
                        } catch {
                          return url.toUpperCase();
                        }
                      })()}
                    </p>
                    <p className="font-bold text-sm text-foreground">
                      {formData.creative.title || 'YOUR COMPELLING HEADLINE'}
                    </p>
                  </div>
                  <div className="border-t bg-white dark:bg-gray-950">
                    <Button
                      className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-none border-none shadow-none transition-all active:scale-[0.99]"
                    >
                      {CTA_OPTIONS.find(c => c.value === formData.creative.call_to_action_type)?.label || 'Learn More'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Review Your Ad
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Ad Name</p>
                      <p className="font-medium">{formData.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ad Set</p>
                      <p className="font-medium">
                        {adSets.find(a => a.id === formData.adset_id)?.name || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Creative Type</p>
                      <p className="font-medium capitalize">{creativeType}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Call to Action</p>
                      <p className="font-medium">
                        {CTA_OPTIONS.find(c => c.value === formData.creative.call_to_action_type)?.label || '-'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Destination URL</p>
                      <p className="font-medium truncate">{formData.creative.link_url || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-900/50">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Note:</strong> Your ad will be submitted for review. This usually takes less than 24 hours.
                  You'll be notified once your ad is approved.
                </p>
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
            onClick={() => {
              if (step < 3) {
                setStep(step + 1);
              } else {
                // Prepare form data with carousel items before submission
                const dataToSubmit = { ...formData };
                if (creativeType === 'carousel' && carouselMedia.length > 0) {
                  dataToSubmit.creative = {
                    ...dataToSubmit.creative,
                    carousel_items: carouselMedia.map(media => ({
                      image_url: media.url,
                      title: formData.creative.title,
                      description: formData.creative.body,
                      link: formData.creative.link_url,
                    })),
                  };
                }
                // Update formData temporarily for submission
                setFormData(dataToSubmit);
                // Call onSubmit which will use the updated formData
                setTimeout(() => onSubmit(), 0);
              }
            }}
            disabled={isSubmitting || (step === 1 && (!formData.name || !formData.adset_id))}
            className="gap-2"
          >
            {step < 3 ? 'Continue' : isSubmitting ? 'Creating...' : 'Create Ad'}
          </Button>
        </div>
      </div>

      {/* Media Library Picker */}
      <MediaLibraryPicker
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelect={handleMediaSelect}
        mediaType={creativeType === 'video' ? 'video' : creativeType === 'carousel' ? 'all' : 'image'}
        multiple={creativeType === 'carousel'}
        maxItems={10}
        title={creativeType === 'carousel' ? 'Select Carousel Media' : 'Select Media'}
        description={creativeType === 'carousel'
          ? 'Choose 2-10 images or videos for your carousel ad'
          : `Choose ${creativeType === 'video' ? 'a video' : 'an image'} from your media library`
        }
      />

      {/* Thumbnail Picker - Images only for video thumbnails */}
      <MediaLibraryPicker
        open={thumbnailPickerOpen}
        onOpenChange={setThumbnailPickerOpen}
        onSelect={(media) => {
          if (!Array.isArray(media)) {
            updateCreative({ thumbnail_url: media.url });
          }
        }}
        mediaType="image"
        multiple={false}
        title="Select Thumbnail Image"
        description="Choose an image from your library to use as the video thumbnail"
      />
    </div >
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
