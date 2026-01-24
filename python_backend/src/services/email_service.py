"""
Email Service
Sends transactional emails via Resend API.
"""
import logging
from datetime import datetime
from typing import Optional

import httpx

from src.config import settings
from src.services.supabase_service import get_supabase_admin_client

logger = logging.getLogger(__name__)


async def _get_workspace_name(workspace_id: str) -> str:
    supabase_admin = get_supabase_admin_client()
    result = supabase_admin.table("workspaces").select("name").eq("id", workspace_id).maybe_single().execute()
    if result.data and result.data.get("name"):
        return result.data["name"]
    return "the workspace"


async def _get_inviter_name(inviter_id: Optional[str]) -> str:
    if not inviter_id:
        return "Your colleague"
    supabase_admin = get_supabase_admin_client()
    result = supabase_admin.table("users").select("full_name, email").eq("id", inviter_id).maybe_single().execute()
    if result.data:
        return result.data.get("full_name") or result.data.get("email") or "Your colleague"
    return "Your colleague"


async def send_invitation_email(
    *,
    to_email: str,
    workspace_id: str,
    role: str,
    invitation_url: str,
    expires_at: Optional[str] = None,
    inviter_id: Optional[str] = None,
) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY is not configured. Skipping invitation email.")
        return False

    workspace_name = await _get_workspace_name(workspace_id)
    inviter_name = await _get_inviter_name(inviter_id)

    from_email = settings.SMTP_FROM_EMAIL or "noreply@socialmediaos.com"
    from_name = settings.SMTP_FROM_NAME or "Social Media OS"
    subject = f"You're invited to join {workspace_name}"

    expiry_html = ""
    if expires_at:
        try:
            expiry_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            expiry_html = f"<p style=\"margin:0 0 16px; color:#475569;\">Expires: {expiry_dt.strftime('%b %d, %Y %H:%M %Z')}</p>"
        except ValueError:
            expiry_html = ""

    html = f"""
    <div style=\"font-family:Arial, sans-serif; max-width:600px; margin:0 auto; padding:24px;\">
      <h2 style=\"margin:0 0 12px;\">You're invited to join {workspace_name}</h2>
      <p style=\"margin:0 0 16px; color:#475569;\">{inviter_name} invited you to join as <strong>{role}</strong>.</p>
      {expiry_html}
      <a href=\"{invitation_url}\" style=\"display:inline-block; padding:12px 20px; background:#0f766e; color:#fff; text-decoration:none; border-radius:8px;\">Accept Invitation</a>
      <p style=\"margin:16px 0 0; color:#94a3b8; font-size:12px;\">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style=\"margin:8px 0 0; word-break:break-all; color:#0f172a; font-size:12px;\">{invitation_url}</p>
    </div>
    """

    payload = {
        "from": f"{from_name} <{from_email}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code >= 400:
            logger.error("Resend API error: %s", response.text)
            return False

        return True
    except Exception as exc:
        logger.error("Failed to send invitation email: %s", exc)
        return False
