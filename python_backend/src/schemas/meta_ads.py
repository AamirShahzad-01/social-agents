"""
Meta Ads Pydantic Schemas
Production-ready request/response validation for Meta Marketing API v24.0 (2026 standards)

STRICT v24.0 2026 COMPLIANCE - All deprecated patterns removed.
Based on official Meta Marketing API documentation.
"""
from enum import Enum
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# ENUMS - Meta Marketing API v24.0 2026
# ============================================================================

class CampaignObjective(str, Enum):
    """
    Meta Ads Campaign Objectives - API v24.0 2026 OUTCOME-based (ODAX)
    
    These are the 6 simplified campaign objectives (v24.0 2026 standards):
    - OUTCOME_AWARENESS: Reach people likely to remember your ad
    - OUTCOME_TRAFFIC: Send people to a destination
    - OUTCOME_ENGAGEMENT: Find people to interact with your business
    - OUTCOME_LEADS: Find people interested who may share contact info
    - OUTCOME_APP_PROMOTION: Get people to install/use your app
    - OUTCOME_SALES: Find people likely to purchase
    """
    OUTCOME_AWARENESS = "OUTCOME_AWARENESS"
    OUTCOME_TRAFFIC = "OUTCOME_TRAFFIC"
    OUTCOME_ENGAGEMENT = "OUTCOME_ENGAGEMENT"
    OUTCOME_LEADS = "OUTCOME_LEADS"
    OUTCOME_SALES = "OUTCOME_SALES"
    OUTCOME_APP_PROMOTION = "OUTCOME_APP_PROMOTION"


class CampaignStatus(str, Enum):
    """Campaign status values"""
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DELETED = "DELETED"
    ARCHIVED = "ARCHIVED"


class AdSetStatus(str, Enum):
    """Ad Set status values"""
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DELETED = "DELETED"
    ARCHIVED = "ARCHIVED"


class AdStatus(str, Enum):
    """Ad status values"""
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DELETED = "DELETED"
    ARCHIVED = "ARCHIVED"
    PENDING_REVIEW = "PENDING_REVIEW"
    DISAPPROVED = "DISAPPROVED"
    PREAPPROVED = "PREAPPROVED"
    PENDING_BILLING_INFO = "PENDING_BILLING_INFO"
    CAMPAIGN_PAUSED = "CAMPAIGN_PAUSED"
    ADSET_PAUSED = "ADSET_PAUSED"
    IN_PROCESS = "IN_PROCESS"
    WITH_ISSUES = "WITH_ISSUES"


class BidStrategy(str, Enum):
    """
    Bid strategy options - v24.0 2026 standards
    """
    LOWEST_COST_WITHOUT_CAP = "LOWEST_COST_WITHOUT_CAP"
    LOWEST_COST_WITH_BID_CAP = "LOWEST_COST_WITH_BID_CAP"
    COST_CAP = "COST_CAP"
    LOWEST_COST_WITH_MIN_ROAS = "LOWEST_COST_WITH_MIN_ROAS"


class OptimizationGoal(str, Enum):
    """
    Optimization goal options - API v24.0 2026
    Mapped by campaign objective and destination type
    """
    # Awareness goals
    REACH = "REACH"
    IMPRESSIONS = "IMPRESSIONS"
    AD_RECALL_LIFT = "AD_RECALL_LIFT"
    
    # Traffic goals
    LINK_CLICKS = "LINK_CLICKS"
    LANDING_PAGE_VIEWS = "LANDING_PAGE_VIEWS"
    
    # Engagement goals
    POST_ENGAGEMENT = "POST_ENGAGEMENT"
    PAGE_LIKES = "PAGE_LIKES"
    THRUPLAY = "THRUPLAY"
    VIDEO_VIEWS = "VIDEO_VIEWS"
    TWO_SECOND_CONTINUOUS_VIDEO_VIEWS = "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS"
    EVENT_RESPONSES = "EVENT_RESPONSES"
    CONVERSATIONS = "CONVERSATIONS"
    
    # Leads goals
    LEAD_GENERATION = "LEAD_GENERATION"
    QUALITY_LEAD = "QUALITY_LEAD"
    
    # Sales/Conversions goals
    OFFSITE_CONVERSIONS = "OFFSITE_CONVERSIONS"
    ONSITE_CONVERSIONS = "ONSITE_CONVERSIONS"
    VALUE = "VALUE"
    
    # App goals
    APP_INSTALLS = "APP_INSTALLS"
    APP_INSTALLS_AND_OFFSITE_CONVERSIONS = "APP_INSTALLS_AND_OFFSITE_CONVERSIONS"
    
    # Other
    ENGAGED_USERS = "ENGAGED_USERS"
    VISIT_INSTAGRAM_PROFILE = "VISIT_INSTAGRAM_PROFILE"
    QUALITY_CALL = "QUALITY_CALL"


