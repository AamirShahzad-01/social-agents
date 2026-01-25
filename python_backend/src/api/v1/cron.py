"""
Cron Job API Router: Scheduled Post Publishing

Endpoint: GET /api/v1/cron/publish-scheduled

This endpoint is called by external cron services (cron-job.org)
to automatically publish posts that have reached their scheduled time.

Security: Protected by CRON_SECRET environment variable

Setup with cron-job.org:
1. Create account at https://cron-job.org
2. Add new cron job:
   - URL: https://your-backend-url.com/api/v1/cron/publish-scheduled
   - Method: GET
   - Schedule: Every 1 minute (* * * * *)
   - Headers: X-Cron-Secret: YOUR_CRON_SECRET
3. Enable failure notifications
"""

import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...services.supabase_service import get_supabase_admin_client
from ...services.credentials import MetaCredentialsService
from ...services.token_refresh_service import token_refresh_service
from ...agents.comment_agent import (
    process_comments,
    ProcessCommentsRequest,
    CommentAgentCredentials,
)
from ...config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/cron", tags=["Cron"])


# ============================================================================
# CONFIGURATION
# ============================================================================

CONFIG = {
    "MAX_RETRY_COUNT": 3,           # Max publish attempts before marking as failed
    "MAX_POSTS_PER_RUN": 50,        # Max posts to process per cron run (avoid timeout)
    "REQUEST_TIMEOUT_SECONDS": 30,  # Timeout for platform API calls
}


# ============================================================================
# MODELS
# ============================================================================

class PublishResult(BaseModel):
    """Result of publishing to a single platform"""
    platform: str
    success: bool
    postId: Optional[str] = None
    error: Optional[str] = None


class ProcessedPost(BaseModel):
    """Result of processing a single scheduled post"""
    postId: str
    topic: str
    status: str  # 'published', 'failed', 'partial'
    platforms: List[PublishResult]


class CronResponse(BaseModel):
    """Response from cron endpoint"""
    success: bool
    message: Optional[str] = None
    processed: int
    published: int
    failed: int
    results: Optional[List[ProcessedPost]] = None
    error: Optional[str] = None
    debug_now: Optional[str] = None


class CommentsCronWorkspaceResult(BaseModel):
    workspaceId: str
    userId: str
    success: bool
    commentsFetched: int = 0
    autoReplied: int = 0
    escalated: int = 0
    errors: int = 0
    errorMessage: Optional[str] = None


class CommentsCronResponse(BaseModel):
    success: bool
    processed: int
    succeeded: int
    failed: int
    results: Optional[List[CommentsCronWorkspaceResult]] = None
    error: Optional[str] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def verify_cron_auth(x_cron_secret: Optional[str]) -> bool:
    """
    Verify cron authentication via X-Cron-Secret header
    
    Args:
        x_cron_secret: Secret from header
        
    Returns:
        True if authorized, False otherwise
    """
    cron_secret = getattr(settings, 'CRON_SECRET', None)
    
    # Debug logging to help diagnose auth issues
    logger.info(f"[CRON AUTH] Header provided: {bool(x_cron_secret)}, length: {len(x_cron_secret) if x_cron_secret else 0}")
    logger.info(f"[CRON AUTH] Secret configured: {bool(cron_secret)}, length: {len(cron_secret) if cron_secret else 0}")
    if x_cron_secret and cron_secret:
        logger.info(f"[CRON AUTH] Header first 10 chars: {x_cron_secret[:10]}...")
        logger.info(f"[CRON AUTH] Secret first 10 chars: {cron_secret[:10]}...")
        logger.info(f"[CRON AUTH] Match: {x_cron_secret == cron_secret}")
    
    # If no CRON_SECRET is set, allow in development mode
    if not cron_secret:
        if not settings.is_production:
            logger.warning("CRON_SECRET not set - allowing request in development mode")
            return True
        return False
    
    return x_cron_secret == cron_secret


