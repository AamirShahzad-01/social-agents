"""
Canva Service
Production-ready service layer for Canva Connect API integration.
Handles OAuth, token management, design operations, and exports.
"""
import asyncio
import base64
import hashlib
import secrets
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Literal, Union
from functools import wraps

import httpx
from pydantic import BaseModel, Field

from .supabase_service import db_select, db_insert, db_update, db_upsert, db_delete
from .oauth_service import generate_pkce
from ..config import settings

logger = logging.getLogger(__name__)

# ================== CONFIGURATION ==================

CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"
CANVA_API_BASE = "https://api.canva.com/rest/v1"

# Configurable timeouts
CANVA_DEFAULT_TIMEOUT = float(getattr(settings, "CANVA_API_TIMEOUT", 30))
CANVA_EXPORT_TIMEOUT = float(getattr(settings, "CANVA_EXPORT_TIMEOUT", 300))
CANVA_UPLOAD_TIMEOUT = float(getattr(settings, "CANVA_UPLOAD_TIMEOUT", 60))

# Rate limiting settings (Canva allows 100 requests/minute)
RATE_LIMIT_REQUESTS = 80  # Stay under the limit
RATE_LIMIT_WINDOW = 60  # seconds

# OAuth scopes
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

# Retry configuration
RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 1.0

# ================== MODELS ==================

class CanvaTokens(BaseModel):
    """Canva OAuth tokens"""
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: datetime
    scopes: Optional[str] = None


class CanvaOAuthState(BaseModel):
    """OAuth state for PKCE flow"""
    user_id: str
    code_verifier: str
    code_challenge: str
    expires_at: datetime
    state_token: str


class CanvaDesign(BaseModel):
    """Canva design data"""
    id: str
    title: str
    thumbnail_url: Optional[str] = None
    created_at: Optional[Union[str, int]] = None
    updated_at: Optional[Union[str, int]] = None
    urls: Optional[Dict[str, str]] = None
    design_type: Optional[str] = None


def _normalize_canva_timestamp(value: Optional[Union[str, int, float]]) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        if value == 0:
            return None
        seconds = value / 1000 if value >= 1e11 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()

    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned or cleaned == "0":
            return None
        if cleaned.isdigit():
            numeric = int(cleaned)
            if numeric == 0:
                return None
            seconds = numeric / 1000 if numeric >= 1e11 else numeric
            return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()
        return cleaned

    return None


class CanvaExportResult(BaseModel):
    """Result of a design export"""
    success: bool
    urls: List[str] = []
    format: str
    is_multi_page: bool = False
    page_count: int = 1
    error: Optional[str] = None


class CanvaServiceError(Exception):
    """Custom exception for Canva service errors"""
    def __init__(self, message: str, code: str = "canva_error", status_code: int = 500):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


# ================== RATE LIMITING ==================

class RateLimiter:
    """Simple in-memory rate limiter per user"""
    def __init__(self):
        self._requests: Dict[str, List[float]] = {}
    
    def check(self, user_id: str) -> bool:
        """Check if user can make a request"""
        now = datetime.now().timestamp()
        
        if user_id not in self._requests:
            self._requests[user_id] = []
        
        # Clean old entries
        self._requests[user_id] = [
            ts for ts in self._requests[user_id]
            if now - ts < RATE_LIMIT_WINDOW
        ]
        
        if len(self._requests[user_id]) >= RATE_LIMIT_REQUESTS:
            return False
        
        self._requests[user_id].append(now)
        return True
    
    def get_wait_time(self, user_id: str) -> float:
        """Get seconds until next request is allowed"""
        if user_id not in self._requests or not self._requests[user_id]:
            return 0
        
        now = datetime.now().timestamp()
        oldest = min(self._requests[user_id])
        wait = (oldest + RATE_LIMIT_WINDOW) - now
        return max(0, wait)


# Global rate limiter instance
_rate_limiter = RateLimiter()


# ================== HELPER FUNCTIONS ==================

