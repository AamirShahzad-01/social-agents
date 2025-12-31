"""
Meta Ads Service
Production Meta Business SDK wrapper for campaign, ad set, and ad management.

Uses official Meta Business SDK (facebook_business v24.0+) for all operations.

Handles:
- Campaign CRUD operations
- Ad Set CRUD operations  
- Ad CRUD with creative uploads
- Audience fetching
- Business portfolio management
- Insights/Analytics
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from ..config import settings
from .meta_sdk_client import create_meta_sdk_client, MetaSDKError

logger = logging.getLogger(__name__)

# Meta API Configuration
META_API_VERSION = "v24.0"

# Objective mapping from legacy to OUTCOME-based (API v24.0+)
OBJECTIVE_MAPPING: Dict[str, str] = {
    "LINK_CLICKS": "OUTCOME_TRAFFIC",
    "TRAFFIC": "OUTCOME_TRAFFIC",
    "CONVERSIONS": "OUTCOME_SALES",
    "SALES": "OUTCOME_SALES",
    "LEAD_GENERATION": "OUTCOME_LEADS",
    "LEADS": "OUTCOME_LEADS",
    "BRAND_AWARENESS": "OUTCOME_AWARENESS",
    "AWARENESS": "OUTCOME_AWARENESS",
    "REACH": "OUTCOME_AWARENESS",
    "POST_ENGAGEMENT": "OUTCOME_ENGAGEMENT",
    "ENGAGEMENT": "OUTCOME_ENGAGEMENT",
    "VIDEO_VIEWS": "OUTCOME_ENGAGEMENT",
    "PAGE_LIKES": "OUTCOME_ENGAGEMENT",
    "APP_INSTALLS": "OUTCOME_APP_PROMOTION",
    "APP_PROMOTION": "OUTCOME_APP_PROMOTION",
    "MESSAGES": "OUTCOME_ENGAGEMENT",
    # New objectives pass through
    "OUTCOME_TRAFFIC": "OUTCOME_TRAFFIC",
    "OUTCOME_SALES": "OUTCOME_SALES",
    "OUTCOME_LEADS": "OUTCOME_LEADS",
    "OUTCOME_AWARENESS": "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT": "OUTCOME_ENGAGEMENT",
    "OUTCOME_APP_PROMOTION": "OUTCOME_APP_PROMOTION",
}

# Valid optimization goals per objective - v24.0 ODAX
OBJECTIVE_VALID_GOALS: Dict[str, List[str]] = {
    "OUTCOME_AWARENESS": ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT"],
    "OUTCOME_TRAFFIC": ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS"],
    "OUTCOME_ENGAGEMENT": ["POST_ENGAGEMENT", "THRUPLAY", "VIDEO_VIEWS", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", "LINK_CLICKS", "PAGE_LIKES", "EVENT_RESPONSES", "CONVERSATIONS"],
    "OUTCOME_LEADS": ["LEAD_GENERATION", "QUALITY_LEAD", "CONVERSATIONS", "LINK_CLICKS", "OFFSITE_CONVERSIONS", "ONSITE_CONVERSIONS"],
    "OUTCOME_SALES": ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "OFFSITE_CONVERSIONS", "ONSITE_CONVERSIONS", "VALUE"],
    "OUTCOME_APP_PROMOTION": ["APP_INSTALLS", "APP_INSTALLS_AND_OFFSITE_CONVERSIONS", "LINK_CLICKS", "REACH"],
}

# Optimization goal to billing event mapping
OPTIMIZATION_TO_BILLING: Dict[str, str] = {
    "REACH": "IMPRESSIONS",
    "IMPRESSIONS": "IMPRESSIONS",
    "LINK_CLICKS": "IMPRESSIONS",
    "LANDING_PAGE_VIEWS": "IMPRESSIONS",
    "POST_ENGAGEMENT": "IMPRESSIONS",
    "VIDEO_VIEWS": "IMPRESSIONS",
    "THRUPLAY": "IMPRESSIONS",
    "LEAD_GENERATION": "IMPRESSIONS",
    "OFFSITE_CONVERSIONS": "IMPRESSIONS",
    "APP_INSTALLS": "IMPRESSIONS",
    "CONVERSATIONS": "IMPRESSIONS",
    "QUALITY_CALL": "IMPRESSIONS",
    "QUALITY_LEAD": "IMPRESSIONS",
    "VALUE": "IMPRESSIONS",
}


class MetaAdsService:
    """
    Production Meta Ads API service using official SDK
    
    Provides methods for:
    - Campaign management
    - Ad Set management
    - Ad creation with media uploads
    - Audience fetching
    - Business portfolio operations
    - Performance insights
    """
    
    def __init__(self):
        self.app_id = settings.FACEBOOK_APP_ID
        self.app_secret = settings.FACEBOOK_APP_SECRET
    
    def _get_sdk_client(self, access_token: str):
        """Get SDK client initialized with access token"""
        return create_meta_sdk_client(access_token)
    
    def _normalize_objective(self, objective: str) -> str:
        """Normalize objective to v24.0 OUTCOME-based format"""
        return OBJECTIVE_MAPPING.get(objective.upper(), objective)
    
    # ========================================================================
    # CAMPAIGN OPERATIONS - Using SDK
    # ========================================================================
    
    async def fetch_campaigns(
        self, 
        account_id: str, 
        access_token: str
    ) -> Dict[str, Any]:
        """
        Fetch all campaigns for an ad account using SDK
        """
        try:
            client = self._get_sdk_client(access_token)
            campaigns = await client.get_campaigns(account_id)
            
            return {
                "data": campaigns,
                "error": None
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error fetching campaigns: {e.message}")
            return {"data": None, "error": e.message}
        except Exception as e:
            logger.error(f"Error fetching campaigns: {e}")
            return {"data": None, "error": str(e)}
    
    async def create_campaign(
        self,
        account_id: str,
        access_token: str,
        name: str,
        objective: str = "OUTCOME_TRAFFIC",
        status: str = "PAUSED",
        special_ad_categories: Optional[List[str]] = None,
        budget_type: Optional[str] = None,
        budget_amount: Optional[float] = None,
        bid_strategy: Optional[str] = None,
        is_cbo: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new campaign using SDK
        """
        try:
            # Normalize objective to v24.0 format
            normalized_objective = self._normalize_objective(objective)
            
            # Determine budget
            daily_budget = None
            lifetime_budget = None
            if budget_amount and is_cbo:
                if budget_type == "LIFETIME":
                    lifetime_budget = int(budget_amount * 100)  # Convert to cents
                else:
                    daily_budget = int(budget_amount * 100)
            
            client = self._get_sdk_client(access_token)
            result = await client.create_campaign(
                ad_account_id=account_id,
                name=name,
                objective=normalized_objective,
                status=status,
                special_ad_categories=special_ad_categories or [],
                daily_budget=daily_budget,
                lifetime_budget=lifetime_budget,
                bid_strategy=bid_strategy
            )
            
            return {
                "data": {"id": result.get("campaign_id") or result.get("id")},
                "error": None
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error creating campaign: {e.message}")
            return {"data": None, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating campaign: {e}")
            return {"data": None, "error": str(e)}
    
    async def update_campaign(
        self,
        campaign_id: str,
        access_token: str,
        **updates
    ) -> Dict[str, Any]:
        """Update a campaign using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.update_campaign(
                campaign_id=campaign_id,
                name=updates.get("name"),
                status=updates.get("status"),
                daily_budget=int(updates["daily_budget"] * 100) if updates.get("daily_budget") else None,
                lifetime_budget=int(updates["lifetime_budget"] * 100) if updates.get("lifetime_budget") else None
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def delete_campaign(
        self,
        campaign_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Delete a campaign using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.delete_campaign(campaign_id)
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def get_campaign_details(
        self,
        campaign_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Get campaign details using SDK"""
        try:
            from facebook_business.adobjects.campaign import Campaign
            client = self._get_sdk_client(access_token)
            
            # Use SDK to get campaign
            campaign = Campaign(fbid=campaign_id)
            campaign = await client._api.call_async('GET', f'/{campaign_id}', params={
                'fields': 'id,name,objective,status,daily_budget,lifetime_budget,special_ad_categories'
            })
            
            return {"data": dict(campaign), "error": None}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # AD SET OPERATIONS - Using SDK
    # ========================================================================
    
    async def fetch_adsets(
        self,
        account_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch all ad sets for an ad account using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            adsets = await client.get_adsets(account_id)
            
            return {"data": adsets, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def create_adset(
        self,
        account_id: str,
        access_token: str,
        campaign_id: str,
        name: str,
        optimization_goal: str = "LINK_CLICKS",
        billing_event: str = "IMPRESSIONS",
        budget_type: str = "DAILY",
        budget_amount: float = 10.0,
        targeting: Optional[Dict[str, Any]] = None,
        status: str = "PAUSED",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        bid_amount: Optional[float] = None,
        destination_type: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Create a new ad set using SDK"""
        try:
            # Determine budget
            daily_budget = None
            lifetime_budget = None
            if budget_type == "LIFETIME":
                lifetime_budget = int(budget_amount * 100)
            else:
                daily_budget = int(budget_amount * 100)
            
            # Default targeting if not provided
            if not targeting:
                targeting = {
                    "geo_locations": {"countries": ["US"]},
                    "age_min": 18,
                    "age_max": 65
                }
            
            # Get billing event from optimization goal
            billing = OPTIMIZATION_TO_BILLING.get(optimization_goal, billing_event)
            
            client = self._get_sdk_client(access_token)
            result = await client.create_adset(
                ad_account_id=account_id,
                name=name,
                campaign_id=campaign_id,
                optimization_goal=optimization_goal,
                billing_event=billing,
                targeting=targeting,
                status=status,
                daily_budget=daily_budget,
                lifetime_budget=lifetime_budget,
                start_time=start_time,
                end_time=end_time,
                bid_amount=int(bid_amount * 100) if bid_amount else None
            )
            
            return {
                "data": {"id": result.get("adset_id") or result.get("id")},
                "error": None
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error creating adset: {e.message}")
            return {"data": None, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating adset: {e}")
            return {"data": None, "error": str(e)}
    
    async def update_adset(
        self,
        adset_id: str,
        access_token: str,
        **updates
    ) -> Dict[str, Any]:
        """Update an ad set using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.update_adset(
                adset_id=adset_id,
                name=updates.get("name"),
                status=updates.get("status"),
                daily_budget=int(updates["daily_budget"] * 100) if updates.get("daily_budget") else None,
                lifetime_budget=int(updates["lifetime_budget"] * 100) if updates.get("lifetime_budget") else None,
                targeting=updates.get("targeting")
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # AD OPERATIONS - Using SDK
    # ========================================================================
    
    async def fetch_ads(
        self,
        account_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch all ads for an ad account using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            ads = await client.get_ads(account_id)
            
            return {"data": ads, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def create_ad_creative(
        self,
        account_id: str,
        access_token: str,
        page_id: str,
        name: str,
        image_hash: Optional[str] = None,
        video_id: Optional[str] = None,
        title: Optional[str] = None,
        body: Optional[str] = None,
        link_url: Optional[str] = None,
        call_to_action_type: str = "LEARN_MORE"
    ) -> Dict[str, Any]:
        """Create an ad creative using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.create_ad_creative(
                ad_account_id=account_id,
                name=name,
                page_id=page_id,
                image_hash=image_hash,
                video_id=video_id,
                message=body,
                link=link_url,
                call_to_action_type=call_to_action_type
            )
            
            return {
                "data": {"id": result.get("creative_id") or result.get("id")},
                "error": None
            }
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def create_ad(
        self,
        account_id: str,
        access_token: str,
        name: str,
        adset_id: str,
        creative_id: str,
        status: str = "PAUSED"
    ) -> Dict[str, Any]:
        """Create a new ad using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.create_ad(
                ad_account_id=account_id,
                name=name,
                adset_id=adset_id,
                creative_id=creative_id,
                status=status
            )
            
            return {
                "data": {"id": result.get("ad_id") or result.get("id")},
                "error": None
            }
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def update_ad(
        self,
        ad_id: str,
        access_token: str,
        **updates
    ) -> Dict[str, Any]:
        """Update an ad using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.update_ad(
                ad_id=ad_id,
                name=updates.get("name"),
                status=updates.get("status")
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def delete_ad(
        self,
        ad_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Delete an ad using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.delete_ad(ad_id)
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # AUDIENCE OPERATIONS - Using SDK
    # ========================================================================
    
    async def fetch_audiences(
        self,
        account_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch custom audiences for an ad account using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            audiences = await client.get_custom_audiences(account_id)
            
            return {"data": audiences, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # INSIGHTS / ANALYTICS - Using SDK
    # ========================================================================
    
    async def fetch_insights(
        self,
        account_id: str,
        access_token: str,
        level: str = "account",
        date_preset: str = "last_7d",
        fields: Optional[List[str]] = None,
        breakdowns: Optional[List[str]] = None,
        filtering: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """Fetch insights/analytics using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            
            default_fields = [
                'impressions', 'reach', 'clicks', 'spend',
                'cpc', 'cpm', 'ctr', 'actions', 'conversions'
            ]
            
            result = await client.get_account_insights(
                ad_account_id=account_id,
                date_preset=date_preset,
                fields=fields or default_fields
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def fetch_campaign_insights(
        self,
        campaign_id: str,
        access_token: str,
        date_preset: str = "last_7d"
    ) -> Dict[str, Any]:
        """Fetch insights for a specific campaign"""
        try:
            from facebook_business.adobjects.campaign import Campaign
            
            client = self._get_sdk_client(access_token)
            campaign = Campaign(fbid=campaign_id)
            
            # Get insights using SDK
            insights = campaign.get_insights(
                fields=['impressions', 'reach', 'clicks', 'spend', 'cpc', 'cpm', 'ctr'],
                params={'date_preset': date_preset}
            )
            
            return {"data": list(insights) if insights else [], "error": None}
            
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # BUSINESS PORTFOLIO OPERATIONS - Using SDK
    # ========================================================================
    
    async def fetch_user_businesses(
        self,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch user's business portfolios using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            businesses = await client.get_businesses()
            
            # Return backwards-compatible format
            return {"businesses": businesses, "error": None}
            
        except MetaSDKError as e:
            return {"businesses": [], "error": e.message}
        except Exception as e:
            return {"businesses": [], "error": str(e)}

    
    async def fetch_business_ad_accounts(
        self,
        business_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch ad accounts owned by a business using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            accounts = await client.get_business_ad_accounts(business_id)
            
            # Return backwards-compatible format
            return {"adAccounts": accounts, "error": None}
            
        except MetaSDKError as e:
            return {"adAccounts": [], "error": e.message}
        except Exception as e:
            return {"adAccounts": [], "error": str(e)}
    
    async def get_ad_account_info(
        self,
        account_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Get ad account details using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            accounts = await client.get_ad_accounts()
            
            # Find the specific account
            normalized_id = account_id.replace('act_', '')
            for acc in accounts:
                if acc.get('account_id') == normalized_id or acc.get('id') == f'act_{normalized_id}':
                    return {"data": acc, "error": None}
            
            return {"data": None, "error": "Account not found"}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def fetch_pages(
        self,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch user's Facebook Pages using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            pages = await client.get_user_pages()
            
            return {"data": pages, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # IMAGE UPLOAD - For ad creatives
    # ========================================================================
    
    async def upload_ad_image(
        self,
        account_id: str,
        access_token: str,
        image_url: str,
        name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload image to Meta Ad Library from URL
        Returns image hash for use in creatives
        
        Note: Direct upload using httpx as SDK requires local file
        """
        import httpx
        import hmac
        import hashlib
        
        try:
            # Download image
            async with httpx.AsyncClient() as client:
                img_response = await client.get(image_url)
                img_response.raise_for_status()
                image_data = img_response.content
            
            # Generate app secret proof
            app_secret_proof = hmac.new(
                self.app_secret.encode('utf-8'),
                access_token.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            # Normalize account ID
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            # Upload to Meta
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f'https://graph.facebook.com/v24.0/{account_id}/adimages',
                    data={
                        'access_token': access_token,
                        'appsecret_proof': app_secret_proof
                    },
                    files={
                        'filename': (name or 'image.jpg', image_data, 'image/jpeg')
                    }
                )
                
                if response.is_success:
                    data = response.json()
                    images = data.get('images', {})
                    if images:
                        first_key = list(images.keys())[0]
                        return {
                            "data": {"hash": images[first_key].get('hash')},
                            "error": None
                        }
                
                error_data = response.json() if response.content else {}
                return {"data": None, "error": error_data.get("error", {}).get("message", "Upload failed")}
            
        except Exception as e:
            logger.error(f"Error uploading ad image: {e}")
            return {"data": None, "error": str(e)}


# Singleton instance
_meta_ads_service: Optional[MetaAdsService] = None


def get_meta_ads_service() -> MetaAdsService:
    """Get or create MetaAdsService singleton"""
    global _meta_ads_service
    if _meta_ads_service is None:
        _meta_ads_service = MetaAdsService()
    return _meta_ads_service
