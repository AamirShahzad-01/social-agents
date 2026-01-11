"""
Advantage+ Campaign Schemas - Meta Marketing API v24.0 (2026 standards)

STRICT v24.0 2026 COMPLIANCE:
- NO smart_promotion_type (deprecated)
- NO existing_customer_budget_percentage (deprecated)
- Campaigns achieve Advantage+ status via THREE automation levers:
  1. Advantage+ Campaign Budget (budget at campaign level)
  2. Advantage+ Audience (targeting_automation.advantage_audience = 1)
  3. Advantage+ Placements (no placement exclusions)

Reference: https://developers.facebook.com/docs/marketing-api/advantage-campaigns
"""
from enum import Enum
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, field_validator
from datetime import datetime


# =============================================================================
# ENUMS - v24.0 2026 Compliant Values Only
# =============================================================================

class AdvantageObjective(str, Enum):
    """
    Supported objectives for Advantage+ campaigns (v24.0 2026)
    These map to specific advantage_state values:
    - OUTCOME_SALES -> ADVANTAGE_PLUS_SALES
    - OUTCOME_APP_PROMOTION -> ADVANTAGE_PLUS_APP  
    - OUTCOME_LEADS -> ADVANTAGE_PLUS_LEADS
    """
    OUTCOME_SALES = "OUTCOME_SALES"
    OUTCOME_APP_PROMOTION = "OUTCOME_APP_PROMOTION"
    OUTCOME_LEADS = "OUTCOME_LEADS"


class AdvantageBidStrategy(str, Enum):
    """
    Supported bid strategies for Advantage+ Campaign Budget (v24.0 2026)
    Must be set at CAMPAIGN level, not ad set level.
    """
    LOWEST_COST_WITHOUT_CAP = "LOWEST_COST_WITHOUT_CAP"  # Recommended, auto-bid
    COST_CAP = "COST_CAP"  # Requires bid_amount
    LOWEST_COST_WITH_BID_CAP = "LOWEST_COST_WITH_BID_CAP"  # Requires bid_amount
    LOWEST_COST_WITH_MIN_ROAS = "LOWEST_COST_WITH_MIN_ROAS"  # Requires roas_average_floor


class AdvantageState(str, Enum):
    """
    Advantage+ campaign state (v24.0 2026)
    Read-only field returned by API in advantage_state_info.
    """
    ADVANTAGE_PLUS_SALES = "ADVANTAGE_PLUS_SALES"
    ADVANTAGE_PLUS_APP = "ADVANTAGE_PLUS_APP"
    ADVANTAGE_PLUS_LEADS = "ADVANTAGE_PLUS_LEADS"
    DISABLED = "DISABLED"  # When any automation lever is off


class AdvantageComponentState(str, Enum):
    """Individual automation lever state"""
    ENABLED = "ENABLED"
    DISABLED = "DISABLED"


class CampaignStatus(str, Enum):
    """Valid campaign statuses"""
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DELETED = "DELETED"
    ARCHIVED = "ARCHIVED"


class BillingEvent(str, Enum):
    """Billing events - IMPRESSIONS is required for Advantage+ campaigns"""
    IMPRESSIONS = "IMPRESSIONS"


class OptimizationGoal(str, Enum):
    """Optimization goals for ad sets"""
    LINK_CLICKS = "LINK_CLICKS"  # Default - doesn't require pixel
    OFFSITE_CONVERSIONS = "OFFSITE_CONVERSIONS"  # Requires promoted_object with pixel_id
    VALUE = "VALUE"  # For value optimization, requires PURCHASE event


class ConversionEvent(str, Enum):
    """Supported conversion events for promoted_object"""
    PURCHASE = "PURCHASE"
    ADD_TO_CART = "ADD_TO_CART"
    INITIATED_CHECKOUT = "INITIATED_CHECKOUT"
    ADD_PAYMENT_INFO = "ADD_PAYMENT_INFO"
    ADD_TO_WISHLIST = "ADD_TO_WISHLIST"
    CONTENT_VIEW = "CONTENT_VIEW"
    COMPLETE_REGISTRATION = "COMPLETE_REGISTRATION"
    LEAD = "LEAD"
    START_TRIAL = "START_TRIAL"
    SUBSCRIBE = "SUBSCRIBE"
    SEARCH = "SEARCH"


