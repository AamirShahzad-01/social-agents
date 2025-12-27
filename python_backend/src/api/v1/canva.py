"""
Canva Integration API Router
OAuth, designs, and export functionality for Canva Connect API
"""

import os
import base64
import hashlib
import secrets
import httpx
import json
import logging
import asyncio
from typing import Optional, Literal
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from src.config import settings
from src.services.supabase_service import get_supabase_client


router = APIRouter(prefix="/api/v1/canva", tags=["Canva"])
logger = logging.getLogger(__name__)


# ================== CONFIG ==================

CANVA_CLIENT_ID = getattr(settings, "CANVA_CLIENT_ID", None)
CANVA_CLIENT_SECRET = getattr(settings, "CANVA_CLIENT_SECRET", None)
APP_URL = getattr(settings, "APP_URL", "http://localhost:3000")
CANVA_REDIRECT_URI = f"{APP_URL}/api/canva/callback"

# Canva API endpoints
CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"
CANVA_API_BASE = "https://api.canva.com/rest/v1"


# OAuth scopes for Canva
CANVA_SCOPES = [
    "app:read",
    "app:write",
    "asset:read",
    "asset:write",
    "brandtemplate:content:read",
    "design:content:read",
    "design:content:write",
    "design:meta:read",
    "design:permission:read",
    "design:permission:write",
    "folder:read",
    "folder:write",
    "folder:permission:read",
    "folder:permission:write",
]


# ================== SCHEMAS ==================

class CreateDesignRequest(BaseModel):
    """Request to create a new design"""
    asset_url: Optional[str] = Field(None, alias="assetUrl")
    design_type: str = Field("Document", alias="designType")
    width: Optional[int] = None
    height: Optional[int] = None
    asset_type: Optional[str] = Field(None, alias="assetType")
    
    class Config:
        populate_by_name = True


class ExportDesignRequest(BaseModel):
    """Request to export a design"""
    design_id: str = Field(..., alias="designId")
    workspace_id: str = Field(..., alias="workspaceId")
    format: Literal["png", "jpg", "pdf", "mp4", "gif"] = "png"
    quality: Literal["low", "medium", "high"] = "high"
    save_to_library: bool = Field(True, alias="saveToLibrary")
    
    class Config:
        populate_by_name = True


# ================== HELPER FUNCTIONS ==================

def generate_pkce() -> tuple[str, str]:
    """
    Generate PKCE code verifier and challenge.
    
    Returns:
        Tuple of (code_verifier, code_challenge)
    """
    # Generate random 32-byte verifier
    code_verifier = secrets.token_urlsafe(32)
    
    # Create SHA256 hash and base64url encode
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).decode().rstrip("=")
    
    return code_verifier, code_challenge


async def get_canva_token(user_id: str) -> Optional[str]:
    """
    Get Canva access token for a user.
    Handles token refresh if expired.
    """
    try:
        supabase = get_supabase_client()
        
        result = supabase.table("user_integrations").select(
            "access_token, refresh_token, expires_at"
        ).eq("user_id", user_id).eq("provider", "canva").single().execute()
        
        if not result.data:
            return None
        
        data = result.data
        
        # Check if token is expired
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        if expires_at <= datetime.now(expires_at.tzinfo):
            # Token expired - refresh it
            refreshed = await refresh_canva_token(user_id, data["refresh_token"])
            return refreshed
        
        return data["access_token"]
        
    except Exception as e:
        logger.error(f"Error getting Canva token: {e}")
        return None


async def refresh_canva_token(user_id: str, refresh_token: str) -> Optional[str]:
    """Refresh Canva access token."""
    if not CANVA_CLIENT_ID or not CANVA_CLIENT_SECRET:
        return None
    
    try:
        auth_header = base64.b64encode(
            f"{CANVA_CLIENT_ID}:{CANVA_CLIENT_SECRET}".encode()
        ).decode()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                CANVA_TOKEN_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {auth_header}"
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                }
            )
        
        if response.status_code != 200:
            return None
        
        tokens = response.json()
        
        # Update tokens in database
        supabase = get_supabase_client()
        expires_at = datetime.now().timestamp() + tokens["expires_in"]
        
        supabase.table("user_integrations").update({
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token", refresh_token),
            "expires_at": datetime.fromtimestamp(expires_at).isoformat(),
            "updated_at": datetime.now().isoformat()
        }).eq("user_id", user_id).eq("provider", "canva").execute()
        
        return tokens["access_token"]
        
    except Exception as e:
        logger.error(f"Error refreshing Canva token: {e}")
        return None