async def get_platform_credentials(workspace_id: str, platform: str) -> Dict[str, Any]:
    """
    Get platform credentials from database
    
    Args:
        workspace_id: Workspace ID
        platform: Platform name (twitter, instagram, etc.)
        
    Returns:
        Credentials dict
        
    Raises:
        Exception: If credentials not found
    """
    if platform in ["facebook", "instagram"]:
        # Use centralized service with refresh_if_needed=False (cron uses cached tokens)
        if platform == "instagram":
            meta_credentials = await MetaCredentialsService.get_instagram_credentials(
                workspace_id, 
                refresh_if_needed=False
            )
            if not meta_credentials:
                raise Exception(f"{platform} not connected for workspace {workspace_id}")
            if meta_credentials.get("is_expired"):
                raise Exception("Instagram access token expired")
            if not meta_credentials.get("access_token") or not meta_credentials.get("ig_user_id"):
                raise Exception("Invalid Instagram configuration")
            return {
                "accessToken": meta_credentials.get("access_token"),
                "userId": meta_credentials.get("ig_user_id"),
                "pageId": meta_credentials.get("page_id"),
                "expiresAt": meta_credentials.get("expires_at"),
            }

        meta_credentials = await MetaCredentialsService.get_meta_credentials(
            workspace_id,
            refresh_if_needed=False
        )
        if not meta_credentials:
            raise Exception(f"{platform} not connected for workspace {workspace_id}")
        if meta_credentials.get("is_expired"):
            raise Exception("Facebook access token expired")
        if not meta_credentials.get("access_token") or not meta_credentials.get("page_id"):
            raise Exception("Invalid Facebook configuration")
        return {
            "accessToken": meta_credentials.get("access_token"),
            "pageId": meta_credentials.get("page_id"),
            "pageName": meta_credentials.get("page_name"),
            "pageAccessToken": meta_credentials.get("page_access_token") or meta_credentials.get("access_token"),
            "expiresAt": meta_credentials.get("expires_at"),
        }

    # For non-Meta platforms, use token_refresh_service
    refresh_result = await token_refresh_service.get_valid_credentials(
        platform=platform,
        workspace_id=workspace_id
    )
    if not refresh_result.success:
        raise Exception(refresh_result.error or f"{platform} token refresh failed")

    credentials = refresh_result.credentials or {}
    if not credentials:
        raise Exception(f"No credentials found for {platform}")

    if platform == "linkedin":
        profile_id = credentials.get("profileId") or credentials.get("userId")
        if not credentials.get("accessToken") or not profile_id:
            raise Exception("Invalid LinkedIn configuration")
        credentials["profileId"] = profile_id
    elif platform == "twitter":
        if not credentials.get("accessToken"):
            raise Exception("Invalid X configuration. Please reconnect your account.")
        if not credentials.get("accessTokenSecret"):
            credentials["accessTokenSecret"] = ""
    elif platform in ["tiktok", "youtube"]:
        if not credentials.get("accessToken"):
            raise Exception(f"Invalid {platform} configuration")

    return credentials