async def _make_canva_request(
    method: str,
    url: str,
    access_token: str,
    user_id: str = None,
    json_data: Dict = None,
    data: Dict = None,
    headers: Dict = None,
    timeout: float = CANVA_DEFAULT_TIMEOUT,
    retry_count: int = 0
) -> httpx.Response:
    """
    Make a request to Canva API with retry logic and rate limiting.
    
    Args:
        method: HTTP method (GET, POST, etc.)
        url: Full URL to request
        access_token: Canva access token
        user_id: User ID for rate limiting
        json_data: JSON body data
        data: Form data
        headers: Additional headers
        timeout: Request timeout in seconds
        retry_count: Current retry attempt
        
    Returns:
        httpx.Response
        
    Raises:
        CanvaServiceError: On request failure after retries
    """
    # Check rate limit
    if user_id and not _rate_limiter.check(user_id):
        wait_time = _rate_limiter.get_wait_time(user_id)
        raise CanvaServiceError(
            f"Rate limit exceeded. Please wait {wait_time:.0f} seconds.",
            code="rate_limit_exceeded",
            status_code=429
        )
    
    request_headers = {
        "Authorization": f"Bearer {access_token}",
        **(headers or {})
    }
    
    if json_data and "Content-Type" not in request_headers:
        request_headers["Content-Type"] = "application/json"
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=request_headers,
                json=json_data,
                data=data
            )
        
        # Handle retryable errors
        if response.status_code in RETRYABLE_STATUS_CODES and retry_count < MAX_RETRIES:
            wait_time = RETRY_BACKOFF_BASE * (2 ** retry_count)
            
            # Handle 429 with Retry-After header
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                if retry_after:
                    wait_time = float(retry_after)
            
            logger.warning(
                f"Canva API returned {response.status_code}, "
                f"retrying in {wait_time}s (attempt {retry_count + 1}/{MAX_RETRIES})"
            )
            
            await asyncio.sleep(wait_time)
            return await _make_canva_request(
                method, url, access_token, user_id,
                json_data, data, headers, timeout, retry_count + 1
            )
        
        return response
        
    except httpx.TimeoutException as e:
        if retry_count < MAX_RETRIES:
            wait_time = RETRY_BACKOFF_BASE * (2 ** retry_count)
            logger.warning(f"Canva API timeout, retrying in {wait_time}s")
            await asyncio.sleep(wait_time)
            return await _make_canva_request(
                method, url, access_token, user_id,
                json_data, data, headers, timeout, retry_count + 1
            )
        raise CanvaServiceError("Request timed out", code="timeout", status_code=504)
    except httpx.RequestError as e:
        raise CanvaServiceError(f"Request failed: {e}", code="request_failed", status_code=502)


# ================== TOKEN MANAGEMENT ==================

# Token refresh threshold (2 hours before expiration)
TOKEN_REFRESH_THRESHOLD_HOURS = 2
TOKEN_REFRESH_THRESHOLD_SECONDS = TOKEN_REFRESH_THRESHOLD_HOURS * 3600


async def get_canva_token(user_id: str) -> Optional[str]:
    """
    Get valid Canva access token for a user.
    Automatically refreshes if expired or expiring within 2 hours.
    
    Args:
        user_id: The user ID
        
    Returns:
        Access token string or None if not connected
    """
    try:
        result = await db_select(
            table="user_integrations",
            columns="access_token, refresh_token, expires_at",
            filters={"user_id": user_id, "provider": "canva"},
            limit=1
        )
        
        if not result.get("success") or not result.get("data"):
            return None
        
        data = result["data"][0]
        
        # Parse expiration with proper timezone handling
        expires_at_str = data.get("expires_at")
        if not expires_at_str:
            return data.get("access_token")
        
        # Handle various datetime formats
        if expires_at_str.endswith("Z"):
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        elif "+" in expires_at_str or expires_at_str.count("-") > 2:
            expires_at = datetime.fromisoformat(expires_at_str)
        else:
            expires_at = datetime.fromisoformat(expires_at_str).replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        
        # Refresh token if expired or expiring within 2 hours (proactive refresh)
        if expires_at <= now + timedelta(seconds=TOKEN_REFRESH_THRESHOLD_SECONDS):
            refresh_token = data.get("refresh_token")
            if not refresh_token:
                logger.warning(f"Canva token expired and no refresh token for user {user_id}")
                return None
            
            logger.info(f"Proactive token refresh for user {user_id} (expires at {expires_at.isoformat()})")
            new_token = await refresh_canva_token(user_id, refresh_token)
            return new_token
        
        return data.get("access_token")
        
    except Exception as e:
        logger.error(f"Error getting Canva token for user {user_id}: {e}")
        return None


