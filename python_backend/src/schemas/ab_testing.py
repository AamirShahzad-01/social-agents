"""
A/B Testing Schemas
Meta Marketing API Split Testing via ad_studies endpoint

Based on December 2025 research:
- Use /BUSINESS_ID/ad_studies endpoint for split tests
- Test variables: audience, creative, placement, delivery optimization
- Supports holdout tests and multi-cell A/B tests
"""
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class ABTestType(str, Enum):
    """Type of A/B test"""
    SPLIT_TEST = "SPLIT_TEST"  # Compare different strategies
    HOLDOUT = "HOLDOUT"        # Measure incremental lift


class ABTestVariable(str, Enum):
    """Variable being tested in the A/B test"""
    AUDIENCE = "AUDIENCE"
    CREATIVE = "CREATIVE"
    PLACEMENT = "PLACEMENT"
    DELIVERY_OPTIMIZATION = "DELIVERY_OPTIMIZATION"
    BUDGET = "BUDGET"


class ABTestStatus(str, Enum):
    """Status of an A/B test"""
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"


class ABTestCell(BaseModel):
    """A single variant/cell in an A/B test - per Meta docs format"""
    name: str = Field(..., description="Name of this variant (e.g., 'Control', 'Variant A')")
    treatment_percentage: int = Field(
        ..., 
        ge=1, 
        le=100,
        description="Percentage of audience for this cell (v24.0 2026 uses treatment_percentage)"
    )
    # Link to campaigns or adsets per Meta docs (use one or the other)
    campaigns: Optional[List[str]] = Field(
        default=None,
        description="Campaign IDs for this cell"
    )
    adsets: Optional[List[str]] = Field(
        default=None,
        description="Ad set IDs for this cell"
    )


class CreateABTestRequest(BaseModel):
    """Request to create a new A/B test (ad study)"""
    name: str = Field(..., min_length=1, max_length=400)
    description: Optional[str] = None
    
    # Test configuration
    test_type: ABTestType = ABTestType.SPLIT_TEST
    test_variable: ABTestVariable
    
    # Campaign/objective settings
    objective: str = Field(
        default="OUTCOME_SALES",
        description="Campaign objective: OUTCOME_SALES, OUTCOME_LEADS, etc."
    )
    
    # Budget
    total_budget: int = Field(
        ...,
        ge=1,
        description="Total budget in cents for the entire test"
    )
    
    # Test cells (variants)
    cells: List[ABTestCell] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Test variants (2-5 cells)"
    )
    
    # Schedule
    start_time: Optional[datetime] = None
    end_time: datetime = Field(
        ...,
        description="When the test should end"
    )
    
    # Statistical settings
    confidence_level: float = Field(
        default=0.95,
        ge=0.8,
        le=0.99,
        description="Required confidence level (0.8-0.99)"
    )
    minimum_detectable_effect: Optional[float] = Field(
        default=0.1,
        description="Minimum effect size to detect (10% = 0.1)"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Creative Test - Holiday 2026",
                "description": "Compare video vs image creatives",
                "test_type": "SPLIT_TEST",
                "test_variable": "CREATIVE",
                "objective": "OUTCOME_SALES",
                "total_budget": 100000,  # $1000
                "cells": [
                    {"name": "Group A", "treatment_percentage": 50, "campaigns": ["123456789"]},
                    {"name": "Group B", "treatment_percentage": 50, "campaigns": ["987654321"]}
                ],
                "end_time": "2026-02-15T00:00:00Z",
                "confidence_level": 0.95
            }
        }


class ABTestCellResult(BaseModel):
    """Results for a single cell/variant"""
    cell_name: str
    budget_spent: float
    impressions: int
    clicks: int
    conversions: int
    cost_per_result: float
    ctr: float
    conversion_rate: float
    roas: Optional[float] = None
    is_winner: bool = False
    lift_vs_control: Optional[float] = None
    confidence: Optional[float] = None


class ABTestResults(BaseModel):
    """Full A/B test results"""
    test_id: str
    test_name: str
    status: ABTestStatus
    test_variable: ABTestVariable
    
    # Progress
    days_running: int
    days_remaining: int
    percent_complete: float
    
    # Results
    winning_cell: Optional[str] = None
    has_statistical_significance: bool = False
    overall_confidence: float = 0.0
    
    # Cell-level results
    cell_results: List[ABTestCellResult]
    
    # Recommendations
    recommendation: Optional[str] = None


class ABTestResponse(BaseModel):
    """Response after creating an A/B test"""
    success: bool
    test_id: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    cells_created: int = 0
    error: Optional[str] = None


class ABTestListItem(BaseModel):
    """Summary item for A/B test listing"""
    id: str
    name: str
    test_type: ABTestType
    test_variable: ABTestVariable
    status: ABTestStatus
    start_time: Optional[datetime]
    end_time: datetime
    cells_count: int
    budget_spent: Optional[float] = None
    has_winner: bool = False
    winning_cell: Optional[str] = None
