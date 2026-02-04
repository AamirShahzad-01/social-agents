'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart3,
  Users,
  Megaphone,
  Plus,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Eye,
  MousePointerClick,
  AlertCircle,
  CheckCircle2,
  Facebook,
  Instagram,
  Calendar,
  Building2,
  ChevronDown,
  Check,
  Loader2,
  Settings,
  MoreHorizontal,
  FlaskConical,
  Bell,
  Zap,
  Image,
  Server,
  Shield,
  FileBarChart,
  Wrench,
  ChevronRight,
  Percent,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  META_ADS_CACHE_PREFIX,
  buildMetaAdsCacheKey,
  getCachedData,
  setCachedData,
  removeCacheByPrefix,
} from '@/lib/meta-ads-cache';

// Import sub-components
import CampaignManager from './CampaignManager';
import AdSetManager from './AdSetManager';
import AdCreativeManager from './AdCreativeManager';
import AudienceManager from './AudienceManager';
import AdsAnalytics from './AdsAnalytics';
import ReportsBuilder from './ReportsBuilder';
import ABTestManager from './ABTestManager';
import AutomationRulesManager from './AutomationRulesManager';
import CreativeHub from './CreativeHub';
import ConversionsAPIManager from './ConversionsAPIManager';
import ComplianceCenter from './ComplianceCenter';
import SDKToolbox from './SDKToolbox';
import AccountSettingsManager from './AccountSettingsManager';
import SettingsGeneral from './settings/SettingsGeneral';
import SettingsTeam from './settings/SettingsTeam';
import SettingsBilling from './settings/SettingsBilling';
import SettingsNotifications from './settings/SettingsNotifications';

import type { Campaign, AdSet, Ad, MetaAdsState, DatePreset } from '@/types/metaAds';
import { DATE_PRESETS, formatNumber } from '@/types/metaAds';

const initialState: MetaAdsState = {
  adAccount: null,
  campaigns: [],
  adSets: [],
  ads: [],
  audiences: [],
  images: [],
  videos: [],
  loading: false, // Start with false to render UI immediately
  error: null,
  selectedCampaign: null,
  selectedAdSet: null,
  selectedAd: null,
  selectedItems: [],
  viewMode: 'campaigns',
  datePreset: 'last_7d',
};