async def check_and_refresh_canva_token(user_id: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Check token expiration and refresh if needed (within 2-hour threshold).
    This function is designed to be called on app startup.
    
    Args:
        user_id: The user ID
        force_refresh: If True, refresh token regardless of expiration time
        
    Returns:
        Dict with status, new expiration, and whether refresh occurred
    """
    try:
        result = await db_select(
            table="user_integrations",
            columns="access_token, refresh_token, expires_at, scopes, metadata",
            filters={"user_id": user_id, "provider": "canva"},
            limit=1
        )
        
        if not result.get("success") or not result.get("data"):
            return {
                "connected": False,
                "refreshed": False,
                "message": "Canva not connected"
            }
        
        data = result["data"][0]
        refresh_token = data.get("refresh_token")
        
        if not refresh_token:
            return {
                "connected": True,
                "refreshed": False,
                "message": "No refresh token available",
                "needsReconnect": True
            }
        
        # Parse expiration
        expires_at_str = data.get("expires_at")
        if not expires_at_str:
            return {
                "connected": True,
                "refreshed": False,
                "message": "Unknown expiration time"
            }
        
        # Handle various datetime formats
        if expires_at_str.endswith("Z"):
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        elif "+" in expires_at_str or expires_at_str.count("-") > 2:
            expires_at = datetime.fromisoformat(expires_at_str)
        else:
            expires_at = datetime.fromisoformat(expires_at_str).replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        time_until_expiry = (expires_at - now).total_seconds()
        
        # Check if refresh is needed
        needs_refresh = force_refresh or time_until_expiry <= TOKEN_REFRESH_THRESHOLD_SECONDS
        
        if not needs_refresh:
            return {
                "connected": True,
                "refreshed": False,
                "message": f"Token valid for {time_until_expiry // 3600} hours",
                "expiresAt": expires_at.isoformat(),
                "hoursUntilExpiry": round(time_until_expiry / 3600, 2)
            }
        
        # Perform refresh
        logger.info(f"Auto-refreshing Canva token for user {user_id} (expires in {time_until_expiry // 60} minutes)")
        new_token = await refresh_canva_token(user_id, refresh_token)
        
        if new_token:
            # Get updated expiration
            updated_result = await db_select(
                table="user_integrations",
                columns="expires_at",
                filters={"user_id": user_id, "provider": "canva"},
                limit=1
            )
            new_expires_at = None
            if updated_result.get("data"):
                new_expires_at_str = updated_result["data"][0].get("expires_at")
                if new_expires_at_str:
                    if new_expires_at_str.endswith("Z"):
                        new_expires_at = datetime.fromisoformat(new_expires_at_str.replace("Z", "+00:00"))
                    else:
                        new_expires_at = datetime.fromisoformat(new_expires_at_str)
            
            return {
                "connected": True,
                "refreshed": True,
                "message": "Token refreshed successfully",
                "expiresAt": new_expires_at.isoformat() if new_expires_at else None,
                "hoursUntilExpiry": round((new_expires_at - now).total_seconds() / 3600, 2) if new_expires_at else None
            }
        else:
            return {
                "connected": True,
                "refreshed": False,
                "message": "Token refresh failed",
                "needsReconnect": True,
                "error": "Refresh token may be invalid or expired"
            }
            
    except Exception as e:
        logger.error(f"Error checking/refreshing Canva token: {e}")
        return {
            "connected": False,
            "refreshed": False,
            "message": "Error checking token status",
            "error": str(e)
        }


async def refresh_canva_token(user_id: str, refresh_token: str) -> Optional[str]:
    """
    Refresh Canva access token.
    
    Args:
        user_id: The user ID
        refresh_token: The refresh token
        
    Returns:
        New access token or None on failure
    """
    client_id = getattr(settings, "CANVA_CLIENT_ID", None)
    client_secret = getattr(settings, "CANVA_CLIENT_SECRET", None)
    
    if not client_id or not client_secret:
        logger.error("Canva credentials not configured")
        return None
    
    try:
        auth_header = base64.b64encode(
            f"{client_id}:{client_secret}".encode()
        ).decode()
        
        async with httpx.AsyncClient(timeout=CANVA_DEFAULT_TIMEOUT) as client:
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
            logger.error(f"Failed to refresh Canva token: {response.status_code} - {response.text}")
            return None
        
        tokens = response.json()
        
        # Calculate new expiration
        expires_in = tokens.get("expires_in", 3600)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        
        # Update tokens in database
        await db_update(
            table="user_integrations",
            data={
                "access_token": tokens["access_token"],
                "refresh_token": tokens.get("refresh_token", refresh_token),
                "expires_at": expires_at.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            filters={"user_id": user_id, "provider": "canva"}
        )
        
        logger.info(f"Refreshed Canva token for user {user_id}")
        return tokens["access_token"]
        
    except Exception as e:
        logger.error(f"Error refreshing Canva token: {e}")
        return None


async def save_canva_tokens(
    user_id: str,
    access_token: str,
    refresh_token: Optional[str],
    expires_in: int,
    scopes: str = "",
    profile_info: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Save Canva OAuth tokens to database.
    
    Args:
        user_id: The user ID
        access_token: The access token
        refresh_token: The refresh token
        expires_in: Token expiration in seconds
        scopes: OAuth scopes
        profile_info: Optional Canva user profile info (display_name, email, etc.)
        
    Returns:
        True on success
    """
    try:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=expires_in)
        
        data = {
            "user_id": user_id,
            "provider": "canva",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at.isoformat(),
            "scopes": scopes,
            "updated_at": now.isoformat(),
            "created_at": now.isoformat()
        }
        
        # Add optional profile info if provided (stored in metadata JSONB)
        if profile_info:
            data["metadata"] = profile_info
        
        result = await db_upsert(
            table="user_integrations",
            data=data,
            on_conflict="user_id,provider"
        )
        
        return result.get("success", False)
        
    except Exception as e:
        logger.error(f"Error saving Canva tokens: {e}")
        return False