def detect_media_type(url: str, format: str) -> str:
    """Detect media type from URL or format."""
    if format in ["mp4", "gif"]:
        return "video"
    return "image"


# ================== AUTH ENDPOINTS ==================

@router.get("/auth")
async def initiate_canva_auth(user_id: str):
    """
    GET /api/v1/canva/auth
    Initiates Canva OAuth flow with PKCE.
    Returns the authorization URL to redirect the user to.
    """
    if not CANVA_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Canva integration not configured. Add CANVA_CLIENT_ID to .env"
        )
    
    # Generate PKCE values
    code_verifier, code_challenge = generate_pkce()
    
    # Create state with user ID and PKCE verifier
    state_data = {
        "userId": user_id,
        "codeVerifier": code_verifier,
        "timestamp": int(datetime.now().timestamp())
    }
    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()
    
    # Build authorization URL
    params = {
        "client_id": CANVA_CLIENT_ID,
        "redirect_uri": CANVA_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(CANVA_SCOPES),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256"
    }
    
    auth_url = f"{CANVA_AUTH_URL}?" + "&".join(
        f"{k}={v}" for k, v in params.items()
    )
    
    return {"authUrl": auth_url}


@router.get("/callback")
async def canva_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None
):
    """
    GET /api/v1/canva/callback
    Handles the OAuth callback from Canva.
    Exchanges authorization code for access tokens.
    """
    dashboard_url = f"{APP_URL}/dashboard/media-studio"
    
    if error:
        return RedirectResponse(f"{dashboard_url}?canva_error={error}")
    
    if not code or not state:
        return RedirectResponse(f"{dashboard_url}?canva_error=missing_params")
    
    try:
        # Decode state
        state_data = json.loads(base64.urlsafe_b64decode(state).decode())
    except Exception:
        return RedirectResponse(f"{dashboard_url}?canva_error=invalid_state")
    
    if not CANVA_CLIENT_ID or not CANVA_CLIENT_SECRET:
        return RedirectResponse(f"{dashboard_url}?canva_error=not_configured")
    
    # Exchange code for tokens
    auth_header = base64.b64encode(
        f"{CANVA_CLIENT_ID}:{CANVA_CLIENT_SECRET}".encode()
    ).decode()
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                CANVA_TOKEN_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {auth_header}"
                },
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": CANVA_REDIRECT_URI,
                    "code_verifier": state_data["codeVerifier"]
                }
            )
        
        if response.status_code != 200:
            logger.error(f"Token exchange failed: {response.text}")
            return RedirectResponse(f"{dashboard_url}?canva_error=token_exchange_failed")
        
        tokens = response.json()
        
        # Store tokens in database
        supabase = get_supabase_client()
        expires_at = datetime.now().timestamp() + tokens["expires_in"]
        
        supabase.table("user_integrations").upsert({
            "user_id": state_data["userId"],
            "provider": "canva",
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "expires_at": datetime.fromtimestamp(expires_at).isoformat(),
            "scopes": tokens.get("scope", ""),
            "updated_at": datetime.now().isoformat()
        }, on_conflict="user_id,provider").execute()
        
        return RedirectResponse(f"{dashboard_url}?canva_connected=true")
        
    except Exception as e:
        logger.error(f"Canva callback error: {e}")
        return RedirectResponse(f"{dashboard_url}?canva_error=unknown")


@router.post("/disconnect")
async def disconnect_canva(user_id: str):
    """
    POST /api/v1/canva/disconnect
    Removes Canva integration for the user.
    """
    try:
        supabase = get_supabase_client()
        
        supabase.table("user_integrations").delete().eq(
            "user_id", user_id
        ).eq("provider", "canva").execute()
        
        return {"success": True}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to disconnect")


