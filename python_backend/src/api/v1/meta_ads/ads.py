"""
Meta Ads API - Ad Endpoints
Handles Ad CRUD operations with creative uploads
"""
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Request, HTTPException, Path, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ._helpers import get_user_context, get_verified_credentials
from ....services.supabase_service import get_supabase_admin_client
from ....services.meta_ads.meta_ads_service import get_meta_ads_service
from ....schemas.meta_ads import CreateAdRequest, UpdateAdRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meta Ads - Ads"])


@router.get("/ads")
async def list_ads(request: Request):
    """
    GET /api/v1/meta-ads/ads
    
    List all ads
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.fetch_ads(
            credentials["account_id"],
            credentials["access_token"]
        )
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads")
async def create_ad(request: Request, body: CreateAdRequest):
    """
    POST /api/v1/meta-ads/ads
    
    Create a new ad with creative
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        page_id = body.page_id or credentials.get("page_id")
        
        if not page_id:
            raise HTTPException(
                status_code=400,
                detail="page_id is required. Please connect a Facebook Page."
            )
        
        # Phase 3: Fetch ad set and campaign to validate creative alignment
        adsets_result = await service.fetch_adsets(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"]
        )
        
        adset_data = None
        campaign_objective = None
        optimization_goal = None
        
        if adsets_result.get("data"):
            adset_data = next((a for a in adsets_result["data"] if a.get("id") == body.adset_id), None)
            if adset_data:
                optimization_goal = adset_data.get("optimization_goal")
                campaign_id = adset_data.get("campaign_id")
                
                # Fetch campaign to get objective
                if campaign_id:
                    campaigns_result = await service.fetch_campaigns(
                        account_id=credentials["account_id"],
                        access_token=credentials["access_token"]
                    )
                    if campaigns_result.get("data"):
                        campaign_data = next((c for c in campaigns_result["data"] if c.get("id") == campaign_id), None)
                        if campaign_data:
                            campaign_objective = campaign_data.get("objective")
        
        # Phase 3: Validate creative aligns with ad set optimization goal (all objectives)
        if optimization_goal:
            # Conversion-based optimizations require link_url
            if optimization_goal in ["OFFSITE_CONVERSIONS", "ONSITE_CONVERSIONS", "VALUE"]:
                if not body.creative.link_url:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Creative requires link_url for {optimization_goal} optimization goal. "
                               f"Please provide a link_url in the creative."
                    )
            
            # Traffic optimizations require link_url
            elif optimization_goal in ["LINK_CLICKS", "LANDING_PAGE_VIEWS"]:
                if not body.creative.link_url:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Creative requires link_url for {optimization_goal} optimization goal. "
                               f"Please provide a link_url in the creative."
                    )
            
            # Lead generation requires link_url or lead form
            elif optimization_goal == "LEAD_GENERATION":
                if not body.creative.link_url and not adset_data.get("promoted_object", {}).get("lead_gen_form_id"):
                    raise HTTPException(
                        status_code=400,
                        detail="LEAD_GENERATION optimization requires either link_url in creative or lead_gen_form_id in promoted_object."
                    )
            
            # Quality lead requires lead form (validated at ad set level)
            elif optimization_goal == "QUALITY_LEAD":
                if not adset_data.get("promoted_object", {}).get("lead_gen_form_id"):
                    logger.warning("QUALITY_LEAD optimization - ensure lead_gen_form_id is set in ad set promoted_object")
            
            # App installs validation
            elif optimization_goal == "APP_INSTALLS":
                if not adset_data.get("promoted_object", {}).get("application_id"):
                    raise HTTPException(
                        status_code=400,
                        detail="APP_INSTALLS optimization requires application_id in ad set promoted_object. "
                               "Please configure the promoted_object with application_id."
                    )
            
            # App installs and conversions requires both
            elif optimization_goal == "APP_INSTALLS_AND_OFFSITE_CONVERSIONS":
                if not adset_data.get("promoted_object", {}).get("application_id"):
                    raise HTTPException(
                        status_code=400,
                        detail="APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires application_id in promoted_object."
                    )
                if not adset_data.get("promoted_object", {}).get("pixel_id"):
                    raise HTTPException(
                        status_code=400,
                        detail="APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires pixel_id in promoted_object for conversion tracking."
                    )
                if not body.creative.link_url:
                    raise HTTPException(
                        status_code=400,
                        detail="APP_INSTALLS_AND_OFFSITE_CONVERSIONS requires link_url in creative for conversion tracking."
                    )
            
            # Video optimizations recommend video content
            elif optimization_goal in ["THRUPLAY", "VIDEO_VIEWS", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS"]:
                if not body.creative.video_id and not body.creative.video_url:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{optimization_goal} optimization requires video content. "
                               f"Please provide a video_id or video_url in the creative."
                    )
        
        # Phase 4: Objective-specific creative validation (all campaign types aligned with Meta Ads Manager)
        if campaign_objective == "OUTCOME_SALES":
            # Sales campaigns: appropriate CTAs
            valid_sales_ctas = ["SHOP_NOW", "BUY_NOW", "ORDER_NOW", "LEARN_MORE", "GET_OFFER", "GET_PROMOTIONS"]
            cta_type = body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE"
            
            if cta_type not in valid_sales_ctas:
                logger.warning(f"Sales campaign using CTA '{cta_type}' - consider using SHOP_NOW, BUY_NOW, or ORDER_NOW for better performance")
            
            # Sales campaigns require link_url
            if not body.creative.link_url:
                raise HTTPException(
                    status_code=400,
                    detail="Sales campaigns require link_url in creative. Please provide a destination URL."
                )
        
        elif campaign_objective == "OUTCOME_LEADS":
            # Leads campaigns: appropriate CTAs
            valid_leads_ctas = ["SIGN_UP", "CONTACT_US", "GET_QUOTE", "APPLY_NOW", "LEARN_MORE", "SEND_MESSAGE", "CALL_NOW"]
            cta_type = body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE"
            
            if cta_type not in valid_leads_ctas:
                logger.warning(f"Leads campaign using CTA '{cta_type}' - consider using SIGN_UP, CONTACT_US, or GET_QUOTE for better performance")
            
            # Leads campaigns: link_url or lead form required (validated above)
            if optimization_goal == "CONVERSATIONS":
                # For conversations, destination_type should match creative
                if adset_data and adset_data.get("destination_type") not in ["MESSENGER", "WHATSAPP", "INSTAGRAM_DIRECT"]:
                    logger.warning("CONVERSATIONS optimization - ensure destination_type matches messaging platform")
        
        elif campaign_objective == "OUTCOME_APP_PROMOTION":
            # App promotion: appropriate CTAs
            valid_app_ctas = ["INSTALL_APP", "USE_APP", "PLAY_GAME", "DOWNLOAD", "LEARN_MORE"]
            cta_type = body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE"
            
            if cta_type not in valid_app_ctas:
                logger.warning(f"App promotion campaign using CTA '{cta_type}' - consider using INSTALL_APP or USE_APP for better performance")
            
            # App promotion: link_url recommended for app store links
            if optimization_goal == "APP_INSTALLS" and not body.creative.link_url:
                logger.warning("App install campaigns benefit from link_url pointing to app store")
        
        elif campaign_objective == "OUTCOME_TRAFFIC":
            # Traffic campaigns: appropriate CTAs
            valid_traffic_ctas = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "DOWNLOAD", "WATCH_MORE"]
            cta_type = body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE"
            
            if cta_type not in valid_traffic_ctas:
                logger.warning(f"Traffic campaign using CTA '{cta_type}' - consider using LEARN_MORE or SHOP_NOW for better performance")
            
            # Traffic campaigns: link_url required (validated above)
            if not body.creative.link_url:
                raise HTTPException(
                    status_code=400,
                    detail="Traffic campaigns require link_url in creative. Please provide a destination URL."
                )
        
        elif campaign_objective == "OUTCOME_ENGAGEMENT":
            # Engagement campaigns: appropriate CTAs based on optimization goal
            cta_type = body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE"
            
            if optimization_goal == "POST_ENGAGEMENT":
                valid_engagement_ctas = ["LIKE_PAGE", "MESSAGE_PAGE", "LEARN_MORE", "WATCH_MORE"]
                if cta_type not in valid_engagement_ctas:
                    logger.warning(f"Post engagement campaign using CTA '{cta_type}' - consider using LIKE_PAGE or MESSAGE_PAGE")
            
            elif optimization_goal == "CONVERSATIONS":
                valid_conversation_ctas = ["SEND_MESSAGE", "MESSAGE_PAGE", "WHATSAPP_MESSAGE"]
                if cta_type not in valid_conversation_ctas:
                    logger.warning(f"Conversations campaign using CTA '{cta_type}' - consider using SEND_MESSAGE or MESSAGE_PAGE")
            
            elif optimization_goal in ["THRUPLAY", "VIDEO_VIEWS"]:
                if not body.creative.video_id and not body.creative.video_url:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{optimization_goal} optimization requires video content. Please provide a video."
                    )
        
        elif campaign_objective == "OUTCOME_AWARENESS":
            # Awareness campaigns: link_url optional, but can be used
            # Video content recommended for AD_RECALL_LIFT
            if optimization_goal == "AD_RECALL_LIFT":
                if not body.creative.video_id and not body.creative.video_url:
                    logger.warning("AD_RECALL_LIFT optimization - video content is recommended for better ad recall measurement")
            
            # Awareness campaigns: appropriate CTAs
            valid_awareness_ctas = ["LEARN_MORE", "WATCH_MORE", "LIKE_PAGE"]
            cta_type = body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE"
            
            if cta_type not in valid_awareness_ctas:
                logger.warning(f"Awareness campaign using CTA '{cta_type}' - consider using LEARN_MORE or WATCH_MORE")
        
        # Step 1: Handle media uploads based on creative type
        image_hash = None
        video_id = body.creative.video_id
        carousel_child_attachments = None
        
        # Check if this is a carousel ad
        if body.creative.carousel_items and len(body.creative.carousel_items) >= 2:
            # CAROUSEL AD: Upload each carousel item's image
            carousel_child_attachments = []
            for idx, item in enumerate(body.creative.carousel_items):
                item_image_hash = None
                if item.image_url:
                    item_upload = await service.upload_ad_image(
                        credentials["account_id"],
                        credentials["access_token"],
                        item.image_url,
                        item.title or f"Carousel Item {idx + 1}"
                    )
                    if item_upload.get("data") and item_upload["data"].get("hash"):
                        item_image_hash = item_upload["data"]["hash"]
                    else:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to upload carousel image {idx + 1}: {item_upload.get('error', 'Unknown error')}"
                        )
                
                # Build child attachment for carousel
                child_attachment = {
                    "link": item.link or body.creative.link_url,
                    "name": item.title or body.creative.title,
                    "description": item.description or body.creative.body,
                }
                if item_image_hash:
                    child_attachment["image_hash"] = item_image_hash
                if item.video_id:
                    child_attachment["video_id"] = item.video_id
                
                carousel_child_attachments.append(child_attachment)
            
            logger.info(f"Prepared {len(carousel_child_attachments)} carousel items")
        
        # Check if this is a video ad (not carousel)
        elif body.creative.video_url and not video_id:
            # VIDEO AD: Upload video from URL
            video_upload = await service.upload_ad_video(
                credentials["account_id"],
                credentials["access_token"],
                body.creative.video_url,
                body.creative.title or body.name
            )
            if video_upload.get("data") and video_upload["data"].get("video_id"):
                video_id = video_upload["data"]["video_id"]
                logger.info(f"Uploaded video with ID: {video_id}")
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload video: {video_upload.get('error', 'Unknown error')}"
                )
        
        # SINGLE IMAGE AD: Upload image if URL provided
        elif body.creative.image_url and not body.creative.image_hash:
            upload_result = await service.upload_ad_image(
                credentials["account_id"],
                credentials["access_token"],
                body.creative.image_url,
                body.creative.title
            )
            if upload_result.get("data") and upload_result["data"].get("hash"):
                image_hash = upload_result["data"]["hash"]
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload image: {upload_result.get('error', 'Unknown error')}"
                )
        else:
            image_hash = body.creative.image_hash
        
        # Step 2: Create ad creative with appropriate format
        creative_result = await service.create_ad_creative(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            page_id=page_id,
            name=f"{body.name} - Creative",
            image_hash=image_hash,
            video_id=video_id,
            title=body.creative.title,
            body=body.creative.body,
            link_url=body.creative.link_url,
            call_to_action_type=body.creative.call_to_action_type.value if body.creative.call_to_action_type else "LEARN_MORE",
            advantage_plus_creative=body.creative.advantage_plus_creative if body.creative.advantage_plus_creative is not None else True,
            gen_ai_disclosure=body.creative.gen_ai_disclosure if body.creative.gen_ai_disclosure else False,
            format_automation=body.creative.format_automation if body.creative.format_automation else False,
            product_set_id=body.creative.product_set_id,
            carousel_child_attachments=carousel_child_attachments,
            thumbnail_url=body.creative.thumbnail_url
        )
        
        if not creative_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to create creative: {creative_result.get('error')}"
            )
        
        # Step 3: Create ad
        ad_result = await service.create_ad(
            account_id=credentials["account_id"],
            access_token=credentials["access_token"],
            name=body.name,
            adset_id=body.adset_id,
            creative_id=creative_result["creative_id"],
            status=body.status.value if body.status else "PAUSED"
        )
        
        if not ad_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to create ad: {ad_result.get('error')}"
            )
        
        # Store in database
        try:
            client = get_supabase_admin_client()
            ad_data = ad_result.get("ad", {})
            campaign_id = ad_data.get("campaign_id") or ad_data.get("campaign", {}).get("id")
            
            client.table("meta_ads").insert({
                "workspace_id": workspace_id,
                "user_id": user_id,
                "meta_ad_id": ad_data.get("id"),
                "meta_creative_id": creative_result["creative_id"],
                "meta_adset_id": body.adset_id,
                "meta_campaign_id": campaign_id,
                "name": body.name,
                "status": body.status.value if body.status else "PAUSED",
                "creative": body.creative.model_dump(),
                "last_synced_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        except Exception as db_error:
            logger.warning(f"Failed to store ad in DB: {db_error}")
        
        return JSONResponse(content={
            "success": True,
            "ad": ad_result.get("ad")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/ads/{ad_id}")
async def update_ad(
    request: Request,
    ad_id: str = Path(...),
    body: UpdateAdRequest = None
):
    """
    PATCH /api/v1/meta-ads/ads/{ad_id}
    
    Update an ad (typically status change)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        updates = {}
        if body:
            if body.status:
                updates["status"] = body.status.value
            if body.name:
                updates["name"] = body.name
        
        service = get_meta_ads_service()
        result = await service.update_ad(
            ad_id,
            credentials["access_token"],
            **updates
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# PUT alias for PATCH - frontend uses PUT
@router.put("/ads/{ad_id}")
async def update_ad_put(
    request: Request,
    ad_id: str = Path(...),
    body: UpdateAdRequest = None
):
    """
    PUT /api/v1/meta-ads/ads/{ad_id}
    
    Update an ad (alias for PATCH)
    """
    return await update_ad(request, ad_id, body)


@router.delete("/ads/{ad_id}")
async def delete_ad(request: Request, ad_id: str = Path(...)):
    """
    DELETE /api/v1/meta-ads/ads/{ad_id}
    
    Delete an ad
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.delete_ad(
            ad_id,
            credentials["access_token"]
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Ad deleted"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads/{ad_id}/duplicate")
async def duplicate_ad(
    request: Request,
    ad_id: str = Path(...),
    body: dict = None
):
    """
    POST /api/v1/meta-ads/ads/{ad_id}/duplicate
    
    Duplicate an ad using Meta's Ad Copies API
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        new_name = body.get("new_name") if body else None
        
        service = get_meta_ads_service()
        result = await service.duplicate_ad(
            ad_id,
            credentials["access_token"],
            new_name=new_name
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "ad_id": result.get("ad_id"),
            "message": "Ad duplicated successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads/{ad_id}/archive")
async def archive_ad(request: Request, ad_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/ads/{ad_id}/archive
    
    Archive an ad (sets status to ARCHIVED)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.update_ad(
            ad_id,
            credentials["access_token"],
            status="ARCHIVED"
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Ad archived"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads/{ad_id}/unarchive")
async def unarchive_ad(request: Request, ad_id: str = Path(...)):
    """
    POST /api/v1/meta-ads/ads/{ad_id}/unarchive
    
    Unarchive an ad (sets status to PAUSED)
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.update_ad(
            ad_id,
            credentials["access_token"],
            status="PAUSED"
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={"success": True, "message": "Ad unarchived"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving ad: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ads/{ad_id}/preview")
async def get_ad_preview(
    request: Request,
    ad_id: str = Path(...),
    ad_format: str = Query("DESKTOP_FEED_STANDARD", description="Preview format: DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, INSTAGRAM_STANDARD, INSTAGRAM_STORY, etc.")
):
    """
    GET /api/v1/meta-ads/ads/{ad_id}/preview
    
    Get ad preview for a specific placement format.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        service = get_meta_ads_service()
        result = await service.get_ad_preview(
            ad_id,
            credentials["access_token"],
            ad_format=ad_format
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "preview": result.get("data")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ad preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ads/generatepreview")
async def generate_ad_preview(
    request: Request,
    body: dict
):
    """
    POST /api/v1/meta-ads/ads/generatepreview
    
    Generate a preview for an ad creative without creating an ad.
    Useful for previewing before publishing.
    """
    try:
        user_id, workspace_id = await get_user_context(request)
        credentials = await get_verified_credentials(workspace_id, user_id)
        
        creative = body.get("creative", {})
        ad_format = body.get("ad_format", "DESKTOP_FEED_STANDARD")
        
        service = get_meta_ads_service()
        result = await service.generate_ad_preview(
            credentials["account_id"],
            credentials["access_token"],
            creative=creative,
            ad_format=ad_format
        )
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return JSONResponse(content={
            "success": True,
            "preview": result.get("data")
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating ad preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
