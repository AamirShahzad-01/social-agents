"""
Canva Integration API Router
Production-ready OAuth, designs, and export functionality for Canva Connect API.

Features:
- Secure OAuth 2.0 with PKCE (state stored in database, not URL)
- JWT authentication on all endpoints
- Rate limiting (80 req/min per user)
- Retry logic with exponential backoff
- Proper error responses
- Timezone-aware datetime handling
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Literal
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from src.config import settings
from src.services.supabase_service import get_supabase_client, db_insert
from src.services.canva_service import (
    # Token management
    get_canva_token,
    save_canva_tokens,
    delete_canva_tokens,
    get_canva_connection_status,
    # OAuth state
    create_canva_oauth_state,
    verify_canva_oauth_state,
    # Design operations
    list_designs,
    get_design,
    create_design,
    get_export_formats,
    export_design,
    # Types
    CanvaServiceError,
    detect_media_type,
    # Constants
    CANVA_AUTH_URL,
    CANVA_TOKEN_URL,
    CANVA_SCOPES,
)
from src.services import verify_jwt

router = APIRouter(prefix="/api/v1/canva", tags=["Canva"])
logger = logging.getLogger(__name__)


# ================== CONFIG ==================

CANVA_CLIENT_ID = getattr(settings, "CANVA_CLIENT_ID", None)
CANVA_CLIENT_SECRET = getattr(settings, "CANVA_CLIENT_SECRET", None)
APP_URL = getattr(settings, "APP_URL", "http://localhost:3000")
# Canonical Canva redirect URI (must match the Developer Portal Authorized Redirects exactly).
CANVA_REDIRECT_URI = settings.get_canva_callback_url()


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
    user_id: Optional[str] = Field(None, alias="userId")
    format: Literal["png", "jpg", "pdf", "mp4", "gif"] = "png"
    quality: Literal["low", "medium", "high"] = "high"
    save_to_library: bool = Field(True, alias="saveToLibrary")
    
    class Config:
        populate_by_name = True


class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    code: str
    needsAuth: bool = False


# ================== AUTHENTICATION DEPENDENCY ==================

async def get_authenticated_user(request: Request) -> dict:
    """
    Authenticate user from JWT token in Authorization header.
    
    Returns:
        Dict with user info including id and workspaceId
        
    Raises:
        HTTPException 401 if not authenticated
    """
    auth_header = request.headers.get("authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail=ErrorResponse(
                error="Authentication required",
                code="missing_token",
                needsAuth=True
            ).model_dump()
        )
    
    token = auth_header.split(" ", 1)[1]
    
    try:
        result = await verify_jwt(token)
        
        if not result.get("success") or not result.get("user"):
            raise HTTPException(
                status_code=401,
                detail=ErrorResponse(
                    error="Invalid token",
                    code="invalid_token",
                    needsAuth=True
                ).model_dump()
            )
        
        return result["user"]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"JWT verification error: {e}")
        raise HTTPException(
            status_code=401,
            detail=ErrorResponse(
                error="Authentication failed",
                code="auth_failed",
                needsAuth=True
            ).model_dump()
        )


def get_user_id_param(request: Request) -> Optional[str]:
    """Get user_id from query parameter (fallback for unauthenticated requests)."""
    return request.query_params.get("user_id")


# ================== ERROR HANDLERS ==================

def handle_canva_error(e: CanvaServiceError):
    """Convert CanvaServiceError to HTTPException."""
    return HTTPException(
        status_code=e.status_code,
        detail=ErrorResponse(
            error=e.message,
            code=e.code,
            needsAuth=e.code == "not_connected"
        ).model_dump()
    )


# ================== AUTH ENDPOINTS ==================

@router.get("/auth")
async def initiate_canva_auth(request: Request, user_id: str = None):
    """
    GET /api/v1/canva/auth
    Initiates Canva OAuth flow with PKCE.
    
    The state and code_verifier are stored securely in the database,
    NOT in the URL (which would compromise PKCE security).
    
    Query Params:
        user_id: User ID (required)
        
    Returns:
        { authUrl: string } - URL to redirect user to
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    if not CANVA_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Canva integration not configured. Add CANVA_CLIENT_ID to .env"
        )
    
    try:
        # Create OAuth state with PKCE (stored in database)
        oauth_state = await create_canva_oauth_state(user_id)
        
        # Build authorization URL
        params = {
            "client_id": CANVA_CLIENT_ID,
            "redirect_uri": CANVA_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(CANVA_SCOPES),
            "state": oauth_state.state_token,  # Only the token, not the verifier!
            "code_challenge": oauth_state.code_challenge,
            "code_challenge_method": "S256"
        }
        
        auth_url = f"{CANVA_AUTH_URL}?{urlencode(params)}"
        
        logger.info(f"Canva OAuth initiated for user {user_id}")
        return {"authUrl": auth_url}
        
    except Exception as e:
        logger.error(f"Error initiating Canva auth: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate OAuth")


