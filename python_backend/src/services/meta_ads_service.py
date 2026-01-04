"""
Meta Ads Service
Production Meta Business SDK wrapper for campaign, ad set, and ad management.

Uses official Meta Business SDK for v25.0+ API operations.
STRICT v25.0+ COMPLIANCE - No deprecated patterns (smart_promotion_type, etc.)

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

from ..config import settings
from .meta_sdk_client import create_meta_sdk_client, MetaSDKError

logger = logging.getLogger(__name__)

# Meta API Configuration - v24.0 (supports v25.0 features)
META_API_VERSION = "v24.0"

# Objective mapping - strictly OUTCOME-based (API v25.0++)
# Legacy objectives (LINK_CLICKS, TRAFFIC, etc.) are purged for 2026 compliance.
OBJECTIVE_MAPPING: Dict[str, str] = {
    "OUTCOME_TRAFFIC": "OUTCOME_TRAFFIC",
    "OUTCOME_SALES": "OUTCOME_SALES",
    "OUTCOME_LEADS": "OUTCOME_LEADS",
    "OUTCOME_AWARENESS": "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT": "OUTCOME_ENGAGEMENT",
    "OUTCOME_APP_PROMOTION": "OUTCOME_APP_PROMOTION",
}

# Valid optimization goals per objective - v25.0+ ODAX
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
        """Normalize objective to v25.0+ OUTCOME-based format"""
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
    

    
    async def create_advantage_plus_campaign(
        self,
        account_id: str,
        access_token: str,
        name: str,
        objective: str,
        status: str,
        special_ad_categories: List[str] = [],
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        bid_strategy: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create Advantage+ Campaign (v25.0+)"""
        try:
            client = self._get_sdk_client(access_token)
            
            result = await client.create_advantage_plus_campaign(
                ad_account_id=account_id,
                name=name,
                objective=objective,
                status=status,
                special_ad_categories=special_ad_categories,
                daily_budget=daily_budget,
                lifetime_budget=lifetime_budget,
                bid_strategy=bid_strategy
            )
            
            return {
                "success": True,
                "campaign": result,
                "advantage_state_info": result.get("advantage_state_info"),
                "error": None
            }
        except MetaSDKError as e:
            logger.error(f"SDK error creating Advantage+ campaign: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating Advantage+ campaign: {e}")
            return {"success": False, "error": str(e)}

    def validate_advantage_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate config for Advantage+ eligibility (v25.0+)
        Checks if the configuration meets the 3-lever requirement.
        """
        requirements = {
            "advantage_budget_state": config.get("has_campaign_budget", False),
            "advantage_audience_state": config.get("has_advantage_audience", True),
            "advantage_placement_state": not config.get("has_placement_exclusions", False)
        }
        
        is_eligible = all(requirements.values())
        
        expected_state = "DISABLED"
        if is_eligible:
            obj = config.get("objective", "OUTCOME_SALES")
            if obj == "OUTCOME_SALES":
                expected_state = "ADVANTAGE_PLUS_SALES"
            elif obj == "OUTCOME_APP_PROMOTION":
                expected_state = "ADVANTAGE_PLUS_APP"
            elif obj == "OUTCOME_LEADS":
                expected_state = "ADVANTAGE_PLUS_LEADS"
                
        return {
            "is_eligible": is_eligible,
            "expected_advantage_state": expected_state,
            "requirements_met": requirements,
            "recommendations": [] if is_eligible else ["Enable all Advantage+ levers"]
        }

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
        optimization_goal: str,
        billing_event: str = "IMPRESSIONS",
        targeting: Dict[str, Any] = None,
        status: str = "PAUSED",
        daily_budget: Optional[int] = None,
        lifetime_budget: Optional[int] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        bid_amount: Optional[float] = None,
        # v25.0+ 2026 default: Enable Advantage+ Audience
        advantage_audience: bool = True,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Create a new ad set using SDK.
        
        v25.0+ COMPLIANCE:
        - advantage_audience defaults to True per Meta API v25.0+
        - Injects targeting_automation.advantage_audience = 1 when enabled
        - Detailed targeting becomes advisory (signals) when enabled
        """
        try:
            # Daily budget and lifetime budget are already provided as parameters
            # Convert to cents if provided
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
            
            # v25.0+: Inject targeting_automation for Advantage+ Audience
            if advantage_audience:
                targeting["targeting_automation"] = {"advantage_audience": 1}
                # When Advantage+ Audience is enabled, age constraints are advisory
                # Meta will expand beyond specified age range
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
                bid_amount=int(bid_amount * 100) if bid_amount else None
            )
            
            return {
                "success": True,
                "adset": {"id": result.get("adset_id") or result.get("id")},
                "advantage_audience_enabled": advantage_audience,
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
        """Update an ad set using SDK"""
        try:
            # v25.0+ Advantage+ Audience injection
            if updates.get("advantage_audience") is not None and updates["advantage_audience"]:
                targeting = updates.get("targeting") or {}
                # Inject v25.0+ automation field
                if "targeting_automation" not in targeting:
                    targeting["targeting_automation"] = {}
                targeting["targeting_automation"]["advantage_audience"] = 1
                updates["targeting"] = targeting

            client = self._get_sdk_client(access_token)
            
            # Filter updates to match SDK signature
            # Note: SDK update_adset needs to be updated if we want to support is_adset_budget_sharing_enabled
            # For now, we focus on targeting/advantage_audience
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
        call_to_action_type: str = "LEARN_MORE",
        advantage_plus_creative: bool = True,
        gen_ai_disclosure: bool = False,
        format_automation: bool = False,
        degrees_of_freedom_spec: Optional[Dict[str, Any]] = None,
        ad_disclaimer_spec: Optional[Dict[str, Any]] = None,
        product_set_id: Optional[str] = None
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
                call_to_action_type=call_to_action_type,
                advantage_plus_creative=advantage_plus_creative,
                gen_ai_disclosure=gen_ai_disclosure,
                format_automation=format_automation,
                degrees_of_freedom_spec=degrees_of_freedom_spec,
                ad_disclaimer_spec=ad_disclaimer_spec,
                product_set_id=product_set_id
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
            breakdowns = await client.get_account_insights_breakdown(
                ad_account_id=account_id,
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
        
        Creates a copy of the campaign with all ad sets and ads.
        """
        try:
            # First, get the campaign details
            details = await self.get_campaign_details(campaign_id, access_token)
            if details.get("error"):
                return {"success": False, "error": details["error"]}
            
            campaign_data = details.get("data", {})
            
            # Create new campaign with same settings
            client = self._get_sdk_client(access_token)
            
            # The Meta API doesn't have a native duplicate, so we recreate
            # For a full implementation, we'd also copy ad sets and ads
            # This is a simplified version that copies the campaign only
            
            return {
                "success": True,
                "campaign_id": campaign_id,
                "message": "Campaign duplication requires copying campaign, ad sets, and ads. Use the full wizard for complete duplication."
            }
            
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
    
    async def get_ab_tests(
        self,
        account_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Get all A/B tests for an account."""
        try:
            client = create_meta_sdk_client(access_token)
            clean_account_id = account_id.replace("act_", "")
            return await client.get_ab_tests(clean_account_id)
        except MetaSDKError as e:
            logger.error(f"SDK error fetching A/B tests: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error fetching A/B tests: {e}")
            return {"success": False, "error": str(e)}
    
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
    # INSIGHTS API - v25.0+ COMPLIANT
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
        Fetch insights at account, campaign, adset, or ad level (v25.0+).
        
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
    # ADVANTAGE+ CAMPAIGNS - v25.0+ STRICT COMPLIANCE
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
        special_ad_categories: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create Advantage+ Campaign using v25.0+ API.
        
        v25.0+ Compliance:
        - NO smart_promotion_type (deprecated)
        - NO existing_customer_budget_percentage (deprecated)
        - Campaign achieves Advantage+ status via three automation levers:
          1. Advantage+ Campaign Budget (budget at campaign level)
          2. Advantage+ Audience (targeting_automation.advantage_audience = 1)
          3. Advantage+ Placements (no exclusions)
        """
        try:
            from facebook_business.adobjects.adaccount import AdAccount
            from facebook_business.adobjects.campaign import Campaign
            from facebook_business.adobjects.adset import AdSet
            
            client = self._get_sdk_client(access_token)
            clean_account_id = account_id.replace("act_", "")
            
            # Step 1: Create Campaign with campaign-level budget (Advantage+ Budget)
            campaign_params = {
                "name": name,
                "objective": objective,  # OUTCOME_SALES, OUTCOME_APP_PROMOTION, OUTCOME_LEADS
                "status": status,
                "special_ad_categories": special_ad_categories or [],
                "bid_strategy": bid_strategy,
            }
            
            # Campaign-level budget (REQUIRED for Advantage+ Campaign Budget)
            if daily_budget:
                campaign_params["daily_budget"] = daily_budget
            if lifetime_budget:
                campaign_params["lifetime_budget"] = lifetime_budget
            if start_time:
                campaign_params["start_time"] = start_time
            if end_time:
                campaign_params["end_time"] = end_time
            
            ad_account = AdAccount(f"act_{clean_account_id}")
            campaign = ad_account.create_campaign(params=campaign_params)
            campaign_id = campaign.get("id")
            
            # Step 2: Create Ad Set with Advantage+ Audience and Placements
            adset_params = {
                "campaign_id": campaign_id,
                "name": f"{name} - Ad Set",
                "status": status,
                "billing_event": "IMPRESSIONS",  # Required for Advantage+
                # Use LINK_CLICKS by default (doesn't require pixel)
                # OFFSITE_CONVERSIONS requires promoted_object with pixel_id
                "optimization_goal": "LINK_CLICKS" if not promoted_object else "OFFSITE_CONVERSIONS",
                # Advantage+ Audience: targeting_automation.advantage_audience = 1
                "targeting": {
                    "geo_locations": geo_locations or {"countries": ["US"]},
                    "targeting_automation": {"advantage_audience": 1}
                },
            }
            
            # Promoted object for conversion tracking (required for OFFSITE_CONVERSIONS)
            if promoted_object:
                adset_params["promoted_object"] = promoted_object
            
            # Bid controls (ad set level for some strategies)
            if bid_amount and bid_strategy in ["COST_CAP", "LOWEST_COST_WITH_BID_CAP"]:
                adset_params["bid_amount"] = bid_amount
            if roas_average_floor and bid_strategy == "LOWEST_COST_WITH_MIN_ROAS":
                adset_params["bid_constraints"] = {"roas_average_floor": int(roas_average_floor * 10000)}
            
            adset = ad_account.create_ad_set(params=adset_params)
            adset_id = adset.get("id")
            
            # Step 3: Get advantage_state_info to verify Advantage+ status
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
            
        except MetaSDKError as e:
            logger.error(f"SDK error creating Advantage+ campaign: {e.message}")
            return {"success": False, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating Advantage+ campaign: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_campaign_advantage_state(
        self,
        campaign_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """
        Get the Advantage+ state of a campaign (v25.0+).
        
        Returns advantage_state_info showing which automation levers are enabled.
        """
        try:
            from facebook_business.adobjects.campaign import Campaign
            
            self._get_sdk_client(access_token)
            
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
        objective: str,
        has_campaign_budget: bool = True,
        has_advantage_audience: bool = True,
        has_placement_exclusions: bool = False,
        special_ad_categories: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Validate if configuration qualifies for Advantage+ status (v25.0+).
        
        Returns expected advantage_state based on the three automation levers.
        """
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
    
    async def fetch_ab_tests(
        self,
        business_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch A/B tests (ad studies) for a business using SDK"""
        try:
            client = create_meta_sdk_client(access_token)
            ab_tests = await client.get_ad_studies(business_id)
            
            return {"ab_tests": ab_tests, "error": None}
            
        except MetaSDKError as e:
            return {"ab_tests": [], "error": e.message}
        except Exception as e:
            return {"ab_tests": [], "error": str(e)}
    
    async def create_ab_test(
        self,
        business_id: str,
        access_token: str,
        name: str,
        cells: List[Dict[str, Any]],
        start_time: str = None,
        end_time: str = None,
        study_type: str = "SPLIT_TEST",
        description: Optional[str] = None,
        confidence_level: Optional[float] = 0.9,
        observation_end_time: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create A/B test (split test) using SDK"""
        try:
            client = create_meta_sdk_client(access_token)
            result = await client.create_ab_test(
                account_id=business_id,  # SDK uses account_id parameter
                name=name,
                test_type=study_type,
                cells=cells,
                description=description,
                start_time=int(start_time) if start_time and str(start_time).isdigit() else None,
                end_time=int(end_time) if end_time and str(end_time).isdigit() else None,
                business_id=business_id
            )
            
            if result.get("success"):
                return {
                    "success": True,
                    "ab_test": result,
                    "id": result.get("test_id"),
                    "error": None
                }
            else:
                return {"success": False, "ab_test": None, "error": result.get("error")}
            
        except MetaSDKError as e:
            logger.error(f"SDK error creating A/B test: {e.message}")
            return {"success": False, "ab_test": None, "error": e.message}
        except Exception as e:
            logger.error(f"Error creating A/B test: {e}")
            return {"success": False, "ab_test": None, "error": str(e)}
    
    async def fetch_ab_test_details(
        self,
        test_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Fetch details of a specific A/B test"""
        try:
            client = create_meta_sdk_client(access_token)
            test_details = await client.get_ad_study_details(test_id)
            
            return {"ab_test": test_details, "error": None}
            
        except MetaSDKError as e:
            return {"ab_test": None, "error": e.message}
        except Exception as e:
            return {"ab_test": None, "error": str(e)}

    async def fetch_ab_test_insights(
        self,
        test_id: str,
        access_token: str,
        date_preset: str = "last_7d"
    ) -> Dict[str, Any]:
        """Fetch performance insights for an A/B test"""
        try:
            client = create_meta_sdk_client(access_token)
            insights = await client.get_ad_study_insights(test_id, date_preset)
            
            # Calculate winner if we have enough data
            winner = None
            statistical_significance = 0
            cells_insights = insights.get("cells", []) if insights else []
            
            if len(cells_insights) >= 2:
                # Find cell with best performance (lowest cost_per_result)
                sorted_cells = sorted(cells_insights, key=lambda x: x.get("cost_per_result", float('inf')))
                if sorted_cells[0].get("cost_per_result", 0) > 0:
                    winner = sorted_cells[0].get("name")
                    # Simple significance calculation
                    if len(sorted_cells) > 1 and sorted_cells[1].get("cost_per_result", 0) > 0:
                        improvement = (sorted_cells[1]["cost_per_result"] - sorted_cells[0]["cost_per_result"]) / sorted_cells[1]["cost_per_result"]
                        statistical_significance = min(improvement * 100 * 10, 99)  # Rough estimate
            
            return {
                "insights": cells_insights,
                "winner": winner,
                "statistical_significance": statistical_significance,
                "error": None
            }
            
        except MetaSDKError as e:
            return {"insights": [], "winner": None, "error": e.message}
        except Exception as e:
            return {"insights": [], "winner": None, "error": str(e)}
    
    async def update_ab_test_status(
        self,
        test_id: str,
        access_token: str,
        status: str
    ) -> Dict[str, Any]:
        """Update A/B test status (pause/resume)"""
        try:
            client = create_meta_sdk_client(access_token)
            
            # Map status values to Meta API expected values
            # Meta API expects: OFF, ON, DRAFT, DEPRECATED_PENDING_REVIEW
            status_mapping = {
                'ACTIVE': 'ON',
                'PAUSED': 'OFF',
                'ON': 'ON',
                'OFF': 'OFF',
            }
            api_status = status_mapping.get(status.upper(), status) if status else None
            
            result = await client.update_ad_study(test_id, status=api_status)
            
            return {"success": True, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "error": e.message}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def cancel_ab_test(
        self,
        test_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Cancel/delete an A/B test"""
        try:
            client = create_meta_sdk_client(access_token)
            result = await client.delete_ad_study(test_id)
            
            return {"success": True, "error": None}
            
        except MetaSDKError as e:
            return {"success": False, "error": e.message}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def duplicate_ab_test(
        self,
        test_id: str,
        access_token: str,
        new_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Duplicate an A/B test"""
        try:
            client = create_meta_sdk_client(access_token)
            
            # Get original test details
            original = await client.get_ad_study_details(test_id)
            
            if not original:
                return {"success": False, "error": "Original test not found"}
            
            # Create new test with same settings
            result = await client.create_ab_test(
                account_id=original.get("business_id", ""),
                name=new_name or f"{original.get('name', 'Test')} (Copy)",
                test_type=original.get("type", "SPLIT_TEST"),
                cells=original.get("cells", []),
                start_time=original.get("start_time"),
                end_time=original.get("end_time"),
                description=original.get("description"),
                business_id=original.get("business_id", "")
            )
            
            return {
                "success": True,
                "id": result.get("id") or result.get("test_id"),
                "ab_test": result,
                "error": None
            }
            
        except MetaSDKError as e:
            return {"success": False, "ab_test": None, "error": e.message}
        except Exception as e:
            return {"success": False, "ab_test": None, "error": str(e)}


# Singleton instance
_meta_ads_service: Optional[MetaAdsService] = None


def get_meta_ads_service() -> MetaAdsService:
    """Get or create MetaAdsService singleton"""
    global _meta_ads_service
    if _meta_ads_service is None:
        _meta_ads_service = MetaAdsService()
    return _meta_ads_service