async def delete_canva_tokens(user_id: str) -> bool:
    """
    Remove Canva integration for a user.
    
    Args:
        user_id: The user ID
        
    Returns:
        True on success
    """
    try:
        result = await db_delete(
            table="user_integrations",
            filters={"user_id": user_id, "provider": "canva"}
        )
        return result.get("success", False)
    except Exception as e:
        logger.error(f"Error deleting Canva tokens: {e}")
        return False


async def get_canva_connection_status(user_id: str) -> Dict[str, Any]:
    """
    Check Canva connection status for a user.
    
    Args:
        user_id: The user ID
        
    Returns:
        Connection status dict with profile info if available
    """
    try:
        result = await db_select(
            table="user_integrations",
            columns="expires_at, scopes, updated_at, created_at, metadata",
            filters={"user_id": user_id, "provider": "canva"},
            limit=1
        )
        
        if not result.get("success") or not result.get("data"):
            return {"connected": False}
        
        data = result["data"][0]
        
        expires_at_str = data.get("expires_at")
        if expires_at_str:
            if expires_at_str.endswith("Z"):
                expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            else:
                expires_at = datetime.fromisoformat(expires_at_str)
            
            is_expired = expires_at <= datetime.now(timezone.utc)
        else:
            is_expired = False
            expires_at = None
        
        # Build response with optional profile info
        response = {
            "connected": True,
            "expiresAt": expires_at.isoformat() if expires_at else None,
            "isExpired": is_expired,
            "scopes": data.get("scopes", "").split(" ") if data.get("scopes") else [],
            "lastUpdated": data.get("updated_at"),
            "connectedAt": data.get("created_at")
        }
        
        # Add profile info if available (optional - works without it)
        metadata = data.get("metadata") or {}
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = {}

        account_name = metadata.get("display_name") or metadata.get("name")
        account_email = metadata.get("email")
        account_id = metadata.get("id")

        if account_name:
            response["accountName"] = account_name
        if account_email:
            response["accountEmail"] = account_email
        if account_id:
            response["accountId"] = account_id
        
        return response
        
    except Exception as e:
        logger.error(f"Error checking Canva connection: {e}")
        return {"connected": False, "error": str(e)}


