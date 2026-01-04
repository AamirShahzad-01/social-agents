import logging
from typing import Optional, Dict, Any, List

from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..services.supabase_service import verify_jwt, is_supabase_configured

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


async def verify_token(token: str, request: Optional[Request] = None) -> Dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="No token provided")
    if not is_supabase_configured():
        logger.warning("Supabase not configured - authentication disabled")
        raise HTTPException(status_code=503, detail="Authentication service unavailable")
    result = await verify_jwt(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = result.get("user", {})
    if not user.get("isActive", True):
        raise HTTPException(status_code=403, detail="User account is inactive")
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await verify_token(credentials.credentials, request)


async def get_current_workspace_id(
    user: Dict[str, Any] = Depends(get_current_user)
) -> str:
    workspace_id = user.get("workspaceId")
    if not workspace_id:
        raise HTTPException(status_code=403, detail="User not assigned to a workspace")
    return workspace_id


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    if not credentials:
        return None
    try:
        return await verify_token(credentials.credentials, request)
    except HTTPException:
        return None


def require_role(allowed_roles: List[str]):
    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = user.get("role", "viewer")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker


PUBLIC_PATHS = [
    "/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/v1/providers",
    "/api/v1/workspace/invites/",
    "/api/v1/cloudinary/",  # Allow public access to Cloudinary uploads
    "/api/v1/media-studio/",  # Media library uses workspace_id for access control
    "/api/v1/posts",  # Posts use user_id for access control
]

OPTIONAL_AUTH_PATHS = [
    "/api/v1/auth/oauth/",
    "/api/v1/webhooks/",
]


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, public_paths: Optional[List[str]] = None):
        super().__init__(app)
        self.public_paths = public_paths or PUBLIC_PATHS
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # Allow CORS preflight requests (OPTIONS) without authentication
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Path matching helper: properly handle root "/" without matching all paths
        def is_public_path(path: str, public_path: str) -> bool:
            if public_path == "/":
                return path == "/"  # Root path only matches exactly
            # For other paths, match exactly or as a prefix followed by /
            return path == public_path or path.startswith(public_path.rstrip('/') + '/')
        
        if any(is_public_path(path, p) for p in self.public_paths):
            return await call_next(request)
        if any(path.startswith(p) for p in OPTIONAL_AUTH_PATHS):
            return await call_next(request)
        
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