# =============================================================================
# TARGETING - v24.0 2026 Advantage+ Audience
# =============================================================================

class GeoLocations(BaseModel):
    """
    Geographic targeting for Advantage+ campaigns.
    This is the ONLY targeting allowed for full Advantage+ status.
    """
    countries: List[str] = Field(
        default=["US"],
        description="ISO 3166-1 alpha-2 country codes"
    )
    regions: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Region targeting: [{'key': 'region_id'}]"
    )


class TargetingAutomation(BaseModel):
    """
    Advantage+ Audience configuration (v24.0 2026)
    Set advantage_audience=1 to enable AI-powered targeting.
    """
    advantage_audience: int = Field(
        default=1,
        ge=0,
        le=1,
        description="1 = Enable Advantage+ Audience, 0 = Disable"
    )


class AdvantagePlusTargeting(BaseModel):
    """
    Targeting specification for Advantage+ campaigns (v24.0 2026)
    
    For full Advantage+ status:
    - Only geo_locations should be set
    - targeting_automation.advantage_audience = 1
    - NO custom audiences, detailed targeting, or demographics
    """
    geo_locations: GeoLocations = Field(default_factory=GeoLocations)
    targeting_automation: TargetingAutomation = Field(default_factory=TargetingAutomation)
    
    # These are optional but will reduce Advantage+ benefits if used
    age_min: Optional[int] = Field(default=None, ge=18, le=25)
    age_max: Optional[int] = Field(default=None)  # Reset to 65 when Advantage+ Audience is on
    

# =============================================================================
# ATTRIBUTION SPEC - v24.0 2026 Updated Windows
# =============================================================================

class AttributionSpec(BaseModel):
    """
    Attribution specification for conversion tracking (v24.0 2026)
    
    IMPORTANT 2026 CHANGES (Jan 12, 2026):
    - View-through attribution: 7-day and 28-day windows are DEPRECATED
    - Only 1-day view-through is allowed
    - Click-through still supports 1, 7, 28 days
    """
    event_type: str = Field(..., description="CLICK_THROUGH or VIEW_THROUGH")
    window_days: int = Field(..., description="1, 7, or 28 for click; 1 only for view (2026 standard)")
    weight: Optional[float] = Field(default=100, description="Attribution weight (default: 100)")
    
    @field_validator('window_days')
    @classmethod
    def validate_window(cls, v, info):
        """Validate attribution window per 2026 standards"""
        event_type = info.data.get('event_type')
        if event_type == 'VIEW_THROUGH' and v > 1:
            raise ValueError(
                'View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards). '
                '7-day and 28-day view windows are deprecated.'
            )
        if v not in [1, 7, 28]:
            raise ValueError('window_days must be 1, 7, or 28')
        return v


# =============================================================================
# PROMOTED OBJECT - Conversion Tracking
# =============================================================================

class PromotedObject(BaseModel):
    """
    Promoted object for conversion tracking (v24.0 2026)
    Required for OUTCOME_SALES objective.
    """
    pixel_id: Optional[str] = Field(default=None, description="Meta Pixel/Dataset ID for tracking conversions")
    custom_event_type: ConversionEvent = Field(
        default=ConversionEvent.PURCHASE,
        description="Conversion event to optimize for"
    )
    application_id: Optional[str] = Field(default=None, description="App ID for app campaigns")
    object_store_url: Optional[str] = Field(default=None, description="App store URL")
    product_set_id: Optional[str] = Field(default=None, description="Product Set ID for Catalog Sales")


# =============================================================================
# ADVANTAGE+ STATE INFO - Read-only API Response
# =============================================================================