# ================== OAUTH STATE MANAGEMENT ==================

async def create_canva_oauth_state(user_id: str) -> CanvaOAuthState:
    """
    Create OAuth state with PKCE for Canva authorization.
    Stores state securely in database.
    
    Args:
        user_id: The user ID
        
    Returns:
        OAuthState object with code_verifier and state_token
    """
    # Generate PKCE values using existing service
    pkce = generate_pkce()
    
    # Generate random state token
    state_token = secrets.token_urlsafe(32)
    
    # Set expiration (10 minutes)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Store in database
    await db_insert(
        table="canva_oauth_states",
        data={
            "user_id": user_id,
            "state_token": state_token,
            "code_verifier": pkce["code_verifier"],
            "expires_at": expires_at.isoformat(),
            "used": False
        }
    )
    
    return CanvaOAuthState(
        user_id=user_id,
        code_verifier=pkce["code_verifier"],
        code_challenge=pkce["code_challenge"],
        expires_at=expires_at,
        state_token=state_token
    )


async def verify_canva_oauth_state(state_token: str) -> Optional[Dict[str, Any]]:
    """
    Verify and consume OAuth state.
    
    Args:
        state_token: The state token from callback
        
    Returns:
        Dict with user_id and code_verifier, or None if invalid
    """
    try:
        result = await db_select(
            table="canva_oauth_states",
            columns="user_id, code_verifier, expires_at, used",
            filters={"state_token": state_token},
            limit=1
        )
        
        if not result.get("success") or not result.get("data"):
            logger.warning(f"OAuth state not found: {state_token[:10]}...")
            return None
        
        data = result["data"][0]
        
        # Check if already used
        if data.get("used"):
            logger.warning("OAuth state already used (replay attack?)")
            return None
        
        # Check expiration
        expires_at_str = data.get("expires_at")
        if expires_at_str:
            if expires_at_str.endswith("Z"):
                expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            else:
                expires_at = datetime.fromisoformat(expires_at_str)
            
            if expires_at <= datetime.now(timezone.utc):
                logger.warning("OAuth state expired")
                return None
        
        # Mark as used
        await db_update(
            table="canva_oauth_states",
            data={"used": True},
            filters={"state_token": state_token}
        )
        
        return {
            "user_id": data["user_id"],
            "code_verifier": data["code_verifier"]
        }
        
    except Exception as e:
        logger.error(f"Error verifying OAuth state: {e}")
        return None


async def cleanup_expired_oauth_states() -> int:
    """Clean up expired OAuth states. Should be run periodically."""
    try:
        result = await db_delete(
            table="canva_oauth_states",
            filters={"expires_at": {"lt": datetime.now(timezone.utc).isoformat()}}
        )
        return result.get("count", 0)
    except Exception as e:
        logger.error(f"Error cleaning up OAuth states: {e}")
        return 0


# ================== DESIGN OPERATIONS ==================

async def list_designs(user_id: str, continuation: str = None) -> Dict[str, Any]:
    """
    List user's Canva designs.
    
    Args:
        user_id: The user ID
        continuation: Pagination token
        
    Returns:
        Dict with designs and pagination info
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise CanvaServiceError(
            "Canva not connected",
            code="not_connected",
            status_code=401
        )
    
    url = f"{CANVA_API_BASE}/designs"
    if continuation:
        url += f"?continuation={continuation}"
    
    response = await _make_canva_request(
        method="GET",
        url=url,
        access_token=access_token,
        user_id=user_id
    )
    
    if response.status_code != 200:
        raise CanvaServiceError(
            f"Failed to fetch designs: {response.text}",
            code="fetch_failed",
            status_code=response.status_code
        )
    
    data = response.json()
    
    # Transform to consistent format
    items = []
    for design in data.get("items", []):
        items.append(CanvaDesign(
            id=design["id"],
            title=design.get("title", "Untitled"),
            thumbnail_url=design.get("thumbnail", {}).get("url"),
            created_at=_normalize_canva_timestamp(design.get("created_at")),
            updated_at=_normalize_canva_timestamp(design.get("updated_at")),
            urls=design.get("urls"),
            design_type=design.get("design_type")
        ).model_dump())
    
    return {
        "items": items,
        "continuation": data.get("continuation")
    }


async def get_design(user_id: str, design_id: str) -> Dict[str, Any]:
    """
    Get details of a specific design.
    
    Args:
        user_id: The user ID
        design_id: The Canva design ID
        
    Returns:
        Design details
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise CanvaServiceError("Canva not connected", code="not_connected", status_code=401)
    
    response = await _make_canva_request(
        method="GET",
        url=f"{CANVA_API_BASE}/designs/{design_id}",
        access_token=access_token,
        user_id=user_id
    )
    
    if response.status_code != 200:
        raise CanvaServiceError(
            f"Failed to get design: {response.text}",
            code="fetch_failed",
            status_code=response.status_code
        )
    
    return response.json().get("design", {})


