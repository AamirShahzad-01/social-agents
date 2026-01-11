"""
Meta Ads API - Audience Endpoints
Handles Custom Audiences and Lookalike Audiences
"""
import logging

from fastapi import APIRouter, Request, HTTPException, Path
from fastapi.responses import JSONResponse

from ._helpers import get_user_context, get_verified_credentials
from ....services.supabase_service import log_activity
from ....services.meta_ads.meta_ads_service import get_meta_ads_service
from ....services.meta_ads.sdk_custom_audiences import CustomAudiencesService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Audiences"])


@router.get("/audiences")
async def list_audiences(request: Request):
    """
    GET /api/v1/meta-ads/audiences
    
    List custom audiences
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_audiences(
            credentials["account_id"],
            credentials["access_token"]
        )
        
        # Transform to frontend expected format
        audiences = []
        if isinstance(result, dict) and result.get("data"):
            audiences = result["data"]
        
        return JSONResponse(content={"audiences": audiences})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching audiences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/custom")
async def create_custom_audience(request: Request):
    """
    POST /api/v1/meta-ads/audiences/custom
    
    Create a custom audience
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        # subtype can be missing for engagement audiences (Meta doesn't support ENGAGEMENT/LEAD_AD subtypes)
        subtype = body.get("subtype")
        rule = body.get("rule")
        
        # Validate that rule-based audiences have a rule
        rule_required_subtypes = ["WEBSITE", "VIDEO", "APP"]
        if subtype in rule_required_subtypes and not rule:
            raise HTTPException(
                status_code=400,
                detail=f"rule parameter is required for {subtype} custom audiences"
            )
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.create_custom_audience(
            account_id=credentials["account_id"],
            name=body.get("name"),
            subtype=subtype,
            rule=rule,
            retention_days=body.get("retention_days", 30),
            prefill=body.get("prefill", True),
            customer_file_source=body.get("customer_file_source")
        )
        
        # Check if SDK returned an error
        if isinstance(result, dict) and result.get("success") is False:
            error_msg = result.get("error", "Failed to create custom audience")
            logger.error(f"Meta API error creating custom audience: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        
        return JSONResponse(content={"success": True, "audience": result})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating custom audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audiences/{audience_id}")
async def get_audience_details(request: Request, audience_id: str = Path(...)):
    """
    GET /api/v1/meta-ads/audiences/{audience_id}
    
    Get details of a specific audience.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.get_audience_details(audience_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "audience": result.get("audience")})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting audience details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/audiences/{audience_id}")
async def delete_audience(request: Request, audience_id: str = Path(...)):
    """
    DELETE /api/v1/meta-ads/audiences/{audience_id}
    
    Delete a custom audience.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.delete_custom_audience(audience_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        # Log the activity
        await log_activity(
            workspace_id=workspace_id,
            user_id=user_id,
            action="delete_audience",
            resource_type="audience",
            resource_id=audience_id,
            details={"audience_id": audience_id}
        )
        
        return JSONResponse(content={"success": True, "message": "Audience deleted successfully"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/audiences/{audience_id}")
async def update_audience(request: Request, audience_id: str = Path(...)):
    """
    PUT /api/v1/meta-ads/audiences/{audience_id}
    
    Update an audience's name or description.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        name = body.get("name")
        description = body.get("description")
        
        if not name and not description:
            raise HTTPException(status_code=400, detail="At least one of 'name' or 'description' is required")
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.update_audience(
            audience_id=audience_id,
            name=name,
            description=description
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Audience updated successfully"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/audiences/{audience_id}/users")
async def remove_audience_users(request: Request, audience_id: str = Path(...)):
    """
    DELETE /api/v1/meta-ads/audiences/{audience_id}/users
    
    Remove users from a custom audience (GDPR compliance).
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        schema = body.get("schema", [])
        data = body.get("data", [])
        
        if not schema:
            raise HTTPException(status_code=400, detail="schema is required")
        if not data:
            raise HTTPException(status_code=400, detail="data is required")
        
        # Validate schema fields
        valid_fields = ["EMAIL", "PHONE", "FN", "LN", "CT", "ST", "ZIP", 
                       "COUNTRY", "DOBY", "DOBM", "DOBD", "GEN", "EXTERN_ID"]
        for field in schema:
            if field not in valid_fields:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid schema field: {field}. Valid fields: {valid_fields}"
                )
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.remove_audience_users(
            audience_id=audience_id,
            schema=schema,
            data=data
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        # Log for GDPR compliance
        await log_activity(
            workspace_id=workspace_id,
            user_id=user_id,
            action="remove_audience_users",
            resource_type="audience",
            resource_id=audience_id,
            details={
                "audience_id": audience_id,
                "num_received": result.get("num_received", 0),
                "num_invalid_entries": result.get("num_invalid_entries", 0)
            }
        )
        
        return JSONResponse(content={
            "success": True,
            "num_received": result.get("num_received", 0),
            "num_invalid_entries": result.get("num_invalid_entries", 0),
            "message": "Users removed successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing audience users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/{audience_id}/share")
async def share_audience(request: Request, audience_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/audiences/{audience_id}/share
    
    Share an audience with another ad account.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        recipient_ad_account_id = body.get("recipient_ad_account_id")
        
        if not recipient_ad_account_id:
            raise HTTPException(status_code=400, detail="recipient_ad_account_id is required")
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.share_audience(
            audience_id=audience_id,
            recipient_ad_account_id=recipient_ad_account_id
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        # Log the activity
        await log_activity(
            workspace_id=workspace_id,
            user_id=user_id,
            action="share_audience",
            resource_type="audience",
            resource_id=audience_id,
            details={
                "audience_id": audience_id,
                "shared_with": recipient_ad_account_id
            }
        )
        
        return JSONResponse(content={"success": True, "message": "Audience shared successfully"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/{audience_id}/users")
async def upload_audience_users(audience_id: str, request: Request):
    """
    POST /api/v1/meta-ads/audiences/{audience_id}/users
    
    Upload customer data to a custom audience.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        schema = body.get("schema", [])
        data = body.get("data", [])
        
        if not schema:
            raise HTTPException(status_code=400, detail="schema is required")
        
        if not data:
            raise HTTPException(status_code=400, detail="data is required")
        
        # Validate schema fields
        valid_fields = ["EMAIL", "PHONE", "FN", "LN", "CT", "ST", "ZIP", 
                       "COUNTRY", "DOBY", "DOBM", "DOBD", "GEN", "EXTERN_ID"]
        for field in schema:
            if field not in valid_fields:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid schema field: {field}. Valid fields: {valid_fields}"
                )
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.upload_audience_users(
            audience_id=audience_id,
            schema=schema,
            data=data
        )
        
        if isinstance(result, dict) and result.get("success") is False:
            error_msg = result.get("error", "Failed to upload users")
            logger.error(f"Meta API error uploading users: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        
        return JSONResponse(content={
            "success": True,
            "audience_id": audience_id,
            "num_received": result.get("num_received", 0),
            "num_invalid_entries": result.get("num_invalid_entries", 0)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading audience users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audiences/lookalike")
async def create_lookalike_audience(request: Request):
    """
    POST /api/v1/meta-ads/audiences/lookalike
    
    Create a lookalike audience - v24.0 2026
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        body = await request.json()
        
        # Handle both target_countries (frontend) and country (single) formats
        target_countries = body.get("target_countries")
        if target_countries and isinstance(target_countries, list) and len(target_countries) > 0:
            country = target_countries[0]  # Use first country for now
        else:
            country = body.get("country", "US")
        
        service = get_meta_ads_service()
        result = await service.create_lookalike_audience(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.get("name"),
            origin_audience_id=body.get("source_audience_id"),
            country=country,
            ratio=body.get("ratio", 0.01),
            lookalike_type=body.get("type", "similarity")
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "audience": result.get("audience")})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating lookalike audience: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audiences/{audience_id}/size")
async def get_audience_size(
    request: Request,
    audience_id: str
):
    """
    GET /api/v1/meta-ads/audiences/{audience_id}/size
    
    Get audience size estimation.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = CustomAudiencesService(credentials["access_token"])
        result = await service.get_audience_size(audience_id=audience_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting audience size: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audiences/lookalike-ratios")
async def get_lookalike_ratios(request: Request):
    """
    GET /api/v1/meta-ads/audiences/lookalike-ratios
    
    Get available lookalike ratio options.
    """
    from ....schemas.audiences import LOOKALIKE_RATIOS
    
    return JSONResponse(content={"ratios": LOOKALIKE_RATIOS})
