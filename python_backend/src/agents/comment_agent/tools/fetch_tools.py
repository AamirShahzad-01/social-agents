"""
Comment Fetch Tools
Tools for fetching comments from Instagram/Facebook via Meta Business SDK
"""
import json
import logging
from typing import Optional
from langchain_core.tools import tool

from ....services.meta_sdk_client import create_meta_sdk_client, MetaSDKError

logger = logging.getLogger(__name__)


def create_fetch_tools(
    access_token: str,
    instagram_user_id: Optional[str] = None,
    facebook_page_id: Optional[str] = None
):
    """Create tools for fetching comments from Meta platforms using SDK"""
    
    # Initialize SDK client
    sdk_client = create_meta_sdk_client(access_token)
    
    @tool
    async def fetch_recent_posts(platform: str, limit: int = 10) -> str:
        """
        Fetch recent posts from Instagram or Facebook that have comments to process.
        
        Args:
            platform: Either 'instagram' or 'facebook'
            limit: Maximum number of posts to fetch (default: 10)
        """
        try:
            user_id = instagram_user_id if platform == "instagram" else facebook_page_id
            
            if not user_id:
                return json.dumps({
                    "success": False,
                    "error": f"No {platform} account connected. Please connect your {platform} account in Settings.",
                    "posts": [],
                })
            
            posts = []
            
            if platform == "instagram":
                # Use SDK to fetch Instagram media
                try:
                    media_data = await sdk_client.get_instagram_media(user_id, limit)
                    for m in media_data:
                        posts.append({
                            "id": m.get("id"),
                            "caption": m.get("caption", ""),
                            "timestamp": m.get("timestamp"),
                            "commentsCount": m.get("comments_count", 0),
                            "permalink": m.get("permalink"),
                            "platform": "instagram",
                        })
                except MetaSDKError as e:
                    return json.dumps({
                        "success": False,
                        "error": _format_sdk_error(e, platform),
                        "errorCode": e.code,
                        "posts": [],
                    })
            else:  # facebook
                # Use SDK to fetch Facebook Page posts
                try:
                    feed_data = await sdk_client.get_page_feed(user_id, limit)
                    for p in feed_data:
                        comments_summary = p.get("comments", {}).get("summary", {})
                        posts.append({
                            "id": p.get("id"),
                            "caption": p.get("message", ""),
                            "timestamp": p.get("created_time"),
                            "commentsCount": comments_summary.get("total_count", 0),
                            "permalink": p.get("permalink_url"),
                            "platform": "facebook",
                        })
                except MetaSDKError as e:
                    return json.dumps({
                        "success": False,
                        "error": _format_sdk_error(e, platform),
                        "errorCode": e.code,
                        "posts": [],
                    })
            
            # Filter to posts that have comments
            posts_with_comments = [p for p in posts if p["commentsCount"] > 0]
            
            logger.info(f"Fetched {len(posts_with_comments)} {platform} posts with comments")
            
            return json.dumps({
                "success": True,
                "posts": posts_with_comments,
                "count": len(posts_with_comments),
            })
            
        except Exception as e:
            logger.error(f"Fetch posts error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
                "posts": [],
            })
    
    @tool
    async def fetch_comments_for_post(post_id: str, platform: str, limit: int = 50) -> str:
        """
        Fetch comments for a specific post. Automatically filters out comments we already replied to.
        
        Args:
            post_id: The post/media ID to fetch comments for
            platform: Either 'instagram' or 'facebook'  
            limit: Maximum number of comments to fetch (default: 50)
        """
        try:
            our_account_id = instagram_user_id if platform == "instagram" else facebook_page_id
            
            # Use SDK to fetch comments
            try:
                comments_data = await sdk_client.get_object_comments(
                    post_id, 
                    limit=limit,
                    fields="id,text,from,timestamp,like_count,replies{from,message}"
                )
            except MetaSDKError as e:
                return json.dumps({
                    "success": False,
                    "error": _format_sdk_error(e, platform),
                    "errorCode": e.code,
                    "comments": [],
                })
            
            comments = []
            for c in comments_data:
                # Check if any reply is from our account
                has_our_reply = False
                replies_data = c.get("replies", {}).get("data", [])
                if replies_data and our_account_id:
                    has_our_reply = any(
                        reply.get("from", {}).get("id") == our_account_id
                        for reply in replies_data
                    )
                
                comments.append({
                    "id": c.get("id"),
                    "text": c.get("text") or c.get("message", ""),
                    "username": c.get("from", {}).get("username") or c.get("from", {}).get("name", "Unknown"),
                    "timestamp": c.get("timestamp"),
                    "likeCount": c.get("like_count", 0),
                    "postId": post_id,
                    "platform": platform,
                    "hasReply": has_our_reply,
                })
            
            # Filter out comments we already replied to
            unanswered_comments = [c for c in comments if not c["hasReply"]]
            
            logger.info(f"Fetched {len(unanswered_comments)} unanswered comments for post {post_id}")
            
            return json.dumps({
                "success": True,
                "comments": unanswered_comments,
                "total": len(comments),
                "unanswered": len(unanswered_comments),
            })
            
        except Exception as e:
            logger.error(f"Fetch comments error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
                "comments": [],
            })
    
    return [fetch_recent_posts, fetch_comments_for_post]


def _format_sdk_error(error: MetaSDKError, platform: str) -> str:
    """Format SDK error into user-friendly message"""
    if error.code == 10 or "pages_read_engagement" in str(error.message).lower():
        return (
            f"Facebook permission denied (Error #10): The 'pages_read_engagement' permission requires "
            f"Facebook App Review approval. Please reconnect your account in Settings."
        )
    elif error.code == 190:
        return f"Access token expired. Please reconnect your {platform} account in Settings."
    elif error.code == 100:
        return f"Invalid request. Please check your {platform} account settings."
    else:
        return error.message or f"Failed to fetch {platform} data"
