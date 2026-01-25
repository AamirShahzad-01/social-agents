"""
Meta Ads Services Module
Consolidates all Meta Ads and SDK-related service classes.

NOTE: Facebook Pages, Instagram, and Comments services have moved to:
    from src.services.platforms import PagesService, IGService, CommentsService

Usage:
    from src.services.meta_ads import get_meta_ads_service
    from src.services.meta_ads import create_meta_sdk_client
"""

# Core services
from .meta_ads_service import get_meta_ads_service, MetaAdsService
from .meta_sdk_client import create_meta_sdk_client, get_meta_sdk_client, MetaSDKClient

# SDK Feature services (Ads/Marketing related)
from .sdk_ad_library import AdLibraryService
from .sdk_ad_preview import AdPreviewService
from .sdk_async_reports import AsyncReportsService
from .sdk_business_assets import BusinessAssetsService
from .sdk_custom_conversions import CustomConversionsService
from .sdk_custom_audiences import CustomAudiencesService
from .sdk_lead_forms import LeadFormsService
from .sdk_offline_conversions import OfflineConversionsService
from .sdk_pixels import PixelsService
from .sdk_reach_estimation import ReachEstimationService
from .sdk_saved_audiences import SavedAudiencesService
from .sdk_targeting import TargetingService
from .sdk_videos import VideosService

# Ads analytics and management
from .sdk_insights import InsightsService
from .sdk_catalogs import CatalogsService
from .sdk_automation_rules import AutomationRulesService
from .sdk_ab_tests import ABTestsService
from .sdk_settings import SettingsService

__all__ = [
    # Core
    "get_meta_ads_service",
    "MetaAdsService",
    "create_meta_sdk_client",
    "get_meta_sdk_client",
    "MetaSDKClient",
    # SDK Features (Ads)
    "AdLibraryService",
    "AdPreviewService",
    "AsyncReportsService",
    "BusinessAssetsService",
    "CustomConversionsService",
    "CustomAudiencesService",
    "LeadFormsService",
    "OfflineConversionsService",
    "PixelsService",
    "ReachEstimationService",
    "SavedAudiencesService",
    "TargetingService",
    "VideosService",
    # Ads analytics & settings
    "InsightsService",
    "CatalogsService",
    "AutomationRulesService",
    "ABTestsService",
    "SettingsService",
]

