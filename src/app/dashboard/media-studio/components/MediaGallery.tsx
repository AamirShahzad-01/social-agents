'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Image as ImageIcon,
  Video,
  Download,
  Trash2,
  Search,
  Grid,
  List,
  Filter,
  X,
  Eye,
  Copy,
  Check,
  Heart,
  Send,
  Loader2,
  RefreshCw,
  FolderOpen,
  Upload,
  Plus,
  CheckSquare,
  Square,
  Layers,
  Megaphone,
  Music,
  Palette,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SendToPostModal, SendConfig, MediaToSend } from './SendToPostModal';
import SendToAdModal, { type AdConfig, type MediaToSendToAd } from '@/components/meta-ads/SendToAdModal';
import type { GeneratedImage, GeneratedVideo } from '../types/mediaStudio.types';
import { useDashboard } from '@/contexts/DashboardContext';
import { useMedia, MediaItem } from '@/contexts/MediaContext';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { AudioWaveform } from '@/components/ui/audio-waveform';

// MediaItem is now imported from MediaContext

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'images' | 'videos' | 'audio' | 'favorites';

interface MediaGalleryProps {
  images: GeneratedImage[];
  videos: GeneratedVideo[];
  workspaceId?: string;
  hideHeader?: boolean;
  externalViewMode?: ViewMode;
  externalFilterType?: FilterType;
  externalSearchQuery?: string;
  externalIsSelectMode?: boolean;
  externalSelectedItems?: MediaItem[];
  onSelectedItemsChange?: (items: MediaItem[]) => void;
  onSelectModeChange?: (mode: boolean) => void;
}