class AdvantageStateInfo(BaseModel):
    """
    Read-only response from API showing Advantage+ status (v24.0 2026)
    
    A campaign achieves advantage_state != DISABLED when ALL three levers are ENABLED:
    - advantage_budget_state: Campaign-level budget is set
    - advantage_audience_state: targeting_automation.advantage_audience = 1
    - advantage_placement_state: No placement exclusions
    """
    advantage_state: AdvantageState
    advantage_budget_state: AdvantageComponentState
    advantage_audience_state: AdvantageComponentState
    advantage_placement_state: AdvantageComponentState
    
    @property
    def is_advantage_plus(self) -> bool:
        """Check if campaign has full Advantage+ status"""
        return self.advantage_state != AdvantageState.DISABLED


# =============================================================================
# REQUEST SCHEMAS
# =============================================================================

class CreateAdvantagePlusCampaignRequest(BaseModel):
    """
    Create Advantage+ Campaign - v24.0 2026 API
    
    To achieve Advantage+ status, configure:
    1. Budget at campaign level (daily_budget or lifetime_budget)
    2. Supported bid_strategy
    3. Objective: OUTCOME_SALES, OUTCOME_APP_PROMOTION, or OUTCOME_LEADS
    """
    # Campaign Info
    name: str = Field(..., min_length=1, max_length=400)
    objective: AdvantageObjective = AdvantageObjective.OUTCOME_SALES
    status: CampaignStatus = CampaignStatus.PAUSED
    
    # Campaign Budget (REQUIRED for Advantage+ Budget)
    daily_budget: Optional[int] = Field(
        default=None,
        gt=0,
        description="Daily budget in cents (e.g., 5000 = $50.00)"
    )
    lifetime_budget: Optional[int] = Field(
        default=None,
        gt=0,
        description="Lifetime budget in cents"
    )
    
    # Bid Strategy (Campaign Level)
    bid_strategy: AdvantageBidStrategy = AdvantageBidStrategy.LOWEST_COST_WITHOUT_CAP
    
    # Bid Parameters (passed to Ad Set if required by bid_strategy)
    bid_amount: Optional[int] = Field(
        default=None,
        gt=0,
        description="Bid amount in cents (required for COST_CAP/BID_CAP)"
    )
    roas_average_floor: Optional[float] = Field(
        default=None,
        description="Min ROAS floor (e.g., 2.0 = 200%)"
    )
    
    # Targeting & Conversion
    geo_locations: Optional[GeoLocations] = None
    promoted_object: Optional[PromotedObject] = None
    
    # Schedule
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = Field(
        default=None,
        description="Required if lifetime_budget is set"
    )
    
    # Control flags
    skip_adset: bool = Field(
        default=False,
        description="If True, only create campaign, do not create default ad set"
    )
    
    # Special Ad Categories (must be empty for full Advantage+)
    special_ad_categories: List[str] = Field(default_factory=list)
    
    @field_validator('daily_budget', 'lifetime_budget')
    @classmethod
    def validate_budget(cls, v, info):
        """Ensure at least one budget is provided"""
        return v

    
    def model_post_init(self, __context):
        """Validate that at least one budget type is set"""
        if self.daily_budget is None and self.lifetime_budget is None:
            raise ValueError("Either daily_budget or lifetime_budget must be provided")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Q1 2026 Advantage+ Sales Campaign",
                "objective": "OUTCOME_SALES",
                "status": "PAUSED",
                "daily_budget": 5000,
                "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
                "special_ad_categories": []
            }
        }