class BillingEvent(str, Enum):
    """
    Billing event options - v24.0 2026
    Note: Some events are only available for specific optimization goals
    """
    IMPRESSIONS = "IMPRESSIONS"
    LINK_CLICKS = "LINK_CLICKS"
    THRUPLAY = "THRUPLAY"
    PAGE_LIKES = "PAGE_LIKES"
    POST_ENGAGEMENT = "POST_ENGAGEMENT"
    VIDEO_VIEWS = "VIDEO_VIEWS"
    APP_INSTALLS = "APP_INSTALLS"


class DestinationType(str, Enum):
    """
    Destination type for ad sets - v24.0 2026
    Determines where ads will send people
    """
    WEBSITE = "WEBSITE"
    APP = "APP"
    MESSENGER = "MESSENGER"
    WHATSAPP = "WHATSAPP"
    INSTAGRAM_DIRECT = "INSTAGRAM_DIRECT"
    INSTAGRAM_PROFILE = "INSTAGRAM_PROFILE"
    PHONE_CALL = "PHONE_CALL"
    SHOP = "SHOP"
    ON_AD = "ON_AD"
    ON_POST = "ON_POST"
    ON_EVENT = "ON_EVENT"
    ON_VIDEO = "ON_VIDEO"
    ON_PAGE = "ON_PAGE"
    FACEBOOK = "FACEBOOK"
    APPLINKS_AUTOMATIC = "APPLINKS_AUTOMATIC"


class SpecialAdCategory(str, Enum):
    """
    Special ad categories - Required for housing, employment, financial products/services
    """
    NONE = "NONE"
    EMPLOYMENT = "EMPLOYMENT"
    HOUSING = "HOUSING"
    FINANCIAL_PRODUCTS_SERVICES = "FINANCIAL_PRODUCTS_SERVICES"
    ISSUES_ELECTIONS_POLITICS = "ISSUES_ELECTIONS_POLITICS"


class CallToActionType(str, Enum):
    """Call to action types - v24.0 2026"""
    # Primary CTAs
    LEARN_MORE = "LEARN_MORE"
    SHOP_NOW = "SHOP_NOW"
    SIGN_UP = "SIGN_UP"
    SUBSCRIBE = "SUBSCRIBE"
    CONTACT_US = "CONTACT_US"
    DOWNLOAD = "DOWNLOAD"
    GET_QUOTE = "GET_QUOTE"
    BOOK_TRAVEL = "BOOK_TRAVEL"
    SEND_MESSAGE = "SEND_MESSAGE"
    CALL_NOW = "CALL_NOW"
    APPLY_NOW = "APPLY_NOW"
    BUY_NOW = "BUY_NOW"
    ORDER_NOW = "ORDER_NOW"
    GET_OFFER = "GET_OFFER"
    GET_DIRECTIONS = "GET_DIRECTIONS"
    WHATSAPP_MESSAGE = "WHATSAPP_MESSAGE"
    WATCH_MORE = "WATCH_MORE"
    DONATE_NOW = "DONATE_NOW"
    INSTALL_APP = "INSTALL_APP"
    USE_APP = "USE_APP"
    # Additional v24.0 2026 CTAs
    BOOK_NOW = "BOOK_NOW"
    PLAY_GAME = "PLAY_GAME"
    LISTEN_NOW = "LISTEN_NOW"
    SEE_MORE = "SEE_MORE"
    REQUEST_TIME = "REQUEST_TIME"
    GET_SHOWTIMES = "GET_SHOWTIMES"
    OPEN_LINK = "OPEN_LINK"
    EVENT_RSVP = "EVENT_RSVP"
    VOTE_NOW = "VOTE_NOW"
    FOLLOW_PAGE = "FOLLOW_PAGE"
    SEND_WHATSAPP_MESSAGE = "SEND_WHATSAPP_MESSAGE"
    MESSAGE_PAGE = "MESSAGE_PAGE"


class AdType(str, Enum):
    """Ad creative types"""
    SINGLE_IMAGE = "single_image"
    SINGLE_VIDEO = "single_video"
    CAROUSEL = "carousel"
    COLLECTION = "collection"
    INSTANT_EXPERIENCE = "instant_experience"


class DraftStatus(str, Enum):
    """Draft status values"""
    DRAFT = "draft"
    PENDING = "pending"
    PUBLISHED = "published"
    FAILED = "failed"


class LookalikeType(str, Enum):
    """
    Lookalike audience type - v24.0 2026
    Required in lookalike_spec from January 6, 2026
    """
    SIMILARITY = "similarity"
    REACH = "reach"
    CUSTOM_RATIO = "custom_ratio"


