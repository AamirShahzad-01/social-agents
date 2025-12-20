"""
Authentication Middleware
Production-ready JWT verification and rate limiting for FastAPI
"""
import logging
import time
from typing import Optional, Dict, Any, List
from collections import defaultdict
from functools import wraps

from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..services.supabase_service import verify_jwt, is_supabase_configured
from ..config import settings

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer(auto_error=False)

# In-memory rate limiting (use Redis in production cluster)
_rate_limit_store: Dict[str, List[float]] = defaultdict(list)
_auth_failure_store: Dict[str, List[float]] = defaultdict(list)

# Rate limit configuration
RATE_LIMIT_WINDOW = 60  # 1 minute
AUTH_FAILURE_WINDOW = 900  # 15 minutes
MAX_AUTH_FAILURES = 5


def _cleanup_old_entries(entries: List[float], window: int) -> List[float]:
    """Remove entries older than the window"""
    cutoff = time.time() - window
    return [t for t in entries if t > cutoff]


def check_rate_limit(identifier: str, max_requests: int = 100, window: int = RATE_LIMIT_WINDOW) -> bool:
    """Check if the identifier has exceeded rate limits"""
    now = time.time()
    _rate_limit_store[identifier] = _cleanup_old_entries(_rate_limit_store[identifier], window)
    
    if len(_rate_limit_store[identifier]) >= max_requests:
        return False
    
    _rate_limit_store[identifier].append(now)
    return True


def record_auth_failure(identifier: str) -> None:
    """Record an authentication failure"""
    now = time.time()
    _auth_failure_store[identifier] = _cleanup_old_entries(_auth_failure_store[identifier], AUTH_FAILURE_WINDOW)
    _auth_failure_store[identifier].append(now)


def is_auth_blocked(identifier: str) -> tuple[bool, int]:
    """Check if auth is blocked due to too many failures"""
    _auth_failure_store[identifier] = _cleanup_old_entries(_auth_failure_store[identifier], AUTH_FAILURE_WINDOW)
    failures = len(_auth_failure_store[identifier])
    
    if failures >= MAX_AUTH_FAILURES:
        # Calculate remaining block time
        if _auth_failure_store[identifier]:
            oldest = min(_auth_failure_store[identifier])
            remaining = int(AUTH_FAILURE_WINDOW - (time.time() - oldest))
            return True, max(0, remaining)
    
    return False, 0


def clear_auth_failures(identifier: str) -> None:
    """Clear auth failures after successful auth"""
    if identifier in _auth_failure_store:
        del _auth_failure_store[identifier]


async def verify_token(token: str, request: Optional[Request] = None) -> Dict[str, Any]:
    """Verify JWT token and return user info"""
    if not token:
        raise HTTPException(status_code=401, detail="No token provided")
    
    # Get client identifier for rate limiting
    client_ip = "unknown"
    if request:
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.headers.get("x-real-ip", "unknown")
    
    # Check if blocked due to auth failures
    blocked, remaining = is_auth_blocked(client_ip)
    if blocked:
        raise HTTPException(
            status_code=429, 
            detail=f"Too many failed attempts. Try again in {remaining} seconds."
        )
    
    if not is_supabase_configured():
        logger.warning("Supabase not configured - authentication disabled")
        raise HTTPException(status_code=503, detail="Authentication service unavailable")
    
    result = await verify_jwt(token)
    
    if not result.get("success"):
        record_auth_failure(client_ip)
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )
    
    user = result.get("user", {})
    
    # Verify user is active
    if not user.get("isActive", True):
        raise HTTPException(status_code=403, detail="User account is inactive")
    
    # Clear failures on success
    clear_auth_failures(client_ip)
    
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """FastAPI dependency to get current authenticated user"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return await verify_token(credentials.credentials, request)


async def get_current_workspace_id(
    user: Dict[str, Any] = Depends(get_current_user)
) -> str:
    """Dependency to get the current workspace ID"""
    workspace_id = user.get("workspaceId")
    if not workspace_id:
        raise HTTPException(status_code=403, detail="User not assigned to a workspace")
    return workspace_id


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """FastAPI dependency to optionally get authenticated user"""
    if not credentials:
        return None
    
    try:
        return await verify_token(credentials.credentials, request)
    except HTTPException:
        return None


def require_role(allowed_roles: List[str]):
    """Dependency factory for role-based access control"""
    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = user.get("role", "viewer")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker


# Public paths that don't require authentication
PUBLIC_PATHS = [
    "/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/v1/providers",
    "/api/v1/workspace/invites/",  # Public invite token lookup (GET /api/v1/workspace/invites/{token})
]

# Paths that allow optional authentication
OPTIONAL_AUTH_PATHS = [
    "/api/v1/auth/oauth/",  # OAuth callbacks
    "/api/v1/webhooks/",    # Webhooks
]


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Production-ready authentication middleware
    Handles JWT verification and rate limiting
    """
    
    def __init__(self, app, public_paths: Optional[List[str]] = None):
        super().__init__(app)
        self.public_paths = public_paths or PUBLIC_PATHS
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Get client IP for rate limiting
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.headers.get("x-real-ip", request.client.host if request.client else "unknown")
        
        # Check general rate limit
        if not check_rate_limit(client_ip, settings.RATE_LIMIT_REQUESTS):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please slow down."}
            )
        
        # Allow public paths
        if any(path == p or path.startswith(p.rstrip('/') + '/') for p in self.public_paths):
            return await call_next(request)
        
        # Allow optional auth paths (they handle auth internally)
        if any(path.startswith(p) for p in OPTIONAL_AUTH_PATHS):
            return await call_next(request)
        
        # Check for Authorization header
        auth_header = request.headers.get("Authorization")
        
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"}
            )
        
        token = auth_header.split(" ", 1)[1]
        
        try:
            user = await verify_token(token, request)
            request.state.user = user
            request.state.workspace_id = user.get("workspaceId")
        except HTTPException as e:
            return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
        except Exception as e:
            logger.error(f"Auth middleware error: {e}")
            return JSONResponse(status_code=500, content={"detail": "Authentication error"})
        
        return await call_next(request)
