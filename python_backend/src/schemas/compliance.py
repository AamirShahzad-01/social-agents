"""
Compliance Center Schemas
Meta Marketing API v24.0 2026 Special Ad Categories & Restrictions
"""
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class SpecialAdCategory(str, Enum):
    """
    Special Ad Categories requiring additional restrictions (v24.0 2026).
    """
    HOUSING = "HOUSING"
    EMPLOYMENT = "EMPLOYMENT"
    FINANCIAL_PRODUCTS_SERVICES = "FINANCIAL_PRODUCTS_SERVICES"
    ISSUES_ELECTIONS_POLITICS = "ISSUES_ELECTIONS_POLITICS"
    



class ComplianceStatus(str, Enum):
    """Compliance check status"""
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    WARNING = "WARNING"


class ComplianceIssue(BaseModel):
    """Single compliance issue"""
    category: str
    severity: str  # "ERROR", "WARNING", "INFO"
    message: str
    field: Optional[str] = None
    recommendation: Optional[str] = None


class ComplianceCheckRequest(BaseModel):
    """Request to check campaign compliance"""
    campaign_id: Optional[str] = None
    adset_id: Optional[str] = None
    ad_id: Optional[str] = None
    
    # Or check a configuration directly
    special_ad_categories: Optional[List[SpecialAdCategory]] = None
    targeting: Optional[Dict[str, Any]] = None
    creative: Optional[Dict[str, Any]] = None


class ComplianceCheckResponse(BaseModel):
    """Response from compliance check"""
    status: ComplianceStatus
    is_compliant: bool
    issues: List[ComplianceIssue] = []
    warnings: List[str] = []
    special_ad_categories: List[SpecialAdCategory] = []
    
    # Restrictions applied
    age_min_required: Optional[int] = None
    age_max_allowed: Optional[int] = None
    geo_restrictions: Optional[List[str]] = None
    excluded_targeting: Optional[List[str]] = None


class ComplianceConfig(BaseModel):
    """Compliance configuration for a campaign"""
    special_ad_categories: List[SpecialAdCategory] = []
    
    # Geographic restrictions
    geo_locations: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Country/region restrictions"
    )
    excluded_geo_locations: Optional[Dict[str, Any]] = None
    
    # Age restrictions
    age_min: Optional[int] = Field(default=None, ge=13, le=65)
    age_max: Optional[int] = Field(default=None, ge=13, le=65)
    
    # Content restrictions
    requires_disclaimer: bool = False
    disclaimer_text: Optional[str] = None
    
    # Political ads specific
    paid_for_by: Optional[str] = Field(
        default=None,
        description="Required for political ads"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "special_ad_categories": ["HOUSING"],
                "age_min": 18,
                "geo_locations": {"countries": ["US"]},
                "requires_disclaimer": False
            }
        }


class ApplyComplianceRequest(BaseModel):
    """Request to apply compliance settings"""
    campaign_id: str
    config: ComplianceConfig


class ApplyComplianceResponse(BaseModel):
    """Response after applying compliance"""
    success: bool
    campaign_id: str
    applied_categories: List[SpecialAdCategory] = []
    restrictions_applied: Dict[str, Any] = {}
    error: Optional[str] = None


# =============================================================================
# AUDIT LOG
# =============================================================================

class ComplianceAuditAction(str, Enum):
    """Types of compliance audit actions"""
    CATEGORY_ADDED = "CATEGORY_ADDED"
    CATEGORY_REMOVED = "CATEGORY_REMOVED"
    RESTRICTION_ADDED = "RESTRICTION_ADDED"
    RESTRICTION_REMOVED = "RESTRICTION_REMOVED"
    COMPLIANCE_CHECK = "COMPLIANCE_CHECK"
    VIOLATION_DETECTED = "VIOLATION_DETECTED"
    CAMPAIGN_PAUSED = "CAMPAIGN_PAUSED"


class ComplianceAuditEntry(BaseModel):
    """Single audit log entry"""
    id: str
    timestamp: datetime
    action: ComplianceAuditAction
    entity_type: str  # "CAMPAIGN", "ADSET", "AD"
    entity_id: str
    entity_name: Optional[str] = None
    user_id: Optional[str] = None
    details: Dict[str, Any] = {}
    previous_state: Optional[Dict[str, Any]] = None
    new_state: Optional[Dict[str, Any]] = None


class ComplianceAuditResponse(BaseModel):
    """Response for audit log query"""
    entries: List[ComplianceAuditEntry]
    total_count: int
    has_more: bool


# =============================================================================
# SPECIAL AD CATEGORY RESTRICTIONS
# =============================================================================

# Built-in restrictions for each category
CATEGORY_RESTRICTIONS = {
    SpecialAdCategory.HOUSING: {
        "excluded_targeting": [
            "age", "gender", "zip_codes",
            "demographics", "behaviors", "interests (housing-related)"
        ],
        "radius_max_miles": 15,
        "description": "Housing ads cannot use age, gender, or ZIP code targeting"
    },
    SpecialAdCategory.EMPLOYMENT: {
        "excluded_targeting": [
            "age", "gender", "zip_codes",
            "demographics", "behaviors"
        ],
        "radius_max_miles": 15,
        "description": "Employment ads cannot use age, gender, or ZIP code targeting"
    },
    SpecialAdCategory.FINANCIAL_PRODUCTS_SERVICES: {
        "excluded_targeting": [
            "age", "gender", "zip_codes",
            "demographics"
        ],
        "radius_max_miles": 15,
        "age_min": 18,
        "description": "Financial services ads require age 18+ and limited targeting"
    },
    SpecialAdCategory.ISSUES_ELECTIONS_POLITICS: {
        "requires_disclaimer": True,
        "requires_authorization": True,
        "requires_paid_for_by": True,
        "description": "Political ads require authorization and 'Paid for by' disclosure"
    }
}
