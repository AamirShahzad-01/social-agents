"""
Workspace API Router
Production-ready workspace management, members, invites, activity, and business settings
"""

import re
import secrets
import logging
from typing import Optional, Literal, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field, EmailStr, field_validator

from src.services.supabase_service import (
    get_supabase_client, 
    get_supabase_admin_client,
    ensure_user_workspace,
    is_workspace_full,
    log_activity
)
from src.config import settings
from src.middleware.auth import get_current_user


router = APIRouter(prefix="/api/v1/workspace", tags=["Workspace"])
logger = logging.getLogger(__name__)


# ================== CONFIG ==================

APP_URL = getattr(settings, "APP_URL", "http://localhost:3000")
UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


# ================== SCHEMAS ==================

class UpdateWorkspaceRequest(BaseModel):
    """Request to update workspace settings"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    max_members: Optional[int] = Field(None, alias="maxMembers", ge=1, le=100)
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Workspace name cannot be empty or whitespace')
        return v.strip() if v else v
    
    class Config:
        populate_by_name = True


class CreateInviteRequest(BaseModel):
    """Request to create a workspace invitation"""
    email: Optional[EmailStr] = None
    role: Literal["admin", "editor", "viewer"] = "editor"
    expires_in_days: int = Field(7, alias="expiresInDays", ge=1, le=365)
    
    class Config:
        populate_by_name = True


class AcceptInviteRequest(BaseModel):
    """Request to accept an invitation"""
    token: str = Field(..., min_length=1)
    
    @field_validator('token')
    @classmethod
    def validate_token(cls, v):
        if not v or not v.strip():
            raise ValueError('Token cannot be empty')
        return v.strip()





# ================== HELPER FUNCTIONS ==================

def generate_invite_token() -> str:
    """Generate a secure random invite token."""
    return secrets.token_urlsafe(32)


async def get_user_workspace_role(user: Dict[str, Any]) -> tuple[str, str]:
    """
    Get user's workspace ID and role from authenticated user data.
    Returns (workspace_id, role) tuple.
    """
    workspace_id = user.get("workspaceId")
    role = user.get("role", "viewer")
    
    if not workspace_id:
        raise HTTPException(
            status_code=404, 
            detail="User is not assigned to a workspace. Please complete onboarding."
        )
    
    return workspace_id, role


def require_admin(role: str) -> None:
    """Raise 403 if user is not an admin."""
    if role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admins can perform this action"
        )


# ================== WORKSPACE ENDPOINTS ==================

@router.get("")
async def get_workspace(user: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/v1/workspace
    Get current workspace details.
    """
    try:
        workspace_id, _ = await get_user_workspace_role(user)
        
        supabase = get_supabase_admin_client()
        result = supabase.table("workspaces").select("*").eq(
            "id", workspace_id
        ).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        return {"data": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting workspace: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get workspace")


@router.patch("")
async def update_workspace(
    request: UpdateWorkspaceRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    PATCH /api/v1/workspace
    Update workspace settings (admin only).
    """
    try:
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        # Validate at least one field is being updated
        if not any([request.name, request.description is not None, request.max_members]):
            raise HTTPException(
                status_code=400,
                detail="At least one field must be provided for update"
            )
        
        supabase = get_supabase_admin_client()
        
        # Build update data
        update_data = {"updated_at": datetime.now().isoformat()}
        if request.name:
            update_data["name"] = request.name
        if request.description is not None:
            update_data["description"] = request.description
        if request.max_members:
            # Validate that max_members is not less than current member count
            current_members = supabase.table("users").select(
                "id", count="exact"
            ).eq("workspace_id", workspace_id).execute()
            
            member_count = current_members.count or 0
            if request.max_members < member_count:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot set max_members to {request.max_members}. "
                          f"Workspace currently has {member_count} members."
                )
            
            update_data["max_users"] = request.max_members
        
        result = supabase.table("workspaces").update(update_data).eq(
            "id", workspace_id
        ).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        
        return {"data": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workspace: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update workspace")


@router.delete("")
async def delete_workspace(user: Dict[str, Any] = Depends(get_current_user)):
    """
    DELETE /api/v1/workspace
    Delete/deactivate workspace (admin only).
    """
    try:
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        supabase = get_supabase_admin_client()
        
        # Soft delete - mark as inactive
        supabase.table("workspaces").update({
            "is_active": False,
            "deleted_at": datetime.now().isoformat()
        }).eq("id", workspace_id).execute()
        
        return {"success": True, "message": "Workspace deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workspace: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete workspace")


# ================== MEMBERS ENDPOINTS ==================

@router.get("/members")
async def get_members(
    user: Dict[str, Any] = Depends(get_current_user),
    role: Optional[Literal["admin", "editor", "viewer"]] = None
):
    """
    GET /api/v1/workspace/members
    Get all members in the workspace.
    """
    try:
        workspace_id, _ = await get_user_workspace_role(user)
        
        supabase = get_supabase_client()
        
        query = supabase.table("users").select(
            "id, email, full_name, role, avatar_url, created_at, workspace_id"
        ).eq("workspace_id", workspace_id).eq("is_active", True)
        
        if role:
            query = query.eq("role", role)
        
        result = query.execute()
        
        return {"data": result.data or []}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting members: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get members")


@router.delete("/members/{member_id}")
async def remove_member(
    member_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    DELETE /api/v1/workspace/members/{member_id}
    Remove a member from the workspace (admin only).
    """
    try:
        # Validate UUID format
        if not UUID_REGEX.match(member_id):
            raise HTTPException(status_code=400, detail="Invalid user ID format")
        
        workspace_id, role = await get_user_workspace_role(user)
        user_id = user.get("id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        
        # Can't remove yourself
        if member_id == user_id:
            raise HTTPException(
                status_code=400,
                detail="You cannot remove yourself from the workspace"
            )
        
        require_admin(role)
        
        supabase = get_supabase_client()
        
        # Check if user being removed is in the same workspace
        member = supabase.table("users").select("workspace_id, role").eq(
            "id", member_id
        ).single().execute()
        
        if not member.data:
            raise HTTPException(status_code=404, detail="Member not found")
        
        if member.data.get("workspace_id") != workspace_id:
            raise HTTPException(
                status_code=403,
                detail="Member is not in your workspace"
            )
        
        # Prevent removing last admin
        if member.data.get("role") == "admin":
            admins = supabase.table("users").select(
                "id", count="exact"
            ).eq("workspace_id", workspace_id).eq("role", "admin").execute()
            
            if (admins.count or 0) <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove the last admin from workspace"
                )
        
        # Soft delete - set workspace_id to null and role to viewer
        supabase.table("users").update({
            "workspace_id": None,
            "role": "viewer",
            "updated_at": datetime.now().isoformat()
        }).eq("id", member_id).eq("workspace_id", workspace_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to remove member")


@router.patch("/members/{member_id}/role")
async def update_member_role(
    member_id: str,
    request: dict,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    PATCH /api/v1/workspace/members/{member_id}/role
    Update a member's role (admin only).
    """
    try:
        if not UUID_REGEX.match(member_id):
            raise HTTPException(status_code=400, detail="Invalid user ID format")
        
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        new_role = request.get("role")
        if new_role not in ["admin", "editor", "viewer"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid role. Must be 'admin', 'editor', or 'viewer'"
            )
        
        supabase = get_supabase_client()
        
        # Check if user being updated is in the same workspace
        member = supabase.table("users").select("workspace_id, role").eq(
            "id", member_id
        ).single().execute()
        
        if not member.data:
            raise HTTPException(status_code=404, detail="Member not found")
        
        if member.data.get("workspace_id") != workspace_id:
            raise HTTPException(
                status_code=403,
                detail="Member is not in your workspace"
            )
        
        # Prevent demoting last admin
        if member.data.get("role") == "admin" and new_role != "admin":
            admins = supabase.table("users").select(
                "id", count="exact"
            ).eq("workspace_id", workspace_id).eq("role", "admin").execute()
            
            if (admins.count or 0) <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot change role of the last admin"
                )
        
        # Update role
        supabase.table("users").update({
            "role": new_role,
            "updated_at": datetime.now().isoformat()
        }).eq("id", member_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating member role: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update member role")


# ================== INVITES ENDPOINTS ==================

@router.get("/invites")
async def get_invites(user: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/v1/workspace/invites
    Get all pending invitations (admin only).
    """
    try:
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        supabase = get_supabase_client()
        
        # Use status field if available, otherwise fall back to is_accepted
        result = supabase.table("workspace_invites").select("*").eq(
            "workspace_id", workspace_id
        ).or_("status.eq.pending,is_accepted.eq.false").gte(
            "expires_at", datetime.now().isoformat()
        ).order("created_at", desc=True).execute()
        
        return {"data": result.data or []}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invites: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get invites")


@router.post("/invites")
async def create_invite(
    request: CreateInviteRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/v1/workspace/invites
    Create a new invitation (admin only).
    """
    try:
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        
        supabase = get_supabase_client()
        
        # Check if workspace is full
        members_result = supabase.table("users").select(
            "id", count="exact"
        ).eq("workspace_id", workspace_id).eq("is_active", True).execute()
        
        workspace_result = supabase.table("workspaces").select(
            "max_users"
        ).eq("id", workspace_id).single().execute()
        
        max_members = workspace_result.data.get("max_users", 10) if workspace_result.data else 10
        current_members = members_result.count or 0
        
        if current_members >= max_members:
            raise HTTPException(
                status_code=400,
                detail=f"Workspace is at maximum capacity ({max_members} members)"
            )
        
        # Check if email is already invited or is a member
        if request.email:
            existing_member = supabase.table("users").select("id").eq(
                "email", request.email
            ).eq("workspace_id", workspace_id).execute()
            
            if existing_member.data:
                raise HTTPException(
                    status_code=400,
                    detail="This email is already a member of the workspace"
                )
            
            # Check for pending invites
            pending_invite = supabase.table("workspace_invites").select("id").eq(
                "workspace_id", workspace_id
            ).eq("email", request.email).or_(
                "status.eq.pending,is_accepted.eq.false"
            ).gte("expires_at", datetime.now().isoformat()).execute()
            
            if pending_invite.data:
                raise HTTPException(
                    status_code=400,
                    detail="An active invitation already exists for this email"
                )
        
        # Generate invite token
        token = generate_invite_token()
        expires_at = datetime.now() + timedelta(days=request.expires_in_days)
        
        # Create invite
        invite_data = {
            "workspace_id": workspace_id,
            "email": request.email,
            "role": request.role,
            "token": token,
            "created_by": user_id,
            "invited_by": user_id,  # For backwards compatibility
            "status": "pending",
            "is_accepted": False,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now().isoformat()
        }
        
        result = supabase.table("workspace_invites").insert(invite_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create invitation")
        
        invite = result.data[0]
        invite_url = f"{APP_URL}/invite/{token}"
        
        return {
            "data": {
                "invite": invite,
                "inviteUrl": invite_url
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating invite: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create invitation")


@router.delete("/invites")
async def revoke_invite(
    invite_id: str = Query(..., alias="inviteId"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    DELETE /api/v1/workspace/invites
    Revoke an invitation (admin only).
    """
    try:
        if not invite_id:
            raise HTTPException(status_code=400, detail="Missing inviteId parameter")
        
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        supabase = get_supabase_client()
        
        # Update invite status to revoked
        supabase.table("workspace_invites").update({
            "status": "revoked",
            "updated_at": datetime.now().isoformat()
        }).eq("id", invite_id).eq("workspace_id", workspace_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking invite: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to revoke invitation")


@router.post("/invites/accept")
async def accept_invite(
    request: AcceptInviteRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/v1/workspace/invites/accept
    Accept an invitation and join the workspace.
    """
    try:
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        
        supabase = get_supabase_client()
        
        # Find the invite
        invite_result = supabase.table("workspace_invites").select("*").eq(
            "token", request.token
        ).or_("status.eq.pending,is_accepted.eq.false").single().execute()
        
        if not invite_result.data:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired invitation"
            )
        
        invite = invite_result.data
        
        # Check if expired
        expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(expires_at.tzinfo):
            raise HTTPException(
                status_code=400,
                detail="This invitation has expired"
            )
        
        # Check if email matches (if email-specific invite)
        if invite.get("email") and invite["email"] != user.get("email"):
            raise HTTPException(
                status_code=403,
                detail="This invitation is for a different email address"
            )
        
        # Update user's workspace and role
        supabase.table("users").update({
            "workspace_id": invite["workspace_id"],
            "role": invite["role"],
            "updated_at": datetime.now().isoformat()
        }).eq("id", user_id).execute()
        
        # Mark invite as accepted
        supabase.table("workspace_invites").update({
            "status": "accepted",
            "is_accepted": True,
            "accepted_by": user_id,
            "accepted_by_user_id": user_id,  # For backwards compatibility
            "accepted_at": datetime.now().isoformat()
        }).eq("id", invite["id"]).execute()
        
        return {"success": True, "workspaceId": invite["workspace_id"]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting invite: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to accept invitation")


@router.get("/invites/{token}")
async def get_invite_by_token(token: str):
    """
    GET /api/v1/workspace/invites/{token}
    Get invitation details by token (public endpoint for invite preview).
    """
    try:
        supabase = get_supabase_client()
        
        result = supabase.table("workspace_invites").select(
            "id, role, email, expires_at, status, workspace_id"
        ).eq("token", token).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        invite = result.data
        
        # Get workspace name
        workspace_result = supabase.table("workspaces").select(
            "name"
        ).eq("id", invite["workspace_id"]).single().execute()
        
        invite["workspace_name"] = workspace_result.data.get("name") if workspace_result.data else "Unknown"
        
        # Check if valid
        is_valid = invite.get("status") == "pending" or invite.get("is_accepted") == False
        if is_valid:
            expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
            is_valid = expires_at > datetime.now(expires_at.tzinfo)
        
        return {
            "data": invite,
            "isValid": is_valid
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invite: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get invitation")


# ================== ACTIVITY ENDPOINTS ==================

@router.get("/activity")
async def get_activity_log(
    user: Dict[str, Any] = Depends(get_current_user),
    filter_user_id: Optional[str] = Query(None, alias="userId"),
    action: Optional[str] = None,
    start_date: Optional[str] = Query(None, alias="startDate"),
    end_date: Optional[str] = Query(None, alias="endDate"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    GET /api/v1/workspace/activity
    Get activity/audit log for the workspace (admin only).
    """
    try:
        workspace_id, role = await get_user_workspace_role(user)
        require_admin(role)
        
        supabase = get_supabase_client()
        
        # Build query
        query = supabase.table("activity_logs").select(
            "*, users(email, full_name)", count="exact"
        ).eq("workspace_id", workspace_id)
        
        if filter_user_id:
            query = query.eq("user_id", filter_user_id)
        if action:
            query = query.eq("action", action)
        if start_date:
            query = query.gte("created_at", start_date)
        if end_date:
            query = query.lte("created_at", end_date)
        
        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        
        result = query.execute()
        
        # Format response
        activities = []
        for log in result.data or []:
            activities.append({
                "id": log.get("id"),
                "workspace_id": log.get("workspace_id"),
                "user_id": log.get("user_id"),
                "user_email": log.get("users", {}).get("email", "Unknown"),
                "user_name": log.get("users", {}).get("full_name"),
                "action": log.get("action"),
                "entity_type": log.get("resource_type"),
                "entity_id": log.get("resource_id"),
                "details": log.get("details"),
                "created_at": log.get("created_at")
            })
        
        total = result.count or 0
        
        return {
            "data": activities,
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting activity log: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get activity log")




# ================== INFO ENDPOINT ==================

@router.get("/info")
async def get_workspace_api_info():
    """Get Workspace API service information"""
    return {
        "service": "Workspace",
        "version": "1.0.0",
        "endpoints": {
            "/": {
                "GET": "Get workspace details",
                "PATCH": "Update workspace (admin)",
                "DELETE": "Delete workspace (admin)"
            },
            "/members": {
                "GET": "List workspace members"
            },
            "/members/{userId}": {
                "DELETE": "Remove member (admin)"
            },
            "/members/{userId}/role": {
                "PATCH": "Update member role (admin)"
            },
            "/invites": {
                "GET": "List pending invites (admin)",
                "POST": "Create invitation (admin)",
                "DELETE": "Revoke invitation (admin)"
            },
            "/invites/accept": {
                "POST": "Accept invitation"
            },
            "/invites/{token}": {
                "GET": "Get invite by token (public)"
            },
            "/activity": {
                "GET": "Get activity log (admin)"
            }
        },
        "roles": ["admin", "editor", "viewer"]
    }

