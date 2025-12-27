"""
Posts API Router
CRUD operations for social media posts
"""

import re
import logging
from typing import Optional, Literal, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.services.supabase_service import get_supabase_admin_client


router = APIRouter(prefix="/api/v1/posts", tags=["Posts"])
logger = logging.getLogger(__name__)


# ================== SCHEMAS ==================

class PostContent(BaseModel):
    """Post content stored as JSONB"""
    generated_image: Optional[str] = Field(None, alias="generatedImage")
    carousel_images: Optional[list[str]] = Field(None, alias="carouselImages")
    generated_video_url: Optional[str] = Field(None, alias="generatedVideoUrl")
    is_generating_image: bool = Field(False, alias="isGeneratingImage")
    is_generating_video: bool = Field(False, alias="isGeneratingVideo")
    video_generation_status: Optional[str] = Field(None, alias="videoGenerationStatus")
    video_operation: Optional[str] = Field(None, alias="videoOperation")
    platform_templates: Optional[dict] = Field(None, alias="platformTemplates")
    image_metadata: Optional[dict] = Field(None, alias="imageMetadata")
    generated_image_timestamp: Optional[str] = Field(None, alias="generatedImageTimestamp")
    image_generation_progress: Optional[int] = Field(None, alias="imageGenerationProgress")
    
    class Config:
        populate_by_name = True


class PostData(BaseModel):
    """Post data for create/update"""
    id: Optional[str] = None
    topic: str
    platforms: list[str]
    content: Optional[dict] = None
    post_type: str = Field("post", alias="postType")
    status: str = "draft"
    scheduled_at: Optional[str] = Field(None, alias="scheduledAt")
    published_at: Optional[str] = Field(None, alias="publishedAt")
    
    # Content fields
    generated_image: Optional[str] = Field(None, alias="generatedImage")
    carousel_images: Optional[list[str]] = Field(None, alias="carouselImages")
    generated_video_url: Optional[str] = Field(None, alias="generatedVideoUrl")
    is_generating_image: bool = Field(False, alias="isGeneratingImage")
    is_generating_video: bool = Field(False, alias="isGeneratingVideo")
    video_generation_status: Optional[str] = Field(None, alias="videoGenerationStatus")
    video_operation: Optional[str] = Field(None, alias="videoOperation")
    platform_templates: Optional[dict] = Field(None, alias="platformTemplates")
    image_metadata: Optional[dict] = Field(None, alias="imageMetadata")
    generated_image_timestamp: Optional[str] = Field(None, alias="generatedImageTimestamp")
    image_generation_progress: Optional[int] = Field(None, alias="imageGenerationProgress")
    
    class Config:
        populate_by_name = True


class CreatePostRequest(BaseModel):
    """Request to create a post"""
    post: PostData
    workspace_id: str = Field(..., alias="workspaceId")
    
    class Config:
        populate_by_name = True


class UpdatePostRequest(BaseModel):
    """Request to update a post"""
    post: PostData
    workspace_id: str = Field(..., alias="workspaceId")
    
    class Config:
        populate_by_name = True


# ================== HELPER FUNCTIONS ==================

def is_base64_data_url(s: Optional[str]) -> bool:
    """Check if string is a base64 data URL."""
    if not s:
        return False
    return s.startswith("data:") and ";base64," in s


def transform_db_post(db_post: dict) -> dict:
    """Transform database format to frontend format."""
    content = db_post.get("content", {}) or {}
    
    return {
        "id": db_post.get("id"),
        "topic": db_post.get("topic"),
        "platforms": db_post.get("platforms"),
        "content": content,
        "postType": db_post.get("post_type", "post"),
        "status": db_post.get("status"),
        "createdAt": db_post.get("created_at"),
        "scheduledAt": db_post.get("scheduled_at"),
        "publishedAt": db_post.get("published_at"),
        "engagementScore": db_post.get("engagement_score"),
        "engagementSuggestions": db_post.get("engagement_suggestions"),
        "generatedImage": content.get("generatedImage"),
        "carouselImages": content.get("carouselImages"),
        "generatedVideoUrl": content.get("generatedVideoUrl"),
        "platformTemplates": content.get("platformTemplates"),
        "imageMetadata": content.get("imageMetadata"),
        "generatedImageTimestamp": content.get("generatedImageTimestamp"),
        "imageGenerationProgress": content.get("imageGenerationProgress"),
        "isGeneratingImage": content.get("isGeneratingImage", False),
        "isGeneratingVideo": content.get("isGeneratingVideo", False),
        "videoGenerationStatus": content.get("videoGenerationStatus", ""),
        "videoOperation": content.get("videoOperation"),
    }