# ================== DESIGNS ENDPOINTS ==================

@router.get("/designs")
async def list_designs(user_id: str):
    """
    GET /api/v1/canva/designs
    List user's Canva designs.
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={"error": "Canva not connected", "needsAuth": True}
        )
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CANVA_API_BASE}/designs",
                headers={"Authorization": f"Bearer {access_token}"}
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail="Failed to fetch designs"
            )
        
        return response.json()
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch designs")


@router.post("/designs")
async def create_design(user_id: str, request: CreateDesignRequest):
    """
    POST /api/v1/canva/designs
    Create a new Canva design from a media library asset.
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={"error": "Canva not connected", "needsAuth": True}
        )
    
    try:
        asset_id = None
        
        # Upload asset to Canva if URL provided
        if request.asset_url:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Start URL upload job
                upload_response = await client.post(
                    f"{CANVA_API_BASE}/url-asset-uploads",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "name": "Media Studio Asset",
                        "url": request.asset_url
                    }
                )
                
                if upload_response.status_code == 200:
                    upload_data = upload_response.json()
                    job_id = upload_data.get("job", {}).get("id")
                    
                    if job_id:
                        # Poll for upload completion
                        for _ in range(30):
                            await asyncio.sleep(1)
                            status_response = await client.get(
                                f"{CANVA_API_BASE}/url-asset-uploads/{job_id}",
                                headers={"Authorization": f"Bearer {access_token}"}
                            )
                            
                            if status_response.status_code == 200:
                                status_data = status_response.json()
                                job_status = status_data.get("job", {}).get("status")
                                
                                if job_status == "success":
                                    asset_id = status_data.get("job", {}).get("asset", {}).get("id")
                                    break
                                elif job_status == "failed":
                                    break
        
        # Build design type payload
        preset_map = {
            "Document": "doc",
            "Presentation": "presentation",
            "Whiteboard": "whiteboard"
        }
        
        dimension_map = {
            "Video": (1920, 1080),
            "Instagram Post": (1080, 1080),
            "Instagram Story": (1080, 1920),
            "Facebook Post": (1200, 630),
            "Twitter Post": (1200, 675)
        }
        
        if request.width and request.height:
            design_type_payload = {
                "type": "custom",
                "width": request.width,
                "height": request.height,
                "unit": "px"
            }
        elif request.design_type in dimension_map:
            w, h = dimension_map[request.design_type]
            design_type_payload = {
                "type": "custom",
                "width": w,
                "height": h,
                "unit": "px"
            }
        else:
            design_type_payload = {
                "type": "preset",
                "name": preset_map.get(request.design_type, "doc")
            }
        
        # Create design payload
        design_payload = {
            "title": "Media Studio Asset",
            "design_type": design_type_payload
        }
        
        # Include asset_id for images (not videos)
        if asset_id and request.asset_type != "video":
            design_payload["asset_id"] = asset_id
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            create_response = await client.post(
                f"{CANVA_API_BASE}/designs",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json=design_payload
            )
        
        if create_response.status_code != 200:
            raise HTTPException(
                status_code=create_response.status_code,
                detail="Failed to create design"
            )
        
        design = create_response.json()
        return {"success": True, "design": design}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create design error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create design")


# ================== EXPORT ENDPOINTS ==================

