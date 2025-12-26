"""
Supabase Service
Production-ready implementation for Supabase storage, database, and authentication
"""
import logging
import base64
import uuid
import mimetypes
import re
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from supabase import create_client, Client

from ..config import settings

logger = logging.getLogger(__name__)

# Client instances
_supabase_client: Optional[Client] = None
_supabase_admin_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Get or create Supabase client (Anon key)"""
    global _supabase_client
    
    if _supabase_client is None:
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_KEY
        
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be configured")
        
        # Note: We don't use ClientOptions due to 'storage' attribute bugs in certain versions
        # of supabase-py. The default options work correctly for server-side applications.
        _supabase_client = create_client(url, key)
        logger.info("Supabase client initialized")
    
    return _supabase_client


def get_supabase_admin_client() -> Client:
    """Get or create Supabase admin client (Service Role) - Bypasses RLS"""
    global _supabase_admin_client
    
    if _supabase_admin_client is None:
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_KEY
        
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured")
        
        # Note: We don't use ClientOptions due to 'storage' attribute bugs in certain versions
        # of supabase-py. The default options work correctly for server-side applications.
        _supabase_admin_client = create_client(url, key)
        logger.info("Supabase admin client initialized")
    
    return _supabase_admin_client


def is_supabase_configured() -> bool:
    """Check if Supabase is configured"""
    return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)


# ============================================================================
# Storage Operations
# ============================================================================

async def upload_file(
    bucket: str,
    file_data: bytes,
    file_name: Optional[str] = None,
    content_type: Optional[str] = None,
    folder: Optional[str] = None,
) -> Dict[str, Any]:
    """Upload file to Supabase Storage"""
    try:
        client = get_supabase_admin_client()
        
        if not file_name:
            ext = mimetypes.guess_extension(content_type or "application/octet-stream") or ""
            file_name = f"{uuid.uuid4()}{ext}"
        
        full_path = f"{folder}/{file_name}" if folder else file_name
        
        client.storage.from_(bucket).upload(
            path=full_path,
            file=file_data,
            file_options={
                "content-type": content_type or "application/octet-stream",
                "upsert": "true"
            }
        )
        
        public_url = client.storage.from_(bucket).get_public_url(full_path)
        
        return {
            "success": True,
            "path": full_path,
            "publicUrl": public_url,
        }
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return {"success": False, "error": str(e)}


async def upload_base64_file(
    base64_data: str,
    file_name: str,
    bucket: str = "media",
    folder: Optional[str] = None
) -> Dict[str, Any]:
    """Upload base64 data to Supabase Storage"""
    try:
        match = re.match(r'^data:(.+);base64,(.+)$', base64_data)
        if not match:
            return {"success": False, "error": "Invalid base64 format"}
        
        mime_type = match.group(1)
        base64_content = match.group(2)
        
        file_data = base64.b64decode(base64_content)
        
        extension = mimetypes.guess_extension(mime_type) or ""
        if not file_name.endswith(extension):
            file_name = f"{file_name}{extension}"
        
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        final_name = f"{timestamp}-{file_name}"
        
        return await upload_file(
            bucket=bucket,
            file_data=file_data,
            file_name=final_name,
            content_type=mime_type,
            folder=folder
        )
    except Exception as e:
        logger.error(f"Base64 upload error: {e}")
        return {"success": False, "error": str(e)}


async def download_file(bucket: str, path: str) -> Dict[str, Any]:
    """Download file from Supabase Storage"""
    try:
        client = get_supabase_admin_client()
        result = client.storage.from_(bucket).download(path)
        return {
            "success": True,
            "data": result,
            "base64": base64.b64encode(result).decode("utf-8")
        }
    except Exception as e:
        logger.error(f"Download error: {e}")
        return {"success": False, "error": str(e)}


async def delete_file(bucket: str, paths: List[str]) -> Dict[str, Any]:
    """Delete files from Supabase Storage"""
    try:
        client = get_supabase_admin_client()
        client.storage.from_(bucket).remove(paths)
        return {"success": True, "deleted": paths}
    except Exception as e:
        logger.error(f"Delete error: {e}")
        return {"success": False, "error": str(e)}


# ============================================================================
# Database Operations
# ============================================================================

async def db_select(
    table: str,
    columns: str = "*",
    filters: Optional[Dict[str, Any]] = None,
    limit: Optional[int] = None,
    order_by: Optional[str] = None
) -> Dict[str, Any]:
    """Select data from Supabase table"""
    try:
        client = get_supabase_admin_client()
        query = client.table(table).select(columns)
        if filters:
            for key, value in filters.items():
                query = query.eq(key, value)
        if limit:
            query = query.limit(limit)
        if order_by:
            query = query.order(order_by)
        result = query.execute()
        return {"success": True, "data": result.data, "count": len(result.data)}
    except Exception as e:
        logger.error(f"Select error: {e}")
        return {"success": False, "error": str(e)}


async def db_insert(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Insert data into Supabase table"""
    try:
        client = get_supabase_admin_client()
        result = client.table(table).insert(data).execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Insert error: {e}")
        return {"success": False, "error": str(e)}


async def db_update(table: str, data: Dict[str, Any], filters: Dict[str, Any]) -> Dict[str, Any]:
    """Update data in Supabase table"""
    try:
        client = get_supabase_admin_client()
        query = client.table(table).update(data)
        for key, value in filters.items():
            query = query.eq(key, value)
        result = query.execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Update error: {e}")
        return {"success": False, "error": str(e)}