async def publish_to_platform(
    platform: str,
    post: Dict[str, Any],
    credentials: Dict[str, Any]
) -> PublishResult:
    """
    Publish a post to a single platform
    
    Args:
        platform: Platform name
        post: Post data from database
        credentials: Platform credentials
        
    Returns:
        PublishResult
    """
    try:
        # Extract content for this platform
        content = post.get("content", {})
        raw_content = content.get(platform) or post.get("topic", "")
        
        # Convert content to string (handle structured content objects)
        text_content = ""
        if isinstance(raw_content, str):
            text_content = raw_content
        elif isinstance(raw_content, dict):
            text_content = raw_content.get("description") or raw_content.get("content") or \
                          raw_content.get("title") or raw_content.get("caption") or ""
        
        # Fallback to topic
        if not text_content and post.get("topic"):
            text_content = post["topic"]
        
        # Extract media from content JSONB
        generated_image = content.get("generatedImage")
        generated_video_url = content.get("generatedVideoUrl")
        carousel_images = content.get("carouselImages", [])
        
        # Determine media URL
        media_url = generated_image or generated_video_url
        if not media_url and carousel_images:
            media_url = carousel_images[0]
        
        # Determine media type
        video_post_types = ["reel", "video", "short"]
        post_type = post.get("post_type", "post")
        media_type = "video" if post_type in video_post_types or generated_video_url else "image"
        
        # Import platform services
        if platform == "twitter":
            from ...services.platforms.twitter_service import twitter_service
            
            access_token = credentials.get("accessToken", "")
            access_token_secret = credentials.get("accessTokenSecret", "")
            
            # Upload media if needed
            media_ids = []
            if media_url:
                upload_result = await twitter_service.upload_media_from_url(
                    access_token, access_token_secret, media_url
                )
                if upload_result.get("success"):
                    media_ids = [upload_result["media_id"]]
            
            # Post tweet
            result = await twitter_service.post_tweet(
                access_token, access_token_secret, text_content, media_ids if media_ids else None
            )
            
            if result.get("success"):
                return PublishResult(
                    platform=platform,
                    success=True,
                    postId=result.get("tweet_id")
                )
            else:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error=result.get("error", "Failed to post")
                )
                
        elif platform == "instagram":
            from ...services.social_service import social_service
            
            access_token = credentials.get("accessToken", "")
            ig_user_id = credentials.get("userId", "")
            
            if not media_url and not carousel_images:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error="Instagram requires media"
                )
            
            try:
                # Check if carousel
                if carousel_images and len(carousel_images) >= 2:
                    container_result = await social_service.instagram_create_carousel_container(
                        ig_user_id, access_token, carousel_images, text_content
                    )
                elif post_type == "reel" or media_type == "video":
                    container_result = await social_service.instagram_create_reels_container(
                        ig_user_id, access_token, media_url, text_content
                    )
                elif post_type == "story":
                    container_result = await social_service.instagram_create_story_container(
                        ig_user_id, access_token, media_url, media_type == "video"
                    )
                else:
                    # Regular image post
                    container_result = await social_service.instagram_create_media_container(
                        ig_user_id, access_token, media_url, text_content
                    )
                
                if not container_result.get("success"):
                    return PublishResult(
                        platform=platform,
                        success=False,
                        error=container_result.get("error", "Failed to create container")
                    )
                
                container_id = container_result.get("container_id") or container_result.get("id")
                
                # Wait for container to be ready
                await social_service.instagram_wait_for_container_ready(container_id, access_token)
                
                # Publish the container
                publish_result = await social_service.instagram_publish_media_container(
                    ig_user_id, access_token, container_id
                )
                
                if publish_result.get("success"):
                    return PublishResult(
                        platform=platform,
                        success=True,
                        postId=publish_result.get("post_id") or publish_result.get("id")
                    )
                else:
                    return PublishResult(
                        platform=platform,
                        success=False,
                        error=publish_result.get("error", "Failed to publish")
                    )
                    
            except Exception as e:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error=str(e)
                )
                
        elif platform == "facebook":
            from ...services.social_service import social_service
            
            access_token = credentials.get("pageAccessToken") or credentials.get("accessToken", "")
            page_id = credentials.get("pageId", "")
            
            try:
                # Check if carousel
                if carousel_images and len(carousel_images) >= 2:
                    # Upload photos as unpublished first
                    photo_ids = []
                    for img_url in carousel_images:
                        upload_result = await social_service.facebook_upload_photo_unpublished(
                            page_id, access_token, img_url
                        )
                        if upload_result.get("success"):
                            photo_ids.append(upload_result.get("photo_id"))
                    
                    if len(photo_ids) >= 2:
                        result = await social_service.facebook_create_carousel(
                            page_id, access_token, photo_ids, text_content
                        )
                    else:
                        return PublishResult(
                            platform=platform,
                            success=False,
                            error="Failed to upload carousel images"
                        )
                        
                elif post_type == "reel" and media_url:
                    result = await social_service.facebook_upload_reel(
                        page_id, access_token, media_url, text_content
                    )
                elif post_type == "story" and media_url:
                    result = await social_service.facebook_upload_story(
                        page_id, access_token, media_url, media_type == "video"
                    )
                elif media_type == "video" and media_url:
                    result = await social_service.facebook_upload_video(
                        page_id, access_token, media_url, text_content
                    )
                elif media_url:
                    result = await social_service.facebook_post_photo(
                        page_id, access_token, media_url, text_content
                    )
                else:
                    # Text only post
                    result = await social_service.facebook_post_to_page(
                        page_id, access_token, text_content
                    )
                
                if result.get("success"):
                    return PublishResult(
                        platform=platform,
                        success=True,
                        postId=result.get("post_id") or result.get("video_id") or result.get("id")
                    )
                else:
                    return PublishResult(
                        platform=platform,
                        success=False,
                        error=result.get("error", "Failed to post")
                    )
                    
            except Exception as e:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error=str(e)
                )
                
        elif platform == "linkedin":
            from ...services.platforms.linkedin_service import linkedin_service
            
            access_token = credentials.get("accessToken", "")
            person_id = credentials.get("personId") or credentials.get("profileId", "")
            organization_id = credentials.get("organizationId")
            post_to_page = credentials.get("postToPage", False)
            if isinstance(raw_content, dict):
                post_to_page = raw_content.get("postToPage", post_to_page)
            post_to_page = post.get("linkedInPostToPage", post_to_page)
            is_organization = post_to_page and organization_id
            
            # Determine target URN
            author_urn = organization_id if is_organization else person_id
            
            try:
                # Check if carousel
                if carousel_images and len(carousel_images) >= 2:
                    # Download images and upload to LinkedIn
                    import httpx
                    async with httpx.AsyncClient() as client:
                        image_urns = []
                        for img_url in carousel_images:
                            # Download image
                            img_response = await client.get(img_url)
                            if img_response.status_code == 200:
                                upload_result = await linkedin_service.upload_image(
                                    access_token, author_urn, img_response.content, is_organization
                                )
                                if upload_result.get("success"):
                                    image_urns.append(upload_result.get("asset"))
                        
                        if len(image_urns) >= 2:
                            result = await linkedin_service.post_carousel(
                                access_token, author_urn, text_content, image_urns,
                                "PUBLIC", is_organization
                            )
                        else:
                            return PublishResult(
                                platform=platform,
                                success=False,
                                error="Failed to upload carousel images"
                            )
                            
                elif media_url:
                    # Download and upload media first
                    import httpx
                    async with httpx.AsyncClient() as client:
                        media_response = await client.get(media_url)
                        if media_response.status_code == 200:
                            if media_type == "video":
                                # Upload video
                                init_result = await linkedin_service.initialize_video_upload(
                                    access_token, author_urn, len(media_response.content), is_organization
                                )
                                if init_result.get("success"):
                                    upload_result = await linkedin_service.upload_video_binary(
                                        init_result["upload_url"], media_response.content, access_token
                                    )
                                    if upload_result.get("success"):
                                        await linkedin_service.finalize_video_upload(
                                            access_token, init_result["asset"], [upload_result.get("etag", "")]
                                        )
                                        media_urn = init_result["asset"]
                                    else:
                                        media_urn = None
                                else:
                                    media_urn = None
                            else:
                                # Upload image
                                upload_result = await linkedin_service.upload_image(
                                    access_token, author_urn, media_response.content, is_organization
                                )
                                media_urn = upload_result.get("asset") if upload_result.get("success") else None
                        else:
                            media_urn = None
                    
                    result = await linkedin_service.post_to_linkedin(
                        access_token, author_urn, text_content, "PUBLIC", media_urn, is_organization
                    )
                else:
                    # Text only post
                    result = await linkedin_service.post_to_linkedin(
                        access_token, author_urn, text_content, "PUBLIC", None, is_organization
                    )
                
                if result.get("success"):
                    return PublishResult(
                        platform=platform,
                        success=True,
                        postId=result.get("post_id")
                    )
                else:
                    return PublishResult(
                        platform=platform,
                        success=False,
                        error=result.get("error", "Failed to post")
                    )
                    
            except Exception as e:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error=str(e)
                )
                
        elif platform == "tiktok":
            from ...services.platforms.tiktok_service import tiktok_service
            
            access_token = credentials.get("accessToken", "")
            
            if not generated_video_url:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error="TikTok requires a video"
                )
            
            try:
                # Use init_video_publish which pulls from URL
                result = await tiktok_service.init_video_publish(
                    access_token, text_content, generated_video_url, "PUBLIC_TO_EVERYONE"
                )
                
                if result.get("success"):
                    return PublishResult(
                        platform=platform,
                        success=True,
                        postId=result.get("publish_id")
                    )
                else:
                    return PublishResult(
                        platform=platform,
                        success=False,
                        error=result.get("error", "Failed to post")
                    )
            except Exception as e:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error=str(e)
                )
                
        elif platform == "youtube":
            from ...services.platforms.youtube_service import youtube_service
            
            access_token = credentials.get("accessToken", "")
            
            if not generated_video_url:
                return PublishResult(
                    platform=platform,
                    success=False,
                    error="YouTube requires a video"
                )
            
            try:
                title = text_content[:100] if text_content else post.get("topic", "")[:100]
                description = text_content or post.get("topic", "")
                
                # Extract thumbnail URL if available
                thumbnail_url = content.get("thumbnailUrl") or content.get("coverImage")
                
                # Use upload_video_from_url with correct parameters including thumbnail
                result = await youtube_service.upload_video_from_url(
                    access_token, title, description, generated_video_url,
                    None, "public", "22", thumbnail_url
                )
                
                if result.get("success"):
                    return PublishResult(
                        platform=platform,
                        success=True,
                        postId=result.get("video_id")
                    )
                else:
                    return PublishResult(
                        platform=platform,
                        success=False,
                        error=result.get("error", "Failed to upload")
                    )
            except Exception as e:
                logger.error(f"Error publishing to {platform}: {e}", exc_info=True)
                return PublishResult(
                    platform=platform,
                    success=False,
                    error=str(e)
                )
        
        else:
            return PublishResult(
                platform=platform,
                success=False,
                error=f"Unsupported platform: {platform}"
            )
            
    except Exception as e:
        logger.error(f"Error publishing to {platform}: {e}", exc_info=True)
        return PublishResult(
            platform=platform,
            success=False,
            error=str(e)
        )


