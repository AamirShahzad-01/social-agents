"""
Meta Ads Service
Production Meta Business SDK wrapper for campaign, ad set, and ad management.

Uses official Meta Business SDK for v24.0 API operations (2026 standards).
STRICT v24.0 2026 COMPLIANCE - No deprecated patterns (smart_promotion_type, etc.)

Handles:
- Campaign CRUD operations (including Advantage+ campaigns)
- Ad Set CRUD operations  
- Ad CRUD with creative uploads
- Audience fetching
- Business portfolio management
- Insights/Analytics
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from ...config import settings
from .meta_sdk_client import create_meta_sdk_client, MetaSDKError

logger = logging.getLogger(__name__)

# Meta API Configuration - v24.0 (2026 standards)
META_API_VERSION = "v24.0"

# Objective mapping - strictly OUTCOME-based (v24.0 2026 standards)
# Legacy objectives (LINK_CLICKS, TRAFFIC, etc.) are purged for 2026 compliance.
OBJECTIVE_MAPPING: Dict[str, str] = {
    "OUTCOME_TRAFFIC": "OUTCOME_TRAFFIC",
    "OUTCOME_SALES": "OUTCOME_SALES",
    "OUTCOME_LEADS": "OUTCOME_LEADS",
    "OUTCOME_AWARENESS": "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT": "OUTCOME_ENGAGEMENT",
    "OUTCOME_APP_PROMOTION": "OUTCOME_APP_PROMOTION",
}

# Valid optimization goals per objective - v24.0 2026 ODAX
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
        """Normalize objective to v24.0 2026 OUTCOME-based format"""
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
    

    


    async def update_campaign(
        self,
        campaign_id: str,
        access_token: str,
        **updates
    ) -> Dict[str, Any]:
        """
        Update a campaign using SDK.
        
        Note: Budgets should be provided in cents. If provided as dollars, they will be converted.
        """
        try:
            client = self._get_sdk_client(access_token)
            
            # Convert budget to cents if provided (assuming values < 10000 are in dollars)
            daily_budget = updates.get("daily_budget")
            lifetime_budget = updates.get("lifetime_budget")
            
            if daily_budget:
                # If budget is less than 10000, assume it's in dollars and convert
                daily_budget = int(daily_budget * 100) if daily_budget < 10000 else int(daily_budget)
            
            if lifetime_budget:
                # If budget is less than 10000, assume it's in dollars and convert
                lifetime_budget = int(lifetime_budget * 100) if lifetime_budget < 10000 else int(lifetime_budget)
            
            result = await client.update_campaign(
                campaign_id=campaign_id,
                name=updates.get("name"),
                status=updates.get("status"),
                daily_budget=daily_budget,
                lifetime_budget=lifetime_budget
            )
            
            return {"success": True, "data": result, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}
    
    async def delete_campaign(
        self,
        campaign_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Delete a campaign using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.delete_campaign(campaign_id)
            return {"success": True, "data": result, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}
    
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
        optimization_goal: str,
        billing_event: str = "IMPRESSIONS",
        targeting: Dict[str, Any] = None,
        status: str = "PAUSED",
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        bid_amount: Optional[float] = None,
        # v24.0 2026 default: Enable Advantage+ Audience
        advantage_audience: bool = True,
        # v24.0 2026 Required Parameters (2026 standards)
        is_adset_budget_sharing_enabled: Optional[bool] = None,
        placement_soft_opt_out: Optional[bool] = None,
        promoted_object: Optional[Dict[str, Any]] = None,
        destination_type: Optional[str] = None,
        attribution_spec: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Create a new ad set using SDK - v24.0 2026 Compliant.
        
        v24.0 2026 COMPLIANCE (2026 standards):
        - advantage_audience defaults to True per Meta API v24.0 2026
        - is_adset_budget_sharing_enabled: Share up to 20% budget between ad sets
        - placement_soft_opt_out: Allow 5% spend on excluded placements (Sales/Leads only)
        - targeting_automation.advantage_audience = 1 for Advantage+ Audience
        - Detailed targeting becomes advisory (signals) when Advantage+ Audience enabled
        - attribution_spec: Updated windows per Jan 12, 2026 - view-through limited to 1 day only
        """
        try:
            # Adjust attribution_spec based on optimization_goal (v24.0 2026)
            # Some optimization goals have restricted attribution window combinations
            if attribution_spec:
                # Optimization goals that only support (1, 0) - click-through: 1 day, view-through: 0 (disabled)
                RESTRICTED_ATTRIBUTION_GOALS = ["LANDING_PAGE_VIEWS"]
                
                if optimization_goal in RESTRICTED_ATTRIBUTION_GOALS:
                    # For restricted goals, only allow click-through: 1 day, no view-through
                    attribution_spec = [
                        {"event_type": "CLICK_THROUGH", "window_days": 1}
                    ]
                    logger.info(f"Attribution spec adjusted for {optimization_goal}: only click-through 1-day allowed")
                else:
                    # Validate attribution_spec for 2026 standards (view-through limited to 1 day)
                    for spec in attribution_spec:
                        if spec.get("event_type") == "VIEW_THROUGH" and spec.get("window_days", 0) > 1:
                            raise ValueError(
                                "View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). "
                                "7-day and 28-day view windows are deprecated."
                            )
            
            # Convert budgets to cents
            if daily_budget is not None:
                daily_budget = int(daily_budget) if isinstance(daily_budget, (int, float)) else daily_budget
            if lifetime_budget is not None:
                lifetime_budget = int(lifetime_budget) if isinstance(lifetime_budget, (int, float)) else lifetime_budget
            
            # Default targeting if not provided
            if not targeting:
                targeting = {
                    "geo_locations": {"countries": ["US"]},
                    "age_min": 18,
                    "age_max": 65
                }
            
            # v24.0 2026: Inject targeting_automation for Advantage+ Audience
            if advantage_audience:
                targeting["targeting_automation"] = {"advantage_audience": 1}
                logger.info(f"Advantage+ Audience enabled for adset {name}")
            else:
                targeting["targeting_automation"] = {"advantage_audience": 0}
            
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
                # bid_amount from service is in dollars, convert to cents for SDK (v24.0 2026)
                bid_amount=int(bid_amount * 100) if bid_amount else None,
                # v24.0 2026 Required Parameters
                is_adset_budget_sharing_enabled=is_adset_budget_sharing_enabled,
                placement_soft_opt_out=placement_soft_opt_out,
                promoted_object=promoted_object,
                destination_type=destination_type,
                attribution_spec=attribution_spec
            )
            
            return {
                "success": True,
                "adset": {"id": result.get("adset_id") or result.get("id")},
                "advantage_audience_enabled": advantage_audience,
                "is_adset_budget_sharing_enabled": is_adset_budget_sharing_enabled,
                "placement_soft_opt_out": placement_soft_opt_out,
                "attribution_spec": attribution_spec,
                "error": None
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error creating adset: {e.message}")
            return {"success": False, "adset": None, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating adset: {e}")
            return {"success": False, "adset": None, "error": str(e)}
    
    async def update_adset(
        self,
        adset_id: str,
        access_token: str,
        **updates
    ) -> Dict[str, Any]:
        """
        Update an ad set using SDK - v24.0 2026 Compliant.
        
        v24.0 2026 Parameters:
        - is_adset_budget_sharing_enabled: Share up to 20% budget between ad sets
        - placement_soft_opt_out: Allow 5% spend on excluded placements
        - attribution_spec: Updated windows per Jan 12, 2026 - view-through limited to 1 day only
        """
        try:
            # Validate attribution_spec for 2026 standards if provided
            attribution_spec = updates.get("attribution_spec")
            if attribution_spec:
                for spec in attribution_spec:
                    if isinstance(spec, dict):
                        if spec.get("event_type") == "VIEW_THROUGH" and spec.get("window_days", 0) > 1:
                            raise ValueError(
                                "View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). "
                                "7-day and 28-day view windows are deprecated."
                            )
            
            # v24.0 2026: Advantage+ Audience injection
            if updates.get("advantage_audience") is not None:
                targeting = updates.get("targeting") or {}
                if not isinstance(targeting, dict):
                    targeting = {}
                if "targeting_automation" not in targeting:
                    targeting["targeting_automation"] = {}
                if updates["advantage_audience"]:
                    targeting["targeting_automation"]["advantage_audience"] = 1
                else:
                    targeting["targeting_automation"]["advantage_audience"] = 0
                updates["targeting"] = targeting

            client = self._get_sdk_client(access_token)
            
            # Handle budget conversion (already in cents from endpoint)
            daily_budget = updates.get("daily_budget")
            lifetime_budget = updates.get("lifetime_budget")
            
            # v24.0 2026 compliant update with all new parameters
            result = await client.update_adset(
                adset_id=adset_id,
                name=updates.get("name"),
                status=updates.get("status"),
                daily_budget=daily_budget,
                lifetime_budget=lifetime_budget,
                targeting=updates.get("targeting"),
                start_time=updates.get("start_time"),
                end_time=updates.get("end_time"),
                # v24.0 2026 Required Parameters
                is_adset_budget_sharing_enabled=updates.get("is_adset_budget_sharing_enabled"),
                placement_soft_opt_out=updates.get("placement_soft_opt_out"),
                bid_amount=int(updates["bid_amount"] * 100) if updates.get("bid_amount") else None,
                attribution_spec=attribution_spec
            )
            
            return {"success": True, "data": result, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "data": None, "error": e.message}
        except ValueError as e:
            return {"success": False, "data": None, "error": str(e)}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}
    
    async def delete_adset(
        self,
        adset_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Delete an ad set using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.delete_adset(adset_id=adset_id)
            
            return {"success": True, "data": result, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}
    
    async def duplicate_adset(
        self,
        adset_id: str,
        access_token: str,
        new_name: Optional[str] = None,
        campaign_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Duplicate an ad set using Meta's Ad Copies API.
        
        Uses POST /{ad_set_id}/copies endpoint per Meta API docs.
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.duplicate_adset(
                adset_id=adset_id,
                new_name=new_name,
                campaign_id=campaign_id
            )
            
            return {
                "success": True,
                "adset_id": result.get("copied_adset_id") or result.get("id"),
                "data": result,
                "error": None
            }
            
        except MetaSDKError as e:
            return {"success": False, "adset_id": None, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "adset_id": None, "data": None, "error": str(e)}
    
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
        call_to_action_type: str = "LEARN_MORE",
        advantage_plus_creative: bool = True,
        gen_ai_disclosure: bool = False,
        format_automation: bool = False,
        degrees_of_freedom_spec: Optional[Dict[str, Any]] = None,
        ad_disclaimer_spec: Optional[Dict[str, Any]] = None,
        product_set_id: Optional[str] = None,
        # New: Carousel and video thumbnail support
        carousel_child_attachments: Optional[List[Dict[str, Any]]] = None,
        thumbnail_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create an ad creative using SDK - supports image, video, and carousel"""
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
                call_to_action_type=call_to_action_type,
                advantage_plus_creative=advantage_plus_creative,
                gen_ai_disclosure=gen_ai_disclosure,
                format_automation=format_automation,
                degrees_of_freedom_spec=degrees_of_freedom_spec,
                ad_disclaimer_spec=ad_disclaimer_spec,
                product_set_id=product_set_id,
                # New: Pass carousel and video params to SDK
                carousel_child_attachments=carousel_child_attachments,
                thumbnail_url=thumbnail_url,
                title=title
            )
            
            creative_id = result.get("creative_id") or result.get("id")
            return {
                "success": True,
                "creative_id": creative_id,
                "data": {"id": creative_id},
                "error": None
            }
            
        except MetaSDKError as e:
            return {"success": False, "creative_id": None, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "creative_id": None, "data": None, "error": str(e)}
    
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
            
            return {"success": True, "data": result, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}
    
    async def delete_ad(
        self,
        ad_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Delete an ad using SDK"""
        try:
            client = self._get_sdk_client(access_token)
            result = await client.delete_ad(ad_id)
            return {"success": True, "data": result, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}
    
    async def duplicate_ad(
        self,
        ad_id: str,
        access_token: str,
        new_name: Optional[str] = None,
        adset_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Duplicate an ad using Meta's Ad Copies API.
        
        Uses POST /{ad-id}/copies endpoint per Meta API docs.
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.duplicate_ad(
                ad_id=ad_id,
                new_name=new_name,
                adset_id=adset_id
            )
            
            return {
                "success": True,
                "ad_id": result.get("copied_ad_id") or result.get("id"),
                "data": result,
                "error": None
            }
            
        except MetaSDKError as e:
            return {"success": False, "ad_id": None, "data": None, "error": e.message}
        except Exception as e:
            return {"success": False, "ad_id": None, "data": None, "error": str(e)}
    
    # ========================================================================
    # AD PREVIEW OPERATIONS - Using SDK
    # ========================================================================
    
    async def get_ad_preview(
        self,
        ad_id: str,
        access_token: str,
        ad_format: str = "DESKTOP_FEED_STANDARD"
    ) -> Dict[str, Any]:
        """
        Get ad preview for an existing ad.
        
        Uses /{ad-id}/previews endpoint.
        
        Supported formats:
        - DESKTOP_FEED_STANDARD
        - MOBILE_FEED_STANDARD
        - INSTAGRAM_STANDARD
        - INSTAGRAM_STORY
        - FACEBOOK_STORY_MOBILE
        - RIGHT_COLUMN_STANDARD
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.get_ad_preview(
                ad_id=ad_id,
                ad_format=ad_format
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def generate_ad_preview(
        self,
        account_id: str,
        access_token: str,
        creative: Dict[str, Any],
        ad_format: str = "DESKTOP_FEED_STANDARD"
    ) -> Dict[str, Any]:
        """
        Generate a preview for an ad creative without creating an ad.
        
        Uses /{account-id}/generatepreviews endpoint.
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.generate_ad_preview(
                account_id=account_id,
                creative=creative,
                ad_format=ad_format
            )
            
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
    
    async def create_lookalike_audience(
        self,
        account_id: str,
        access_token: str,
        name: str,
        origin_audience_id: str,
        country: str = "US",
        ratio: float = 0.01,
        lookalike_type: str = "similarity"
    ) -> Dict[str, Any]:
        """
        Create a lookalike audience based on a source custom audience.
        
        Per Meta API v24.0 2026 docs:
        - lookalike_spec is MANDATORY (2026 standards)
        - type: 'similarity' (top 1%) or 'custom_ratio' (for value-based)
        - ratio: 0.01 to 0.20 (1% to 20%)
        - Minimum source audience size: 100 people
        
        Args:
            account_id: Ad Account ID
            access_token: User access token
            name: Name for the lookalike audience
            origin_audience_id: ID of source custom audience
            country: Target country code (e.g., 'US', 'GB')
            ratio: Percentage of population (0.01 = 1%)
            lookalike_type: 'similarity' or 'custom_ratio'
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.create_lookalike_audience(
                account_id=account_id,
                name=name,
                source_audience_id=origin_audience_id,
                target_countries=[country],
                ratio=ratio
            )
            
            if result.get("success"):
                return {
                    "success": True,
                    "audience": {
                        "id": result.get("audience_id"),
                        "name": name,
                        "subtype": "LOOKALIKE"
                    }
                }
            else:
                return {"success": False, "error": result.get("error")}
            
        except MetaSDKError as e:
            return {"success": False, "error": e.message}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
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
                account_id=account_id,
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
    
    async def fetch_insights_breakdown(
        self,
        account_id: str,
        access_token: str,
        breakdown: str = "age",
        date_preset: str = "last_7d",
        level: str = "account"
    ) -> Dict[str, Any]:
        """
        Fetch insights with demographic/placement breakdown.
        
        Args:
            account_id: Ad account ID
            access_token: User access token
            breakdown: One of: age, gender, age,gender, country, 
                       publisher_platform, platform_position, device_platform
            date_preset: Time range preset
            level: account, campaign, adset, ad
            
        Returns:
            Dict with breakdowns list and error if any
        """
        try:
            client = self._get_sdk_client(access_token)
            breakdowns = await client.get_insights_breakdown(
                account_id=account_id,
                breakdown=breakdown,
                date_preset=date_preset,
                level=level
            )
            
            return {"breakdowns": breakdowns, "error": None}
            
        except MetaSDKError as e:
            logger.error(f"SDK error fetching insights breakdown: {e.message}")
            return {"breakdowns": [], "error": e.message}
        except Exception as e:
            logger.error(f"Error fetching insights breakdown: {e}")
            return {"breakdowns": [], "error": str(e)}
    
    async def fetch_campaign_insights_breakdown(
        self,
        campaign_id: str,
        access_token: str,
        breakdown: str = "age",
        date_preset: str = "last_7d"
    ) -> Dict[str, Any]:
        """Fetch campaign insights with breakdown"""
        try:
            client = self._get_sdk_client(access_token)
            breakdowns = await client.get_campaign_insights_breakdown(
                campaign_id=campaign_id,
                breakdown=breakdown,
                date_preset=date_preset
            )
            
            return {"breakdowns": breakdowns, "error": None}
            
        except MetaSDKError as e:
            return {"breakdowns": [], "error": e.message}
        except Exception as e:
            return {"breakdowns": [], "error": str(e)}
    
    async def get_insights_breakdown(
        self,
        account_id: str,
        access_token: str,
        breakdown: str = "age",
        level: str = "account",
        date_preset: str = "last_7d",
        campaign_id: Optional[str] = None,
        adset_id: Optional[str] = None,
        ad_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get insights with demographic/placement breakdown.
        Wrapper for fetch_insights_breakdown that handles filtering.
        """
        try:
            client = self._get_sdk_client(access_token)
            
            # Use specific object if provided
            if ad_id:
                result = await client.get_ad_insights_breakdown(
                    ad_id=ad_id, breakdown=breakdown, date_preset=date_preset
                )
            elif adset_id:
                result = await client.get_adset_insights_breakdown(
                    adset_id=adset_id, breakdown=breakdown, date_preset=date_preset
                )
            elif campaign_id:
                result = await client.get_campaign_insights_breakdown(
                    campaign_id=campaign_id, breakdown=breakdown, date_preset=date_preset
                )
            else:
                result = await client.get_account_insights_breakdown(
                    ad_account_id=account_id, breakdown=breakdown, date_preset=date_preset, level=level
                )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def get_insights_time_series(
        self,
        account_id: str,
        access_token: str,
        time_increment: str = "1",
        level: str = "account",
        date_preset: str = "last_30d",
        campaign_id: Optional[str] = None,
        adset_id: Optional[str] = None,
        ad_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get insights with time series data.
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.get_insights_time_series(
                ad_account_id=account_id,
                time_increment=time_increment,
                date_preset=date_preset,
                level=level,
                campaign_id=campaign_id,
                adset_id=adset_id,
                ad_id=ad_id
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    async def get_insights_actions(
        self,
        account_id: str,
        access_token: str,
        level: str = "account",
        date_preset: str = "last_7d",
        campaign_id: Optional[str] = None,
        adset_id: Optional[str] = None,
        ad_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get action breakdown insights (conversions, clicks, video views, etc.)
        """
        try:
            client = self._get_sdk_client(access_token)
            result = await client.get_insights_actions(
                ad_account_id=account_id,
                date_preset=date_preset,
                level=level,
                campaign_id=campaign_id,
                adset_id=adset_id,
                ad_id=ad_id
            )
            
            return {"data": result, "error": None}
            
        except MetaSDKError as e:
            return {"data": None, "error": e.message}
        except Exception as e:
            return {"data": None, "error": str(e)}
    
    # ========================================================================
    # CAMPAIGN OPERATIONS - Bulk & Duplicate
    # ========================================================================
    
    async def duplicate_campaign(
        self,
        campaign_id: str,
        access_token: str,
        new_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Duplicate an existing campaign.
        
        Creates a copy of the campaign with the same settings.
        """
        try:
            # First, get the campaign details
            details = await self.get_campaign_details(campaign_id, access_token)
            if details.get("error"):
                return {"success": False, "error": details["error"]}
            
            campaign_data = details.get("data", {})
            if not campaign_data:
                return {"success": False, "error": "Campaign not found"}
            
            # Create new campaign with same settings
            client = self._get_sdk_client(access_token)
            
            # Get account ID from campaign
            account_id = campaign_data.get("account_id")
            if not account_id:
                return {"success": False, "error": "Could not determine ad account ID"}
            
            # Build new campaign name
            original_name = campaign_data.get("name", "Campaign")
            duplicate_name = new_name or f"{original_name} (Copy)"
            
            # Create new campaign using SDK
            result = await client.create_advantage_plus_campaign(
                ad_account_id=account_id,
                name=duplicate_name,
                objective=campaign_data.get("objective", "OUTCOME_TRAFFIC"),
                status="PAUSED",  # Always start paused for safety
                special_ad_categories=campaign_data.get("special_ad_categories", []),
                daily_budget=campaign_data.get("daily_budget"),
                lifetime_budget=campaign_data.get("lifetime_budget"),
                bid_strategy=campaign_data.get("bid_strategy")
            )
            
            if result.get("id"):
                return {
                    "success": True,
                    "campaign_id": result.get("id"),
                    "data": result,
                    "message": "Campaign duplicated successfully"
                }
            else:
                return {"success": False, "error": "Failed to create duplicate campaign"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def bulk_update_status(
        self,
        access_token: str,
        entity_type: str,  # campaign, adset, ad
        entity_ids: List[str],
        new_status: str
    ) -> Dict[str, Any]:
        """
        Bulk update status for multiple entities.
        
        Args:
            access_token: User access token
            entity_type: campaign, adset, or ad
            entity_ids: List of entity IDs to update
            new_status: ACTIVE or PAUSED
            
        Returns:
            Dict with results for each entity
        """
        try:
            client = self._get_sdk_client(access_token)
            results = []
            
            for entity_id in entity_ids:
                try:
                    if entity_type == "campaign":
                        result = await client.update_campaign(entity_id, status=new_status)
                    elif entity_type == "adset":
                        result = await client.update_adset(entity_id, status=new_status)
                    elif entity_type == "ad":
                        result = await client.update_ad(entity_id, status=new_status)
                    else:
                        result = {"success": False, "error": f"Unknown entity type: {entity_type}"}
                    
                    results.append({"id": entity_id, "success": True})
                except Exception as e:
                    results.append({"id": entity_id, "success": False, "error": str(e)})
            
            return {
                "success": True,
                "results": results,
                "updated": len([r for r in results if r.get("success")]),
                "failed": len([r for r in results if not r.get("success")])
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
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
            
            # Determine content type from URL
            content_type = 'image/png' if '.png' in image_url.lower() else 'image/jpeg'
            extension = '.png' if content_type == 'image/png' else '.jpg'
            file_name = (name or 'image') + extension
            
            # Generate app secret proof
            app_secret_proof = hmac.new(
                self.app_secret.encode('utf-8'),
                access_token.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            # Normalize account ID
            if not account_id.startswith('act_'):
                account_id = f'act_{account_id}'
            
            # Upload to Meta using 'bytes' field per Meta API docs
            async with httpx.AsyncClient(timeout=60.0) as client:
                import base64
                response = await client.post(
                    f'https://graph.facebook.com/v24.0/{account_id}/adimages',
                    data={
                        'access_token': access_token,
                        'appsecret_proof': app_secret_proof,
                        'bytes': base64.b64encode(image_data).decode('utf-8')
                    }
                )
                
                logger.info(f"Image upload response: {response.status_code}")
                
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
                error_msg = error_data.get("error", {}).get("message", "Upload failed")
                logger.error(f"Meta image upload error: {error_msg} - Full response: {error_data}")
                return {"data": None, "error": error_msg}
            
        except Exception as e:
            logger.error(f"Error uploading ad image: {e}")
            return {"data": None, "error": str(e)}
    

    
    # =========================================================================
    # A/B TESTING SERVICE METHODS
    # =========================================================================
    
    
    # =========================================================================
    # AUTOMATION RULES SERVICE METHODS
    # =========================================================================
    
    async def create_automation_rule(
        self,
        account_id: str,
        access_token: str,
        name: str,
        evaluation_spec: Dict,
        execution_spec: Dict,
        schedule_spec: Optional[Dict] = None,
        status: str = "ENABLED",
    ) -> Dict[str, Any]:
        """Create an automation rule."""
        try:
            client = create_meta_sdk_client(access_token)
            clean_account_id = account_id.replace("act_", "")
            
            result = await client.create_automation_rule(
                account_id=clean_account_id,
                name=name,
                evaluation_spec=evaluation_spec,
                execution_spec=execution_spec,
                schedule_spec=schedule_spec,
                status=status,
            )
            return result
        except MetaSDKError as e:
            logger.error(f"SDK error creating rule: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating rule: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_automation_rules(
        self,
        account_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Get all automation rules for an account."""
        try:
            client = create_meta_sdk_client(access_token)
            clean_account_id = account_id.replace("act_", "")
            return await client.get_automation_rules(clean_account_id)
        except MetaSDKError as e:
            logger.error(f"SDK error fetching rules: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error fetching rules: {e}")
            return {"success": False, "error": str(e)}
    
    async def update_automation_rule(
        self,
        rule_id: str,
        access_token: str,
        updates: Dict
    ) -> Dict[str, Any]:
        """Update an automation rule."""
        try:
            client = create_meta_sdk_client(access_token)
            return await client.update_automation_rule(rule_id, updates)
        except MetaSDKError as e:
            logger.error(f"SDK error updating rule: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error updating rule: {e}")
            return {"success": False, "error": str(e)}
    
    async def delete_automation_rule(
        self,
        rule_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Delete an automation rule."""
        try:
            client = create_meta_sdk_client(access_token)
            return await client.delete_automation_rule(rule_id)
        except MetaSDKError as e:
            logger.error(f"SDK error deleting rule: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error deleting rule: {e}")
            return {"success": False, "error": str(e)}
    
    # ========================================================================
    # INSIGHTS API - v24.0 2026 COMPLIANT
    # ========================================================================
    
    async def fetch_insights(
        self,
        account_id: str,
        access_token: str,
        level: str = "account",
        date_preset: str = "last_7d",
        time_range: Optional[Dict[str, str]] = None,
        breakdowns: Optional[List[str]] = None,
        action_attribution_windows: Optional[List[str]] = None,
        object_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetch insights at account, campaign, adset, or ad level (v24.0 2026).
        
        Args:
            account_id: Ad account ID
            access_token: Meta access token
            level: account, campaign, adset, ad
            date_preset: Date preset (last_7d, last_30d, etc.)
            time_range: Custom date range {'since': 'YYYY-MM-DD', 'until': 'YYYY-MM-DD'}
            breakdowns: age, gender, country, publisher_platform
            action_attribution_windows: 1d_click, 7d_click, 1d_view
            object_id: Specific campaign/adset/ad ID (for non-account level)
        """
        try:
            client = self._get_sdk_client(access_token)
            
            if level == "account":
                result = await client.get_account_insights(
                    ad_account_id=account_id,
                    date_preset=date_preset,
                    time_range=time_range,
                    breakdowns=breakdowns,
                    action_attribution_windows=action_attribution_windows,
                    level=level
                )
            elif level == "campaign" and object_id:
                result = await client.get_campaign_insights(
                    campaign_id=object_id,
                    date_preset=date_preset,
                    time_range=time_range,
                    breakdowns=breakdowns,
                    action_attribution_windows=action_attribution_windows
                )
            elif level == "adset" and object_id:
                result = await client.get_adset_insights(
                    adset_id=object_id,
                    date_preset=date_preset,
                    time_range=time_range,
                    breakdowns=breakdowns,
                    action_attribution_windows=action_attribution_windows
                )
            elif level == "ad" and object_id:
                result = await client.get_ad_insights(
                    ad_id=object_id,
                    date_preset=date_preset,
                    time_range=time_range,
                    breakdowns=breakdowns,
                    action_attribution_windows=action_attribution_windows
                )
            else:
                result = await client.get_account_insights(
                    ad_account_id=account_id,
                    date_preset=date_preset,
                    level=level
                )
            
            return {
                "success": True,
                "data": result,
                "error": None
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error fetching insights: {e.message}")
            return {"success": False, "data": [], "error": e.message}
        except Exception as e:
            logger.error(f"Error fetching insights: {e}")
            return {"success": False, "data": [], "error": str(e)}
    
    # ========================================================================
    # ADVANTAGE+ CAMPAIGNS - v24.0 2026 COMPLIANCE
    # ========================================================================
    
    async def create_advantage_plus_campaign(
        self,
        account_id: str,
        access_token: str,
        name: str,
        objective: str = "OUTCOME_SALES",
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: str = "LOWEST_COST_WITHOUT_CAP",
        bid_amount: Optional[int] = None,
        roas_average_floor: Optional[float] = None,
        geo_locations: Optional[Dict] = None,
        promoted_object: Optional[Dict] = None,
        status: str = "PAUSED",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        special_ad_categories: Optional[List[str]] = None,
        skip_adset: bool = False
    ) -> Dict[str, Any]:
        """
        Create Advantage+ Campaign using v24.0 API (2026 standards).
        
        v24.0 2026 Compliance:
        - NO smart_promotion_type (deprecated)
        - NO existing_customer_budget_percentage (deprecated)
        - Campaign achieves Advantage+ status via three automation levers:
          1. Advantage+ Campaign Budget (budget at campaign level)
          2. Advantage+ Audience (targeting_automation.advantage_audience = 1)
          3. Advantage+ Placements (no placement exclusions)
        
        Args:
            account_id: Ad account ID (with or without 'act_' prefix)
            access_token: Meta access token
            name: Campaign name (max 400 characters)
            objective: Campaign objective (OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_APP_PROMOTION, etc.)
            daily_budget: Daily budget in cents (required if lifetime_budget not set)
            lifetime_budget: Lifetime budget in cents (requires end_time)
            bid_strategy: Bid strategy at campaign level
            bid_amount: Bid amount in cents (required for COST_CAP, LOWEST_COST_WITH_BID_CAP)
            roas_average_floor: Minimum ROAS floor (required for LOWEST_COST_WITH_MIN_ROAS)
            geo_locations: Geographic targeting dict with countries list
            promoted_object: Promoted object dict (required for conversion tracking)
            status: Campaign status (PAUSED, ACTIVE)
            start_time: Campaign start time (ISO format string or Unix timestamp)
            end_time: Campaign end time (ISO format string or Unix timestamp, required for lifetime_budget)
            special_ad_categories: List of special ad categories (empty for full Advantage+)
            skip_adset: If True, only create campaign without default ad set
        
        Returns:
            Dict with success status, campaign_id, adset_id, and advantage_state_info
        """
        try:
            from facebook_business.adobjects.adaccount import AdAccount
            from facebook_business.adobjects.campaign import Campaign
            from facebook_business.adobjects.adset import AdSet
            from facebook_business.exceptions import FacebookRequestError
            
            # Validate required parameters (v24.0 2026 standards)
            if not daily_budget and not lifetime_budget:
                return {"success": False, "error": "Either daily_budget or lifetime_budget must be provided for Advantage+ Campaign Budget"}
            
            if lifetime_budget and not end_time:
                return {"success": False, "error": "end_time is required when lifetime_budget is set"}
            
            # Validate bid_strategy requirements (v24.0 2026)
            if bid_strategy in ["COST_CAP", "LOWEST_COST_WITH_BID_CAP"] and not bid_amount:
                return {"success": False, "error": f"bid_amount is required for bid_strategy: {bid_strategy}"}
            
            if bid_strategy == "LOWEST_COST_WITH_MIN_ROAS" and not roas_average_floor:
                return {"success": False, "error": "roas_average_floor is required for LOWEST_COST_WITH_MIN_ROAS bid_strategy"}
            
            client = self._get_sdk_client(access_token)
            clean_account_id = account_id.replace("act_", "")
            
            # Helper function to convert datetime to Unix timestamp for Meta API (v24.0 2026)
            def convert_to_timestamp(time_str):
                """Convert ISO format string to Unix timestamp for Meta API"""
                if not time_str:
                    return None
                try:
                    from datetime import datetime as dt_parser
                    # Handle ISO format with timezone
                    if isinstance(time_str, str) and 'T' in time_str:
                        # Remove 'Z' suffix and replace with +00:00 if needed
                        time_str_clean = time_str.replace('Z', '+00:00')
                        # Parse ISO format
                        dt = dt_parser.fromisoformat(time_str_clean)
                        return int(dt.timestamp())
                    elif isinstance(time_str, (int, float)):
                        # Already a timestamp
                        return int(time_str)
                    else:
                        # Return as-is if cannot parse
                        return time_str
                except (ValueError, AttributeError, TypeError) as e:
                    logger.warning(f"Could not parse time string {time_str}: {e}. Passing as-is.")
                    return time_str
            
            # Step 1: Create Campaign with campaign-level budget (Advantage+ Budget - Lever 1)
            campaign_params = {
                "name": name,
                "objective": objective,
                "status": status,
                "special_ad_categories": special_ad_categories or [],
            }
            
            # Campaign-level budget (REQUIRED for Advantage+ Campaign Budget - Lever 1)
            if daily_budget:
                campaign_params["daily_budget"] = int(daily_budget)
            if lifetime_budget:
                campaign_params["lifetime_budget"] = int(lifetime_budget)
            
            # Schedule (convert ISO to Unix timestamp for Meta API)
            if start_time:
                campaign_params["start_time"] = convert_to_timestamp(start_time)
            if end_time:
                campaign_params["end_time"] = convert_to_timestamp(end_time)
            
            # Bid strategy at campaign level (v24.0 2026)
            if bid_strategy:
                campaign_params["bid_strategy"] = bid_strategy
            
            ad_account = AdAccount(f"act_{clean_account_id}")
            
            try:
                campaign_result = ad_account.create_campaign(params=campaign_params)
                campaign_id = campaign_result.get("id")
            except FacebookRequestError as e:
                error_msg = e.api_error_message() or str(e)
                logger.error(f"Meta API error creating campaign: {error_msg}")
                return {"success": False, "error": f"Failed to create campaign: {error_msg}"}
            
            if not campaign_id:
                return {"success": False, "error": "Failed to create campaign: No campaign ID returned"}
            
            adset_id = None
            if not skip_adset:
                # Step 2: Create Ad Set with Advantage+ Audience enabled (Lever 2)
                # Build targeting with Advantage+ Audience
                if not geo_locations:
                    logger.warning(f"No geo_locations provided for campaign {name}, using default: US")
                    geo_locations = {"countries": ["US"]}
                
                targeting = {
                    "geo_locations": geo_locations,
                    "targeting_automation": {"advantage_audience": 1}  # Enable Advantage+ Audience (Lever 2)
                }
                # No placement exclusions = Advantage+ Placements (Lever 3)
                
                # Determine optimization goal based on objective (v24.0 2026 mapping)
                # Use OBJECTIVE_VALID_GOALS to get valid goals for the objective
                valid_goals = OBJECTIVE_VALID_GOALS.get(objective, ["LINK_CLICKS"])
                
                # Select appropriate optimization goal based on objective and promoted_object
                optimization_goal = valid_goals[0]  # Default to first valid goal
                
                if objective == "OUTCOME_SALES":
                    # Prefer OFFSITE_CONVERSIONS if promoted_object is provided, otherwise LINK_CLICKS
                    if promoted_object and "OFFSITE_CONVERSIONS" in valid_goals:
                        optimization_goal = "OFFSITE_CONVERSIONS"
                    elif "LINK_CLICKS" in valid_goals:
                        optimization_goal = "LINK_CLICKS"
                    else:
                        optimization_goal = valid_goals[0]
                elif objective == "OUTCOME_LEADS":
                    # Prefer LEAD_GENERATION for leads objective
                    if "LEAD_GENERATION" in valid_goals:
                        optimization_goal = "LEAD_GENERATION"
                    elif "QUALITY_LEAD" in valid_goals:
                        optimization_goal = "QUALITY_LEAD"
                    else:
                        optimization_goal = valid_goals[0]
                elif objective == "OUTCOME_APP_PROMOTION":
                    # Prefer APP_INSTALLS for app promotion
                    if "APP_INSTALLS" in valid_goals:
                        optimization_goal = "APP_INSTALLS"
                    else:
                        optimization_goal = valid_goals[0]
                elif objective == "OUTCOME_ENGAGEMENT":
                    # Prefer POST_ENGAGEMENT for engagement objective
                    if "POST_ENGAGEMENT" in valid_goals:
                        optimization_goal = "POST_ENGAGEMENT"
                    else:
                        optimization_goal = valid_goals[0]
                elif objective == "OUTCOME_AWARENESS":
                    # Prefer REACH for awareness objective
                    if "REACH" in valid_goals:
                        optimization_goal = "REACH"
                    elif "IMPRESSIONS" in valid_goals:
                        optimization_goal = "IMPRESSIONS"
                    else:
                        optimization_goal = valid_goals[0]
                elif objective == "OUTCOME_TRAFFIC":
                    # Prefer LANDING_PAGE_VIEWS for traffic, fallback to LINK_CLICKS
                    if "LANDING_PAGE_VIEWS" in valid_goals:
                        optimization_goal = "LANDING_PAGE_VIEWS"
                    elif "LINK_CLICKS" in valid_goals:
                        optimization_goal = "LINK_CLICKS"
                    else:
                        optimization_goal = valid_goals[0]
                
                adset_params = {
                    "name": f"{name} - Ad Set",
                    "campaign_id": campaign_id,
                    "optimization_goal": optimization_goal,
                    "billing_event": "IMPRESSIONS",  # Required for Advantage+ (v24.0 2026)
                    "targeting": targeting,
                    "status": status
                }
                
                # Add promoted_object if provided (required for conversion tracking)
                if promoted_object:
                    adset_params["promoted_object"] = promoted_object
                
                # Bid controls at ad set level (v24.0 2026)
                if bid_amount and bid_strategy in ["COST_CAP", "LOWEST_COST_WITH_BID_CAP"]:
                    adset_params["bid_amount"] = int(bid_amount)
                
                if roas_average_floor and bid_strategy == "LOWEST_COST_WITH_MIN_ROAS":
                    # ROAS floor is in basis points (10000 = 100%, 20000 = 200%)
                    adset_params["bid_constraints"] = {"roas_average_floor": int(roas_average_floor * 10000)}
                
                # v24.0 2026 Required Parameters for Ad Sets
                # Ad Set Budget Sharing: Allow up to 20% budget sharing between ad sets for better optimization
                # For Advantage+ campaigns, enable this for optimal performance (2026 standards)
                adset_params["is_adset_budget_sharing_enabled"] = True
                
                # Placement Soft Opt Out: Allow 5% spend on excluded placements
                # For Advantage+ Placements (Lever 3), NO placement exclusions are set
                # This parameter only applies if placements are excluded, so it's not relevant here
                # However, Meta API may require this parameter, so set to False for strict Advantage+ compliance
                # Note: Since no placement exclusions are set, this parameter doesn't affect Advantage+ status
                # Setting to False ensures strict compliance with Advantage+ Placements requirement (Lever 3)
                adset_params["placement_soft_opt_out"] = False
                
                # Attribution Spec (v24.0 2026): Updated windows per Jan 12, 2026 changes
                # - View-through deprecated: 7-day and 28-day view windows removed (Jan 12, 2026)
                # - Only 1-day view-through remains allowed
                # - Click-through still supports 1, 7, 28 days
                # Default attribution for Advantage+ campaigns: 1-day click, 7-day click, 1-day view
                attribution_spec = [
                    {"event_type": "CLICK_THROUGH", "window_days": 1},
                    {"event_type": "CLICK_THROUGH", "window_days": 7},
                    {"event_type": "VIEW_THROUGH", "window_days": 1}  # Only 1-day view allowed per 2026 standards
                ]
                adset_params["attribution_spec"] = attribution_spec
                
                # Schedule for ad set (convert to timestamp)
                if start_time:
                    adset_params["start_time"] = convert_to_timestamp(start_time)
                if end_time:
                    adset_params["end_time"] = convert_to_timestamp(end_time)
                
                try:
                    adset_result = ad_account.create_ad_set(params=adset_params)
                    adset_id = adset_result.get("id")
                    if not adset_id:
                        logger.warning(f"Ad set created but no ID returned for campaign {campaign_id}")
                except FacebookRequestError as e:
                    error_msg = e.api_error_message() or str(e)
                    logger.error(f"Meta API error creating ad set: {error_msg}")
                    # Campaign was created successfully, but ad set failed - return partial success
                    return {
                        "success": True,
                        "campaign_id": campaign_id,
                        "adset_id": None,
                        "name": name,
                        "objective": objective,
                        "status": status,
                        "warning": f"Campaign created but ad set creation failed: {error_msg}",
                        "advantage_state_info": {
                            "advantage_state": "DISABLED",
                            "advantage_budget_state": "ENABLED",
                            "advantage_audience_state": "DISABLED",
                            "advantage_placement_state": "ENABLED",
                        }
                    }
            
            # Step 3: Get advantage_state_info to verify Advantage+ status (v24.0 2026)
            try:
                campaign_obj = Campaign(campaign_id)
                campaign_info = campaign_obj.api_get(fields=[
                    "id", "name", "objective", "status", 
                    "daily_budget", "lifetime_budget",
                    "advantage_state_info"
                ])
                
                advantage_state_info = campaign_info.get("advantage_state_info", {})
                
                return {
                    "success": True,
                    "campaign_id": campaign_id,
                    "adset_id": adset_id,
                    "name": name,
                    "objective": objective,
                    "status": status,
                    "advantage_state_info": {
                        "advantage_state": advantage_state_info.get("advantage_state", "DISABLED"),
                        "advantage_budget_state": advantage_state_info.get("advantage_budget_state", "DISABLED"),
                        "advantage_audience_state": advantage_state_info.get("advantage_audience_state", "DISABLED"),
                        "advantage_placement_state": advantage_state_info.get("advantage_placement_state", "DISABLED"),
                    }
                }
            except FacebookRequestError as e:
                # Campaign created but couldn't fetch advantage state
                logger.warning(f"Could not fetch advantage_state_info for campaign {campaign_id}: {e}")
                return {
                    "success": True,
                    "campaign_id": campaign_id,
                    "adset_id": adset_id,
                    "name": name,
                    "objective": objective,
                    "status": status,
                    "warning": "Campaign created but advantage_state_info could not be retrieved",
                    "advantage_state_info": None
                }
            
        except MetaSDKError as e:
            logger.error(f"SDK error creating Advantage+ campaign: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating Advantage+ campaign: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    async def get_campaign_advantage_state(
        self,
        campaign_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """
        Get the Advantage+ state of a campaign using v24.0 API.
        
        Returns advantage_state_info showing which automation levers are enabled.
        """
        try:
            from facebook_business.adobjects.campaign import Campaign
            
            client = self._get_sdk_client(access_token)
            
            campaign = Campaign(campaign_id)
            campaign_info = campaign.api_get(fields=[
                "id", "name", "objective", "status",
                "advantage_state_info"
            ])
            
            advantage_state_info = campaign_info.get("advantage_state_info", {})
            
            return {
                "success": True,
                "campaign_id": campaign_id,
                "name": campaign_info.get("name"),
                "objective": campaign_info.get("objective"),
                "advantage_state_info": {
                    "advantage_state": advantage_state_info.get("advantage_state", "DISABLED"),
                    "advantage_budget_state": advantage_state_info.get("advantage_budget_state", "DISABLED"),
                    "advantage_audience_state": advantage_state_info.get("advantage_audience_state", "DISABLED"),
                    "advantage_placement_state": advantage_state_info.get("advantage_placement_state", "DISABLED"),
                }
            }
            
        except MetaSDKError as e:
            logger.error(f"SDK error getting advantage state: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error getting advantage state: {e}")
            return {"success": False, "error": str(e)}
    
    def validate_advantage_config(
        self,
        config: Optional[Dict[str, Any]] = None,
        objective: Optional[str] = None,
        has_campaign_budget: Optional[bool] = None,
        has_advantage_audience: Optional[bool] = None,
        has_placement_exclusions: Optional[bool] = None,
        special_ad_categories: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Validate if configuration qualifies for Advantage+ status (v24.0 2026).
        
        Can accept either a config dict or individual parameters.
        
        Args:
            config: Dictionary with configuration (overrides individual params if provided)
            objective: Campaign objective (OUTCOME_SALES, OUTCOME_LEADS, etc.)
            has_campaign_budget: Whether budget is set at campaign level
            has_advantage_audience: Whether Advantage+ Audience is enabled
            has_placement_exclusions: Whether placement exclusions are set
            special_ad_categories: List of special ad categories
        
        Returns:
            Dict with is_eligible, expected_advantage_state, requirements_met, and recommendations
        """
        # Extract values from config dict if provided
        if config and isinstance(config, dict):
            objective = config.get("objective", objective)
            has_campaign_budget = config.get("has_campaign_budget", has_campaign_budget)
            has_advantage_audience = config.get("has_advantage_audience", has_advantage_audience)
            has_placement_exclusions = config.get("has_placement_exclusions", has_placement_exclusions)
            special_ad_categories = config.get("special_ad_categories", special_ad_categories)
        
        # Default values if not provided
        objective = objective or "OUTCOME_SALES"
        has_campaign_budget = has_campaign_budget if has_campaign_budget is not None else True
        has_advantage_audience = has_advantage_audience if has_advantage_audience is not None else True
        has_placement_exclusions = has_placement_exclusions if has_placement_exclusions is not None else False
        special_ad_categories = special_ad_categories or []
        
        # Determine expected state based on levers
        advantage_budget_state = "ENABLED" if has_campaign_budget else "DISABLED"
        advantage_audience_state = "ENABLED" if has_advantage_audience else "DISABLED"
        advantage_placement_state = "DISABLED" if has_placement_exclusions else "ENABLED"
        
        all_enabled = (
            advantage_budget_state == "ENABLED" and
            advantage_audience_state == "ENABLED" and
            advantage_placement_state == "ENABLED"
        )
        
        # Map objective to advantage_state
        objective_to_state = {
            "OUTCOME_SALES": "ADVANTAGE_PLUS_SALES",
            "OUTCOME_APP_PROMOTION": "ADVANTAGE_PLUS_APP",
            "APP_INSTALLS": "ADVANTAGE_PLUS_APP",
            "OUTCOME_LEADS": "ADVANTAGE_PLUS_LEADS",
        }
        
        if all_enabled and not special_ad_categories:
            expected_state = objective_to_state.get(objective, "DISABLED")
        else:
            expected_state = "DISABLED"
        
        recommendations = []
        if not has_campaign_budget:
            recommendations.append("Set budget at campaign level for Advantage+ Campaign Budget")
        if not has_advantage_audience:
            recommendations.append("Enable targeting_automation.advantage_audience = 1")
        if has_placement_exclusions:
            recommendations.append("Remove placement exclusions for Advantage+ Placements")
        if special_ad_categories:
            recommendations.append("Special Ad Categories may limit Advantage+ features")
        
        return {
            "is_eligible": all_enabled and not special_ad_categories,
            "expected_advantage_state": expected_state,
            "requirements_met": {
                "advantage_budget_state": advantage_budget_state == "ENABLED",
                "advantage_audience_state": advantage_audience_state == "ENABLED",
                "advantage_placement_state": advantage_placement_state == "ENABLED",
            },
            "recommendations": recommendations
        }

   
# Singleton instance
_meta_ads_service: Optional[MetaAdsService] = None


def get_meta_ads_service() -> MetaAdsService:
    """Get or create MetaAdsService singleton"""
    global _meta_ads_service
    if _meta_ads_service is None:
        _meta_ads_service = MetaAdsService()
    return _meta_ads_service
    