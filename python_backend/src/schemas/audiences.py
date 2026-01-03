"""
Audiences Schemas
Meta Marketing API Custom & Lookalike Audiences

Features:
- Custom Audience creation
- Lookalike Audience creation
- Audience size estimation
- Audience combining
"""
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class AudienceSubtype(str, Enum):
    """Types of custom audiences"""
    WEBSITE = "WEBSITE"
    APP = "APP"
    OFFLINE_CONVERSION = "OFFLINE_CONVERSION"
    ENGAGEMENT = "ENGAGEMENT"
    CUSTOMER_FILE = "CUSTOMER_FILE"
    VIDEO = "VIDEO"
    LEAD_AD = "LEAD_AD"
    LOOKALIKE = "LOOKALIKE"


class AudienceSource(str, Enum):
    """Source for custom audience"""
    PIXEL = "PIXEL"
    APP_INSTALLS = "APP_INSTALLS"
    APP_ACTIVITY = "APP_ACTIVITY"
    CUSTOMER_LIST = "CUSTOMER_LIST"
    FACEBOOK_PAGE = "FACEBOOK_PAGE"
    INSTAGRAM = "INSTAGRAM"
    VIDEO_VIEWS = "VIDEO_VIEWS"
    LEAD_FORM = "LEAD_FORM"


class RetentionDays(int, Enum):
    """Retention period options"""
    DAYS_1 = 1
    DAYS_7 = 7
    DAYS_14 = 14
    DAYS_30 = 30
    DAYS_60 = 60
    DAYS_90 = 90
    DAYS_180 = 180
    DAYS_365 = 365


class WebsiteEventType(str, Enum):
    """Website events for custom audiences"""
    ALL_VISITORS = "ALL_VISITORS"
    PAGE_VISITORS = "PAGE_VISITORS"
    PURCHASE = "PURCHASE"
    ADD_TO_CART = "ADD_TO_CART"
    VIEW_CONTENT = "VIEW_CONTENT"
    LEAD = "LEAD"
    COMPLETE_REGISTRATION = "COMPLETE_REGISTRATION"
    INITIATE_CHECKOUT = "INITIATE_CHECKOUT"
    SEARCH = "SEARCH"
    CUSTOM_EVENT = "CUSTOM_EVENT"


# =============================================================================
# ENGAGEMENT AUDIENCES - per Meta v25.0+ docs
# =============================================================================

class EngagementSourceType(str, Enum):
    """Event source types for engagement audiences - per Meta docs"""
    PAGE = "page"  # Facebook Page
    LEAD = "lead"  # Lead form
    IG_LEAD_GENERATION = "ig_lead_generation"  # Instagram lead form
    CANVAS = "canvas"  # Instant Experience
    IG_BUSINESS = "ig_business"  # Instagram business profile
    SHOPPING_PAGE = "shopping_page"  # Facebook Shop
    SHOPPING_IG = "shopping_ig"  # Instagram Shop
    AR_EXPERIENCE = "ar_experience"  # AR effects in ads
    AR_EFFECTS = "ar_effects"  # FB/IG AR effects


class PageEngagementEvent(str, Enum):
    """Facebook Page engagement events - per Meta docs"""
    PAGE_ENGAGED = "page_engaged"  # Most inclusive - all page interactions
    PAGE_VISITED = "page_visited"
    PAGE_LIKED = "page_liked"  # Current page likers
    PAGE_MESSAGED = "page_messaged"
    PAGE_CTA_CLICKED = "page_cta_clicked"  # Call-to-action clicks
    PAGE_OR_POST_SAVE = "page_or_post_save"
    PAGE_POST_INTERACTION = "page_post_interaction"  # Reactions, shares, comments


class LeadFormEvent(str, Enum):
    """Lead form engagement events - per Meta docs"""
    LEAD_GENERATION_SUBMITTED = "lead_generation_submitted"  # Completed form
    LEAD_GENERATION_DROPOFF = "lead_generation_dropoff"  # Closed without submit
    LEAD_GENERATION_OPENED = "lead_generation_opened"  # Opened form