class CreateAdvantagePlusAdSetRequest(BaseModel):
    """
    Create Ad Set for Advantage+ Campaign - v24.0 2026 API
    
    To achieve Advantage+ Audience status:
    - Set targeting_automation.advantage_audience = 1
    - Only use geo_locations for targeting
    - No placement exclusions
    """
    # Link to campaign
    campaign_id: str = Field(..., description="Parent Advantage+ campaign ID")
    name: str = Field(..., min_length=1, max_length=400)
    status: CampaignStatus = CampaignStatus.PAUSED
    
    # Targeting (Advantage+ Audience)
    targeting: AdvantagePlusTargeting = Field(default_factory=AdvantagePlusTargeting)
    
    # Promoted Object (Conversion Tracking) - required only for OFFSITE_CONVERSIONS
    promoted_object: Optional[PromotedObject] = None
    
    # Optimization - LINK_CLICKS doesn't require pixel, OFFSITE_CONVERSIONS requires promoted_object
    optimization_goal: OptimizationGoal = OptimizationGoal.LINK_CLICKS
    billing_event: BillingEvent = BillingEvent.IMPRESSIONS  # Required for Advantage+
    
    # Bid Controls (for COST_CAP or BID_CAP strategies)
    bid_amount: Optional[int] = Field(
        default=None,
        gt=0,
        description="Bid amount in cents (required for COST_CAP/BID_CAP)"
    )
    
    # Min ROAS (for LOWEST_COST_WITH_MIN_ROAS strategy)
    roas_average_floor: Optional[int] = Field(
        default=None,
        ge=100,
        le=10000000,
        description="Min ROAS floor (100 = 1%, 10000 = 100%)"
    )
    
    # Schedule
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    
    # v24.0 2026 Required Parameters
    is_adset_budget_sharing_enabled: Optional[bool] = Field(
        default=True,
        description="Share up to 20% budget between ad sets for better optimization (2026 standards)"
    )
    placement_soft_opt_out: Optional[bool] = Field(
        default=False,
        description="Allow 5% spend on excluded placements. Set to False for strict Advantage+ Placements compliance"
    )
    
    # Attribution Spec (v24.0 2026): Updated windows per Jan 12, 2026 changes
    # View-through deprecated: 7-day and 28-day view windows removed
    # Only 1-day view-through remains allowed
    attribution_spec: Optional[List[AttributionSpec]] = Field(
        default=None,
        description="Attribution windows. View-through limited to 1 day only (2026 standards)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "campaign_id": "120330000000000000",
                "name": "Advantage+ Ad Set - US",
                "status": "PAUSED",
                "targeting": {
                    "geo_locations": {"countries": ["US", "CA"]},
                    "targeting_automation": {"advantage_audience": 1}
                },
                # promoted_object only needed for OFFSITE_CONVERSIONS:
                # "promoted_object": {
                #     "pixel_id": "123456789012345",
                #     "custom_event_type": "PURCHASE"
                # },
                "optimization_goal": "LINK_CLICKS",
                "billing_event": "IMPRESSIONS"
            }
        }


class ValidateAdvantageConfigRequest(BaseModel):
    """Validate configuration for Advantage+ eligibility"""
    objective: AdvantageObjective
    has_campaign_budget: bool = True
    has_advantage_audience: bool = True
    has_placement_exclusions: bool = False
    special_ad_categories: List[str] = Field(default_factory=list)


# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================

class AdvantagePlusCampaignResponse(BaseModel):
    """Response after creating an Advantage+ campaign"""
    success: bool
    campaign_id: Optional[str] = None
    name: Optional[str] = None
    objective: Optional[str] = None
    status: Optional[str] = None
    advantage_state_info: Optional[AdvantageStateInfo] = None
    error: Optional[str] = None


class AdvantagePlusAdSetResponse(BaseModel):
    """Response after creating an Advantage+ ad set"""
    success: bool
    adset_id: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None


class ValidateAdvantageConfigResponse(BaseModel):
    """Response indicating Advantage+ eligibility"""
    is_eligible: bool
    expected_advantage_state: AdvantageState
    requirements_met: Dict[str, bool] = Field(
        default_factory=lambda: {
            "advantage_budget_state": False,
            "advantage_audience_state": False,
            "advantage_placement_state": False
        }
    )
    recommendations: List[str] = Field(default_factory=list)