async def create_design(
    user_id: str,
    design_type: str = "Document",
    width: Optional[int] = None,
    height: Optional[int] = None,
    asset_url: Optional[str] = None,
    asset_type: Optional[str] = None,
    title: str = "Media Studio Asset"
) -> Dict[str, Any]:
    """
    Create a new Canva design.
    
    Args:
        user_id: The user ID
        design_type: Type of design (Document, Presentation, etc.)
        width: Custom width in pixels
        height: Custom height in pixels
        asset_url: URL of asset to include
        asset_type: Type of asset (image/video)
        title: Design title
        
    Returns:
        Created design details with edit URL
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise CanvaServiceError("Canva not connected", code="not_connected", status_code=401)
    
    asset_id = None
    
    # Upload asset if URL provided (only for images)
    if asset_url and asset_type != "video":
        try:
            asset_id = await _upload_asset_from_url(user_id, access_token, asset_url)
        except Exception as e:
            logger.warning(f"Failed to upload asset to Canva: {e}")
    
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
    
    if width and height:
        design_type_payload = {
            "type": "custom",
            "width": width,
            "height": height,
            "unit": "px"
        }
    elif design_type in dimension_map:
        w, h = dimension_map[design_type]
        design_type_payload = {
            "type": "custom",
            "width": w,
            "height": h,
            "unit": "px"
        }
    else:
        design_type_payload = {
            "type": "preset",
            "name": preset_map.get(design_type, "doc")
        }
    
    # Create design payload
    design_payload = {
        "title": title,
        "design_type": design_type_payload
    }
    
    if asset_id:
        design_payload["asset_id"] = asset_id
    
    response = await _make_canva_request(
        method="POST",
        url=f"{CANVA_API_BASE}/designs",
        access_token=access_token,
        user_id=user_id,
        json_data=design_payload,
        timeout=CANVA_DEFAULT_TIMEOUT
    )
    
    if response.status_code != 200:
        raise CanvaServiceError(
            f"Failed to create design: {response.text}",
            code="create_failed",
            status_code=response.status_code
        )
    
    return response.json()


async def _upload_asset_from_url(
    user_id: str,
    access_token: str,
    asset_url: str
) -> Optional[str]:
    """Upload an asset from URL to Canva and return asset ID."""
    # Start upload job
    response = await _make_canva_request(
        method="POST",
        url=f"{CANVA_API_BASE}/url-asset-uploads",
        access_token=access_token,
        user_id=user_id,
        json_data={
            "name": "Media Studio Asset",
            "url": asset_url
        },
        timeout=CANVA_UPLOAD_TIMEOUT
    )
    
    if response.status_code != 200:
        logger.warning(f"Asset upload failed: {response.status_code}")
        return None
    
    upload_data = response.json()
    job_id = upload_data.get("job", {}).get("id")
    
    if not job_id:
        return None
    
    # Poll for completion
    for _ in range(30):
        await asyncio.sleep(1)
        
        status_response = await _make_canva_request(
            method="GET",
            url=f"{CANVA_API_BASE}/url-asset-uploads/{job_id}",
            access_token=access_token,
            user_id=user_id
        )
        
        if status_response.status_code == 200:
            status_data = status_response.json()
            job_status = status_data.get("job", {}).get("status")
            
            if job_status == "success":
                return status_data.get("job", {}).get("asset", {}).get("id")
            elif job_status == "failed":
                logger.warning(f"Asset upload job failed: {status_data}")
                return None
    
    logger.warning("Asset upload timed out")
    return None


# ================== EXPORT OPERATIONS ==================

async def get_export_formats(user_id: str, design_id: str) -> Dict[str, Any]:
    """
    Get available export formats for a design.
    
    Args:
        user_id: The user ID
        design_id: The design ID
        
    Returns:
        Dict of available formats
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise CanvaServiceError("Canva not connected", code="not_connected", status_code=401)
    
    response = await _make_canva_request(
        method="GET",
        url=f"{CANVA_API_BASE}/designs/{design_id}/export-formats",
        access_token=access_token,
        user_id=user_id
    )
    
    if response.status_code != 200:
        raise CanvaServiceError(
            f"Failed to get export formats: {response.text}",
            code="fetch_failed",
            status_code=response.status_code
        )
    
    data = response.json()
    
    formats = {}
    if data.get("formats"):
        for fmt in data["formats"].keys():
            formats[fmt] = True
    
    return {
        "designId": design_id,
        "formats": formats,
        "raw": data
    }