class InstagramEngagementEvent(str, Enum):
    """Instagram business profile engagement events - per Meta docs"""
    IG_USER_ENGAGED = "ig_user_engaged"  # All IG engagement
    IG_USER_VISITED_PROFILE = "ig_user_visited_profile"
    IG_USER_FOLLOWED = "ig_user_followed"
    IG_USER_MESSAGED = "ig_user_messaged"
    IG_USER_SAVED_MEDIA = "ig_user_saved_media"


class CustomerFileSource(str, Enum):
    """Customer file source types - per Meta docs"""
    USER_PROVIDED_ONLY = "USER_PROVIDED_ONLY"  # Directly from customers
    PARTNER_PROVIDED_ONLY = "PARTNER_PROVIDED_ONLY"  # From partners/agencies
    BOTH_USER_AND_PARTNER_PROVIDED = "BOTH_USER_AND_PARTNER_PROVIDED"


class CreateCustomAudienceRequest(BaseModel):
    """Request to create a custom audience - per Meta v25.0+ docs"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    subtype: AudienceSubtype
    
    # For WEBSITE audiences
    pixel_id: Optional[str] = None
    rule: Optional[Dict[str, Any]] = None
    event_type: Optional[WebsiteEventType] = None
    retention_days: int = Field(default=30, ge=1, le=365)
    
    # For CUSTOMER_FILE audiences - per Meta docs
    customer_file_source: Optional[CustomerFileSource] = None
    
    # For ENGAGEMENT audiences - per Meta docs
    engagement_source_type: Optional[EngagementSourceType] = None
    engagement_source_id: Optional[str] = Field(
        default=None,
        description="ID of engagement object (Page ID, Form ID, IG Profile ID)"
    )
    engagement_event: Optional[str] = Field(
        default=None,
        description="Engagement event type (page_engaged, lead_generation_submitted, etc.)"
    )
    prefill: bool = Field(
        default=True,
        description="Prefill audience with existing matching users"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Website Visitors - Last 30 Days",
                "subtype": "WEBSITE",
                "pixel_id": "123456789",
                "event_type": "ALL_VISITORS",
                "retention_days": 30
            }
        }


class CreateLookalikeRequest(BaseModel):
    """Request to create a lookalike audience"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    source_audience_id: str = Field(..., description="ID of source custom audience")
    target_countries: List[str] = Field(
        ...,
        min_length=1,
        description="ISO country codes (e.g., ['US', 'CA'])"
    )
    ratio: float = Field(
        default=0.01,
        ge=0.01,
        le=0.20,
        description="0.01 = 1% most similar (smallest), 0.20 = 20% (largest)"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Lookalike - Top Customers 1%",
                "source_audience_id": "23456789",
                "target_countries": ["US"],
                "ratio": 0.01
            }
        }


class AudienceResponse(BaseModel):
    """Response after creating audience"""
    success: bool
    audience_id: Optional[str] = None
    name: Optional[str] = None
    subtype: Optional[str] = None
    approximate_count: Optional[int] = None
    error: Optional[str] = None


class AudienceListItem(BaseModel):
    """Audience in list view - per Meta v25.0+ docs"""
    id: str
    name: str
    subtype: AudienceSubtype
    approximate_count: Optional[int] = None
    description: Optional[str] = None
    time_created: Optional[datetime] = None
    time_updated: Optional[datetime] = None
    is_value_based: bool = False
    lookalike_spec: Optional[Dict[str, Any]] = None
    
    # Flagged audience detection - per Meta docs (Sept 2025+)
    # operation_status 471 = audience flagged for sensitive content
    operation_status: Optional[int] = None
    is_flagged: bool = Field(
        default=False,
        description="True if operation_status=471 (flagged for sensitive content)"
    )


class AudienceSizeEstimate(BaseModel):
    """Size estimation for an audience"""
    audience_id: str
    count: int
    lower_bound: Optional[int] = None
    upper_bound: Optional[int] = None
    is_ready: bool = True