async def db_upsert(table: str, data: Dict[str, Any], on_conflict: str = "id") -> Dict[str, Any]:
    """Upsert data in Supabase table"""
    try:
        client = get_supabase_admin_client()
        result = client.table(table).upsert(data, on_conflict=on_conflict).execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Upsert error: {e}")
        return {"success": False, "error": str(e)}


async def db_delete(table: str, filters: Dict[str, Any]) -> Dict[str, Any]:
    """Delete data from Supabase table"""
    try:
        client = get_supabase_admin_client()
        query = client.table(table).delete()
        for key, value in filters.items():
            query = query.eq(key, value)
        result = query.execute()
        return {"success": True, "deleted": result.data}
    except Exception as e:
        logger.error(f"Delete error: {e}")
        return {"success": False, "error": str(e)}


# ============================================================================
# Domain Helpers
# ============================================================================

async def log_activity(
    workspace_id: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[str] = None,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> Dict[str, Any]:
    """Log activity to activity_logs table"""
    # Combine old_values/new_values into details if details not provided
    combined_details = details or {}
    if old_values:
        combined_details["old_values"] = old_values
    if new_values:
        combined_details["new_values"] = new_values
    
    data = {
        "workspace_id": workspace_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "user_id": user_id,
        "old_values": old_values,
        "new_values": new_values,
        "details": combined_details,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    return await db_insert("activity_logs", data)


async def ensure_user_workspace(
    user_id: str,
    user_email: Optional[str] = None
) -> str:
    """
    Ensure user has a workspace, creating one if needed.
    Matches reference project's ensureUserWorkspace pattern.
    
    Returns workspace_id.
    """
    try:
        client = get_supabase_admin_client()
        
        # Check if user already has a workspace
        user_result = client.table("users").select(
            "workspace_id, role"
        ).eq("id", user_id).maybeSingle().execute()
        
        if user_result.data and user_result.data.get("workspace_id"):
            return user_result.data["workspace_id"]
        
        # User doesn't have workspace - create one
        workspace_name = f"{user_email.split('@')[0]}'s Workspace" if user_email else "New Workspace"
        
        # Create workspace
        workspace_result = client.table("workspaces").insert({
            "name": workspace_name,
            "max_users": 10,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        
        if not workspace_result.data:
            raise Exception("Failed to create workspace")
        
        workspace_id = workspace_result.data[0]["id"]
        
        # Create or update user record with workspace
        if user_result.data:
            # Update existing user
            client.table("users").update({
                "workspace_id": workspace_id,
                "role": "admin",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", user_id).execute()
        else:
            # Create new user record
            client.table("users").insert({
                "id": user_id,
                "workspace_id": workspace_id,
                "email": user_email,
                "role": "admin",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        
        logger.info(f"Created workspace {workspace_id} for user {user_id}")
        return workspace_id
        
    except Exception as e:
        logger.error(f"Error ensuring user workspace: {e}")
        raise Exception(f"Failed to initialize workspace: {str(e)}")


async def is_workspace_full(workspace_id: str) -> bool:
    """Check if workspace has reached maximum member capacity"""
    try:
        client = get_supabase_admin_client()
        
        # Get workspace max_users
        workspace = client.table("workspaces").select(
            "max_users"
        ).eq("id", workspace_id).single().execute()
        
        if not workspace.data:
            return True  # Fail safe - block if workspace not found
        
        max_users = workspace.data.get("max_users", 10)
        
        # Count current members
        members = client.table("users").select(
            "id", count="exact"
        ).eq("workspace_id", workspace_id).eq("is_active", True).execute()
        
        current_count = members.count or 0
        
        return current_count >= max_users
        
    except Exception as e:
        logger.error(f"Error checking workspace capacity: {e}")
        return True  # Fail safe


async def register_media_asset(
    workspace_id: str,
    name: str,
    file_url: str,
    type: str,
    source: str = "ai-generated",
    file_size: Optional[int] = None,
    created_by: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Register a new media asset"""
    data = {
        "workspace_id": workspace_id,
        "name": name,
        "description": description,
        "type": type,
        "source": source,
        "file_url": file_url,
        "file_size": file_size,
        "tags": tags or [],
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    return await db_insert("media_assets", data)


# ============================================================================
# Auth Operations
# ============================================================================

async def verify_jwt(token: str) -> Dict[str, Any]:
    """Verify JWT token and fetch user profile"""
    try:
        client = get_supabase_client()
        user_resp = client.auth.get_user(token)
        
        if not user_resp or not user_resp.user:
            return {"success": False, "error": "Invalid token"}
        
        user_id = user_resp.user.id
        
        # Check token expiry
        if hasattr(user_resp, 'session') and user_resp.session:
            expires_at = user_resp.session.expires_at
            if expires_at and datetime.fromtimestamp(expires_at, tz=timezone.utc) < datetime.now(timezone.utc):
                return {"success": False, "error": "Token expired"}
        
        # Fetch profile using admin client to bypass RLS
        admin = get_supabase_admin_client()
        profile_resp = admin.table("users").select(
            "workspace_id, role, is_active"
        ).eq("id", user_id).single().execute()
        
        if profile_resp.data:
            profile = profile_resp.data
            return {
                "success": True,
                "user": {
                    "id": user_id,
                    "email": user_resp.user.email,
                    "workspaceId": profile.get("workspace_id"),
                    "role": profile.get("role", "viewer"),
                    "isActive": profile.get("is_active", True)
                }
            }
        
        # Fallback for users without profile
        return {
            "success": True,
            "user": {
                "id": user_id,
                "email": user_resp.user.email,
                "workspaceId": None,
                "role": "viewer",
                "isActive": True
            }
        }
    
    except Exception as e:
        logger.error(f"JWT verification error: {e}")
        return {"success": False, "error": "Authentication failed"}