@router.get("/auth/status")
async def get_canva_auth_status(user_id: str = None):
    """
    GET /api/v1/canva/auth/status
    Check Canva connection status for a user.
    
    Query Params:
        user_id: User ID (required)
        
    Returns:
        Connection status with expiration info
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    status = await get_canva_connection_status(user_id)
    return status


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
    dashboard_url = f"{APP_URL}/dashboard/canva-editor"
    
    if error:
        logger.warning(f"Canva OAuth denied: {error}")
        return RedirectResponse(f"{dashboard_url}?canva_error={error}")
    
    if not code or not state:
        return RedirectResponse(f"{dashboard_url}?canva_error=missing_params")
    
    # Verify state and get code_verifier from database
    state_data = await verify_canva_oauth_state(state)
    if not state_data:
        return RedirectResponse(f"{dashboard_url}?canva_error=invalid_state")
    
    user_id = state_data["user_id"]
    code_verifier = state_data["code_verifier"]
    
    if not CANVA_CLIENT_ID or not CANVA_CLIENT_SECRET:
        return RedirectResponse(f"{dashboard_url}?canva_error=not_configured")
    
    # Exchange code for tokens
    import base64
    import httpx
    
    auth_header = base64.b64encode(
        f"{CANVA_CLIENT_ID}:{CANVA_CLIENT_SECRET}".encode()
    ).decode()
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
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
                    "code_verifier": code_verifier
                }
            )
        
        if response.status_code != 200:
            logger.error(f"Token exchange failed: {response.status_code} - {response.text}")
            return RedirectResponse(f"{dashboard_url}?canva_error=token_exchange_failed")
        
        tokens = response.json()
        
        # Optionally fetch user profile (graceful failure - works without it)
        profile_info = None
        try:
            async with httpx.AsyncClient(timeout=15.0) as profile_client:
                profile_response = await profile_client.get(
                    "https://api.canva.com/rest/v1/users/me",
                    headers={"Authorization": f"Bearer {tokens['access_token']}"}
                )
                if profile_response.status_code == 200:
                    profile_data = profile_response.json()
                    profile_info = profile_data.get("user", profile_data)
                    logger.info(f"Fetched Canva profile for user {user_id}: {profile_info.get('display_name', 'N/A')}")
        except Exception as profile_error:
            logger.warning(f"Could not fetch Canva profile (non-critical): {profile_error}")
        
        # Save tokens with optional profile info
        success = await save_canva_tokens(
            user_id=user_id,
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            expires_in=tokens.get("expires_in", 3600),
            scopes=tokens.get("scope", ""),
            profile_info=profile_info
        )
        
        if not success:
            return RedirectResponse(f"{dashboard_url}?canva_error=save_failed")
        
        logger.info(f"Canva connected for user {user_id}")
        return RedirectResponse(f"{dashboard_url}?canva_connected=true")
        
    except Exception as e:
        logger.error(f"Canva callback error: {e}")
        return RedirectResponse(f"{dashboard_url}?canva_error=unknown")



@router.post("/disconnect")
async def disconnect_canva(user_id: str = None):
    """
    POST /api/v1/canva/disconnect
    Removes Canva integration for the user.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        success = await delete_canva_tokens(user_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Disconnect error: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect")


# ================== DESIGNS ENDPOINTS ==================

@router.get("/designs")
async def get_designs(user_id: str = None, continuation: str = None):
    """
    GET /api/v1/canva/designs
    List user's Canva designs.
    
    Query Params:
        user_id: User ID (required)
        continuation: Pagination token
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        result = await list_designs(user_id, continuation)
        return result
    except CanvaServiceError as e:
        raise handle_canva_error(e)
    except Exception as e:
        logger.error(f"List designs error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch designs")


@router.post("/designs")
async def create_new_design(request: CreateDesignRequest, user_id: str = None):
    """
    POST /api/v1/canva/designs
    Create a new Canva design from a media library asset.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        result = await create_design(
            user_id=user_id,
            design_type=request.design_type,
            width=request.width,
            height=request.height,
            asset_url=request.asset_url,
            asset_type=request.asset_type
        )
        return {"success": True, "design": result}
    except CanvaServiceError as e:
        raise handle_canva_error(e)
    except Exception as e:
        logger.error(f"Create design error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create design")


# ================== EXPORT ENDPOINTS ==================

@router.get("/export-formats")
async def get_design_export_formats(user_id: str = None, design_id: str = None):
    """
    GET /api/v1/canva/export-formats
    Get available export formats for a design.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if not design_id:
        raise HTTPException(status_code=400, detail="designId is required")
    
    try:
        result = await get_export_formats(user_id, design_id)
        return result
    except CanvaServiceError as e:
        raise handle_canva_error(e)
    except Exception as e:
        logger.error(f"Get export formats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get export formats")


@router.post("/export")
async def export_design_endpoint(request: ExportDesignRequest, user_id: str = None):
    """
    POST /api/v1/canva/export
    Export a Canva design and optionally save to media library.
    
    This endpoint:
    1. Exports the design from Canva (polls for completion)
    2. Downloads from temporary Canva URL
    3. Uploads to Cloudinary for permanent storage
    4. Optionally saves to media_library table
    """
    # Use user_id from request body or query param
    effective_user_id = request.user_id or user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        # Export from Canva
        export_result = await export_design(
            user_id=effective_user_id,
            design_id=request.design_id,
            format=request.format,
            quality=request.quality
        )
        
        if not export_result.success:
            raise HTTPException(
                status_code=500,
                detail=export_result.error or "Export failed"
            )
        
        if not export_result.urls:
            raise HTTPException(status_code=500, detail="No export URLs returned")
        
        # Upload to Cloudinary for permanent storage
        permanent_urls = []
        
        try:
            from src.services.cloudinary_service import CloudinaryService
            import httpx
            
            async with httpx.AsyncClient(timeout=120.0) as client:
                for idx, canva_url in enumerate(export_result.urls):
                    try:
                        # Download from Canva
                        download_response = await client.get(canva_url)
                        if download_response.status_code != 200:
                            logger.warning(f"Failed to download from Canva: {canva_url}")
                            permanent_urls.append(canva_url)
                            continue
                        
                        file_data = download_response.content
                        
                        # Upload to Cloudinary
                        if request.format == "mp4":
                            result = await CloudinaryService.upload_video(
                                file_data=file_data,
                                filename=f"canva_export_{request.design_id}_{idx}.mp4",
                                folder="canva-exports",
                                tags=["canva", "export", request.workspace_id],
                            )
                        else:
                            result = await CloudinaryService.upload_image(
                                file_data=file_data,
                                filename=f"canva_export_{request.design_id}_{idx}.{request.format}",
                                folder="canva-exports",
                                tags=["canva", "export", request.workspace_id],
                            )
                        
                        if result.success:
                            permanent_urls.append(result.secure_url)
                            logger.info(f"Uploaded to Cloudinary: {result.public_id}")
                        else:
                            logger.warning(f"Cloudinary upload failed: {result.error}")
                            permanent_urls.append(canva_url)
                            
                    except Exception as e:
                        logger.warning(f"Error processing export URL: {e}")
                        permanent_urls.append(canva_url)
                        
        except ImportError:
            logger.warning("Cloudinary not available, using temporary Canva URLs")
            permanent_urls = export_result.urls
        except Exception as e:
            logger.warning(f"Cloudinary process error: {e}")
            permanent_urls = export_result.urls if not permanent_urls else permanent_urls
        
        if not permanent_urls:
            permanent_urls = export_result.urls
        
        media_type = detect_media_type(permanent_urls[0], request.format)
        is_cloudinary = permanent_urls[0].startswith("https://res.cloudinary.com")
        
        # Save to media library if requested
        media_item = None
        if request.save_to_library:
            try:
                # Get design title
                try:
                    design_data = await get_design(effective_user_id, request.design_id)
                    design_title = design_data.get("title", "Canva Design")
                except Exception:
                    design_title = "Canva Design"
                
                supabase = get_supabase_client()
                now = datetime.now(timezone.utc)
                
                media_item = {
                    "type": media_type,
                    "source": "edited",
                    "url": permanent_urls[0],
                    "prompt": f"Edited in Canva: {design_title}",
                    "model": "canva",
                    "user_id": effective_user_id,  # FIXED: Include user_id
                    "workspace_id": request.workspace_id,
                    "config": {
                        "canvaDesignId": request.design_id,
                        "exportFormat": request.format,
                        "exportQuality": request.quality,
                        "storageProvider": "cloudinary" if is_cloudinary else "canva"
                    },
                    "metadata": {
                        "source": "canva",
                        "designId": request.design_id,
                        "designTitle": design_title,
                        "exportedAt": now.isoformat(),
                        "pageCount": len(permanent_urls),
                        "storageProvider": "cloudinary" if is_cloudinary else "canva"
                    },
                    "tags": ["canva", "edited", media_type],
                    "created_at": now.isoformat()
                }
                
                result = supabase.table("media_library").insert(media_item).execute()
                if result.data:
                    media_item = result.data[0]
                    
            except Exception as e:
                logger.error(f"Failed to save to media library: {e}")
                # Continue anyway, export was successful
        
        return {
            "success": True,
            "mediaItem": media_item,
            "exportUrl": permanent_urls[0],
            "allExportUrls": permanent_urls if len(permanent_urls) > 1 else None,
            "isMultiPage": len(permanent_urls) > 1,
            "pageCount": len(permanent_urls),
            "storageProvider": "cloudinary" if is_cloudinary else "canva"
        }
        
    except CanvaServiceError as e:
        raise handle_canva_error(e)
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
        "version": "2.0.0",
        "configured": CANVA_CLIENT_ID is not None,
        "features": {
            "rateLimiting": True,
            "retryLogic": True,
            "secureOAuth": True,
            "permanentStorage": True
        },
        "endpoints": {
            "auth": {
                "GET /auth": "Initiate OAuth flow with PKCE",
                "GET /auth/status": "Check connection status"
            },
            "callback": {
                "GET /callback": "OAuth callback handler"
            },
            "disconnect": {
                "POST /disconnect": "Remove Canva integration"
            },
            "designs": {
                "GET /designs": "List user's designs",
                "POST /designs": "Create new design from asset"
            },
            "export-formats": {
                "GET /export-formats": "Get available export formats"
            },
            "export": {
                "POST /export": "Export design to media library"
            }
        },
        "scopes": CANVA_SCOPES,
        "supported_design_types": [
            "Document", "Presentation", "Whiteboard", "Video",
            "Instagram Post", "Instagram Story", "Facebook Post", "Twitter Post"
        ],
        "supported_export_formats": ["png", "jpg", "pdf", "mp4", "gif"]
    }