# ================== ENDPOINTS ==================

@router.get("")
async def get_posts(
    user_id: str,
    workspace_id: str = Query(..., alias="workspace_id")
):
    """
    GET /api/v1/posts
    Fetch all posts for a workspace.
    """
    try:
        supabase = get_supabase_admin_client()
        
        result = supabase.table("posts").select("*").eq(
            "workspace_id", workspace_id
        ).order("created_at", desc=True).execute()
        
        posts = [transform_db_post(p) for p in (result.data or [])]
        
        return posts
        
    except Exception as e:
        logger.error(f"Error getting posts: {e}")
        raise HTTPException(status_code=500, detail="Failed to get posts")


@router.post("")
async def create_post(user_id: str, request: CreatePostRequest):
    """
    POST /api/v1/posts
    Create a new post.
    """
    try:
        supabase = get_supabase_admin_client()
        post = request.post
        
        # Build content JSONB
        content_data = post.content or {}
        content_data.update({
            "generatedImage": post.generated_image,
            "carouselImages": post.carousel_images,
            "generatedVideoUrl": post.generated_video_url,
            "isGeneratingImage": post.is_generating_image,
            "isGeneratingVideo": post.is_generating_video,
            "videoGenerationStatus": post.video_generation_status,
            "videoOperation": post.video_operation,
            "platformTemplates": post.platform_templates,
            "imageMetadata": post.image_metadata,
            "generatedImageTimestamp": post.generated_image_timestamp,
            "imageGenerationProgress": post.image_generation_progress,
        })
        
        # Determine post type
        post_type = post.post_type
        if post.carousel_images and len(post.carousel_images) > 0:
            post_type = "carousel"
        
        db_post = {
            "workspace_id": request.workspace_id,
            "created_by": user_id,
            "topic": post.topic,
            "platforms": post.platforms,
            "post_type": post_type,
            "content": content_data,
            "status": post.status,
            "created_at": datetime.now().isoformat()
        }
        
        if post.id:
            db_post["id"] = post.id
        if post.scheduled_at:
            db_post["scheduled_at"] = post.scheduled_at
        if post.published_at:
            db_post["published_at"] = post.published_at
        
        result = supabase.table("posts").insert(db_post).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create post")
        
        # Log activity
        supabase.table("activity_logs").insert({
            "workspace_id": request.workspace_id,
            "user_id": user_id,
            "action": "create",
            "resource_type": "post",
            "resource_id": result.data[0]["id"],
            "details": {},
            "created_at": datetime.now().isoformat()
        }).execute()
        
        return {
            "success": True,
            "data": transform_db_post(result.data[0]),
            "message": "Post created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating post: {e}")
        raise HTTPException(status_code=500, detail="Failed to create post")