class CombineAudiencesRequest(BaseModel):
    """Request to combine audiences"""
    name: str
    operation: str = Field(
        default="INCLUDE",
        description="INCLUDE (union), EXCLUDE (difference)"
    )
    audience_ids: List[str] = Field(..., min_length=2)


# =============================================================================
# LOOKALIKE RATIO EXPLANATIONS
# =============================================================================

LOOKALIKE_RATIOS = [
    {"value": 0.01, "label": "1%", "description": "Smallest, most similar to source"},
    {"value": 0.02, "label": "2%", "description": "Very similar"},
    {"value": 0.03, "label": "3%", "description": "Similar"},
    {"value": 0.05, "label": "5%", "description": "Balanced reach & similarity"},
    {"value": 0.10, "label": "10%", "description": "Broader reach"},
    {"value": 0.20, "label": "20%", "description": "Largest reach, less similar"},
]

# Minimum source audience sizes
MIN_SOURCE_AUDIENCE_SIZE = 100
RECOMMENDED_SOURCE_SIZE = 1000


# =============================================================================
# CUSTOMER DATA UPLOAD - per Meta v25.0+ docs
# =============================================================================

class CustomerDataField(str, Enum):
    """
    Customer data field types for upload - per Meta v25.0+ docs
    All fields (except EXTERN_ID) are normalized and SHA256 hashed before sending
    """
    EMAIL = "EMAIL"  # Lowercase, trimmed
    PHONE = "PHONE"  # Digits only, with country code
    FN = "FN"  # First name - lowercase, no punctuation
    LN = "LN"  # Last name - lowercase, no punctuation
    CT = "CT"  # City - lowercase
    ST = "ST"  # State - 2-char code, lowercase
    ZIP = "ZIP"  # Zip/postal code - lowercase
    COUNTRY = "COUNTRY"  # 2-char ISO code, lowercase
    DOBY = "DOBY"  # Year of birth - YYYY format
    DOBM = "DOBM"  # Month of birth - MM format
    DOBD = "DOBD"  # Day of birth - DD format
    GEN = "GEN"  # Gender - m/f
    EXTERN_ID = "EXTERN_ID"  # External ID - NOT hashed
    MADID = "MADID"  # Mobile Advertiser ID
    FI = "FI"  # First initial


class UploadUsersRequest(BaseModel):
    """
    Request to upload customer data to a Custom Audience - per Meta v25.0+ docs
    
    Data is automatically normalized and SHA256 hashed by the backend
    before being sent to Meta's API.
    """
    schema: List[CustomerDataField] = Field(
        ...,
        min_length=1,
        description="List of field types in order (e.g., ['EMAIL', 'PHONE', 'FN', 'LN'])"
    )
    data: List[List[str]] = Field(
        ...,
        min_length=1,
        description="2D array of customer data rows matching the schema order"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "schema": ["EMAIL", "PHONE", "FN", "LN"],
                "data": [
                    ["john@example.com", "+12025551234", "John", "Doe"],
                    ["jane@example.com", "+12025555678", "Jane", "Smith"]
                ]
            }
        }


class UploadUsersResponse(BaseModel):
    """Response from customer data upload - per Meta v25.0+ docs"""
    success: bool
    audience_id: str
    num_received: int = Field(
        default=0,
        description="Number of records successfully received by Meta"
    )
    num_invalid_entries: int = Field(
        default=0,
        description="Number of records that failed validation"
    )
    invalid_entry_samples: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Samples of invalid entries for debugging"
    )
    error: Optional[str] = None


class CustomerDataNormalization:
    """
    Normalization rules per Meta documentation:
    
    - EMAIL: lowercase, trim whitespace
    - PHONE: remove all non-digits, include country code (e.g., 12025551234)
    - FN/LN: lowercase, remove punctuation and spaces
    - CT/ST/ZIP/COUNTRY: lowercase
    - DOBY: 4-digit year (YYYY)
    - DOBM: 2-digit month (01-12)
    - DOBD: 2-digit day (01-31)
    - GEN: 'm' or 'f'
    - EXTERN_ID: No normalization, no hashing
    
    All fields except EXTERN_ID are SHA256 hashed after normalization.
    """
    pass