class AudienceSubtype(str, Enum):
    """Custom audience subtypes"""
    CUSTOM = "CUSTOM"
    WEBSITE = "WEBSITE"
    APP = "APP"
    OFFLINE_CONVERSION = "OFFLINE_CONVERSION"
    CLAIM = "CLAIM"
    PARTNER = "PARTNER"
    VIDEO = "VIDEO"
    LOOKALIKE = "LOOKALIKE"
    ENGAGEMENT = "ENGAGEMENT"
    DATA_SET = "DATA_SET"
    BAG_OF_ACCOUNTS = "BAG_OF_ACCOUNTS"
    STUDY_RULE_AUDIENCE = "STUDY_RULE_AUDIENCE"
    FOX = "FOX"


class PlacementSoftOptOut(str, Enum):
    """
    Placement soft opt out options - v24.0 2026 (2026 standards)
    Allows up to 5% budget on excluded placements for better performance
    Available for OUTCOME_SALES and OUTCOME_LEADS objectives
    """
    TRUE = "true"
    FALSE = "false"


class MediaTypeAutomation(str, Enum):
    """
    Media type automation for Advantage+ Catalog Ads - v24.0 2026
    Defaults to OPT_IN from September 2025
    """
    OPT_IN = "OPT_IN"
    OPT_OUT = "OPT_OUT"


class BuyingType(str, Enum):
    """Campaign buying type"""
    AUCTION = "AUCTION"
    RESERVED = "RESERVED"


# ============================================================================
# TARGETING SCHEMAS - v24.0 2026
# ============================================================================

class GeoLocations(BaseModel):
    """Geographic targeting specification"""
    countries: Optional[List[str]] = None
    regions: Optional[List[Dict[str, Any]]] = None
    cities: Optional[List[Dict[str, Any]]] = None
    zips: Optional[List[Dict[str, str]]] = None
    location_types: Optional[List[str]] = None  # home, recent, travel_in
    geo_markets: Optional[List[Dict[str, Any]]] = None
    electoral_districts: Optional[List[Dict[str, Any]]] = None
    country_groups: Optional[List[str]] = None


class TargetingEntity(BaseModel):
    """Interest/behavior targeting entity"""
    id: Union[str, int]
    name: Optional[str] = None


class FlexibleSpec(BaseModel):
    """
    Flexible targeting spec for AND/OR combinations
    Used for advanced interest/behavior targeting
    """
    interests: Optional[List[TargetingEntity]] = None
    behaviors: Optional[List[TargetingEntity]] = None
    life_events: Optional[List[TargetingEntity]] = None
    industries: Optional[List[TargetingEntity]] = None
    income: Optional[List[TargetingEntity]] = None
    family_statuses: Optional[List[TargetingEntity]] = None
    work_employers: Optional[List[TargetingEntity]] = None
    work_positions: Optional[List[TargetingEntity]] = None
    education_schools: Optional[List[TargetingEntity]] = None
    education_majors: Optional[List[TargetingEntity]] = None


class TargetingSpec(BaseModel):
    """
    Complete targeting specification - v24.0 2026
    Supports all Meta targeting options
    """
    geo_locations: Optional[GeoLocations] = None
    excluded_geo_locations: Optional[GeoLocations] = None
    age_min: Optional[int] = Field(None, ge=13, le=65)
    age_max: Optional[int] = Field(None, ge=13, le=65)
    genders: Optional[List[int]] = None  # 0=all, 1=male, 2=female
    
    # Interest targeting
    interests: Optional[List[TargetingEntity]] = None
    behaviors: Optional[List[TargetingEntity]] = None
    
    # Flexible specs for AND/OR targeting
    flexible_spec: Optional[List[FlexibleSpec]] = None
    exclusions: Optional[FlexibleSpec] = None
    
    # Audience targeting
    custom_audiences: Optional[List[Dict[str, str]]] = None
    excluded_custom_audiences: Optional[List[Dict[str, str]]] = None
    
    # Device/Platform targeting
    device_platforms: Optional[List[str]] = None  # mobile, desktop
    user_device: Optional[List[str]] = None
    user_os: Optional[List[str]] = None
    wireless_carrier: Optional[List[str]] = None
    
    # Placement targeting
    publisher_platforms: Optional[List[str]] = None  # facebook, instagram, audience_network, messenger
    facebook_positions: Optional[List[str]] = None
    instagram_positions: Optional[List[str]] = None
    audience_network_positions: Optional[List[str]] = None
    messenger_positions: Optional[List[str]] = None
    
    # Connection targeting
    connections: Optional[List[Dict[str, str]]] = None
    excluded_connections: Optional[List[Dict[str, str]]] = None
    friends_of_connections: Optional[List[Dict[str, str]]] = None
    
    # Locales/Languages
    locales: Optional[List[int]] = None