@router.get("/export-formats")
async def get_export_formats(user_id: str, design_id: str = None):
    """
    GET /api/v1/canva/export-formats
    Get available export formats for a design.
    """
    if not design_id:
        raise HTTPException(status_code=400, detail="designId is required")
    
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={"error": "Canva not connected", "needsAuth": True}
        )
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CANVA_API_BASE}/designs/{design_id}/export-formats",
                headers={"Authorization": f"Bearer {access_token}"}
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail="Failed to fetch export formats"
            )
        
        data = response.json()
        
        # Parse formats into simpler structure
        formats = {}
        if data.get("formats"):
            for fmt in data["formats"].keys():
                formats[fmt] = True
        
        return {
            "designId": design_id,
            "formats": formats,
            "raw": data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch export formats")


@router.post("/export")
async def export_design(user_id: str, request: ExportDesignRequest):
    """
    POST /api/v1/canva/export
    Export a Canva design and optionally save to media library.
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={"error": "Canva not connected", "needsAuth": True}
        )
    
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Get design details
            design_response = await client.get(
                f"{CANVA_API_BASE}/designs/{request.design_id}",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            design_title = "Canva Design"
            is_vertical = False
            page_count = 1
            
            if design_response.status_code == 200:
                design_data = design_response.json()
                design_title = design_data.get("design", {}).get("title", design_title)
                page_count = design_data.get("design", {}).get("page_count", 1)
                
                thumb = design_data.get("design", {}).get("thumbnail", {})
                if thumb.get("height", 0) > thumb.get("width", 0):
                    is_vertical = True
            
            # Determine MP4 quality based on orientation
            mp4_quality = "vertical_1080p" if is_vertical else "horizontal_1080p"
            
            # Build export request
            export_body = {
                "design_id": request.design_id,
                "format": {
                    "type": request.format
                },
                "export_quality": "pro" if request.quality == "high" else "regular"
            }
            
            if request.format == "jpg":
                quality_map = {"high": 100, "medium": 75, "low": 50}
                export_body["format"]["quality"] = quality_map[request.quality]
            elif request.format == "mp4":
                export_body["format"]["quality"] = mp4_quality
            
            # Start export job
            export_response = await client.post(
                f"{CANVA_API_BASE}/exports",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json=export_body
            )
            
            if export_response.status_code != 200:
                raise HTTPException(
                    status_code=export_response.status_code,
                    detail=f"Failed to start export: {export_response.text}"
                )
            
            export_job = export_response.json()
            job_id = export_job.get("job", {}).get("id")
            
            if not job_id:
                raise HTTPException(status_code=500, detail="No export job ID returned")
            
            # Poll for export completion
            max_attempts = 120 if request.format == "mp4" else 30
            poll_interval = 2 if request.format == "mp4" else 1
            
            export_url = None
            all_export_urls = []
            
            for attempt in range(max_attempts):
                await asyncio.sleep(poll_interval)
                
                status_response = await client.get(
                    f"{CANVA_API_BASE}/exports/{job_id}",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    job_status = status_data.get("job", {}).get("status")
                    
                    if job_status == "success":
                        all_export_urls = status_data.get("job", {}).get("urls", [])
                        export_url = all_export_urls[0] if all_export_urls else None
                        break
                    elif job_status == "failed":
                        error_msg = status_data.get("job", {}).get("error", {}).get("message", "Unknown error")
                        raise HTTPException(status_code=500, detail=f"Export failed: {error_msg}")
            
            if not export_url:
                raise HTTPException(
                    status_code=504,
                    detail="Export timed out. Video exports may take longer."
                )
            
            # Download from Canva and upload to Cloudinary for permanent storage
            # Canva URLs expire after ~8 hours, so we need permanent storage
            permanent_urls = []
            
            try:
                from src.services.cloudinary_service import CloudinaryService, MediaType
                
                for idx, canva_url in enumerate(all_export_urls):
                    # Download from Canva
                    download_response = await client.get(canva_url)
                    if download_response.status_code != 200:
                        logger.warning(f"Failed to download from Canva: {canva_url}")
                        permanent_urls.append(canva_url)  # Fallback to temp URL
                        continue
                    
                    file_data = download_response.content
                    
                    # Determine media type and upload to Cloudinary
                    if request.format == "mp4":
                        result = await CloudinaryService.upload_video(
                            file_data=file_data,
                            filename=f"canva_export_{request.design_id}_{idx}.mp4",
                            folder="canva-exports",
                            tags=["canva", "export", request.workspace_id],
                        )
                    elif request.format in ["png", "jpg"]:
                        result = await CloudinaryService.upload_image(
                            file_data=file_data,
                            filename=f"canva_export_{request.design_id}_{idx}.{request.format}",
                            folder="canva-exports",
                            tags=["canva", "export", request.workspace_id],
                        )
                    else:
                        # PDF/GIF - upload as raw
                        result = await CloudinaryService.upload_image(
                            file_data=file_data,
                            filename=f"canva_export_{request.design_id}_{idx}.{request.format}",
                            folder="canva-exports",
                            tags=["canva", "export", request.workspace_id],
                        )
                    
                    if result.success:
                        permanent_urls.append(result.secure_url)
                        logger.info(f"Uploaded Canva export to Cloudinary: {result.public_id}")
                    else:
                        logger.warning(f"Cloudinary upload failed: {result.error}")
                        permanent_urls.append(canva_url)  # Fallback to temp URL
                        
            except ImportError:
                # Cloudinary not configured - use Canva URLs directly
                logger.warning("Cloudinary not available, using temporary Canva URLs")
                permanent_urls = all_export_urls
            except Exception as e:
                logger.warning(f"Cloudinary upload error: {e}, using temporary URLs")
                permanent_urls = all_export_urls if not permanent_urls else permanent_urls
            
            if not permanent_urls:
                permanent_urls = all_export_urls  # Final fallback
            
            media_type = detect_media_type(export_url, request.format)
            
            # Get Cloudinary metadata if available
            cloudinary_metadata = {}
            if permanent_urls[0].startswith("https://res.cloudinary.com"):
                cloudinary_metadata = {"storageProvider": "cloudinary"}
            
            # Save to media library if requested
            media_item = None
            if request.save_to_library:
                supabase = get_supabase_client()
                
                media_item = {
                    "type": media_type,
                    "source": "edited",
                    "url": permanent_urls[0],
                    "prompt": f"Edited in Canva: {design_title}",
                    "model": "canva",
                    "config": {
                        "canvaDesignId": request.design_id,
                        "exportFormat": request.format,
                        "exportQuality": request.quality,
                        **cloudinary_metadata
                    },
                    "metadata": {
                        "source": "canva",
                        "designId": request.design_id,
                        "designTitle": design_title,
                        "exportedAt": datetime.now().isoformat(),
                        "pageCount": len(permanent_urls),
                        **cloudinary_metadata
                    },
                    "tags": ["canva", "edited", media_type],
                    "workspace_id": request.workspace_id,
                    "created_at": datetime.now().isoformat()
                }
                
                result = supabase.table("media_library").insert(media_item).execute()
                if result.data:
                    media_item = result.data[0]
            
            return {
                "success": True,
                "mediaItem": media_item,
                "exportUrl": permanent_urls[0],
                "allExportUrls": permanent_urls if len(permanent_urls) > 1 else None,
                "isMultiPage": len(permanent_urls) > 1,
                "pageCount": len(permanent_urls),
                "storageProvider": "cloudinary" if permanent_urls[0].startswith("https://res.cloudinary.com") else "canva"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export design error: {e}")
        raise HTTPException(status_code=500, detail="Failed to export design")


# ================== INFO ENDPOINT ==================

@router.get("/")
async def get_canva_info():
    """Get Canva integration service information"""
    return {
        "service": "Canva Integration",
        "version": "1.0.0",
        "configured": CANVA_CLIENT_ID is not None,
        "endpoints": {
            "auth": {
                "GET": "Initiate OAuth flow with PKCE"
            },
            "callback": {
                "GET": "OAuth callback handler"
            },
            "disconnect": {
                "POST": "Remove Canva integration"
            },
            "designs": {
                "GET": "List user's designs",
                "POST": "Create new design from asset"
            },
            "export-formats": {
                "GET": "Get available export formats"
            },
            "export": {
                "POST": "Export design to media library"
            }
        },
        "scopes": CANVA_SCOPES,
        "supported_design_types": ["Document", "Presentation", "Whiteboard", "Video", "Instagram Post", "Instagram Story", "Facebook Post", "Twitter Post"],
        "supported_export_formats": ["png", "jpg", "pdf", "mp4", "gif"]
    }