async def update_post_status(
    post_id: str,
    status: str,  # 'published' or 'failed'
    error_message: Optional[str] = None,
    publish_results: Optional[List[PublishResult]] = None
) -> None:
    """
    Update post status in database
    
    For successful publishes: delete the post
    For failures: increment retry count, mark as failed after max retries
    """
    supabase = get_supabase_admin_client()
    now = datetime.now(timezone.utc).isoformat()
    
    if status == "published":
        # Delete post after successful publishing (same as manual publish)
        supabase.table("posts").delete().eq("id", post_id).execute()
        logger.info(f"Deleted published post {post_id}")
    else:
        # Get current retry count
        current = supabase.table("posts").select(
            "content,publish_retry_count"
        ).eq("id", post_id).single().execute()
        
        current_retry_count = current.data.get("publish_retry_count", 0) if current.data else 0
        new_retry_count = current_retry_count + 1
        
        update_data = {
            "updated_at": now,
            "publish_retry_count": new_retry_count,
            "publish_error": error_message,
        }
        
        # Only mark as permanently failed after max retries
        if new_retry_count >= CONFIG["MAX_RETRY_COUNT"]:
            update_data["status"] = "failed"
            logger.warning(f"Post {post_id} marked as failed after {new_retry_count} attempts")
        # Otherwise keep as 'scheduled' for retry on next cron run
        
        # Store error details in content JSONB for UI display
        if current.data and current.data.get("content"):
            existing_content = current.data["content"]
            existing_content["_publishLog"] = {
                "lastAttempt": now,
                "retryCount": new_retry_count,
                "error": error_message,
                "results": [r.model_dump() for r in publish_results] if publish_results else [],
            }
            update_data["content"] = existing_content
        
        supabase.table("posts").update(update_data).eq("id", post_id).execute()