class PromotedObject(BaseModel):
    """
    Promoted object for conversion tracking - v24.0 2026
    Required for iOS 14+ campaigns and conversion optimization
    """
    page_id: Optional[str] = None
    pixel_id: Optional[str] = None
    application_id: Optional[str] = None
    object_store_url: Optional[str] = None
    custom_event_type: Optional[str] = None
    custom_event_str: Optional[str] = None
    offer_id: Optional[str] = None
    product_catalog_id: Optional[str] = None
    product_set_id: Optional[str] = None
    event_id: Optional[str] = None
    offline_conversion_data_set_id: Optional[str] = None
    instagram_profile_id: Optional[str] = None
    conversion_goal_id: Optional[str] = None
    mcme_conversion_id: Optional[str] = None


class AttributionSpec(BaseModel):
    """Attribution specification for conversion tracking"""
    event_type: str  # CLICK_THROUGH, VIEW_THROUGH
    window_days: int  # Click: 1, 7, 28 | View: 1 (7/28 Deprecated)
    weight: Optional[float] = 100

    @field_validator('window_days')
    @classmethod
    def validate_window(cls, v, info):
        # Jan 2026 Deprecation: 7-day and 28-day view-through windows are no longer supported.
        # Only 1-day view-through is allowed.
        # Click-through still supports 1, 7, 28.
        if info.data.get('event_type') == 'VIEW_THROUGH' and v > 1:
            raise ValueError('View-through attribution is strictly limited to 1 day as of 2026 (v24.0 2026 standards)')
        return v


# ============================================================================
# LOOKALIKE AUDIENCE SPECS - v24.0 2026 (Mandatory per 2026 standards)
# ============================================================================

class LookalikeSpec(BaseModel):
    """
    Lookalike audience specification - v24.0 2026 MANDATORY per 2026 standards
    
    All fields are required for creating new lookalike audiences.
    """
    country: str = Field(..., description="ISO 2-letter country code (e.g., 'US', 'GB')")
    ratio: float = Field(..., ge=0.01, le=0.20, description="Similarity ratio 1%-20%")
    type: LookalikeType = Field(default=LookalikeType.SIMILARITY, description="Lookalike type")
    origin_audience_id: Optional[str] = Field(None, description="Source custom audience ID")
    starting_ratio: Optional[float] = Field(None, description="Starting ratio for custom_ratio type")
    
    @field_validator('ratio')
    @classmethod
    def validate_ratio(cls, v):
        if v < 0.01 or v > 0.20:
            raise ValueError('Ratio must be between 0.01 (1%) and 0.20 (20%)')
        return v


# ============================================================================
# CAMPAIGN SCHEMAS - v24.0 2026
# ============================================================================




class UpdateCampaignRequest(BaseModel):
    """Request to update a campaign"""
    name: Optional[str] = Field(None, max_length=255)
    status: Optional[CampaignStatus] = None
    budget_amount: Optional[float] = None
    bid_strategy: Optional[BidStrategy] = None
    end_time: Optional[str] = None


class CampaignInsights(BaseModel):
    """Campaign performance insights - v24.0 2026 metrics"""
    impressions: Optional[int] = 0
    reach: Optional[int] = 0
    clicks: Optional[int] = 0
    spend: Optional[float] = 0
    cpc: Optional[float] = 0
    cpm: Optional[float] = 0
    ctr: Optional[float] = 0
    frequency: Optional[float] = None
    conversions: Optional[int] = None
    cost_per_conversion: Optional[float] = None
    roas: Optional[float] = None  # Return on Ad Spend
    # New v24.0 2026 metrics
    instagram_profile_visits: Optional[int] = None


class AdvantageStateInfo(BaseModel):
    """
    Read-only Advantage+ state information (v24.0 2026)
    
    A campaign achieves Advantage+ status when ALL three levers are ENABLED:
    - advantage_budget_state: Campaign-level budget is set
    - advantage_audience_state: Advantage+ Audience is enabled
    - advantage_placement_state: No placement exclusions
    
    Maps to advantage_state values:
    - OUTCOME_SALES -> ADVANTAGE_PLUS_SALES
    - OUTCOME_APP_PROMOTION -> ADVANTAGE_PLUS_APP
    - OUTCOME_LEADS -> ADVANTAGE_PLUS_LEADS
    """
    advantage_state: str = "DISABLED"  # ADVANTAGE_PLUS_SALES, ADVANTAGE_PLUS_APP, ADVANTAGE_PLUS_LEADS, or DISABLED
    advantage_budget_state: str = "DISABLED"  # ENABLED or DISABLED
    advantage_audience_state: str = "DISABLED"  # ENABLED or DISABLED
    advantage_placement_state: str = "DISABLED"  # ENABLED or DISABLED