async def export_design(
    user_id: str,
    design_id: str,
    format: Literal["png", "jpg", "pdf", "mp4", "gif"] = "png",
    quality: Literal["low", "medium", "high"] = "high"
) -> CanvaExportResult:
    """
    Export a Canva design.
    
    Args:
        user_id: The user ID
        design_id: The design ID
        format: Export format
        quality: Export quality
        
    Returns:
        CanvaExportResult with URLs
    """
    access_token = await get_canva_token(user_id)
    if not access_token:
        raise CanvaServiceError("Canva not connected", code="not_connected", status_code=401)
    
    # Get design details for orientation detection
    try:
        design = await get_design(user_id, design_id)
        thumb = design.get("thumbnail", {})
        is_vertical = thumb.get("height", 0) > thumb.get("width", 0)
    except Exception:
        is_vertical = False
    
    # Build export request
    export_body = {
        "design_id": design_id,
        "format": {"type": format},
        "export_quality": "pro" if quality == "high" else "regular"
    }
    
    if format == "jpg":
        quality_map = {"high": 100, "medium": 75, "low": 50}
        export_body["format"]["quality"] = quality_map[quality]
    elif format == "mp4":
        export_body["format"]["quality"] = "vertical_1080p" if is_vertical else "horizontal_1080p"
    
    # Start export job
    response = await _make_canva_request(
        method="POST",
        url=f"{CANVA_API_BASE}/exports",
        access_token=access_token,
        user_id=user_id,
        json_data=export_body
    )
    
    if response.status_code != 200:
        raise CanvaServiceError(
            f"Failed to start export: {response.text}",
            code="export_failed",
            status_code=response.status_code
        )
    
    export_job = response.json()
    job_id = export_job.get("job", {}).get("id")
    
    if not job_id:
        raise CanvaServiceError("No export job ID returned", code="export_failed")
    
    # Poll for completion
    max_attempts = 120 if format == "mp4" else 30
    poll_interval = 2 if format == "mp4" else 1
    
    for attempt in range(max_attempts):
        await asyncio.sleep(poll_interval)
        
        status_response = await _make_canva_request(
            method="GET",
            url=f"{CANVA_API_BASE}/exports/{job_id}",
            access_token=access_token,
            user_id=user_id
        )
        
        if status_response.status_code == 200:
            status_data = status_response.json()
            job_status = status_data.get("job", {}).get("status")
            
            if job_status == "success":
                urls = status_data.get("job", {}).get("urls", [])
                return CanvaExportResult(
                    success=True,
                    urls=urls,
                    format=format,
                    is_multi_page=len(urls) > 1,
                    page_count=len(urls)
                )
            elif job_status == "failed":
                error_msg = status_data.get("job", {}).get("error", {}).get("message", "Unknown error")
                return CanvaExportResult(
                    success=False,
                    format=format,
                    error=error_msg
                )
    
    return CanvaExportResult(
        success=False,
        format=format,
        error="Export timed out. Video exports may take longer."
    )


# ================== UTILITY FUNCTIONS ==================

def detect_media_type(url: str, format: str) -> str:
    """Detect media type from URL or format."""
    if format in ["mp4", "gif"]:
        return "video"
    return "image"
