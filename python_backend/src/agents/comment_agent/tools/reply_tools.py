"""
Comment Reply Tools
Tools for posting replies to comments via Meta Graph API
"""
import json
import logging
import httpx
from langchain_core.tools import tool

from .fetch_tools import generate_appsecret_proof, GRAPH_API_BASE

logger = logging.getLogger(__name__)


def create_reply_tools(access_token: str):
    """Create tools for replying to comments on Meta platforms"""
    
    @tool
    async def reply_to_comment(comment_id: str, message: str, platform: str) -> str:
        """
        Post a reply to a comment on Instagram or Facebook.
        Use this after finding relevant knowledge or generating an appropriate response.
        
        Args:
            comment_id: The ID of the comment to reply to
            message: The reply message to post. Keep it friendly, helpful, and concise (1-3 sentences).
            platform: Either 'instagram' or 'facebook'
        """
        try:
            logger.info(f"Replying to {platform} comment {comment_id}")
            
            url = f"{GRAPH_API_BASE}/{comment_id}/replies"
            proof = generate_appsecret_proof(access_token)
            
            data = {
                "message": message,
                "access_token": access_token,
            }
            if proof:
                data["appsecret_proof"] = proof
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    data=data,
                    timeout=30.0
                )
            
            if response.status_code != 200:
                error_data = response.json()
                error_message = error_data.get("error", {}).get("message", "Failed to post reply")
                return json.dumps({
                    "success": False,
                    "error": error_message,
                })
            
            result = response.json()
            logger.info(f"Reply posted successfully: {result.get('id')}")
            
            return json.dumps({
                "success": True,
                "replyId": result.get("id"),
                "message": "Reply posted successfully",
            })
            
        except Exception as e:
            logger.error(f"Reply error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
            })
    
    @tool
    async def like_comment(comment_id: str) -> str:
        """
        Like a comment to acknowledge it without replying.
        Use for positive comments that don't need a text response.
        
        Args:
            comment_id: The ID of the comment to like
        """
        try:
            url = f"{GRAPH_API_BASE}/{comment_id}/likes"
            proof = generate_appsecret_proof(access_token)
            
            data = {"access_token": access_token}
            if proof:
                data["appsecret_proof"] = proof
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    data=data,
                    timeout=30.0
                )
            
            if response.status_code != 200:
                return json.dumps({"success": False, "error": "Failed to like comment"})
            
            return json.dumps({"success": True, "message": "Comment liked"})
            
        except Exception as e:
            logger.error(f"Like comment error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
            })
    
    return [reply_to_comment, like_comment]