export default function MetaAdsManager() {
  const { user } = useAuth();
  const [state, setState] = useState<MetaAdsState>(initialState);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true); // Start true to show loading state on data
  const [isInitializing, setIsInitializing] = useState(true); // Track initial load
  const [datePreset, setDatePreset] = useState<DatePreset>('last_7d');
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);

  // Ad Set creation modal state
  const [showCreateAdSet, setShowCreateAdSet] = useState(false);
  const [createAdSetCampaignId, setCreateAdSetCampaignId] = useState<string | undefined>(undefined);

  // Ad creation modal state
  const [showCreateAd, setShowCreateAd] = useState(false);
  const [createAdAdSetId, setCreateAdAdSetId] = useState<string | undefined>(undefined);

  // Business Portfolio state
  const [availableBusinesses, setAvailableBusinesses] = useState<any[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<any>(null);
  const [showBusinessSelector, setShowBusinessSelector] = useState(false);
  const [isSwitchingBusiness, setIsSwitchingBusiness] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const lastCacheKeyRef = useRef<string | null>(null);

  const cacheScopeId = useMemo(
    () => activeBusiness?.id || state.adAccount?.id || user?.id || 'default',
    [activeBusiness?.id, state.adAccount?.id, user?.id]
  );
  const dashboardCacheKey = useMemo(
    () => buildMetaAdsCacheKey('dashboard', cacheScopeId),
    [cacheScopeId]
  );

  const applyDashboardCache = useCallback((cached: any) => {
    setIsConnected(Boolean(cached.isConnected));
    setState((prev) => ({
      ...prev,
      adAccount: cached.adAccount || prev.adAccount,
      campaigns: cached.campaigns || prev.campaigns,
      adSets: cached.adSets || prev.adSets,
      ads: cached.ads || prev.ads,
      audiences: cached.audiences || prev.audiences,
    }));
    setAvailableBusinesses(cached.availableBusinesses || []);
    setActiveBusiness(cached.activeBusiness || null);
    setLastUpdatedAt(cached.lastUpdatedAt || null);
  }, []);

  const initializeAll = useCallback(async () => {
    setIsInitializing(true);
    setIsRefreshing(true);

    try {
      const [statusRes, businessRes, campaignsRes, audiencesRes] = await Promise.all([
        fetch('/api/v1/meta-ads/status', { credentials: 'include' }).catch(() => null),
        fetch('/api/v1/meta-ads/switch-business', { credentials: 'include' }).catch(() => null),
        fetch('/api/v1/meta-ads/campaigns', { credentials: 'include' }).catch(() => null),
        fetch('/api/v1/meta-ads/audiences', { credentials: 'include' }).catch(() => null),
      ]);

      let nextIsConnected = isConnected;
      let nextAdAccount = state.adAccount;
      let nextBusinesses = availableBusinesses;
      let nextActiveBusiness = activeBusiness;
      let nextCampaigns = state.campaigns;
      let nextAdSets = state.adSets;
      let nextAds = state.ads;
      let nextAudiences = state.audiences;

      if (statusRes?.ok) {
        const statusData = await statusRes.json();
        nextIsConnected = statusData.isConnected;
        nextAdAccount = statusData.adAccount || nextAdAccount;
        setIsConnected(statusData.isConnected);
        if (statusData.adAccount) {
          setState(prev => ({ ...prev, adAccount: statusData.adAccount }));
        }
      }

      if (businessRes?.ok) {
        const businessData = await businessRes.json();
        nextBusinesses = businessData.availableBusinesses || [];
        nextActiveBusiness = businessData.activeBusiness || null;
        setAvailableBusinesses(nextBusinesses);
        setActiveBusiness(nextActiveBusiness);
      }

      if (campaignsRes?.ok) {
        const campaignsData = await campaignsRes.json();
        nextCampaigns = campaignsData.campaigns || [];
        nextAdSets = campaignsData.adSets || [];
        nextAds = campaignsData.ads || [];
        setState(prev => ({
          ...prev,
          campaigns: nextCampaigns,
          adSets: nextAdSets,
          ads: nextAds,
        }));
      }

      if (audiencesRes?.ok) {
        const audiencesData = await audiencesRes.json();
        nextAudiences = audiencesData.audiences || [];
        setState(prev => ({ ...prev, audiences: nextAudiences }));
      }

      const nextUpdatedAt = new Date().toISOString();
      setLastUpdatedAt(nextUpdatedAt);
      setCachedData(
        dashboardCacheKey,
        {
          isConnected: nextIsConnected,
          adAccount: nextAdAccount,
          availableBusinesses: nextBusinesses,
          activeBusiness: nextActiveBusiness,
          campaigns: nextCampaigns,
          adSets: nextAdSets,
          ads: nextAds,
          audiences: nextAudiences,
          lastUpdatedAt: nextUpdatedAt,
        },
        `${META_ADS_CACHE_PREFIX}_dashboard_${cacheScopeId}`
      );
    } catch (error) {
      console.error('Error initializing Meta Ads Manager:', error);
    } finally {
      setIsInitializing(false);
      setIsRefreshing(false);
    }
  }, [
    activeBusiness,
    availableBusinesses,
    cacheScopeId,
    dashboardCacheKey,
    isConnected,
    state.adAccount,
    state.adSets,
    state.ads,
    state.audiences,
    state.campaigns,
  ]);

  useEffect(() => {
    if (lastCacheKeyRef.current === dashboardCacheKey) {
      return;
    }
    const cached = getCachedData<any>(dashboardCacheKey);
    if (cached) {
      lastCacheKeyRef.current = dashboardCacheKey;
      applyDashboardCache(cached);
      setIsInitializing(false);
      setIsRefreshing(false);
      return;
    }
    lastCacheKeyRef.current = dashboardCacheKey;
    initializeAll();
  }, [applyDashboardCache, dashboardCacheKey, initializeAll]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showBusinessSelector) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-business-selector]')) {
          setShowBusinessSelector(false);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showBusinessSelector]);

  const handleSwitchBusiness = async (businessId: string) => {
    const previousBusinessId = activeBusiness?.id || state.adAccount?.id || user?.id || 'default';
    setIsSwitchingBusiness(true);
    try {
      const response = await fetch('/api/v1/meta-ads/switch-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setActiveBusiness({
          id: data.business.id,
          name: data.business.name,
          adAccount: data.adAccount,
        });
        setShowBusinessSelector(false);
        removeCacheByPrefix(`${META_ADS_CACHE_PREFIX}_dashboard_${previousBusinessId}`);
        removeCacheByPrefix(`${META_ADS_CACHE_PREFIX}_analytics_${previousBusinessId}`);
        removeCacheByPrefix(`${META_ADS_CACHE_PREFIX}_breakdown_${previousBusinessId}`);
        removeCacheByPrefix(`${META_ADS_CACHE_PREFIX}_settings_${previousBusinessId}`);
        // Reload all data after switching business
        await loadDashboardData();
      }
    } catch (error) {
    } finally {
      setIsSwitchingBusiness(false);
    }
  };

  const loadDashboardData = async () => {
    setIsRefreshing(true);
    try {
      // Fetch status, campaigns, and audiences in parallel
      const [statusRes, campaignsRes, audiencesRes] = await Promise.all([
        fetch('/api/v1/meta-ads/status', { credentials: 'include' }),
        fetch('/api/v1/meta-ads/campaigns', { credentials: 'include' }),
        fetch('/api/v1/meta-ads/audiences', { credentials: 'include' }),
      ]);

      let nextIsConnected = isConnected;
      let nextAdAccount = state.adAccount;
      let nextCampaigns = state.campaigns;
      let nextAdSets = state.adSets;
      let nextAds = state.ads;
      let nextAudiences = state.audiences;

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        nextIsConnected = statusData.isConnected;
        nextAdAccount = statusData.adAccount || nextAdAccount;
        setIsConnected(statusData.isConnected);
        if (statusData.adAccount) {
          setState(prev => ({ ...prev, adAccount: statusData.adAccount }));
        }
      }

      if (campaignsRes.ok) {
        const campaignsData = await campaignsRes.json();
        nextCampaigns = campaignsData.campaigns || [];
        nextAdSets = campaignsData.adSets || [];
        nextAds = campaignsData.ads || [];
        setState(prev => ({
          ...prev,
          campaigns: nextCampaigns,
          adSets: nextAdSets,
          ads: nextAds,
        }));
      }

      if (audiencesRes.ok) {
        const audiencesData = await audiencesRes.json();
        nextAudiences = audiencesData.audiences || [];
        setState(prev => ({ ...prev, audiences: nextAudiences }));
      }

      const nextUpdatedAt = new Date().toISOString();
      setLastUpdatedAt(nextUpdatedAt);
      setCachedData(
        dashboardCacheKey,
        {
          isConnected: nextIsConnected,
          adAccount: nextAdAccount,
          availableBusinesses,
          activeBusiness,
          campaigns: nextCampaigns,
          adSets: nextAdSets,
          ads: nextAds,
          audiences: nextAudiences,
          lastUpdatedAt: nextUpdatedAt,
        },
        `${META_ADS_CACHE_PREFIX}_dashboard_${cacheScopeId}`
      );
    } catch (error) {
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handler for opening the Create Ad Set modal
  const handleCreateAdSet = (campaignId?: string) => {
    setCreateAdSetCampaignId(campaignId);
    setShowCreateAdSet(true);
  };

  // Handler for opening the Create Ad modal
  const handleCreateAd = (adSetId?: string) => {
    setCreateAdAdSetId(adSetId);
    setShowCreateAd(true);
  };

  // Calculate metrics
  const totalSpend = state.campaigns.reduce((sum, c) => sum + (c.insights?.spend || 0), 0);
  const totalImpressions = state.campaigns.reduce((sum, c) => sum + (c.insights?.impressions || 0), 0);
  const totalClicks = state.campaigns.reduce((sum, c) => sum + (c.insights?.clicks || 0), 0);
  const totalReach = state.campaigns.reduce((sum, c) => sum + (c.insights?.reach || 0), 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const activeCampaigns = state.campaigns.filter(c => c.status === 'ACTIVE').length;

  // Show loading spinner during initial load
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading Meta Ads Manager...</p>
        </div>
      </div>
    );
  }

  // Render tool content if a tool is selected
  if (activeTool) {
    return (
      <div className="flex flex-col h-full bg-canva-gradient">
        <ToolHeader
          toolName={activeTool}
          onBack={() => setActiveTool(null)}
          onRefresh={loadDashboardData}
          isRefreshing={isRefreshing}
        />
        <div className="flex-1 overflow-auto p-6">
          {activeTool === 'ab-tests' && <ABTestManager onRefresh={loadDashboardData} />}
          {activeTool === 'automation' && <AutomationRulesManager onRefresh={loadDashboardData} />}
          {activeTool === 'creative' && <CreativeHub onRefresh={loadDashboardData} />}
          {activeTool === 'capi' && <ConversionsAPIManager onRefresh={loadDashboardData} />}
          {activeTool === 'compliance' && <ComplianceCenter onRefresh={loadDashboardData} />}
          {activeTool === 'sdk' && <SDKToolbox onRefresh={loadDashboardData} />}
          {activeTool === 'account-settings' && <AccountSettingsManager onRefresh={loadDashboardData} />}
          {activeTool === 'settings-general' && (
            <SettingsGeneral onRefresh={loadDashboardData} cacheScopeId={cacheScopeId} />
          )}
          {activeTool === 'settings-team' && (
            <SettingsTeam onRefresh={loadDashboardData} cacheScopeId={cacheScopeId} />
          )}
          {activeTool === 'settings-billing' && (
            <SettingsBilling onRefresh={loadDashboardData} cacheScopeId={cacheScopeId} />
          )}
          {activeTool === 'settings-notifications' && (
            <SettingsNotifications onRefresh={loadDashboardData} cacheScopeId={cacheScopeId} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-canva-gradient/95 backdrop-blur-sm border-b shadow-sm">
        <div className="px-6 py-1.5">
          <div className="flex items-center justify-between">
            {/* Left: Title & Account */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-base font-semibold leading-none">Meta Ads Manager</h1>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Facebook className="w-3 h-3 text-blue-500" />
                    <Instagram className="w-3 h-3 text-pink-500" />
                    {/* Business Selector */}
                    {availableBusinesses.length > 1 ? (
                      <div className="relative" data-business-selector>
                        <button
                          onClick={() => setShowBusinessSelector(!showBusinessSelector)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                        >
                          <Building2 className="w-3 h-3" />
                          <span className="max-w-[120px] truncate">{activeBusiness?.name || 'Select'}</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showBusinessSelector && (
                          <div className="absolute top-full left-0 mt-1 w-56 bg-popover border rounded-lg shadow-lg z-50 p-1.5">
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">Business Portfolios</p>
                            {availableBusinesses.map((business) => (
                              <button
                                key={business.id}
                                onClick={() => handleSwitchBusiness(business.id)}
                                disabled={isSwitchingBusiness}
                                className={cn(
                                  "w-full flex items-center justify-between px-2 py-2 text-left text-sm rounded-md hover:bg-muted transition-colors",
                                  business.id === activeBusiness?.id && "bg-muted"
                                )}
                              >
                                <div>
                                  <p className="font-medium text-sm">{business.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {business.adAccounts?.length || 0} ad accounts
                                  </p>
                                </div>
                                {business.id === activeBusiness?.id ? (
                                  <Check className="w-4 h-4 text-primary" />
                                ) : isSwitchingBusiness ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {activeBusiness?.name || state.adAccount?.name || 'Ad Account'}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{state.adAccount?.currency || 'USD'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5">

              {/* Notifications */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setActiveTool('account-settings')}
              >
                <Bell className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={loadDashboardData}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
              </Button>

              {/* Tools Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-7 gap-1.5 text-xs px-2.5 text-white" style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)' }}>
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    Tools
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setActiveTool('ab-tests')} className="gap-2 text-xs">
                    <FlaskConical className="w-3.5 h-3.5" />
                    A/B Tests
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTool('automation')} className="gap-2 text-xs">
                    <Zap className="w-3.5 h-3.5" />
                    Automation Rules
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTool('creative')} className="gap-2 text-xs">
                    <Image className="w-3.5 h-3.5" />
                    Creative Hub
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setActiveTool('capi')} className="gap-2 text-xs">
                    <Server className="w-3.5 h-3.5" />
                    Conversions API
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTool('account-settings')} className="gap-2 text-xs">
                    <Settings className="w-3.5 h-3.5" />
                    Account Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTool('compliance')} className="gap-2 text-xs">
                    <Shield className="w-3.5 h-3.5" />
                    Compliance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTool('sdk')} className="gap-2 text-xs">
                    <Wrench className="w-3.5 h-3.5" />
                    SDK Tools
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Connection Banner */}
      {!isConnected && (
        <div className="mx-6 mt-4 flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-sky-50 border border-sky-200 dark:bg-sky-950/30 dark:border-sky-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <div>
              <p className="text-sm font-medium">Meta Ads Not Connected</p>
              <p className="text-xs text-muted-foreground">Connect your Meta Business account to manage campaigns.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-9 bg-sky-600 hover:bg-sky-700"
            onClick={() => window.location.href = '/settings?tab=accounts'}
          >
            <Facebook className="w-4 h-4 mr-2" />
            Connect Now
          </Button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            {/* Tab Navigation - Compact (matches Media Studio) */}
            <div className="bg-card border rounded-md p-0.5 shadow-sm">
              <TabsList className="grid w-full grid-cols-5 bg-transparent gap-0.5 h-auto">
                <TabsTrigger
                  value="dashboard"
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium transition-all duration-200",
                    activeTab === 'dashboard'
                      ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Dashboard</span>
                </TabsTrigger>
                <TabsTrigger
                  value="campaigns"
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium transition-all duration-200",
                    activeTab === 'campaigns'
                      ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Campaigns</span>
                </TabsTrigger>
                <TabsTrigger
                  value="audiences"
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium transition-all duration-200",
                    activeTab === 'audiences'
                      ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Audiences</span>
                </TabsTrigger>
                <TabsTrigger
                  value="reports"
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium transition-all duration-200",
                    activeTab === 'reports'
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileBarChart className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Reports</span>
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium transition-all duration-200",
                    activeTab === 'settings'
                      ? "bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-md"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Settings</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6 mt-0">
              {/* Metrics Row */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <MetricCard
                  label="Total Spend"
                  value={`$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={DollarSign}
                  change={12.5}
                  color="teal"
                />
                <MetricCard
                  label="Impressions"
                  value={formatNumber(totalImpressions)}
                  icon={Eye}
                  change={8.2}
                  color="blue"
                />
                <MetricCard
                  label="Reach"
                  value={formatNumber(totalReach)}
                  icon={Users}
                  change={5.3}
                  color="purple"
                />
                <MetricCard
                  label="Clicks"
                  value={formatNumber(totalClicks)}
                  icon={MousePointerClick}
                  change={15.3}
                  color="amber"
                />
                <MetricCard
                  label="CTR"
                  value={`${avgCTR.toFixed(2)}%`}
                  icon={Percent}
                  change={2.1}
                  color="teal"
                />
              </div>

              {/* Main Dashboard Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Campaign Performance */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-medium">Campaign Performance</CardTitle>
                        <CardDescription className="text-xs">Top performing campaigns</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('campaigns')} className="h-8 text-xs gap-1">
                        View All <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {state.campaigns.length > 0 ? (
                      <div className="space-y-2">
                        {state.campaigns.slice(0, 5).map((campaign) => (
                          <CampaignRow key={campaign.id} campaign={campaign} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={Megaphone}
                        title="No campaigns yet"
                        description="Create your first campaign to start advertising"
                        action={
                          <Button size="sm" onClick={() => { setActiveTab('campaigns'); setShowCreateCampaign(true); }} className="mt-4 h-9">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Campaign
                          </Button>
                        }
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Quick Actions & Status */}
                <div className="space-y-6">
                  {/* Quick Actions */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <QuickAction
                        icon={Megaphone}
                        label="Create Campaign"
                        onClick={() => { setActiveTab('campaigns'); setShowCreateCampaign(true); }}
                      />
                      <QuickAction
                        icon={Users}
                        label="Build Audience"
                        onClick={() => setActiveTab('audiences')}
                      />
                      <QuickAction
                        icon={FileBarChart}
                        label="View Reports"
                        onClick={() => setActiveTab('reports')}
                      />
                    </CardContent>
                  </Card>

                  {/* Account Summary */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-medium">Account Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <SummaryItem label="Active Campaigns" value={activeCampaigns} />
                        <SummaryItem label="Total Ad Sets" value={state.adSets.length} />
                        <SummaryItem label="Active Ads" value={state.ads.filter(a => a.status === 'ACTIVE').length} />
                        <SummaryItem label="Audiences" value={state.audiences.length} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns" className="mt-0">
              <CampaignManager
                campaigns={state.campaigns}
                adSets={state.adSets}
                ads={state.ads}
                onRefresh={loadDashboardData}
                showCreate={showCreateCampaign}
                onShowCreateChange={setShowCreateCampaign}
                onCreateAdSet={handleCreateAdSet}
                onCreateAd={handleCreateAd}
              />
            </TabsContent>

            {/* Audiences Tab */}
            <TabsContent value="audiences" className="mt-0">
              <AudienceManager
                audiences={state.audiences}
                onRefresh={loadDashboardData}
              />
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="mt-0">
              <div className="space-y-6">
                <AdsAnalytics
                  campaigns={state.campaigns}
                  adSets={state.adSets}
                  ads={state.ads}
                  cacheScopeId={cacheScopeId}
                />
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="mt-0">
              <SettingsPanel onSelectTool={(tool) => setActiveTool(tool)} />
            </TabsContent>
          </Tabs>
        </div>
        <p className="text-xs text-center text-muted-foreground pt-4">
          Last updated: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : 'N/A'}
        </p>
      </div>

      {/* Ad Set Creation Modal */}
      {showCreateAdSet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateAdSet(false)} />
          <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto mx-4 p-6">
            <AdSetManager
              adSets={state.adSets}
              campaigns={state.campaigns}
              onRefresh={() => {
                loadDashboardData();
                setShowCreateAdSet(false);
              }}
              showCreate={true}
              onShowCreateChange={(show) => {
                if (!show) setShowCreateAdSet(false);
              }}
              preselectedCampaignId={createAdSetCampaignId}
            />
          </div>
        </div>
      )}

      {/* Ad Creation Modal */}
      {showCreateAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateAd(false)} />
          <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto mx-4 p-6">
            <AdCreativeManager
              ads={state.ads}
              adSets={state.adSets}
              onRefresh={() => {
                loadDashboardData();
                setShowCreateAd(false);
              }}
              showCreate={true}
              onShowCreateChange={(show) => {
                if (!show) setShowCreateAd(false);
              }}
              preselectedAdSetId={createAdAdSetId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============= Helper Components =============

function MetricCard({
  label,
  value,
  icon: Icon,
  change,
  color = 'teal',
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  change: number;
  color?: 'teal' | 'blue' | 'purple' | 'amber';
}) {
  const colorClasses = {
    teal: 'from-teal-500 to-teal-600',
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    amber: 'from-amber-500 to-amber-600',
  };
  const isPositive = change >= 0;
  return (
    <Card className="border hover:shadow-sm transition-shadow">
      <CardContent className="p-2">
        <div className="flex items-center justify-between mb-1">
          <div className={cn("p-1 rounded bg-gradient-to-br text-white", colorClasses[color])}>
            <Icon className="w-2.5 h-2.5" />
          </div>
          <span className={cn(
            "text-[9px] font-medium",
            isPositive
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}>
            {isPositive ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        </div>
        <p className="text-sm font-bold tracking-tight">{value}</p>
        <p className="text-[9px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const statusColors = {
    ACTIVE: 'bg-teal-500',
    PAUSED: 'bg-slate-400',
    DELETED: 'bg-rose-500',
    ARCHIVED: 'bg-slate-400',
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-2 h-2 rounded-full", statusColors[campaign.status])} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{campaign.name}</p>
          <p className="text-xs text-muted-foreground">{campaign.objective.replace('OUTCOME_', '')}</p>
        </div>
      </div>
      <div className="flex items-center gap-6 text-right">
        <div className="hidden sm:block">
          <p className="text-sm font-medium">${(campaign.insights?.spend || 0).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Spend</p>
        </div>
        <div className="hidden md:block">
          <p className="text-sm font-medium">{formatNumber(campaign.insights?.impressions || 0)}</p>
          <p className="text-xs text-muted-foreground">Impressions</p>
        </div>
        <div>
          <p className="text-sm font-medium">{formatNumber(campaign.insights?.clicks || 0)}</p>
          <p className="text-xs text-muted-foreground">Clicks</p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 p-2 rounded-md border hover:bg-muted/50 transition-colors text-left"
    >
      <div className="p-1.5 rounded-md bg-muted">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <span className="text-xs font-medium">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
    </button>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 rounded-full bg-muted mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-[200px]">{description}</p>
      {action}
    </div>
  );
}

function ToolHeader({
  toolName,
  onBack,
  onRefresh,
  isRefreshing,
}: {
  toolName: string;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const toolLabels: Record<string, { label: string; icon: React.ElementType }> = {
    'ab-tests': { label: 'A/B Tests', icon: FlaskConical },
    'automation': { label: 'Automation Rules', icon: Zap },
    'creative': { label: 'Creative Hub', icon: Image },
    'capi': { label: 'Conversions API', icon: Server },
    'compliance': { label: 'Compliance Center', icon: Shield },
    'sdk': { label: 'SDK Toolbox', icon: Wrench },
    'account-settings': { label: 'Account Settings', icon: Settings },
    'settings-general': { label: 'General Settings', icon: Building2 },
    'settings-team': { label: 'Team Access', icon: Users },
    'settings-billing': { label: 'Billing & Spending', icon: DollarSign },
    'settings-notifications': { label: 'Notifications', icon: Bell },
  };

  const tool = toolLabels[toolName] || { label: toolName, icon: Settings };
  const Icon = tool.icon;

  return (
    <header className="sticky top-0 z-20 bg-canva-gradient shadow-sm border-b">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 gap-2">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{tool.label}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>
    </header>
  );
}

function SettingsPanel({ onSelectTool }: { onSelectTool: (tool: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <SettingsCard
        icon={Settings}
        title="General Settings"
        description="Account name, status, and timezone"
        iconColor="bg-gradient-to-br from-teal-500 to-teal-600"
        onClick={() => onSelectTool('settings-general')}
      />
      <SettingsCard
        icon={Server}
        title="Conversions API"
        description="Configure server-side event tracking"
        iconColor="bg-gradient-to-br from-cyan-500 to-cyan-600"
        onClick={() => onSelectTool('capi')}
      />
      <SettingsCard
        icon={Shield}
        title="Compliance"
        description="Ad policy and compliance center"
        iconColor="bg-gradient-to-br from-blue-500 to-blue-600"
        onClick={() => onSelectTool('compliance')}
      />
      <SettingsCard
        icon={Wrench}
        title="SDK Tools"
        description="Developer tools and debugging"
        iconColor="bg-gradient-to-br from-purple-500 to-purple-600"
        onClick={() => onSelectTool('sdk')}
      />
      <SettingsCard
        icon={Building2}
        title="Business Settings"
        description="Manage business portfolio"
        iconColor="bg-gradient-to-br from-amber-500 to-amber-600"
        onClick={() => window.location.href = '/settings?tab=accounts'}
      />
      <SettingsCard
        icon={Users}
        title="Team Access"
        description="Manage team permissions"
        iconColor="bg-gradient-to-br from-purple-500 to-purple-600"
        onClick={() => onSelectTool('settings-team')}
      />
      <SettingsCard
        icon={AlertCircle}
        title="Notifications"
        description="Alert and notification rules"
        iconColor="bg-gradient-to-br from-amber-500 to-orange-600"
        onClick={() => onSelectTool('settings-notifications')}
      />
      <SettingsCard
        icon={DollarSign}
        title="Billing & Spending"
        description="Spend caps and account balance"
        iconColor="bg-gradient-to-br from-green-500 to-green-600"
        onClick={() => onSelectTool('settings-billing')}
      />
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  iconColor = "bg-muted",
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  iconColor?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className="hover:border-teal-500/40 hover:shadow-md transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2.5 rounded-lg text-white", iconColor)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