class CampaignResponse(BaseModel):
    """Campaign response model - v24.0 2026"""
    id: str
    name: str
    objective: str
    status: str
    effective_status: Optional[str] = None
    buying_type: Optional[str] = "AUCTION"
    bid_strategy: Optional[str] = None
    daily_budget: Optional[int] = None
    lifetime_budget: Optional[int] = None
    special_ad_categories: Optional[List[str]] = None
    is_campaign_budget_optimization: Optional[bool] = None
    created_time: Optional[str] = None
    updated_time: Optional[str] = None
    start_time: Optional[str] = None
    stop_time: Optional[str] = None
    insights: Optional[CampaignInsights] = None
    # v24.0 2026 Advantage+ state information
    advantage_state_info: Optional[AdvantageStateInfo] = None


# ============================================================================
# AD SET SCHEMAS - v24.0 2026
# ============================================================================

class AdSetSchedule(BaseModel):
    """Ad set schedule for dayparting"""
    start_minute: int = Field(..., ge=0, le=1439)
    end_minute: int = Field(..., ge=0, le=1439)
    days: List[int]  # 0=Sunday, 6=Saturday
    timezone_type: Optional[str] = "USER"


class CreateAdSetRequest(BaseModel):
    """
    Request to create an ad set - v24.0 2026
    
    New v24.0 2026 fields:
    - is_adset_budget_sharing_enabled: Share up to 20% budget with other ad sets
    - placement_soft_opt_out: Allow 5% spend on excluded placements
    """
    name: str = Field(..., min_length=1, max_length=255)
    campaign_id: str
    status: Optional[AdSetStatus] = AdSetStatus.PAUSED
    
    # Optimization
    optimization_goal: Optional[str] = None
    billing_event: Optional[BillingEvent] = BillingEvent.IMPRESSIONS
    
    # Bidding
    bid_strategy: Optional[BidStrategy] = None
    bid_amount: Optional[float] = None  # In dollars (converted to cents by service layer)
    
    # Budget
    budget_type: Optional[str] = "daily"
    budget_amount: Optional[float] = 10.0
    daily_min_spend_target: Optional[float] = None
    daily_spend_cap: Optional[float] = None
    
    # v24.0 2026 NEW: Ad Set Budget Sharing
    is_adset_budget_sharing_enabled: Optional[bool] = None
    
    # Schedule
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    adset_schedule: Optional[List[AdSetSchedule]] = None
    
    # Targeting
    targeting: Optional[TargetingSpec] = None
    
    # v24.0 2026 Advantage+ Audience - defaults to True per Meta API v24.0 2026
    # When enabled, detailed targeting becomes advisory (signals)
    advantage_audience: Optional[bool] = True
    
    # Destination
    destination_type: Optional[DestinationType] = None
    promoted_object: Optional[PromotedObject] = None
    
    # v24.0 2026 NEW: Placement soft opt out
    placement_soft_opt_out: Optional[bool] = None
    
    # Attribution
    attribution_spec: Optional[List[AttributionSpec]] = None
    
    # Page/Creative defaults
    page_id: Optional[str] = None


class UpdateAdSetRequest(BaseModel):
    """Request to update an ad set - v24.0 2026"""
    name: Optional[str] = Field(None, max_length=255)
    status: Optional[AdSetStatus] = None
    budget_amount: Optional[float] = None
    budget_type: Optional[str] = None  # 'daily' or 'lifetime'
    bid_amount: Optional[float] = None  # In dollars (converted to cents by service layer)
    targeting: Optional[TargetingSpec] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    daily_spend_cap: Optional[float] = None
    
    # v24.0 2026 Updates
    advantage_audience: Optional[bool] = None
    is_adset_budget_sharing_enabled: Optional[bool] = None
    placement_soft_opt_out: Optional[bool] = None
    attribution_spec: Optional[List[AttributionSpec]] = None


