"""
Meta Ads A/B Testing (Split Testing) API
Handles campaign experiments and ad studies
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional, List, Union
from pydantic import BaseModel, Field
import logging

from ...services.meta_ads_service import get_meta_ads_service
from ...services.meta_credentials_service import MetaCredentialsService
from ...services.supabase_service import ensure_user_workspace

router = APIRouter()
logger = logging.getLogger(__name__)


async def get_user_context(request: Request):
    """Extract user_id and workspace_id from authenticated request"""
    user = getattr(request.state, 'user', None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    user_id = user.get('id')
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    workspace_id = await ensure_user_workspace(user_id, user.get('email'))
    return user_id, workspace_id


async def get_credentials(workspace_id: str, user_id: str):
    """Get Meta Ads credentials"""
    credentials = await MetaCredentialsService.get_ads_credentials(workspace_id, user_id)
    
    if not credentials or not credentials.get('access_token'):
        raise HTTPException(status_code=401, detail="Meta Ads not connected")
    
    return credentials


class AdStudyCell(BaseModel):
    """A/B test cell (group) definition"""
    name: str = Field(..., description="Cell name (e.g., 'Group A')")
    treatment_percentage: int = Field(..., ge=1, le=100, description="Percentage of traffic (1-100)")
    adsets: Optional[List[str]] = Field(default=None, description="List of ad set IDs in this cell")
    campaigns: Optional[List[str]] = Field(default=None, description="List of campaign IDs in this cell")


class CreateABTestRequest(BaseModel):
    """Request to create an A/B test"""
    business_id: str = Field(..., description="Business ID that owns the ad sets")
    name: str = Field(..., min_length=1, max_length=255, description="Test name")
    description: Optional[str] = Field(default=None, description="Test description")
    type: str = Field(default="SPLIT_TEST", description="Study type (SPLIT_TEST)")
    test_type: Optional[str] = Field(default=None, description="Alternative field for study type")
    cells: List[AdStudyCell] = Field(..., min_length=2, max_length=5, description="Test groups (2-5 cells)")
    start_time: Optional[Union[str, int]] = Field(default=None, description="ISO format or Unix timestamp start time")
    end_time: Optional[Union[str, int]] = Field(default=None, description="ISO format or Unix timestamp end time")
    confidence_level: Optional[float] = Field(default=0.9, ge=0.8, le=0.99, description="Statistical confidence (0.8-0.99)")
    observation_end_time: Optional[Union[str, int]] = Field(default=None, description="When to stop collecting data")


class UpdateTestStatusRequest(BaseModel):
    """Request to update test status"""
    status: str = Field(..., description="New status: ACTIVE or PAUSED")


class DuplicateTestRequest(BaseModel):
    """Request to duplicate a test"""
    new_name: Optional[str] = Field(None, description="Name for duplicated test")


@router.get("/ab-tests")
async def get_ab_tests(request: Request, business_id: str):
    """
    Get all A/B tests (ad studies) for a business
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_ab_tests(business_id, credentials["access_token"])
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "ab_tests": result.get("ab_tests", []),
            "count": len(result.get("ab_tests", []))
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching A/B tests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ab-tests")
async def create_ab_test(request: Request, test_data: CreateABTestRequest):
    """
    Create new A/B test (split test)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        # Validate cells percentages sum to 100
        total_percentage = sum(cell.treatment_percentage for cell in test_data.cells)
        if total_percentage != 100:
            raise HTTPException(
                status_code=400,
                detail=f"Cell percentages must sum to 100, got {total_percentage}"
            )
        
        service = get_meta_ads_service()
        result = await service.create_ab_test(
            business_id=test_data.business_id,
            access_token=credentials["access_token"],
            name=test_data.name,
            description=test_data.description,
            study_type=test_data.type,
            cells=[cell.model_dump() for cell in test_data.cells],
            start_time=test_data.start_time,
            end_time=test_data.end_time,
            confidence_level=test_data.confidence_level,
            observation_end_time=test_data.observation_end_time
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "success": True,
            "ab_test": result.get("ab_test"),
            "id": result.get("id")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating A/B test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ab-tests/{test_id}")
async def get_ab_test_details(request: Request, test_id: str):
    """
    Get details of a specific A/B test
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_ab_test_details(test_id, credentials["access_token"])
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content=result.get("ab_test", {}))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching A/B test details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ab-tests/{test_id}/insights")
async def get_ab_test_insights(request: Request, test_id: str, date_preset: str = "last_7d"):
    """
    Get performance insights for an A/B test
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_ab_test_insights(test_id, credentials["access_token"], date_preset)
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "insights": result.get("insights", []),
            "winner": result.get("winner"),
            "statistical_significance": result.get("statistical_significance", 0)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching A/B test insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/ab-tests/{test_id}/status")
async def update_ab_test_status(request: Request, test_id: str, status_data: UpdateTestStatusRequest):
    """
    Pause or resume an A/B test
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        if status_data.status not in ["ACTIVE", "PAUSED"]:
            raise HTTPException(status_code=400, detail="Status must be ACTIVE or PAUSED")
        
        service = get_meta_ads_service()
        result = await service.update_ab_test_status(
            test_id, credentials["access_token"], status_data.status
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={"success": True, "id": test_id, "status": status_data.status})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating A/B test status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/ab-tests/{test_id}")
async def cancel_ab_test(request: Request, test_id: str):
    """
    Cancel/delete an A/B test
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.cancel_ab_test(test_id, credentials["access_token"])
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={"success": True, "id": test_id, "message": "Test cancelled"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling A/B test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ab-tests/{test_id}/duplicate")
async def duplicate_ab_test(request: Request, test_id: str, duplicate_data: DuplicateTestRequest):
    """
    Duplicate an existing A/B test
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.duplicate_ab_test(
            test_id, credentials["access_token"], duplicate_data.new_name
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        return JSONResponse(content={
            "success": True,
            "original_id": test_id,
            "new_id": result.get("id"),
            "ab_test": result.get("ab_test")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating A/B test: {e}")
        raise HTTPException(status_code=500, detail=str(e))
