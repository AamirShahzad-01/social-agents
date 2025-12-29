"""
Comment Fetch Tools
Tools for fetching comments from Instagram/Facebook via Meta Graph API
"""
import os
import json
import hmac
import hashlib
import logging
import httpx
from typing import Optional
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v24.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


def generate_appsecret_proof(access_token: str) -> str:
    """
    Generate HMAC-SHA256 appsecret_proof for Meta API server-to-server calls.
    Required by Facebook/Instagram Graph API for security.
    """
    app_secret = os.getenv("FACEBOOK_CLIENT_SECRET") or os.getenv("META_APP_SECRET") or ""
    if not app_secret:
        return ""
    return hmac.new(
        app_secret.encode(),
        access_token.encode(),
        hashlib.sha256
    ).hexdigest()


def build_api_url(base_url: str, access_token: str) -> str:
    """Build URL with access token and appsecret_proof"""
    proof = generate_appsecret_proof(access_token)
    url = f"{base_url}&access_token={access_token}"
    if proof:
        url += f"&appsecret_proof={proof}"
    return url


def create_fetch_tools(
    access_token: str,
    instagram_user_id: Optional[str] = None,
    facebook_page_id: Optional[str] = None
):
    """Create tools for fetching comments from Meta platforms"""
    
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
            
            # Different endpoints for each platform
            endpoint = "media" if platform == "instagram" else "posts"
            fields = (
                "id,caption,timestamp,comments_count,like_count,media_type,permalink"
                if platform == "instagram"
                else "id,message,created_time,comments.summary(true),shares,permalink_url"
            )
            
            url = build_api_url(
                f"{GRAPH_API_BASE}/{user_id}/{endpoint}?fields={fields}&limit={limit}",
                access_token
            )
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0)
            
            if response.status_code != 200:
                error_data = response.json()
                error_code = error_data.get("error", {}).get("code")
                error_message = error_data.get("error", {}).get("message", f"Failed to fetch {platform} posts")
                
                user_message = error_message
                if error_code == 10 or "pages_read_engagement" in error_message:
                    user_message = (
                        f"Facebook permission denied (Error #10): The 'pages_read_engagement' permission requires "
                        f"Facebook App Review approval. Please reconnect your account in Settings."
                    )
                elif error_code == 190:
                    user_message = f"Access token expired. Please reconnect your {platform} account in Settings."
                
                return json.dumps({
                    "success": False,
                    "error": user_message,
                    "errorCode": error_code,
                    "posts": [],
                })
            
            data = response.json()
            posts = []
            
            for p in data.get("data", []):
                comments_count = (
                    p.get("comments_count", 0)
                    if platform == "instagram"
                    else p.get("comments", {}).get("summary", {}).get("total_count", 0)
                )
                
                posts.append({
                    "id": p.get("id"),
                    "caption": p.get("caption") or p.get("message", ""),
                    "timestamp": p.get("timestamp") or p.get("created_time"),
                    "commentsCount": comments_count,
                    "permalink": p.get("permalink") or p.get("permalink_url"),
                    "platform": platform,
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
            fields = "id,text,from,timestamp,like_count,replies{from,message}"
            url = build_api_url(
                f"{GRAPH_API_BASE}/{post_id}/comments?fields={fields}&limit={limit}",
                access_token
            )
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0)
            
            if response.status_code != 200:
                error_data = response.json()
                error_code = error_data.get("error", {}).get("code")
                error_message = error_data.get("error", {}).get("message", "Failed to fetch comments")
                
                user_message = error_message
                if error_code == 10 or "pages_read_engagement" in error_message:
                    user_message = "Permission denied: Please reconnect your Facebook account in Settings."
                elif error_code == 190:
                    user_message = "Access token expired. Please reconnect your account in Settings."
                
                return json.dumps({
                    "success": False,
                    "error": user_message,
                    "errorCode": error_code,
                    "comments": [],
                })
            
            data = response.json()
            our_account_id = instagram_user_id if platform == "instagram" else facebook_page_id
            
            comments = []
            for c in data.get("data", []):
                # Check if any reply is from our account
                has_our_reply = False
                if c.get("replies", {}).get("data"):
                    has_our_reply = any(
                        reply.get("from", {}).get("id") == our_account_id
                        for reply in c["replies"]["data"]
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