async def log_publish_activity(
    post: Dict[str, Any],
    status: str,
    results: List[PublishResult]
) -> None:
    """Log publish activity to activity_logs table"""
    supabase = get_supabase_admin_client()
    success_count = sum(1 for r in results if r.success)
    
    supabase.table("activity_logs").insert({
        "workspace_id": post.get("workspace_id"),
        "user_id": post.get("created_by"),
        "action": "post_published" if status == "published" else "post_publish_failed",
        "resource_type": "post",
        "resource_id": post.get("id"),
        "details": {
            "scheduled": True,
            "scheduled_at": post.get("scheduled_at"),
            "published_at": datetime.now(timezone.utc).isoformat(),
            "platforms": [r.model_dump() for r in results],
            "success_count": success_count,
            "total_platforms": len(results),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


# ============================================================================
# API ENDPOINTS
# ============================================================================

async def _pick_workspace_user_id(supabase, workspace_id: str) -> Optional[str]:
    admin = supabase.table("users").select(
        "id"
    ).eq("workspace_id", workspace_id).eq("is_active", True).eq("role", "admin").order(
        "created_at", desc=False
    ).limit(1).execute()
    if admin.data:
        return admin.data[0].get("id")

    any_user = supabase.table("users").select(
        "id"
    ).eq("workspace_id", workspace_id).eq("is_active", True).order(
        "created_at", desc=False
    ).limit(1).execute()
    if any_user.data:
        return any_user.data[0].get("id")
    return None


async def _build_comment_agent_credentials(
    supabase,
    workspace_id: str,
    platforms: List[str],
) -> Optional[CommentAgentCredentials]:
    """
    Build credentials for comment agent using ONLY centralized service (NO fallbacks)
    
    Cron jobs use refresh_if_needed=False - they use cached tokens refreshed by publish button
    """
    credentials: Dict[str, Any] = {}
    
    try:
        # Use centralized Meta credentials service ONLY (NO fallbacks)
        has_meta_platforms = any(p in ["instagram", "facebook"] for p in platforms)
        
        if has_meta_platforms:
            # Get Meta credentials from centralized service (NO refresh for cron)
            meta_creds = await MetaCredentialsService.get_meta_credentials(
                workspace_id,
                refresh_if_needed=False  # Cron jobs use cached token
            )
            
            if meta_creds:
                # Extract Meta credentials
                if meta_creds.get("access_token"):
                    credentials["accessToken"] = meta_creds["access_token"]
                
                if meta_creds.get("page_id"):
                    credentials["facebookPageId"] = meta_creds["page_id"]
                
                if meta_creds.get("page_access_token"):
                    credentials["pageAccessToken"] = meta_creds["page_access_token"]
                
                # Get Instagram user ID if needed
                if "instagram" in platforms:
                    ig_creds = await MetaCredentialsService.get_instagram_credentials(
                        workspace_id,
                        refresh_if_needed=False  # Cron jobs use cached token
                    )
                    if ig_creds and ig_creds.get("ig_user_id"):
                        credentials["instagramUserId"] = ig_creds["ig_user_id"]
        
        # Get YouTube credentials (non-Meta platform)
        if "youtube" in platforms:
            try:
                refresh_result = await token_refresh_service.get_valid_credentials(
                    platform="youtube",
                    workspace_id=workspace_id,
                )
                yt_credentials = refresh_result.credentials if refresh_result.success else None
                if yt_credentials:
                    credentials["youtubeAccessToken"] = yt_credentials.get("accessToken") or yt_credentials.get("access_token")
                    channel_id = yt_credentials.get("channelId") or yt_credentials.get("channel_id")
                    if channel_id:
                        credentials["youtubeChannelId"] = channel_id
            except Exception as e:
                logger.warning(f"YouTube credentials failed: {e}")
        
        if not credentials:
            logger.warning(f"No valid credentials found for workspace {workspace_id}")
            return None
        
        logger.info(f"Built credentials for workspace {workspace_id}: accessToken={'present' if credentials.get('accessToken') else 'missing'}, youtubeAccessToken={'present' if credentials.get('youtubeAccessToken') else 'missing'}")
        return CommentAgentCredentials(**credentials)
        
    except Exception as e:
        logger.error(f"Error building credentials for workspace {workspace_id}: {e}", exc_info=True)
        return None


@router.get("/process-comments", response_model=CommentsCronResponse)
async def cron_process_comments(
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None),
    workspace_id: Optional[str] = None,
    platforms: Optional[str] = None,
):
    if not verify_cron_auth(x_cron_secret):
        return JSONResponse(
            status_code=401,
            content=CommentsCronResponse(
                success=False,
                processed=0,
                succeeded=0,
                failed=0,
                error="Unauthorized - invalid or missing X-Cron-Secret",
            ).model_dump(),
        )

    try:
        supabase = get_supabase_admin_client()
        platform_list = [p.strip() for p in (platforms or "instagram,facebook,youtube").split(",") if p.strip()]

        workspaces: List[str] = []
        if workspace_id:
            workspaces = [workspace_id]
        else:
            ws = supabase.table("workspaces").select("id").eq("is_active", True).execute()
            workspaces = [w.get("id") for w in (ws.data or []) if w.get("id")]

        results: List[CommentsCronWorkspaceResult] = []

        for ws_id in workspaces:
            user_id = await _pick_workspace_user_id(supabase, ws_id)
            if not user_id:
                results.append(CommentsCronWorkspaceResult(
                    workspaceId=ws_id,
                    userId="",
                    success=False,
                    errors=1,
                    errorMessage="No active user found for workspace",
                ))
                continue

            creds = await _build_comment_agent_credentials(supabase, ws_id, platform_list)
            resp = await process_comments(ProcessCommentsRequest(
                workspaceId=ws_id,
                userId=user_id,
                platforms=platform_list,
                runType="cron",
                credentials=creds,
            ))

            results.append(CommentsCronWorkspaceResult(
                workspaceId=ws_id,
                userId=user_id,
                success=resp.success,
                commentsFetched=resp.commentsFetched,
                autoReplied=resp.autoReplied,
                escalated=resp.escalated,
                errors=resp.errors,
                errorMessage=getattr(resp, "errorMessage", None),
            ))

        succeeded = sum(1 for r in results if r.success)
        failed = len(results) - succeeded
        return CommentsCronResponse(
            success=failed == 0,
            processed=len(results),
            succeeded=succeeded,
            failed=failed,
            results=results,
        )

    except Exception as e:
        logger.error(f"Cron comments error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=CommentsCronResponse(
                success=False,
                processed=0,
                succeeded=0,
                failed=0,
                error=str(e),
            ).model_dump(),
        )


@router.get("/publish-scheduled", response_model=CronResponse)
async def publish_scheduled_posts(
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """
    GET /api/v1/cron/publish-scheduled
    
    Process and publish all scheduled posts that are due.
    
    Called by external cron service (cron-job.org) every minute.
    
    Authentication:
    - X-Cron-Secret header must match CRON_SECRET env variable
    
    Workflow:
    1. Query posts where status='scheduled' AND scheduled_at <= NOW()
    2. For each post, publish to all platforms
    3. On success: delete post
    4. On failure: increment retry count, mark as failed after 3 attempts
    5. Log activity
    
    Returns:
        CronResponse with processing summary
    """
    start_time = datetime.now(timezone.utc)
    
    try:
        # 1. Verify authentication
        if not verify_cron_auth(x_cron_secret):
            logger.warning("Cron auth failed - invalid or missing X-Cron-Secret")
            return JSONResponse(
                status_code=401,
                content=CronResponse(
                    success=False,
                    error="Unauthorized - invalid or missing X-Cron-Secret",
                    processed=0,
                    published=0,
                    failed=0
                ).model_dump(),
            )
        
        logger.info("Cron job started: publish-scheduled")
        
        # 2. Get Supabase client
        supabase = get_supabase_admin_client()
        
        # 3. Fetch scheduled posts that are due
        # Use UTC for consistency
        utc_now = datetime.now(timezone.utc)
        now_string = utc_now.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Debug: Check ALL posts to see what their statuses actually are
        all_posts_query = supabase.table("posts").select("id, status, scheduled_at, workspace_id").limit(10).execute()
        all_posts = all_posts_query.data or []
        logger.info(f"DEBUG: Sample of posts in DB (Total sample: {len(all_posts)}):")
        for p in all_posts:
            logger.info(f"DEBUG: Post {p.get('id')} - Status: '{p.get('status')}', Scheduled: {p.get('scheduled_at')}, Workspace: {p.get('workspace_id')}")

        # Original debug for scheduled only
        all_scheduled_query = supabase.table("posts").select("id, status, scheduled_at, publish_retry_count").eq(
            "status", "scheduled"
        ).execute()
        
        all_scheduled = all_scheduled_query.data or []
        logger.info(f"DEBUG: Total posts with status='scheduled' in DB: {len(all_scheduled)}")
        for p in all_scheduled:
            logger.info(f"DEBUG: Post {p.get('id')} scheduled_at: {p.get('scheduled_at')}, now: {now_string}")

        # Improved query: Only fetch posts that are due AND haven't exceeded retry count
        # This prevents failed posts from blocking the queue
        query = supabase.table("posts").select("*").eq(
            "status", "scheduled"
        ).lte("scheduled_at", now_string)
        
        # Filter out posts that already reached max retries. 
        # We use a filter that includes rows where publish_retry_count is NULL or < 3
        query = query.or_(f"publish_retry_count.is.null,publish_retry_count.lt.{CONFIG['MAX_RETRY_COUNT']}")
        
        result = query.order(
            "scheduled_at", desc=False
        ).limit(CONFIG["MAX_POSTS_PER_RUN"]).execute()
        
        scheduled_posts = result.data or []
        
        # Filter again in Python to be 100% sure and handle NULLs
        scheduled_posts = [
            p for p in scheduled_posts 
            if (p.get("publish_retry_count") or 0) < CONFIG["MAX_RETRY_COUNT"]
        ]
        
        # 4. Handle no posts case
        if not scheduled_posts:
            logger.info("No scheduled posts to process")
            return CronResponse(
                success=True,
                message="No scheduled posts to process",
                processed=0,
                published=0,
                failed=0
            )
        
        logger.info(f"Found {len(scheduled_posts)} scheduled posts to process")
        
        # 5. Process each post
        processed_results: List[ProcessedPost] = []
        
        for post in scheduled_posts:
            post_id = post.get("id")
            topic = post.get("topic", "Untitled")
            platforms = post.get("platforms", [])
            workspace_id = post.get("workspace_id")
            
            logger.info(f"Processing post {post_id}: {topic}")
            
            try:
                # Publish to all platforms
                platform_results: List[PublishResult] = []
                
                for platform in platforms:
                    try:
                        # Get credentials for this platform
                        credentials = await get_platform_credentials(workspace_id, platform)
                        
                        # Publish to platform
                        result = await publish_to_platform(platform, post, credentials)
                        platform_results.append(result)
                        
                    except Exception as e:
                        logger.error(f"Error with {platform}: {e}")
                        platform_results.append(PublishResult(
                            platform=platform,
                            success=False,
                            error=str(e)
                        ))
                
                # Determine overall status
                success_count = sum(1 for r in platform_results if r.success)
                total_platforms = len(platform_results)
                
                if success_count == total_platforms:
                    post_status = "published"
                elif success_count == 0:
                    post_status = "failed"
                else:
                    post_status = "partial"
                
                # Update post in database
                db_status = "published" if post_status == "partial" else post_status
                error_msg = None
                if post_status != "published":
                    error_msg = "; ".join(
                        f"{r.platform}: {r.error}" 
                        for r in platform_results if not r.success
                    )
                
                await update_post_status(post_id, db_status, error_msg, platform_results)
                
                # Log activity
                await log_publish_activity(post, db_status, platform_results)
                
                processed_results.append(ProcessedPost(
                    postId=post_id,
                    topic=topic,
                    status=post_status,
                    platforms=platform_results
                ))
                
                logger.info(f"Post {post_id} processed: {post_status} ({success_count}/{total_platforms})")
                
            except Exception as e:
                logger.error(f"Error processing post {post_id}: {e}", exc_info=True)
                
                await update_post_status(post_id, "failed", str(e))
                
                processed_results.append(ProcessedPost(
                    postId=post_id,
                    topic=topic,
                    status="failed",
                    platforms=[PublishResult(
                        platform="all",
                        success=False,
                        error=str(e)
                    )]
                ))
        
        # 6. Calculate summary
        published = sum(1 for r in processed_results if r.status in ["published", "partial"])
        failed = sum(1 for r in processed_results if r.status == "failed")
        
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(f"Cron completed: {len(processed_results)} processed, {published} published, {failed} failed in {duration:.2f}s")
        
        return CronResponse(
            success=True,
            message=f"Processed {len(processed_results)} posts in {duration:.2f}s",
            processed=len(processed_results),
            published=published,
            failed=failed,
            results=processed_results,
            debug_now=now_string
        )
        
    except Exception as e:
        logger.error(f"Cron job error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content=CronResponse(
                success=False,
                error=str(e),
                processed=0,
                published=0,
                failed=0
            ).model_dump(),
        )


@router.post("/publish-scheduled", response_model=CronResponse)
async def publish_scheduled_posts_post(
    request: Request,
    x_cron_secret: Optional[str] = Header(default=None)
):
    """POST method for manual triggers - delegates to GET handler"""
    return await publish_scheduled_posts(request, x_cron_secret)


@router.get("/info/service")
async def cron_api_info():
    """Get Cron API service information"""
    return {
        "service": "Cron Jobs",
        "version": "1.0.0",
        "description": "Scheduled post publishing via external cron service",
        "endpoints": {
            "/publish-scheduled": {
                "GET": "Process and publish scheduled posts",
                "POST": "Same as GET (for manual triggers)",
            }
        },
        "authentication": "X-Cron-Secret header",
        "configuration": {
            "max_retry_count": CONFIG["MAX_RETRY_COUNT"],
            "max_posts_per_run": CONFIG["MAX_POSTS_PER_RUN"],
            "timeout_seconds": CONFIG["REQUEST_TIMEOUT_SECONDS"],
        },
        "setup_instructions": {
            "step_1": "Create account at https://cron-job.org (free)",
            "step_2": "Add new cron job with your backend URL + /api/v1/cron/publish-scheduled",
            "step_3": "Set method to GET",
            "step_4": "Set schedule to 'Every 1 minute' (* * * * *)",
            "step_5": "Add header: X-Cron-Secret: YOUR_CRON_SECRET",
            "step_6": "Enable failure notifications",
        },
        "cron_secret_configured": bool(getattr(settings, 'CRON_SECRET', None)),
    }
