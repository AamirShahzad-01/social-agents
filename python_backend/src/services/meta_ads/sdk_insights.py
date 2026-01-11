"""
SDK Insights Service
Meta Business SDK - Analytics/Reporting

Uses:
- facebook_business.adobjects.adaccount
- facebook_business.adobjects.campaign
- facebook_business.adobjects.adset
- facebook_business.adobjects.ad
- Get insights, breakdowns, and reports for campaigns
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List

from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.exceptions import FacebookRequestError

from ...config import settings

logger = logging.getLogger(__name__)

# API Version
META_API_VERSION = "v24.0"

# Default insights fields
DEFAULT_INSIGHTS_FIELDS = [
    'impressions', 'reach', 'frequency', 'spend',
    'clicks', 'cpc', 'cpm', 'ctr',
    'actions', 'cost_per_action_type', 'conversions',
    'conversion_values', 'purchase_roas'
]

# Video metrics
VIDEO_INSIGHTS_FIELDS = [
    'video_avg_time_watched_actions',
    'video_p25_watched_actions',
    'video_p50_watched_actions',
    'video_p75_watched_actions',
    'video_p100_watched_actions'
]

# Available breakdowns (v24.0 2026)
AVAILABLE_BREAKDOWNS = [
    'age',                  # Age ranges (18-24, 25-34, etc.)
    'gender',               # Male, Female, Unknown
    'country',              # By country
    'region',               # By region/state
    'publisher_platform',   # Facebook, Instagram, Audience Network
    'platform_position',    # Feed, Stories, Reels, etc.
    'device_platform',      # Mobile, Desktop
    'impression_device'     # Device type
]


class InsightsService:
    """Service for Meta Ads insights and analytics using SDK."""
    
    def __init__(self, access_token: str):
        """
        Initialize Insights Service.
        
        Args:
            access_token: User access token with ads_read permission
        """
        self.access_token = access_token
    
    def _init_api(self):
        """Initialize the SDK API"""
        from facebook_business.api import FacebookAdsApi
        FacebookAdsApi.init(
            app_id=settings.FACEBOOK_APP_ID,
            app_secret=settings.FACEBOOK_APP_SECRET,
            access_token=self.access_token,
            api_version=META_API_VERSION
        )
    
    def _get_account_insights_sync(
        self, 
        ad_account_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get insights for an ad account"""
        try:
            self._init_api()
            
            if not ad_account_id.startswith('act_'):
                ad_account_id = f'act_{ad_account_id}'
            
            default_fields = [
                'impressions', 'reach', 'clicks', 'spend',
                'cpc', 'cpm', 'ctr'
            ]
            
            account = AdAccount(fbid=ad_account_id)
            insights = account.get_insights(
                fields=fields or default_fields,
                params={'date_preset': date_preset}
            )
            
            if insights:
                return {"success": True, "insights": dict(insights[0])}
            return {"success": True, "insights": {}}
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get account insights error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_account_insights(
        self,
        ad_account_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get performance insights for an Ad Account.
        
        Args:
            ad_account_id: Ad Account ID
            date_preset: last_7d, last_14d, last_28d, last_30d, last_90d, etc.
            fields: Specific metrics to fetch
            
        Returns:
            Dict with impressions, reach, clicks, spend, cpc, cpm, ctr
        """
        return await asyncio.to_thread(
            self._get_account_insights_sync,
            ad_account_id,
            date_preset,
            fields
        )
    
    def _get_insights_breakdown_sync(
        self, 
        ad_account_id: str,
        breakdown: str = 'age',
        date_preset: str = 'last_7d',
        level: str = 'account',
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get insights with breakdown for an ad account.
        
        Breakdowns available (v24.0 2026):
        - age: Age ranges (18-24, 25-34, etc.)
        - gender: Male, Female, Unknown
        - age,gender: Combined age and gender breakdown
        - country: By country
        - region: By region/state
        - publisher_platform: Facebook, Instagram, Audience Network
        - platform_position: Feed, Stories, Reels, etc.
        - device_platform: Mobile, Desktop
        - impression_device: Device type
        """
        try:
            self._init_api()
            
            if not ad_account_id.startswith('act_'):
                ad_account_id = f'act_{ad_account_id}'
            
            default_fields = [
                'impressions', 'reach', 'clicks', 'spend',
                'cpc', 'cpm', 'ctr', 'actions',
                'conversions', 'cost_per_action_type'
            ]
            
            account = AdAccount(fbid=ad_account_id)
            
            params = {
                'date_preset': date_preset,
                'level': level
            }
            
            # Handle combined breakdowns
            if ',' in breakdown:
                params['breakdowns'] = breakdown.split(',')
            else:
                params['breakdowns'] = [breakdown]
            
            insights = account.get_insights(
                fields=fields or default_fields,
                params=params
            )
            
            result = []
            for insight in insights if insights else []:
                insight_dict = dict(insight)
                result.append(insight_dict)
            
            return {"success": True, "insights": result}
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get insights breakdown error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_account_insights_breakdown(
        self,
        ad_account_id: str,
        breakdown: str = 'age',
        date_preset: str = 'last_7d',
        level: str = 'account',
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get performance insights with demographic/placement breakdowns.
        
        Args:
            ad_account_id: Ad Account ID
            breakdown: 'age', 'gender', 'age,gender', 'country', 'publisher_platform', 
                       'platform_position', 'device_platform'
            date_preset: 'last_7d', 'last_30d', 'this_month', etc.
            level: 'account', 'campaign', 'adset', 'ad'
            fields: Specific metrics to fetch
            
        Returns:
            Dict with list of insight dicts, each with breakdown dimensions
        """
        return await asyncio.to_thread(
            self._get_insights_breakdown_sync,
            ad_account_id,
            breakdown,
            date_preset,
            level,
            fields
        )
    
    def _get_campaign_insights_sync(
        self, 
        campaign_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get insights for a specific campaign"""
        try:
            self._init_api()
            
            default_fields = [
                'impressions', 'reach', 'clicks', 'spend',
                'cpc', 'cpm', 'ctr'
            ]
            
            campaign = Campaign(fbid=campaign_id)
            
            params = {'date_preset': date_preset}
            
            if breakdowns:
                params['breakdowns'] = breakdowns
            
            insights = campaign.get_insights(
                fields=fields or default_fields,
                params=params
            )
            
            result = []
            for insight in insights if insights else []:
                result.append(dict(insight))
            
            return {"success": True, "insights": result}
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get campaign insights error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_campaign_insights(
        self,
        campaign_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get campaign-level insights (v24.0 2026).
        
        Args:
            campaign_id: Campaign ID
            date_preset: last_7d, last_14d, last_28d, etc.
            fields: List of fields to retrieve
            breakdowns: age, gender, country, publisher_platform, etc.
            
        Returns:
            Dict with list of insight data
        """
        return await asyncio.to_thread(
            self._get_campaign_insights_sync,
            campaign_id,
            date_preset,
            fields,
            breakdowns
        )
    
    def _get_adset_insights_sync(
        self, 
        adset_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get insights for a specific ad set"""
        try:
            self._init_api()
            
            default_fields = ['impressions', 'reach', 'clicks', 'spend', 'cpc', 'cpm', 'ctr']
            
            adset = AdSet(fbid=adset_id)
            params = {'date_preset': date_preset}
            
            if breakdowns:
                params['breakdowns'] = breakdowns
            
            insights = adset.get_insights(
                fields=fields or default_fields,
                params=params
            )
            
            result = []
            for insight in insights if insights else []:
                result.append(dict(insight))
            
            return {"success": True, "insights": result}
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get adset insights error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_adset_insights(
        self,
        adset_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get ad set-level insights (v24.0 2026).
        
        Args:
            adset_id: Ad Set ID
            date_preset: last_7d, last_14d, last_28d, etc.
            fields: List of fields to retrieve
            breakdowns: age, gender, country, publisher_platform, etc.
            
        Returns:
            Dict with list of insight data
        """
        return await asyncio.to_thread(
            self._get_adset_insights_sync,
            adset_id,
            date_preset,
            fields,
            breakdowns
        )
    
    def _get_ad_insights_sync(
        self, 
        ad_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get insights for a specific ad"""
        try:
            self._init_api()
            
            default_fields = ['impressions', 'reach', 'clicks', 'spend', 'cpc', 'cpm', 'ctr']
            
            ad = Ad(fbid=ad_id)
            params = {'date_preset': date_preset}
            
            if breakdowns:
                params['breakdowns'] = breakdowns
            
            insights = ad.get_insights(
                fields=fields or default_fields,
                params=params
            )
            
            result = []
            for insight in insights if insights else []:
                result.append(dict(insight))
            
            return {"success": True, "insights": result}
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Get ad insights error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_ad_insights(
        self,
        ad_id: str,
        date_preset: str = 'last_7d',
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get ad-level insights (v24.0 2026).
        
        Args:
            ad_id: Ad ID
            date_preset: last_7d, last_14d, last_28d, etc.
            fields: List of fields to retrieve
            breakdowns: age, gender, country, publisher_platform, etc.
            
        Returns:
            Dict with list of insight data
        """
        return await asyncio.to_thread(
            self._get_ad_insights_sync,
            ad_id,
            date_preset,
            fields,
            breakdowns
        )
    
    def _generate_report_sync(
        self,
        account_id: str,
        metrics: List[str],
        breakdowns: Optional[List[str]] = None,
        date_preset: str = "last_7d",
        level: str = "campaign"
    ) -> Dict[str, Any]:
        """Generate a custom report"""
        try:
            self._init_api()
            
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            account = AdAccount(fbid=account_id)
            
            params = {
                'date_preset': date_preset,
                'level': level
            }
            
            if breakdowns:
                params['breakdowns'] = breakdowns
            
            insights = account.get_insights(
                fields=metrics,
                params=params
            )
            
            result = []
            for insight in insights if insights else []:
                result.append(dict(insight))
            
            return {"success": True, "report": result}
            
        except FacebookRequestError as e:
            logger.error(f"Facebook API error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Generate report error: {e}")
            return {"success": False, "error": str(e)}
    
    async def generate_report(
        self,
        account_id: str,
        metrics: List[str],
        breakdowns: Optional[List[str]] = None,
        date_preset: str = "last_7d",
        level: str = "campaign"
    ) -> Dict[str, Any]:
        """
        Generate a custom report.
        
        Args:
            account_id: Ad Account ID
            metrics: List of metrics to include
            breakdowns: Optional list of breakdowns
            date_preset: Date preset for the report
            level: account, campaign, adset, or ad
            
        Returns:
            Dict with report data
        """
        return await asyncio.to_thread(
            self._generate_report_sync,
            account_id,
            metrics,
            breakdowns,
            date_preset,
            level
        )


# Date preset constants
DATE_PRESETS = [
    "today",
    "yesterday",
    "this_month",
    "last_month",
    "this_quarter",
    "maximum",
    "data_maximum",
    "last_3d",
    "last_7d",
    "last_14d",
    "last_28d",
    "last_30d",
    "last_90d",
    "last_week_mon_sun",
    "last_week_sun_sat",
    "last_quarter",
    "last_year",
    "this_week_mon_today",
    "this_week_sun_today",
    "this_year"
]