export function MediaGallery({
  images,
  videos,
  workspaceId,
  hideHeader = false,
  externalViewMode,
  externalFilterType,
  externalSearchQuery,
  externalIsSelectMode,
  externalSelectedItems,
  onSelectedItemsChange,
  onSelectModeChange,
}: MediaGalleryProps) {
  // Use external state if provided, otherwise use internal state
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('grid');
  const [internalFilterType, setInternalFilterType] = useState<FilterType>('all');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalIsSelectMode, setInternalIsSelectMode] = useState(false);
  const [internalSelectedItems, setInternalSelectedItems] = useState<MediaItem[]>([]);

  // Determine which state to use (external or internal)
  const viewMode = externalViewMode ?? internalViewMode;
  const filterType = externalFilterType ?? internalFilterType;
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const isSelectMode = externalIsSelectMode ?? internalIsSelectMode;
  const selectedItems = externalSelectedItems ?? internalSelectedItems;

  // Use callbacks if provided, otherwise use internal setters
  const setSelectedItems = onSelectedItemsChange ?? setInternalSelectedItems;
  const setIsSelectMode = onSelectModeChange ?? setInternalIsSelectMode;
  const setViewMode = externalViewMode !== undefined ? () => { } : setInternalViewMode;
  const setFilterType = externalFilterType !== undefined ? () => { } : setInternalFilterType;
  const setSearchQuery = externalSearchQuery !== undefined ? () => { } : setInternalSearchQuery;

  const [selectedItem, setSelectedItem] = useState<MediaItem | GeneratedImage | GeneratedVideo | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [mediaToSend, setMediaToSend] = useState<MediaToSend | null>(null);

  // Meta Ads modal state
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [mediaToAd, setMediaToAd] = useState<MediaToSendToAd | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canva state
  const [creatingDesignFrom, setCreatingDesignFrom] = useState<string | null>(null);

  // Dashboard context for refreshing posts
  const { refreshData } = useDashboard();

  // Auth context to get user ID for API calls
  const { user } = useAuth();

  // Media context for cached media items (like DashboardContext for posts)
  const {
    mediaItems: dbMediaItems,
    loading: isLoading,
    refreshMedia: fetchMediaFromDb,
    setFilters,
    toggleFavorite: contextToggleFavorite,
    deleteItem: contextDeleteItem,
  } = useMedia();

  // Update context filters when local filter changes
  useEffect(() => {
    setFilters({
      type: filterType === 'images' ? 'image' : filterType === 'videos' ? 'video' : filterType === 'audio' ? 'audio' : undefined,
      isFavorite: filterType === 'favorites' ? true : undefined,
      search: searchQuery || undefined,
    });
  }, [filterType, searchQuery, setFilters]);

  // Listen for custom events from external toolbar (for carousel creation)
  useEffect(() => {
    const handleCreateCarouselPostEvent = (e: CustomEvent<MediaItem[]>) => {
      const items = e.detail;
      if (items.length < 2 || !workspaceId) return;

      const imageCount = items.filter(item => item.type === 'image').length;
      const videoCount = items.filter(item => item.type === 'video').length;
      const audioCount = items.filter(item => item.type === 'audio').length;
      const carouselUrls = items.map(item => item.url);
      const primaryType = items[0].type;

      setMediaToSend({
        type: primaryType,
        url: carouselUrls[0],
        prompt: `Carousel with ${imageCount > 0 ? `${imageCount} image${imageCount > 1 ? 's' : ''}` : ''}${imageCount > 0 && (videoCount > 0 || audioCount > 0) ? ' and ' : ''}${videoCount > 0 ? `${videoCount} video${videoCount > 1 ? 's' : ''}` : ''}${(imageCount > 0 || videoCount > 0) && audioCount > 0 ? ' and ' : ''}${audioCount > 0 ? `${audioCount} audio${audioCount > 1 ? 's' : ''}` : ''}`,
        additionalUrls: carouselUrls.slice(1),
      });
      setSendModalOpen(true);
    };

    const handleCreateCarouselAdEvent = (e: CustomEvent<MediaItem[]>) => {
      const items = e.detail;
      if (items.length < 2 || !workspaceId) return;

      const carouselUrls = items.map(item => item.url);
      const primaryType = items[0].type;

      setMediaToAd({
        type: primaryType,
        url: carouselUrls[0],
        prompt: `Carousel ad with ${items.length} items`,
        additionalUrls: carouselUrls.slice(1),
      });
      setAdModalOpen(true);
    };

    window.addEventListener('createCarouselPost', handleCreateCarouselPostEvent as EventListener);
    window.addEventListener('createCarouselAd', handleCreateCarouselAdEvent as EventListener);

    return () => {
      window.removeEventListener('createCarouselPost', handleCreateCarouselPostEvent as EventListener);
      window.removeEventListener('createCarouselAd', handleCreateCarouselAdEvent as EventListener);
    };
  }, [workspaceId]);

  // Filter in-memory items based on search and type
  const filteredImages = images.filter(img =>
    (filterType === 'all' || filterType === 'images') &&
    (searchQuery === '' || img.prompt.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredVideos = videos.filter(vid =>
    (filterType === 'all' || filterType === 'videos') &&
    vid.status === 'completed' &&
    (searchQuery === '' || vid.prompt.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Combine database items with in-memory items
  const allItems = workspaceId
    ? dbMediaItems.filter(item => {
      if (filterType === 'all') return item.type !== 'audio';
      if (filterType === 'images') return item.type === 'image';
      if (filterType === 'videos') return item.type === 'video';
      if (filterType === 'audio') return item.type === 'audio';
      if (filterType === 'favorites') return item.is_favorite;
      return true;
    })
    : [...filteredImages.map(img => ({
      id: img.id,
      type: 'image' as const,
      source: img.type,
      url: img.url,
      prompt: img.prompt,
      model: img.config?.model || 'unknown',
      config: img.config || {},
      is_favorite: false,
      tags: [],
      created_at: new Date(img.createdAt).toISOString(),
    })), ...filteredVideos.filter(v => v.url).map(vid => ({
      id: vid.id,
      type: 'video' as const,
      source: 'generated',
      url: vid.url!,
      prompt: vid.prompt,
      model: vid.config?.model || 'sora-2',
      config: vid.config || {},
      is_favorite: false,
      tags: [],
      created_at: new Date(vid.createdAt).toISOString(),
    }))];

  const totalItems = allItems.length;

  const handleDownload = async (url: string, type: 'image' | 'video' | 'audio') => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      let filename = `${type}_${Date.now()}`;
      if (type === 'image') filename += '.png';
      else if (type === 'video') filename += '.mp4';
      else if (type === 'audio') filename += '.mp3'; // Assuming mp3 for audio
      a.download = filename;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      toast.error('Failed to download media.');
    }
  };

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleFavorite = async (item: MediaItem) => {
    if (!workspaceId) return;
    await contextToggleFavorite(item.id);
  };

  // Get media dimensions for Canva
  const getMediaDimensions = (url: string, type: 'image' | 'video' | 'audio'): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      if (type === 'image') {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = url;
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
        video.onerror = reject;
        video.src = url;
      } else {
        // Audio doesn't have dimensions
        resolve({ width: 1280, height: 720 });
      }
    });
  };

  // Create design in Canva from media item
  const createDesignFromAsset = async (item: MediaItem) => {
    setCreatingDesignFrom(item.id);
    try {
      let dimensions = { width: 0, height: 0 };
      try {
        dimensions = await getMediaDimensions(item.url, item.type);
      } catch (e) {
        // Fallback dimensions
      }

      const response = await fetch(`/api/canva/designs?user_id=${user?.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetUrl: item.url,
          assetType: item.type,
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
          const newWindow = window.open(editUrl, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // Popup was blocked
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

  const handleDelete = async (item: MediaItem) => {
    if (!workspaceId || !confirm('Delete this media item?')) return;
    await contextDeleteItem(item.id);
    if (selectedItem && 'id' in selectedItem && selectedItem.id === item.id) {
      setSelectedItem(null);
    }
  };

  const handleSendToPost = (item: MediaItem) => {
    setMediaToSend({
      type: item.type,
      url: item.url,
      prompt: item.prompt,
    });
    setSendModalOpen(true);
  };

  // Send to Meta Ads
  const handleSendToAd = (item: MediaItem) => {
    setMediaToAd({
      type: item.type,
      url: item.url,
      prompt: item.prompt,
    });
    setAdModalOpen(true);
  };

  // Handle ad creation from modal
  const handleAdConfig = async (config: AdConfig) => {
    if (!workspaceId) {
      toast.error('No workspace selected. Please select a workspace first.');
      return;
    }

    const response = await fetch('/api/v1/meta-ads/ads/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        adConfig: config,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || 'Failed to create ad draft');
      throw new Error(data.error || 'Failed to create ad draft');
    }

    toast.success('Ad draft created! Go to Meta Ads Manager → Library Ads to review and publish.');
    setAdModalOpen(false);
    setMediaToAd(null);
  };

  // Send multiple items to carousel ad
  const handleCreateCarouselAd = () => {
    if (selectedItems.length < 2 || !workspaceId) return;

    const carouselUrls = selectedItems.map(item => item.url);
    const primaryType = selectedItems[0].type;

    setMediaToAd({
      type: primaryType,
      url: carouselUrls[0],
      prompt: `Carousel ad with ${selectedItems.length} items`,
      additionalUrls: carouselUrls.slice(1),
    });
    setAdModalOpen(true);
  };

  const handleSendConfig = async (config: SendConfig) => {
    // Create a new post with the media - empty caption for user to fill in
    try {
      const { platform, postType, media, postToPage } = config;
      const postId = crypto.randomUUID();

      // Always send directly to publish
      const postStatus = 'ready_to_publish';

      // Build platform-specific content structure with EMPTY caption/description
      // User will add their own caption in Publish page
      const buildPlatformContent = () => {
        const baseContent = {
          type: media.type as 'image' | 'video' | 'audio',
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
                content: '', // Empty tweet text
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
                postToPage: postToPage, // Include LinkedIn target preference
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
        } else if (media.type === 'audio') {
          return {
            generatedAudioUrl: media.url,
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
            topic: '', // Empty topic - user will add caption
            platforms: [platform],
            postType: postType,
            content: buildPlatformContent(),
            status: postStatus,
            createdAt: new Date().toISOString(),
            ...getMediaFields(),
            isGeneratingImage: false,
            isGeneratingVideo: false,
            videoGenerationStatus: 'none',
            // LinkedIn-specific: store postToPage preference
            ...(platform === 'linkedin' && postToPage !== undefined && { linkedInPostToPage: postToPage }),
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
      // Add target info for LinkedIn
      const targetInfo = platform === 'linkedin' && postToPage !== undefined
        ? ` (${postToPage ? 'Company Page' : 'Personal Profile'})`
        : '';

      alert(`${postTypeLabels[postType] || 'Post'} created for ${platformName}${targetInfo}! Go to Publish to edit caption and publish.`);
    } catch (error) {
      alert('Failed to create post. Please try again.');
      throw error;
    }
  };

  // Handle file upload (using Cloudinary)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !workspaceId) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');

        if (!isImage && !isVideo && !isAudio) {
          throw new Error(`Invalid file type: ${file.name}. Only images, videos, and audio are allowed.`);
        }

        // Check file size (max 2GB for videos via chunked upload, 100MB direct, 50MB for images, 20MB for audio)
        const maxSize = isVideo ? 2 * 1024 * 1024 * 1024 : isAudio ? 20 * 1024 * 1024 : 50 * 1024 * 1024;
        if (file.size > maxSize) {
          throw new Error(`File too large: ${file.name}. Max ${isVideo ? '2GB' : isAudio ? '20MB' : '50MB'}.`);
        }

        // Upload to Cloudinary via backend API
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'media-library');
        formData.append('tags', `workspace:${workspaceId},uploaded`);

        // Use chunked upload for large videos (>100MB)
        if (isVideo && file.size > 100 * 1024 * 1024) {
          formData.append('chunked', 'true');
        }

        // Determine upload endpoint based on file type (use Next.js proxy paths)
        const uploadEndpoint = isImage
          ? '/api/cloudinary/upload/image'
          : isVideo
            ? '/api/cloudinary/upload/video'
            : '/api/cloudinary/upload/audio';

        // Use the Next.js proxy path (proxied to Python backend)
        const uploadResponse = await fetch(uploadEndpoint, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.detail || errorData.error || 'Failed to upload to Cloudinary');
        }

        const uploadResult = await uploadResponse.json();

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        // Use secure_url from Cloudinary (CDN optimized)
        const fileUrl = uploadResult.secure_url;

        // Save to media library
        const mediaResponse = await fetch('/api/media-studio/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            mediaItem: {
              type: isImage ? 'image' : isVideo ? 'video' : 'audio',
              source: 'uploaded',
              url: fileUrl,
              prompt: file.name.replace(/\.[^/.]+$/, ''), // Use filename without extension as prompt
              model: 'cloudinary',
              config: {
                originalFileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                cloudinaryPublicId: uploadResult.public_id,
                cloudinaryFormat: uploadResult.format,
                width: uploadResult.width,
                height: uploadResult.height,
                duration: uploadResult.duration,
              },
            },
          }),
        });

        if (!mediaResponse.ok) {
          throw new Error('Failed to save to library');
        }
      }

      // Refresh the gallery (force refresh after upload)
      await fetchMediaFromDb();

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast.success('Upload complete!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  // Toggle item selection for carousel
  const toggleItemSelection = (item: MediaItem) => {
    const isSelected = selectedItems.some((i: MediaItem) => i.id === item.id);
    if (isSelected) {
      setSelectedItems(selectedItems.filter((i: MediaItem) => i.id !== item.id));
    } else {
      // Max 10 items for carousel
      if (selectedItems.length >= 10) {
        return;
      }
      setSelectedItems([...selectedItems, item]);
    }
  };

  // Check if item is selected
  const isItemSelected = (itemId: string) => selectedItems.some(i => i.id === itemId);

  // Cancel selection mode
  const cancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedItems([]);
  };

  // Open carousel modal to select platform
  const handleCreateCarousel = () => {
    if (selectedItems.length < 2 || !workspaceId) return;

    // Count images and videos
    const imageCount = selectedItems.filter(item => item.type === 'image').length;
    const videoCount = selectedItems.filter(item => item.type === 'video').length;
    const audioCount = selectedItems.filter(item => item.type === 'audio').length;

    // Get URLs for carousel (supports both images and videos)
    const carouselUrls = selectedItems.map(item => item.url);

    // Determine primary type based on first item
    const primaryType = selectedItems[0].type;

    // Open SendToPostModal with carousel data
    setMediaToSend({
      type: primaryType,
      url: carouselUrls[0], // First item as primary
      prompt: `Carousel with ${imageCount > 0 ? `${imageCount} image${imageCount > 1 ? 's' : ''}` : ''}${imageCount > 0 && (videoCount > 0 || audioCount > 0) ? ' and ' : ''}${videoCount > 0 ? `${videoCount} video${videoCount > 1 ? 's' : ''}` : ''}${(imageCount > 0 || videoCount > 0) && audioCount > 0 ? ' and ' : ''}${audioCount > 0 ? `${audioCount} audio${audioCount > 1 ? 's' : ''}` : ''}`,
      additionalUrls: carouselUrls.slice(1), // Rest of items
    });
    setSendModalOpen(true);
  };

  // Handle carousel send config (called from modal)
  const handleCarouselSendConfig = async (config: SendConfig) => {
    if (!workspaceId) return;

    try {
      const { platform, postType, media } = config;
      const postId = crypto.randomUUID();

      // Always send directly to publish
      const postStatus = 'ready_to_publish';

      // Get all carousel URLs
      const carouselUrls = [media.url, ...(media.additionalUrls || [])];

      // Check if carousel contains videos or audio
      const hasVideos = carouselUrls.some(url =>
        url?.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i) ||
        url?.includes('video') ||
        url?.startsWith('data:video/')
      );
      const hasAudio = carouselUrls.some(url =>
        url?.match(/\.(mp3|wav|ogg)(\?|$)/i) ||
        url?.includes('audio') ||
        url?.startsWith('data:audio/')
      );

      // Build platform-specific content for carousel
      const buildCarouselContent = () => {
        const baseContent = {
          type: hasVideos ? 'video' as const : hasAudio ? 'audio' as const : 'image' as const,
          format: 'carousel' as const,
          title: '',
          description: '',
          hashtags: [],
        };

        switch (platform) {
          case 'instagram':
            return { instagram: baseContent };
          case 'facebook':
            return { facebook: baseContent };
          case 'linkedin':
            return { linkedin: baseContent };
          case 'twitter':
            return { twitter: baseContent };
          default:
            return { [platform]: baseContent };
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
            postType: 'carousel',
            content: buildCarouselContent(),
            status: postStatus,
            createdAt: new Date().toISOString(),
            carouselImages: carouselUrls,
            generatedImage: carouselUrls[0],
            isGeneratingImage: false,
            isGeneratingVideo: false,
            videoGenerationStatus: 'none',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create carousel post');
      }

      await refreshData();

      const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
      const mediaCount = carouselUrls.length;
      const mediaType = hasVideos ? 'media items' : hasAudio ? 'audio items' : 'images';

      alert(`Carousel with ${mediaCount} ${mediaType} created for ${platformName}! Go to Publish to edit caption and publish.`);
      cancelSelectMode();
    } catch (error) {
      alert('Failed to create carousel. Please try again.');
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters - only show if hideHeader is false */}
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Media Asserts</h2>
            <p className="text-xs" style={{ color: 'var(--ms-text-secondary)' }}>
              {totalItems} items
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Upload Button */}
            {workspaceId && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="media-upload"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSelectMode}
                  className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {isUploading ? 'Uploading...' : 'Upload'}
                </Button>
              </>
            )}

            {/* Select/Carousel Mode */}
            {workspaceId && totalItems > 1 && (
              isSelectMode ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                    {selectedItems.length} selected
                  </Badge>
                  <Button
                    onClick={handleCreateCarousel}
                    disabled={selectedItems.length < 2}
                    size="sm"
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
                  >
                    <Layers className="w-4 h-4 mr-1" />
                    Carousel Post
                  </Button>
                  <Button
                    onClick={handleCreateCarouselAd}
                    disabled={selectedItems.length < 2}
                    size="sm"
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  >
                    <Megaphone className="w-4 h-4 mr-1" />
                    Carousel Ad
                  </Button>
                  <Button
                    onClick={cancelSelectMode}
                    variant="outline"
                    size="sm"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setIsSelectMode(true)}
                  variant="outline"
                  size="sm"
                >
                  <CheckSquare className="w-4 h-4 mr-1" />
                  Select
                </Button>
              )
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by prompt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px]"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Filter */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {(['all', 'images', 'videos', 'audio', 'favorites'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  className={`px-3 py-1.5 rounded-md text-sm capitalize transition-colors flex items-center gap-1 ${filterType === type ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  onClick={() => setFilterType(type)}
                >
                  {type === 'favorites' && <Heart className="w-3 h-3" />}
                  {type === 'audio' && <Music className="w-3 h-3" />}
                  {type}
                </button>
              ))}
            </div>

            {/* Refresh */}
            {workspaceId && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchMediaFromDb}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}

            {/* View Mode */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty State */}
      {totalItems === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No media yet</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? 'No items match your search'
                : 'Start generating images and videos, or upload your own'
              }
            </p>
            {workspaceId && !searchQuery && (
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Media
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && totalItems > 0 && !isLoading && (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4">
          {allItems.map((item) => {
            const selected = isItemSelected(item.id);
            return (
              <div
                key={item.id}
                className={`
                ms-gallery-item group relative bg-muted rounded-xl overflow-hidden cursor-pointer 
                break-inside-avoid mb-4 inline-block w-full align-top
                transition-all duration-300 ease-out
                hover:shadow-lg hover:-translate-y-1
                ${isSelectMode && selected ? 'ring-2 ring-[var(--ms-primary)] ring-offset-2' : ''}
              `}
                onClick={() => isSelectMode ? toggleItemSelection(item) : setSelectedItem(item)}
              >
                {item.type === 'image' ? (
                  <img
                    src={item.url}
                    alt={item.prompt}
                    className="w-full h-auto object-contain transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                  />
                ) : item.type === 'audio' ? (
                  <div className="w-full aspect-square flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/50 to-pink-900/50 p-4 relative overflow-hidden group-hover:scale-105 transition-transform duration-300">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent" />

                    {/* Replace static placeholder with Waveform */}
                    <div className="w-full h-1/2 flex items-center justify-center">
                      <AudioWaveform isPlaying={false} barCount={20} className="text-white/50" />
                    </div>

                    {/* Audio Name - First 10 words - Moved to Bottom */}
                    <div className="absolute bottom-3 left-3 right-3 z-10">
                      <p className="text-white/90 text-xs font-medium line-clamp-3 leading-relaxed drop-shadow-md">
                        {item.prompt ? (
                          <>
                            {item.prompt.split(' ').slice(0, 10).join(' ')}
                            {item.prompt.split(' ').length > 10 ? '...' : ''}
                          </>
                        ) : 'Untitled Audio'}
                      </p>
                    </div>
                    {/* Add play icon overlay on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px] z-20">
                      <div className="bg-white/20 p-3 rounded-full backdrop-blur-md border border-white/30 text-white hover:scale-110 transition-transform">
                        <Music className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <video
                    src={item.url}
                    className="w-full h-auto min-h-[220px] max-h-[440px] object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    muted
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => {
                      const video = e.target as HTMLVideoElement;
                      if (video.readyState >= 2 && video.src) {
                        video.play().catch(() => { });
                      }
                    }}
                    onMouseLeave={(e) => {
                      const target = e.target as HTMLVideoElement;
                      target.pause();
                      target.currentTime = 0;
                    }}
                  />
                )}

                {/* Selection Checkbox (Select Mode) */}
                {isSelectMode && (
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <div className={`
                    w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                    ${selected
                        ? 'bg-[var(--ms-primary)] border-[var(--ms-primary)] text-white scale-110'
                        : 'bg-white/90 border-[var(--ms-border)] hover:border-[var(--ms-primary)] backdrop-blur-sm'
                      }
                  `}>
                      {selected && <Check className="w-4 h-4" />}
                    </div>
                    {selected && (
                      <div
                        className="absolute -bottom-6 left-0 text-white text-[11px] px-2 py-0.5 rounded-md font-medium"
                        style={{ background: 'var(--ms-primary)' }}
                      >
                        {selectedItems.findIndex(i => i.id === item.id) + 1}
                      </div>
                    )}
                  </div>
                )}

                {/* Smooth Hover Overlay with Staggered Actions */}
                {!isSelectMode && (
                  <div className="ms-gallery-overlay absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col items-center justify-end p-3.5">
                    <div className="ms-gallery-actions flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-9 w-9 p-0 rounded-lg bg-gray-700/90 hover:bg-gray-600 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                        onClick={(e) => { e.stopPropagation(); handleDownload(item.url, item.type); }}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-9 w-9 p-0 rounded-lg bg-gray-700/90 hover:bg-gray-600 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                        onClick={(e) => { e.stopPropagation(); copyPrompt(item.prompt); }}
                      >
                        {copied ? <Check className="w-4 h-4 text-[var(--ms-success)]" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      {workspaceId && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 w-9 p-0 rounded-lg bg-gray-700/90 hover:bg-gray-600 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(item); }}
                          >
                            <Heart className={`w-3.5 h-3.5 transition-colors ${item.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 w-8 p-0 rounded-lg bg-gray-700/90 hover:bg-gray-600 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                            onClick={(e) => { e.stopPropagation(); handleSendToPost(item); }}
                            title="Send to Publish"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                            onClick={(e) => { e.stopPropagation(); createDesignFromAsset(item); }}
                            title="Edit in Canva"
                            disabled={creatingDesignFrom === item.id}
                          >
                            {creatingDesignFrom === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Palette className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                            onClick={(e) => { e.stopPropagation(); handleSendToAd(item); }}
                            title="Create Ad"
                          >
                            <Megaphone className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Type Badge */}
                <Badge
                  className={`
                  absolute ${isSelectMode ? 'bottom-2 left-2' : 'top-2 left-2'} 
                  bg-black/60 text-white border-0 backdrop-blur-sm
                  transition-all duration-200 group-hover:bg-black/80
                `}
                >
                  {item.type === 'image' ? <ImageIcon className="w-3 h-3 mr-1" /> : item.type === 'audio' ? <Music className="w-3 h-3 mr-1" /> : <Video className="w-3 h-3 mr-1" />}
                  {item.type}
                </Badge>

                {/* Favorite Indicator */}
                {item.is_favorite && !isSelectMode && (
                  <div className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg backdrop-blur-sm">
                    <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && totalItems > 0 && !isLoading && (
        <div className="space-y-2">
          {allItems.map((item) => (
            <Card key={item.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedItem(item)}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded-md overflow-hidden flex-shrink-0">
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.prompt} className="w-full h-full object-cover" />
                  ) : (item as any).type === 'audio' ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/10 to-pink-500/10">
                      <Music className="w-6 h-6 text-purple-500" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{item.prompt}</p>
                    {item.is_favorite && <Heart className="w-3 h-3 fill-red-500 text-red-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()} • {item.model} • {item.source}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDownload(item.url, item.type); }}>
                    <Download className="w-4 h-4" />
                  </Button>
                  {workspaceId && (
                    <>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleToggleFavorite(item); }}>
                        <Heart className={`w-4 h-4 ${item.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleSendToPost(item); }} title="Send to Publish">
                        <Send className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); createDesignFromAsset(item); }} title="Edit in Canva" className="text-purple-600 hover:text-purple-700" disabled={creatingDesignFrom === item.id}>
                        {creatingDesignFrom === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleSendToAd(item); }} title="Create Ad" className="text-blue-600 hover:text-blue-700">
                        <Megaphone className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(item); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && 'url' in selectedItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Media Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {selectedItem.url && (
                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                  {('type' in selectedItem && (selectedItem as MediaItem).type === 'image') ? (
                    <img src={selectedItem.url} alt={selectedItem.prompt} className="w-full h-full object-contain" />
                  ) : ('type' in selectedItem && (selectedItem as MediaItem).type === 'audio') ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 p-8 relative">
                      <div className="w-full max-w-md h-32 mb-8">
                        <AudioWaveform isPlaying={true} barCount={60} />
                      </div>
                      <audio src={selectedItem.url} controls className="w-full max-w-md z-10" autoPlay />
                    </div>
                  ) : (
                    <video src={selectedItem.url} controls className="w-full h-full" />
                  )}
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Prompt</label>
                <p className="text-sm text-muted-foreground mt-1">{selectedItem.prompt}</p>
              </div>
              {'model' in selectedItem && (
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Model:</span> {selectedItem.model}
                  </div>
                  {'source' in selectedItem && (
                    <div>
                      <span className="text-muted-foreground">Source:</span> {selectedItem.source}
                    </div>
                  )}
                  {'created_at' in selectedItem && (
                    <div>
                      <span className="text-muted-foreground">Created:</span> {new Date(selectedItem.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => copyPrompt(selectedItem.prompt)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Prompt
                </Button>
                {selectedItem.url && (
                  <Button variant="outline" onClick={() => handleDownload(selectedItem.url!, 'type' in selectedItem ? (selectedItem as MediaItem).type : ('status' in selectedItem ? 'video' : 'image'))}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                )}
                {workspaceId && 'is_favorite' in selectedItem && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleToggleFavorite(selectedItem as MediaItem)}
                    >
                      <Heart className={`w-4 h-4 mr-2 ${selectedItem.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
                      {selectedItem.is_favorite ? 'Unfavorite' : 'Favorite'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSendToPost(selectedItem as MediaItem)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send to Post
                    </Button>
                    <Button
                      variant="outline"
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0"
                      onClick={() => createDesignFromAsset(selectedItem as MediaItem)}
                      disabled={creatingDesignFrom === (selectedItem as MediaItem).id}
                    >
                      {creatingDesignFrom === (selectedItem as MediaItem).id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Palette className="w-4 h-4 mr-2" />
                      )}
                      Edit in Canva
                    </Button>
                    <Button
                      variant="outline"
                      className="text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300"
                      onClick={() => handleSendToAd(selectedItem as MediaItem)}
                    >
                      <Megaphone className="w-4 h-4 mr-2" />
                      Create Ad
                    </Button>
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(selectedItem as MediaItem)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send to Post Modal */}
      <SendToPostModal
        isOpen={sendModalOpen}
        onClose={() => {
          setSendModalOpen(false);
          // If in select mode and modal closes, keep selection
        }}
        media={mediaToSend}
        onSend={async (config) => {
          // Check if this is a carousel (has additionalUrls)
          if (mediaToSend?.additionalUrls && mediaToSend.additionalUrls.length > 0) {
            await handleCarouselSendConfig(config);
          } else {
            await handleSendConfig(config);
          }
        }}
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
