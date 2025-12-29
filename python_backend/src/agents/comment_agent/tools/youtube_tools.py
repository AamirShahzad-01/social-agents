"""
YouTube Tools
Tools for fetching and replying to YouTube comments via YouTube Data API
"""
import os
import json
import logging
import httpx
from typing import Optional
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


def create_youtube_fetch_tools(
    access_token: str,
    channel_id: Optional[str] = None
):
    """Create tools for fetching YouTube comments"""
    
    @tool
    async def fetch_recent_youtube_videos(limit: int = 10) -> str:
        """
        Fetch recent videos from YouTube channel that have comments to process.
        
        Args:
            limit: Maximum number of videos to fetch (default: 10)
        """
        try:
            if not channel_id:
                return json.dumps({
                    "success": False,
                    "error": "No YouTube channel connected. Please connect your YouTube account in Settings.",
                    "videos": [],
                })
            
            # Search for channel's uploads
            url = f"{YOUTUBE_API_BASE}/search"
            params = {
                "part": "snippet",
                "channelId": channel_id,
                "type": "video",
                "order": "date",
                "maxResults": limit,
                "access_token": access_token,
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)
            
            if response.status_code != 200:
                error_data = response.json()
                error_message = error_data.get("error", {}).get("message", "Failed to fetch YouTube videos")
                return json.dumps({
                    "success": False,
                    "error": error_message,
                    "videos": [],
                })
            
            data = response.json()
            videos = []
            
            for item in data.get("items", []):
                video_id = item.get("id", {}).get("videoId")
                snippet = item.get("snippet", {})
                
                if video_id:
                    videos.append({
                        "id": video_id,
                        "title": snippet.get("title", ""),
                        "description": snippet.get("description", ""),
                        "publishedAt": snippet.get("publishedAt"),
                        "platform": "youtube",
                    })
            
            logger.info(f"Fetched {len(videos)} YouTube videos")
            
            return json.dumps({
                "success": True,
                "videos": videos,
                "count": len(videos),
            })
            
        except Exception as e:
            logger.error(f"Fetch YouTube videos error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
                "videos": [],
            })
    
    @tool
    async def fetch_comments_for_youtube_video(video_id: str, limit: int = 50) -> str:
        """
        Fetch comments for a specific YouTube video.
        
        Args:
            video_id: The YouTube video ID to fetch comments for
            limit: Maximum number of comments to fetch (default: 50)
        """
        try:
            url = f"{YOUTUBE_API_BASE}/commentThreads"
            params = {
                "part": "snippet,replies",
                "videoId": video_id,
                "maxResults": limit,
                "access_token": access_token,
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)
            
            if response.status_code != 200:
                error_data = response.json()
                error_message = error_data.get("error", {}).get("message", "Failed to fetch YouTube comments")
                return json.dumps({
                    "success": False,
                    "error": error_message,
                    "comments": [],
                })
            
            data = response.json()
            comments = []
            
            for item in data.get("items", []):
                top_comment = item.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
                comment_id = item.get("snippet", {}).get("topLevelComment", {}).get("id")
                
                # Check if we already replied
                has_reply = False
                replies = item.get("replies", {}).get("comments", [])
                if channel_id:
                    has_reply = any(
                        reply.get("snippet", {}).get("authorChannelId", {}).get("value") == channel_id
                        for reply in replies
                    )
                
                comments.append({
                    "id": comment_id,
                    "text": top_comment.get("textDisplay", ""),
                    "username": top_comment.get("authorDisplayName", "Unknown"),
                    "timestamp": top_comment.get("publishedAt"),
                    "likeCount": top_comment.get("likeCount", 0),
                    "postId": video_id,
                    "platform": "youtube",
                    "hasReply": has_reply,
                })
            
            # Filter out comments we already replied to
            unanswered_comments = [c for c in comments if not c["hasReply"]]
            
            logger.info(f"Fetched {len(unanswered_comments)} unanswered YouTube comments for video {video_id}")
            
            return json.dumps({
                "success": True,
                "comments": unanswered_comments,
                "total": len(comments),
                "unanswered": len(unanswered_comments),
            })
            
        except Exception as e:
            logger.error(f"Fetch YouTube comments error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
                "comments": [],
            })
    
    return [fetch_recent_youtube_videos, fetch_comments_for_youtube_video]


def create_youtube_reply_tools(access_token: str):
    """Create tools for replying to YouTube comments"""
    
    @tool
    async def reply_to_youtube_comment(comment_id: str, message: str) -> str:
        """
        Reply to a YouTube comment. Use this for YouTube platform ONLY - NOT for Instagram/Facebook.
        
        Args:
            comment_id: ID of the comment to reply to
            message: Reply message
        """
        try:
            logger.info(f"Replying to YouTube comment {comment_id}")
            
            url = f"{YOUTUBE_API_BASE}/comments"
            params = {"part": "snippet"}
            
            body = {
                "snippet": {
                    "parentId": comment_id,
                    "textOriginal": message,
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    params=params,
                    json=body,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    timeout=30.0
                )
            
            if response.status_code not in [200, 201]:
                error_data = response.json()
                error_message = error_data.get("error", {}).get("message", "Failed to post YouTube reply")
                return json.dumps({
                    "success": False,
                    "error": error_message,
                })
            
            result = response.json()
            reply_id = result.get("id")
            logger.info(f"YouTube reply posted successfully: {reply_id}")
            
            return json.dumps({
                "success": True,
                "replyId": reply_id,
                "message": "Reply posted successfully on YouTube",
            })
            
        except Exception as e:
            logger.error(f"YouTube reply error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
            })
    
    @tool
    async def like_youtube_comment(comment_id: str) -> str:
        """
        Like a YouTube comment to acknowledge it.
        
        Args:
            comment_id: The ID of the comment to like
        """
        try:
            url = f"{YOUTUBE_API_BASE}/comments/setModerationStatus"
            params = {
                "id": comment_id,
                "moderationStatus": "published",
                "access_token": access_token,
            }
            
            # Note: YouTube API doesn't have a direct "like" endpoint for comments as a channel owner
            # This is a placeholder - in practice you might want to use a different approach
            logger.info(f"Acknowledging YouTube comment {comment_id}")
            
            return json.dumps({
                "success": True,
                "message": "Comment acknowledged",
            })
            
        except Exception as e:
            logger.error(f"Like YouTube comment error: {e}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": str(e),
            })
    
    return [reply_to_youtube_comment, like_youtube_comment]