@router.put("/{post_id}")
async def update_post(user_id: str, post_id: str, request: UpdatePostRequest):
    """
    PUT /api/v1/posts/{post_id}
    Update an existing post.
    """
    try:
        supabase = get_supabase_admin_client()
        post = request.post
        
        # Fetch existing post to preserve content
        existing_result = supabase.table("posts").select("content").eq(
            "id", post_id
        ).eq("workspace_id", request.workspace_id).single().execute()
        
        existing_content = existing_result.data.get("content", {}) if existing_result.data else {}
        
        # Merge content
        content_data = {**existing_content, **(post.content or {})}
        
        # Update specific fields if provided
        if post.generated_image is not None:
            content_data["generatedImage"] = post.generated_image
        if post.carousel_images is not None:
            content_data["carouselImages"] = post.carousel_images
        if post.generated_video_url is not None:
            content_data["generatedVideoUrl"] = post.generated_video_url
        if post.is_generating_image is not None:
            content_data["isGeneratingImage"] = post.is_generating_image
        if post.is_generating_video is not None:
            content_data["isGeneratingVideo"] = post.is_generating_video
        if post.video_generation_status is not None:
            content_data["videoGenerationStatus"] = post.video_generation_status
        if post.video_operation is not None:
            content_data["videoOperation"] = post.video_operation
        if post.platform_templates is not None:
            content_data["platformTemplates"] = post.platform_templates
        if post.image_metadata is not None:
            content_data["imageMetadata"] = post.image_metadata
        if post.generated_image_timestamp is not None:
            content_data["generatedImageTimestamp"] = post.generated_image_timestamp
        if post.image_generation_progress is not None:
            content_data["imageGenerationProgress"] = post.image_generation_progress
        
        # Determine post type
        post_type = post.post_type
        carousel_images = content_data.get("carouselImages")
        if carousel_images and len(carousel_images) > 0:
            post_type = "carousel"
        
        db_post = {
            "topic": post.topic,
            "platforms": post.platforms,
            "post_type": post_type,
            "content": content_data,
            "status": post.status,
            "updated_at": datetime.now().isoformat()
        }
        
        if post.scheduled_at:
            db_post["scheduled_at"] = post.scheduled_at
        if post.published_at:
            db_post["published_at"] = post.published_at
        
        result = supabase.table("posts").update(db_post).eq(
            "id", post_id
        ).eq("workspace_id", request.workspace_id).execute()
        
        # Log activity
        supabase.table("activity_logs").insert({
            "workspace_id": request.workspace_id,
            "user_id": user_id,
            "action": "update",
            "resource_type": "post",
            "resource_id": post_id,
            "details": {},
            "created_at": datetime.now().isoformat()
        }).execute()
        
        return transform_db_post(result.data[0]) if result.data else {"success": True}
        
    except Exception as e:
        logger.error(f"Error updating post: {e}")
        raise HTTPException(status_code=500, detail="Failed to update post")


@router.delete("/{post_id}")
async def delete_post(
    user_id: str,
    post_id: str,
    workspace_id: str = Query(..., alias="workspace_id")
):
    """
    DELETE /api/v1/posts/{post_id}
    Delete a post.
    """
    try:
        supabase = get_supabase_admin_client()
        
        supabase.table("posts").delete().eq(
            "id", post_id
        ).eq("workspace_id", workspace_id).execute()
        
        # Log activity
        supabase.table("activity_logs").insert({
            "workspace_id": workspace_id,
            "user_id": user_id,
            "action": "delete",
            "resource_type": "post",
            "resource_id": post_id,
            "details": {},
            "created_at": datetime.now().isoformat()
        }).execute()
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error deleting post: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete post")


@router.get("/{post_id}")
async def get_post(
    post_id: str,
    workspace_id: str = Query(..., alias="workspace_id")
):
    """
    GET /api/v1/posts/{post_id}
    Get a single post by ID.
    """
    try:
        supabase = get_supabase_admin_client()
        
        result = supabase.table("posts").select("*").eq(
            "id", post_id
        ).eq("workspace_id", workspace_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Post not found")
        
        return transform_db_post(result.data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting post: {e}")
        raise HTTPException(status_code=500, detail="Failed to get post")


# ================== INFO ENDPOINT ==================

@router.get("/info/service")
async def get_posts_api_info():
    """Get Posts API service information"""
    return {
        "service": "Posts",
        "version": "1.0.0",
        "endpoints": {
            "/": {
                "GET": "List all posts for workspace",
                "POST": "Create new post"
            },
            "/{post_id}": {
                "GET": "Get post by ID",
                "PUT": "Update post",
                "DELETE": "Delete post"
            }
        },
        "post_types": ["post", "carousel", "reel", "story", "video"],
        "statuses": ["draft", "scheduled", "published", "archived"]
    }
