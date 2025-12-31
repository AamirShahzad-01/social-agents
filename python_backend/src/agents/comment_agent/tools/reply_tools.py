"""
Comment Reply Tools
Tools for posting replies to comments via Meta Business SDK
"""
import json
import logging
from langchain_core.tools import tool

from ....services.meta_sdk_client import create_meta_sdk_client, MetaSDKError

logger = logging.getLogger(__name__)


def create_reply_tools(access_token: str):
    """Create tools for replying to comments on Meta platforms using SDK"""
    
    # Initialize SDK client
    sdk_client = create_meta_sdk_client(access_token)
    
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
            
            # Use SDK to post reply
            try:
                result = await sdk_client.reply_to_comment(comment_id, message)
                
                reply_id = result.get("id")
                logger.info(f"Reply posted successfully: {reply_id}")
                
                return json.dumps({
                    "success": True,
                    "replyId": reply_id,
                    "message": "Reply posted successfully",
                })
                
            except MetaSDKError as e:
                logger.error(f"SDK error replying to comment: {e}")
                return json.dumps({
                    "success": False,
                    "error": _format_reply_error(e, platform),
                    "errorCode": e.code,
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
            # Use SDK to like comment
            try:
                await sdk_client.like_object(comment_id)
                
                return json.dumps({
                    "success": True,
                    "message": "Comment liked",
                })
                
            except MetaSDKError as e:
                logger.error(f"SDK error liking comment: {e}")
                return json.dumps({
                    "success": False,
                    "error": e.message or "Failed to like comment",
                })
            
        except Exception as e:
            logger.error(f"Like comment error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
            })
    
    return [reply_to_comment, like_comment]


def _format_reply_error(error: MetaSDKError, platform: str) -> str:
    """Format SDK error into user-friendly message for reply operations"""
    if error.code == 190:
        return f"Access token expired. Please reconnect your {platform} account in Settings."
    elif error.code == 10:
        return "Permission denied. Please ensure your app has the required permissions."
    elif error.code == 200:
        return "Cannot reply to this comment. It may have been deleted or restricted."
    elif error.code == 100:
        return "Invalid comment ID. The comment may no longer exist."
    else:
        return error.message or "Failed to post reply"