class AdSetResponse(BaseModel):
    """Ad set response model - v24.0 2026"""
    id: str
    name: str
    campaign_id: str
    status: str
    effective_status: Optional[str] = None
    optimization_goal: str
    billing_event: Optional[str] = None
    bid_strategy: Optional[str] = None
    bid_amount: Optional[int] = None
    daily_budget: Optional[int] = None
    lifetime_budget: Optional[int] = None
    is_adset_budget_sharing_enabled: Optional[bool] = None
    destination_type: Optional[str] = None
    targeting: Optional[Dict[str, Any]] = None
    promoted_object: Optional[Dict[str, Any]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    created_time: Optional[str] = None
    updated_time: Optional[str] = None
    insights: Optional[Dict[str, Any]] = None


# ============================================================================
# AD CREATIVE SCHEMAS - v24.0 2026
# ============================================================================

class LinkData(BaseModel):
    """Link data for object_story_spec"""
    link: str
    message: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    caption: Optional[str] = None
    image_hash: Optional[str] = None
    picture: Optional[str] = None
    call_to_action: Optional[Dict[str, Any]] = None


class VideoData(BaseModel):
    """Video data for object_story_spec"""
    video_id: str
    message: Optional[str] = None
    title: Optional[str] = None
    image_hash: Optional[str] = None
    call_to_action: Optional[Dict[str, Any]] = None


class PhotoData(BaseModel):
    """Photo data for object_story_spec"""
    image_hash: str
    message: Optional[str] = None
    caption: Optional[str] = None


class ObjectStorySpec(BaseModel):
    """
    Object story specification for ad creatives - v24.0 2026
    Creates an unpublished page post for the ad
    """
    page_id: str

    instagram_user_id: Optional[str] = None
    link_data: Optional[LinkData] = None
    video_data: Optional[VideoData] = None
    photo_data: Optional[PhotoData] = None


class CarouselItem(BaseModel):
    """Carousel ad item"""
    image_url: Optional[str] = None
    image_hash: Optional[str] = None
    video_id: Optional[str] = None
    title: Optional[str] = Field(None, max_length=40)
    description: Optional[str] = Field(None, max_length=125)
    link: Optional[str] = None
    call_to_action: Optional[Dict[str, Any]] = None


class AdCreative(BaseModel):
    """
    Ad creative specification - v24.0 2026
    
    Note: For v24.0 2026, prefer using object_story_spec for new creatives
    """
    title: Optional[str] = Field(None, max_length=40)
    body: Optional[str] = Field(None, max_length=125)
    call_to_action_type: Optional[CallToActionType] = None
    link_url: Optional[str] = None
    
    # Image/Video
    image_url: Optional[str] = None
    image_hash: Optional[str] = None
    video_id: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    
    # Carousel
    carousel_items: Optional[List[CarouselItem]] = None
    
    # Object Story Spec (preferred for v24.0 2026)
    object_story_spec: Optional[ObjectStorySpec] = None
    
    # v24.0 2026: Media type automation for Advantage+ Catalog Ads
    media_type_automation: Optional[MediaTypeAutomation] = None
    
    # v24.0 2026 Advantage+ Creative (Standard Enhancements)
    advantage_plus_creative: Optional[bool] = True
    
    # v24.0 2026: Granular AI Enhancement Levers (degrees_of_freedom_spec)
    # Dictionary containing creative_features_spec with supported fields:
    # Core Features (pre-2026):
    #   - standard_enhancements: Bundle of basic AI optimizations
    #   - image_enhancement: Image touch-ups and adjustments
    #   - video_auto_crop: Automatic aspect ratio adjustment for videos
    #   - text_optimizations: AI-powered text optimization
    #   - image_templates: Apply templates to images for better placement fit
    #   - adapt_to_placement: 9:16 image display in Stories/Reels
    # New 2026 Features (v24.0 2026):
    #   - inline_comment: Display relevant comments below ad for social proof
    #   - expand_image: AI-powered image expansion for better placement coverage
    #   - dynamic_media: Display catalog videos alongside images (e-commerce)
    #   - add_stickers: AI-generated creative stickers
    #   - description_automation: Automated description generation
    degrees_of_freedom_spec: Optional[Dict[str, Any]] = None
    
    # v24.0 2026: Ad Disclaimer (Legal/Political Disclosure)
    ad_disclaimer_spec: Optional[Dict[str, Any]] = None
    
    # v24.0 2026: Gen AI Disclosure (Required for AI-generated content)
    gen_ai_disclosure: Optional[bool] = False
    
    # v24.0 2026: Format Automation for Catalog Ads
    format_automation: Optional[bool] = False
    product_set_id: Optional[str] = None
    
    @field_validator('carousel_items')
    @classmethod
    def validate_carousel(cls, v):
        if v is not None:
            if len(v) < 2:
                raise ValueError('Carousel must have at least 2 items')
            if len(v) > 10:
                raise ValueError('Carousel can have at most 10 items')
        return v


class CreateAdRequest(BaseModel):
    """Request to create an ad"""
    name: str = Field(..., min_length=1, max_length=255)
    adset_id: str
    status: Optional[AdStatus] = AdStatus.PAUSED
    creative: AdCreative
    page_id: Optional[str] = None
    tracking_specs: Optional[List[Dict[str, Any]]] = None
    conversion_domain: Optional[str] = None


class UpdateAdRequest(BaseModel):
    """Request to update an ad"""
    status: Optional[AdStatus] = None
    name: Optional[str] = Field(None, max_length=255)


class AdResponse(BaseModel):
    """Ad response model - v24.0 2026"""
    id: str
    name: str
    adset_id: str
    campaign_id: Optional[str] = None
    status: str
    effective_status: Optional[str] = None
    creative: Optional[Dict[str, Any]] = None
    tracking_specs: Optional[List[Dict[str, Any]]] = None
    created_time: Optional[str] = None
    updated_time: Optional[str] = None
    insights: Optional[Dict[str, Any]] = None


# ============================================================================
# AD DRAFT SCHEMAS
# ============================================================================

class CreateAdDraftRequest(BaseModel):
    """Request to create or update an ad draft"""
    ad_type: AdType = AdType.SINGLE_IMAGE
    platform: Optional[str] = "facebook"
    objective: Optional[str] = None
    optimization_goal: Optional[str] = None
    billing_event: Optional[str] = "IMPRESSIONS"
    creative: Dict[str, Any] = Field(default_factory=dict)
    targeting: Optional[Dict[str, Any]] = None
    budget: Optional[Dict[str, Any]] = None
    schedule: Optional[Dict[str, Any]] = None
    campaign_name: Optional[str] = None
    adset_name: Optional[str] = None
    ad_name: Optional[str] = None
    destination_type: Optional[str] = None
    bid_strategy: Optional[str] = None


class AdDraftResponse(BaseModel):
    """Ad draft response model"""
    id: str
    workspace_id: str
    user_id: str
    platform: Optional[str] = "facebook"
    ad_type: str
    status: str
    creative: Dict[str, Any]
    targeting: Optional[Dict[str, Any]] = None
    budget: Optional[Dict[str, Any]] = None
    schedule: Optional[Dict[str, Any]] = None
    campaign_name: Optional[str] = None
    adset_name: Optional[str] = None
    ad_name: Optional[str] = None
    meta_ad_id: Optional[str] = None
    meta_campaign_id: Optional[str] = None
    meta_adset_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================================================
# AUDIENCE SCHEMAS - v24.0 2026
# ============================================================================

class CreateCustomAudienceRequest(BaseModel):
    """Request to create a custom audience - v24.0 2026"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    subtype: AudienceSubtype = AudienceSubtype.CUSTOM
    customer_file_source: Optional[str] = "USER_PROVIDED_ONLY"
    retention_days: Optional[int] = Field(30, ge=1, le=365)
    
    # For website/app audiences
    rule: Optional[Dict[str, Any]] = None
    
    # For lookalike audiences (use CreateLookalikeRequest instead)
    lookalike_spec: Optional[LookalikeSpec] = None


class CreateLookalikeRequest(BaseModel):
    """
    Request to create a lookalike audience - v24.0 2026
    
    IMPORTANT: From January 6, 2026, lookalike_spec is MANDATORY
    """
    name: str = Field(..., min_length=1, max_length=255)
    source_audience_id: str = Field(..., description="Origin custom audience ID")
    lookalike_spec: LookalikeSpec = Field(..., description="Required lookalike specification")


class AudienceResponse(BaseModel):
    """Custom audience response"""
    id: str
    name: str
    description: Optional[str] = None
    subtype: Optional[str] = None
    approximate_count: Optional[int] = None
    approximate_count_lower_bound: Optional[int] = None
    approximate_count_upper_bound: Optional[int] = None
    retention_days: Optional[int] = None
    time_created: Optional[str] = None
    time_updated: Optional[str] = None
    lookalike_spec: Optional[Dict[str, Any]] = None
    delivery_status: Optional[Dict[str, Any]] = None
    operation_status: Optional[Dict[str, Any]] = None
    permission_for_actions: Optional[Dict[str, Any]] = None
    is_value_based: Optional[bool] = None


class AudienceListResponse(BaseModel):
    """Response for audience list"""
    audiences: List[AudienceResponse] = []


# ============================================================================
# STATUS & RESPONSE SCHEMAS - v24.0 2026
# ============================================================================

class AdAccountInfo(BaseModel):
    """Ad account information"""
    id: Optional[str] = None
    account_id: Optional[str] = None
    name: Optional[str] = None
    currency: str = "USD"
    timezone_name: str = "America/Los_Angeles"
    timezone_offset_hours_utc: Optional[int] = None
    amount_spent: Optional[str] = None
    balance: Optional[str] = None
    spend_cap: Optional[str] = None
    business: Optional[Dict[str, Any]] = None
    funding_source: Optional[str] = None
    capabilities: Optional[List[str]] = None


class PageInfo(BaseModel):
    """Facebook page information"""
    id: str
    name: Optional[str] = None
    access_token: Optional[str] = None
    category: Optional[str] = None


class PlatformStatus(BaseModel):
    """Platform connection status"""
    isConnected: bool
    username: Optional[str] = None
    pageId: Optional[str] = None
    pageName: Optional[str] = None
    adAccountId: Optional[str] = None
    adAccountName: Optional[str] = None


class MetaAdsStatusResponse(BaseModel):
    """Meta Ads connection status response"""
    isConnected: bool
    canRunAds: bool = False
    tokenExpired: Optional[bool] = None
    tokenExpiresSoon: Optional[bool] = None
    expiresAt: Optional[str] = None
    adAccount: Optional[AdAccountInfo] = None
    page: Optional[PageInfo] = None
    platforms: Optional[Dict[str, Any]] = None
    missingForAds: Optional[List[str]] = None
    businessPortfolios: Optional[List[Dict[str, Any]]] = None
    message: Optional[str] = None
    error: Optional[str] = None


class BusinessInfo(BaseModel):
    """Business portfolio info"""
    id: str
    name: str
    adAccounts: Optional[List[Dict[str, Any]]] = None
    pages: Optional[List[Dict[str, Any]]] = None


class SwitchBusinessRequest(BaseModel):
    """Request to switch business portfolio"""
    businessId: str
    adAccountId: Optional[str] = None


class CampaignListResponse(BaseModel):
    """Response for campaign list"""
    campaigns: List[CampaignResponse] = []
    adSets: List[AdSetResponse] = []
    ads: List[AdResponse] = []


class OAuthUrlResponse(BaseModel):
    """OAuth URL response"""
    url: str


class SuccessResponse(BaseModel):
    """Generic success response"""
    success: bool
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    """Error response"""
    error: str
    message: Optional[str] = None
    details: Optional[Any] = None
    error_code: Optional[int] = None
    error_user_title: Optional[str] = None
    error_user_msg: Optional[str] = None


# ============================================================================
# INSIGHTS SCHEMAS - v24.0 2026
# ============================================================================

class DatePreset(str, Enum):
    """Date presets for insights queries"""
    TODAY = "today"
    YESTERDAY = "yesterday"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    THIS_QUARTER = "this_quarter"
    LIFETIME = "lifetime"
    LAST_3D = "last_3d"
    LAST_7D = "last_7d"
    LAST_14D = "last_14d"
    LAST_28D = "last_28d"
    LAST_30D = "last_30d"
    LAST_90D = "last_90d"
    LAST_WEEK_MON_SUN = "last_week_mon_sun"
    LAST_WEEK_SUN_SAT = "last_week_sun_sat"
    LAST_QUARTER = "last_quarter"
    LAST_YEAR = "last_year"
    THIS_WEEK_MON_TODAY = "this_week_mon_today"
    THIS_WEEK_SUN_TODAY = "this_week_sun_today"
    THIS_YEAR = "this_year"


class InsightsRequest(BaseModel):
    """Request for insights data - v24.0 2026 compliant"""
    date_preset: Optional[DatePreset] = DatePreset.LAST_7D
    time_range: Optional[Dict[str, str]] = None  # {'since': 'YYYY-MM-DD', 'until': 'YYYY-MM-DD'}
    level: Optional[str] = "account"  # account, campaign, adset, ad
    fields: Optional[List[str]] = None
    breakdowns: Optional[List[str]] = None  # age, gender, country, publisher_platform
    action_attribution_windows: Optional[List[str]] = None  # 1d_click, 7d_click, 1d_view
    filtering: Optional[List[Dict[str, Any]]] = None
    sort: Optional[List[str]] = None
    limit: Optional[int] = 100


class ActionType(BaseModel):
    """Action type data from Meta Insights"""
    action_type: str
    value: Optional[str] = None
    one_day_click: Optional[str] = Field(None, alias="1d_click")
    seven_day_click: Optional[str] = Field(None, alias="7d_click")
    one_day_view: Optional[str] = Field(None, alias="1d_view")
    
    model_config = {"populate_by_name": True}


class InsightData(BaseModel):
    """Individual insight data row - v24.0 2026"""
    date_start: Optional[str] = None
    date_stop: Optional[str] = None
    impressions: Optional[str] = None
    reach: Optional[str] = None
    frequency: Optional[str] = None
    spend: Optional[str] = None
    clicks: Optional[str] = None
    cpc: Optional[str] = None
    cpm: Optional[str] = None
    ctr: Optional[str] = None
    actions: Optional[List[Dict[str, Any]]] = None
    cost_per_action_type: Optional[List[Dict[str, Any]]] = None
    conversions: Optional[List[Dict[str, Any]]] = None
    conversion_values: Optional[List[Dict[str, Any]]] = None
    purchase_roas: Optional[List[Dict[str, Any]]] = None
    # Breakdown fields
    age: Optional[str] = None
    gender: Optional[str] = None
    country: Optional[str] = None
    publisher_platform: Optional[str] = None


class InsightsResponse(BaseModel):
    """Insights response - v24.0 2026"""
    success: bool = True
    data: List[Dict[str, Any]] = []
    paging: Optional[Dict[str, Any]] = None
    summary: Optional[Dict[str, Any]] = None
