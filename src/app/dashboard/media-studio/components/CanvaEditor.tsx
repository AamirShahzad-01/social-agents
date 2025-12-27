'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  ExternalLink,
  Download,
  Link2,
  Image as ImageIcon,
  Video,
  FolderOpen,
  Sparkles,
  ArrowRight,
  Palette,
  Send,
  Megaphone,
  Film,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboard } from '@/contexts/DashboardContext';
import toast from 'react-hot-toast';
import { SendToPostModal, SendConfig, MediaToSend } from './SendToPostModal';
import SendToAdModal, { type AdConfig, type MediaToSendToAd } from '@/components/meta-ads/SendToAdModal';
import { VideoEditor } from './video-editor';

interface CanvaDesign {
  id: string;
  title: string;
  thumbnail?: {
    url: string;
  };
  created_at: string;
  updated_at: string;
  urls?: {
    edit_url: string;
    view_url: string;
  };
  design_type?: string; // e.g., 'video', 'presentation', etc.
}

interface MediaLibraryItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  prompt?: string;
  created_at: string;
  thumbnail_url?: string;
}

interface CanvaEditorProps {
  onMediaSaved?: (url: string) => void;
}

export function CanvaEditor({ onMediaSaved }: CanvaEditorProps) {
  const { workspaceId, user } = useAuth();

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);

  // Designs state
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [isLoadingDesigns, setIsLoadingDesigns] = useState(false);

  // Library state
  const [libraryItems, setLibraryItems] = useState<MediaLibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaLibraryItem | null>(null);

  // Export state
  const [exportingDesignId, setExportingDesignId] = useState<string | null>(null);
  const [sendingDesignId, setSendingDesignId] = useState<string | null>(null);
  const [creatingDesignFrom, setCreatingDesignFrom] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'library' | 'designs' | 'video-editor'>('library');

  // Send to Post state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [mediaToSend, setMediaToSend] = useState<MediaToSend | null>(null);

  // Send to Meta Ads state
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [mediaToAd, setMediaToAd] = useState<MediaToSendToAd | null>(null);
  const [sendingDesignToAdId, setSendingDesignToAdId] = useState<string | null>(null);

  // Dashboard context for refreshing posts
  const { refreshData } = useDashboard();

  // Handle video editor completion
  const handleVideoProcessed = async (videoUrl: string) => {
    await fetchLibraryItems();
    setActiveTab('library');
    if (onMediaSaved) {
      onMediaSaved(videoUrl);
    }
  };

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Check URL params for connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('canva_connected') === 'true') {
      setIsConnected(true);
      toast.success('Canva connected successfully!');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('canva_error')) {
      toast.error('Failed to connect Canva: ' + params.get('canva_error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load data when connected
  useEffect(() => {
    if (isConnected && workspaceId) {
      fetchDesigns();
      fetchLibraryItems();
    }
  }, [isConnected, workspaceId]);

  const checkConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const response = await fetch('/api/canva/designs');
      if (response.ok) {
        setIsConnected(true);
      } else {
        const data = await response.json();
        setIsConnected(!data.needsAuth);
      }
    } catch {
      setIsConnected(false);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const fetchDesigns = async () => {
    setIsLoadingDesigns(true);
    try {
      const response = await fetch('/api/canva/designs');
      if (response.ok) {
        const data = await response.json();
        setDesigns(data.items || []);
      }
    } catch (error) {
    } finally {
      setIsLoadingDesigns(false);
    }
  };

  const fetchLibraryItems = async () => {
    if (!workspaceId) return;

    setIsLoadingLibrary(true);
    try {
      const response = await fetch(`/api/media-studio/library?workspace_id=${workspaceId}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setLibraryItems(data.items || []);
      }
    } catch (error) {
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const getMediaDimensions = (url: string, type: 'image' | 'video'): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      if (type === 'image') {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = url;
      } else {
        const video = document.createElement('video');
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
        video.onerror = reject;
        video.src = url;
      }
    });
  };

  const createDesignFromAsset = async (item: MediaLibraryItem) => {
    setCreatingDesignFrom(item.id);
    try {
      let dimensions = { width: 0, height: 0 };
      try {
        dimensions = await getMediaDimensions(item.url, item.type);
      } catch (e) {
      }

      const response = await fetch('/api/canva/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetUrl: item.url,
          assetType: item.type, // Pass asset type (image/video)
          designType: item.type === 'video' ? 'Video' : 'Document',
          width: dimensions.width,
          height: dimensions.height,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Open Canva editor - try multiple URL formats
        const editUrl =
          data.design?.urls?.edit_url ||
          data.design?.design?.urls?.edit_url ||
          (data.design?.design?.id && `https://www.canva.com/design/${data.design.design.id}/edit`) ||
          (data.design?.id && `https://www.canva.com/design/${data.design.id}/edit`);

        if (editUrl) {
          toast.success('Design created! Opening Canva editor...');
          // Use window.open and handle popup blocker
          const newWindow = window.open(editUrl, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // Popup was blocked - show link instead
            toast((t) => (
              <div className="flex items-center gap-2">
                <span>Popup blocked. </span>
                <a
                  href={editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                  onClick={() => toast.dismiss(t.id)}
                >
                  Click here to open Canva
                </a>
              </div>
            ), { duration: 10000 });
          }
        } else {
          toast.success('Design created! Check your Canva account to edit.');
        }

        // Refresh designs list
        await fetchDesigns();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create design');
      }
    } catch (error) {
      toast.error('Failed to create design');
    } finally {
      setCreatingDesignFrom(null);
    }
  };

  const exportDesignToLibrary = async (design: CanvaDesign) => {
    if (!workspaceId) {
      toast.error('No workspace selected');
      return;
    }

    setExportingDesignId(design.id);

    try {
      // First, check available export formats to determine if this is a video design
      // This is more reliable than checking design_type or title
      const formatsResponse = await fetch(`/api/canva/export-formats?designId=${design.id}`);

      let format = 'png'; // Default to PNG for images
      let isVideoDesign = false;

      if (formatsResponse.ok) {
        const formatsData = await formatsResponse.json();

        // If MP4 is available and PNG is NOT available, it's a video-only design
        // If both are available, check design_type/title for hints
        const hasMp4 = formatsData.formats?.mp4;
        const hasPng = formatsData.formats?.png;

        if (hasMp4 && !hasPng) {
          // Video-only design (e.g., Canva video templates)
          format = 'mp4';
          isVideoDesign = true;
        } else if (hasMp4 && hasPng) {
          // Both available - use design_type/title hints
          const designTypeStr = (design.design_type || '').toLowerCase();
          const titleStr = (design.title || '').toLowerCase();
          const videoIndicators = ['video', 'animation', 'reel', 'story'];

          isVideoDesign = videoIndicators.some(indicator =>
            designTypeStr.includes(indicator) || titleStr.includes(indicator)
          );

          format = isVideoDesign ? 'mp4' : 'png';
        }
        // If only PNG available, keep default

      } else {
        // Fallback to design_type/title detection if formats API fails
        const designTypeStr = (design.design_type || '').toLowerCase();
        const titleStr = (design.title || '').toLowerCase();
        const videoIndicators = ['video', 'animation', 'reel', 'story'];

        isVideoDesign = videoIndicators.some(indicator =>
          designTypeStr.includes(indicator) || titleStr.includes(indicator)
        );

        format = isVideoDesign ? 'mp4' : 'png';

      }

      // Now export with the determined format
      const response = await fetch('/api/canva/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: design.id,
          workspaceId,
          format,
          quality: 'high',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const mediaType = data.mediaItem?.type || (isVideoDesign ? 'video' : 'image');
        toast.success(`${mediaType === 'video' ? 'Video' : 'Image'} exported to library!`);

        // Refresh library
        await fetchLibraryItems();

        if (onMediaSaved) {
          onMediaSaved(data.exportUrl);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to export design');
      }
    } catch (error) {
      toast.error('Failed to export design');
    } finally {
      setExportingDesignId(null);
    }
  };

  const openInCanva = (design: CanvaDesign) => {
    if (design.urls?.edit_url) {
      window.open(design.urls.edit_url, '_blank');
    }
  };

  // Handle send to post for library items
  const handleSendToPost = (item: MediaLibraryItem) => {
    setMediaToSend({
      type: item.type,
      url: item.url,
      prompt: item.prompt || '',
    });
    setSendModalOpen(true);
  };

  // Handle send to Meta Ads for library items
  const handleSendToAd = (item: MediaLibraryItem) => {
    setMediaToAd({
      type: item.type,
      url: item.url,
      prompt: item.prompt || '',
    });
    setAdModalOpen(true);
  };

  // Handle send design to Meta Ads (exports first, then opens ad modal)
  const handleSendDesignToAd = async (design: CanvaDesign) => {
    if (!workspaceId) {
      toast.error('No workspace selected');
      return;
    }

    setSendingDesignToAdId(design.id);

    try {
      // Check available export formats
      const formatsResponse = await fetch(`/api/canva/export-formats?designId=${design.id}`);

      let format = 'png';
      let isVideoDesign = false;

      if (formatsResponse.ok) {
        const formatsData = await formatsResponse.json();
        const hasMp4 = formatsData.formats?.mp4;
        const hasPng = formatsData.formats?.png;

        if (hasMp4 && !hasPng) {
          format = 'mp4';
          isVideoDesign = true;
        } else if (hasMp4 && hasPng) {
          const designTypeStr = (design.design_type || '').toLowerCase();
          const titleStr = (design.title || '').toLowerCase();
          const videoIndicators = ['video', 'animation', 'reel', 'story'];

          isVideoDesign = videoIndicators.some(indicator =>
            designTypeStr.includes(indicator) || titleStr.includes(indicator)
          );

          format = isVideoDesign ? 'mp4' : 'png';
        }
      }

      // Export the design
      const response = await fetch('/api/canva/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: design.id,
          workspaceId,
          format,
          quality: 'high',
          saveToLibrary: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const mediaType = data.mediaItem?.type || (isVideoDesign ? 'video' : 'image');
        const exportUrl = data.exportUrl || data.mediaItem?.url;
        const additionalUrls = data.additionalUrls || [];

        if (exportUrl) {
          setMediaToAd({
            type: mediaType as 'image' | 'video',
            url: exportUrl,
            prompt: design.title || '',
            additionalUrls: additionalUrls.length > 0 ? additionalUrls : undefined,
          });
          setAdModalOpen(true);
          toast.success('Design exported! Configure your ad.');
        } else {
          toast.error('Failed to get export URL');
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to export design');
      }
    } catch (error) {
      toast.error('Failed to export design');
    } finally {
      setSendingDesignToAdId(null);
    }
  };

  // Handle ad config from modal
  const handleAdConfig = async (config: AdConfig) => {
    try {
      const response = await fetch('/api/meta-ads/ads/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          adConfig: config,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create ad draft');
      }

      toast.success(`Ad draft created! Go to Meta Ads Manager → Library Ads to review and publish.`);
      setAdModalOpen(false);
      setMediaToAd(null);
    } catch (error) {
      toast.error('Failed to create ad. Please try again.');
      throw error;
    }
  };

  // Handle send to post for Canva designs (exports first, then sends)
  const handleSendDesignToPost = async (design: CanvaDesign) => {
    if (!workspaceId) {
      toast.error('No workspace selected');
      return;
    }

    // First export the design to get the URL
    setSendingDesignId(design.id);

    try {
      // Check available export formats
      const formatsResponse = await fetch(`/api/canva/export-formats?designId=${design.id}`);

      let format = 'png';
      let isVideoDesign = false;

      if (formatsResponse.ok) {
        const formatsData = await formatsResponse.json();
        const hasMp4 = formatsData.formats?.mp4;
        const hasPng = formatsData.formats?.png;

        if (hasMp4 && !hasPng) {
          format = 'mp4';
          isVideoDesign = true;
        } else if (hasMp4 && hasPng) {
          const designTypeStr = (design.design_type || '').toLowerCase();
          const titleStr = (design.title || '').toLowerCase();
          const videoIndicators = ['video', 'animation', 'reel', 'story'];

          isVideoDesign = videoIndicators.some(indicator =>
            designTypeStr.includes(indicator) || titleStr.includes(indicator)
          );

          format = isVideoDesign ? 'mp4' : 'png';
        }
      }

      // Export the design (also save to library so user can delete file later)
      const response = await fetch('/api/canva/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: design.id,
          workspaceId,
          format,
          quality: 'high',
          saveToLibrary: true, // Save to library so user can manage/delete the file
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const mediaType = data.mediaItem?.type || (isVideoDesign ? 'video' : 'image');
        const exportUrl = data.exportUrl || data.mediaItem?.url;

        // Get additional URLs for multi-page designs (carousel support)
        const additionalUrls = data.additionalUrls || [];
        const isMultiPage = data.isMultiPage || additionalUrls.length > 0;

        if (exportUrl) {
          // Open send to post modal with the exported media
          // Include additionalUrls for carousel/multi-page designs
          setMediaToSend({
            type: mediaType as 'image' | 'video',
            url: exportUrl,
            prompt: design.title || '',
            additionalUrls: isMultiPage ? additionalUrls : undefined,
          });
          setSendModalOpen(true);

          if (isMultiPage) {
            toast.success(`Design exported! ${data.pageCount} pages detected - select platform to create carousel.`);
          } else {
            toast.success('Design exported! Select platform to create post.');
          }
        } else {
          toast.error('Failed to get export URL');
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to export design');
      }
    } catch (error) {
      toast.error('Failed to export design');
    } finally {
      setSendingDesignId(null);
    }
  };

  // Handle send config from modal
  const handleSendConfig = async (config: SendConfig) => {
    try {
      const { platform, postType, media } = config;
      const postId = crypto.randomUUID();

      // Always send directly to publish
      const postStatus = 'ready_to_publish';

      // Build platform-specific content structure
      const buildPlatformContent = () => {
        const baseContent = {
          type: media.type as 'image' | 'video',
          format: postType as 'post' | 'carousel' | 'reel' | 'short' | 'story' | 'thread' | 'article',
          title: '',
          description: '',
          hashtags: [],
        };

        switch (platform) {
          case 'instagram':
            return {
              instagram: {
                ...baseContent,
                ...(postType === 'reel' && { type: 'video' }),
              }
            };

          case 'twitter':
            return {
              twitter: {
                ...baseContent,
                content: '',
              }
            };

          case 'facebook':
            return {
              facebook: {
                ...baseContent,
                ...(postType === 'reel' && { type: 'video', format: 'reel' }),
              }
            };

          case 'linkedin':
            return {
              linkedin: {
                ...baseContent,
                ...(postType === 'article' && { format: 'article' }),
              }
            };

          case 'youtube':
            return {
              youtube: {
                type: postType === 'thumbnail' ? 'image' : 'video',
                format: postType === 'short' ? 'short' : 'post',
                title: '',
                description: '',
                tags: [],
                privacyStatus: 'public' as const,
              }
            };

          case 'tiktok':
            return {
              tiktok: {
                type: postType === 'slideshow' ? 'image' : 'video',
                format: postType as 'post' | 'slideshow',
                title: '',
                description: '',
                hashtags: [],
              }
            };

          default:
            return { [platform]: baseContent };
        }
      };

      // Determine media fields based on post type and media type
      const getMediaFields = () => {
        const isVideoPostType = ['reel', 'video', 'short'].includes(postType);
        const isCarouselPostType = postType === 'carousel' || postType === 'slideshow';

        if (isCarouselPostType && media.additionalUrls && media.additionalUrls.length > 0) {
          return {
            carouselImages: [media.url, ...media.additionalUrls],
            generatedImage: media.url,
          };
        } else if (isVideoPostType || media.type === 'video') {
          return {
            generatedVideoUrl: media.url,
          };
        } else {
          return {
            generatedImage: media.url,
          };
        }
      };

      const response = await fetch(`/api/posts?user_id=${user?.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          post: {
            id: postId,
            topic: '',
            platforms: [platform],
            postType: postType,
            content: buildPlatformContent(),
            status: postStatus,
            createdAt: new Date().toISOString(),
            ...getMediaFields(),
            isGeneratingImage: false,
            isGeneratingVideo: false,
            videoGenerationStatus: 'none',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
      }

      await refreshData();

      const postTypeLabels: Record<string, string> = {
        post: 'Post',
        carousel: 'Carousel',
        reel: 'Reel',
        story: 'Story',
        video: 'Video',
        short: 'Short',
        slideshow: 'Slideshow',
        thread: 'Thread',
        article: 'Article',
        thumbnail: 'Thumbnail',
      };

      const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

      alert(`${postTypeLabels[postType] || 'Post'} created for ${platformName}! Go to Publish to edit caption and publish.`);
    } catch (error) {
      alert('Failed to create post. Please try again.');
      throw error;
    }
  };

  // Not connected state
  if (isCheckingConnection) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card className="border-2 border-dashed border-purple-200 dark:border-purple-900 bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-950/20 dark:to-pink-950/20">
        <CardContent className="flex flex-col items-center justify-center py-20 px-8 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur-xl opacity-30" />
            <div className="relative bg-gradient-to-r from-purple-500 to-pink-500 p-4 rounded-2xl">
              <Palette className="w-12 h-12 text-white" />
            </div>
          </div>

          <h3 className="text-2xl font-bold mb-2">Connect Canva</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Edit your media library assets with Canva's powerful design tools.
            Add text, filters, graphics, and more - then save back to your library.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 w-full max-w-2xl">
            <div className="flex items-center gap-3 p-4 bg-background rounded-lg border">
              <FolderOpen className="w-5 h-5 text-purple-500" />
              <span className="text-sm">Select from library</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-background rounded-lg border">
              <ArrowRight className="w-5 h-5 text-pink-500" />
              <span className="text-sm">Edit in Canva</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-background rounded-lg border">
              <Download className="w-5 h-5 text-green-500" />
              <span className="text-sm">Save back</span>
            </div>
          </div>

          <Button
            size="lg"
            onClick={() => window.location.href = '/settings?tab=accounts'}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Link2 className="w-4 h-4 mr-2" />
            Connect in Settings
          </Button>

          <p className="text-xs text-muted-foreground mt-4">
            Go to Settings → Accounts to connect your Canva account
          </p>
        </CardContent>
      </Card>
    );
  }

  // Connected state
  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'library' | 'designs' | 'video-editor')}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="library" className="gap-2">
            <FolderOpen className="w-4 h-4" />
            Media Library
            <Badge variant="secondary" className="ml-1">{libraryItems.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="designs" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Canva Designs
            <Badge variant="secondary" className="ml-1">{designs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="video-editor" className="gap-2">
            <Film className="w-4 h-4" />
            Video Editor
          </TabsTrigger>
        </TabsList>

        {/* Library Tab - Select media to edit */}
        <TabsContent value="library" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Media to Edit</CardTitle>
              <CardDescription>
                Choose an image or video from your library to edit in Canva
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLibrary ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : libraryItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No media in library yet</p>
                  <p className="text-sm">Generate some images or videos first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {libraryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedItem?.id === item.id
                        ? 'border-purple-500 ring-2 ring-purple-200'
                        : 'border-transparent hover:border-purple-300'
                        }`}
                      onClick={() => setSelectedItem(item)}
                    >
                      {item.type === 'video' ? (
                        item.thumbnail_url ? (
                          <img
                            src={item.thumbnail_url}
                            alt={item.prompt || 'Video'}
                            className="aspect-[4/3] object-cover w-full"
                          />
                        ) : (
                          <video
                            src={item.url}
                            className="aspect-[4/3] object-cover w-full"
                            muted
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                              // Seek to first frame to show preview
                              (e.target as HTMLVideoElement).currentTime = 0.1;
                            }}
                          />
                        )
                      ) : (
                        <img
                          src={item.thumbnail_url || item.url}
                          alt={item.prompt || 'Media'}
                          className="aspect-[4/3] object-cover w-full"
                        />
                      )}

                      {/* Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            createDesignFromAsset(item);
                          }}
                          disabled={creatingDesignFrom === item.id}
                          className="bg-gradient-to-r from-purple-500 to-pink-500"
                        >
                          {creatingDesignFrom === item.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Palette className="w-4 h-4 mr-1" />
                              Edit in Canva
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendToPost(item);
                          }}
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Send to Post
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendToAd(item);
                          }}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        >
                          <Megaphone className="w-4 h-4 mr-1" />
                          Create Ad
                        </Button>
                      </div>

                      {/* Type badge */}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="text-xs">
                          {item.type === 'video' ? (
                            <Video className="w-3 h-3" />
                          ) : (
                            <ImageIcon className="w-3 h-3" />
                          )}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Designs Tab - Export designs back */}
        <TabsContent value="designs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Canva Designs</CardTitle>
              <CardDescription>
                Edit designs in Canva or export them back to your media library
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDesigns ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : designs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No Canva designs yet</p>
                  <p className="text-sm">Select media from library to create a design</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {designs.map((design) => (
                    <div
                      key={design.id}
                      className="relative group rounded-lg overflow-hidden border bg-muted"
                    >
                      {design.thumbnail?.url ? (
                        <img
                          src={design.thumbnail.url}
                          alt={design.title}
                          className="aspect-[4/3] object-cover w-full"
                        />
                      ) : (
                        <div className="aspect-[4/3] flex items-center justify-center">
                          <Palette className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}

                      {/* Title */}
                      <div className="p-2 bg-background">
                        <p className="text-sm font-medium truncate">{design.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(design.updated_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Hover actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => openInCanva(design)}
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Edit in Canva
                        </Button>

                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                          onClick={() => exportDesignToLibrary(design)}
                          disabled={exportingDesignId === design.id || sendingDesignId === design.id}
                        >
                          {exportingDesignId === design.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-1" />
                              Save to Library
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                          onClick={() => handleSendDesignToPost(design)}
                          disabled={sendingDesignId === design.id || exportingDesignId === design.id || sendingDesignToAdId === design.id}
                        >
                          {sendingDesignId === design.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-1" />
                              Send to Post
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                          onClick={() => handleSendDesignToAd(design)}
                          disabled={sendingDesignToAdId === design.id || exportingDesignId === design.id || sendingDesignId === design.id}
                        >
                          {sendingDesignToAdId === design.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Megaphone className="w-4 h-4 mr-1" />
                              Create Ad
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Video Editor Tab - Merge videos & Audio mixing */}
        <TabsContent value="video-editor" className="mt-4">
          <VideoEditor onVideoProcessed={handleVideoProcessed} />
        </TabsContent>
      </Tabs>

      {/* Send to Post Modal */}
      <SendToPostModal
        isOpen={sendModalOpen}
        onClose={() => {
          setSendModalOpen(false);
          setMediaToSend(null);
        }}
        media={mediaToSend}
        onSend={handleSendConfig}
      />

      {/* Send to Meta Ads Modal */}
      <SendToAdModal
        isOpen={adModalOpen}
        onClose={() => {
          setAdModalOpen(false);
          setMediaToAd(null);
        }}
        media={mediaToAd}
        onSend={handleAdConfig}
      />
    </div>
  );
}
