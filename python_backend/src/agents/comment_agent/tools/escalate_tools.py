"""
Escalation Tools
Tools for escalating comments that need human expertise
"""
import json
import logging
from langchain_core.tools import tool

from ....services import is_supabase_configured, db_select, db_insert

logger = logging.getLogger(__name__)


def create_escalate_tools(workspace_id: str):
    """Create tools for escalating comments to user"""
    
    @tool
    async def escalate_to_user(
        comment_id: str,
        post_id: str,
        platform: str,
        username: str,
        original_comment: str,
        summary: str,
        comment_timestamp: str = None,
        post_caption: str = None
    ) -> str:
        """
        Escalate a comment to the user when you CANNOT answer it confidently. Use this when:
        - The comment asks about specific order/account details
        - The comment requires human judgment or expertise
        - No relevant knowledge was found in the knowledge base
        - The comment is about pricing not in your knowledge
        - The comment is a partnership/business inquiry
        - The comment contains a complaint requiring personal attention
        - You are unsure about the correct answer
        
        ALWAYS provide a clear 1-line summary explaining why the user needs to handle this.
        
        Args:
            comment_id: The comment ID from the platform
            post_id: The post ID this comment is on
            platform: The platform (instagram, facebook, youtube)
            username: Username of the person who commented
            original_comment: The FULL original comment text - do not truncate
            summary: ONE LINE summary explaining why user needs to handle this
            comment_timestamp: When the comment was posted (optional)
            post_caption: Caption of the post for context (optional)
        """
        try:
            if not is_supabase_configured():
                logger.info(f"Escalating comment from {username}: {summary}")
                return json.dumps({
                    "success": True,
                    "message": f"Comment escalated to user: {summary}",
                })
            
            # Check for duplicates first
            existing = await db_select(
                table="pending_comments",
                columns="id",
                filters={"comment_id": comment_id, "workspace_id": workspace_id},
                limit=1
            )
            
            if existing.get("success") and existing.get("data"):
                logger.info(f"Comment {comment_id} already escalated, skipping duplicate")
                return json.dumps({
                    "success": False,
                    "reason": "Already escalated - duplicate prevented",
                })
            
            # Store for user review
            result = await db_insert("pending_comments", {
                "comment_id": comment_id,
                "post_id": post_id,
                "platform": platform,
                "workspace_id": workspace_id,
                "username": username,
                "original_comment": original_comment,
                "summary": summary,
                "comment_timestamp": comment_timestamp,
                "post_caption": post_caption,
                "status": "pending",
            })
            
            if not result.get("success"):
                return json.dumps({
                    "success": False,
                    "error": result.get("error", "Failed to escalate comment"),
                })
            
            logger.info(f"Escalated comment from {username}: {summary}")
            
            return json.dumps({
                "success": True,
                "message": f'Escalated to user: "{summary}"',
            })
            
        except Exception as e:
            logger.error(f"Escalation error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
            })
    
    @tool
    async def check_if_escalated(comment_id: str) -> str:
        """
        Check if a comment has already been escalated to the user.
        Use this to avoid duplicate escalations.
        
        Args:
            comment_id: The comment ID to check
        """
        try:
            if not is_supabase_configured():
                return json.dumps({"escalated": False})
            
            result = await db_select(
                table="pending_comments",
                columns="id, status",
                filters={"comment_id": comment_id, "workspace_id": workspace_id},
                limit=1
            )
            
            if not result.get("success"):
                return json.dumps({
                    "escalated": False,
                    "error": result.get("error"),
                })
            
            data = result.get("data", [])
            if data:
                return json.dumps({
                    "escalated": True,
                    "status": data[0].get("status"),
                })
            
            return json.dumps({"escalated": False})
            
        except Exception as e:
            logger.error(f"Check escalation error: {e}", exc_info=True)
            return json.dumps({
                "escalated": False,
                "error": str(e),
            })
    
    return [escalate_to_user, check_if_escalated]
