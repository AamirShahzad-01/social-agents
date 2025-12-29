"""
Comment Agent Service
Main autonomous agent for processing and responding to comments
"""
import logging
import time
from typing import Optional, List

from langchain.agents import create_agent

from .schemas import (
    ProcessCommentsRequest,
    ProcessCommentsResponse,
    ProcessingResult,
    CommentAgentCredentials,
)
from .prompts import get_comment_agent_system_prompt
from .tools import (
    create_fetch_tools,
    create_reply_tools,
    create_knowledge_tools,
    create_escalate_tools,
    create_youtube_fetch_tools,
    create_youtube_reply_tools,
)
from ...services import is_supabase_configured, db_insert, db_update
from langchain_google_genai import ChatGoogleGenerativeAI
from ...config import settings

logger = logging.getLogger(__name__)


async def process_comments(request: ProcessCommentsRequest) -> ProcessCommentsResponse:
    """
    Process comments as a personal assistant.
    
    - Searches knowledge base first
    - Auto-replies when confident
    - Escalates to user when unsure
    
    Args:
        request: Process comments request with optional credentials
        
    Returns:
        ProcessCommentsResponse with stats
    """
    start_time = time.time()
    workspace_id = request.workspaceId
    platforms = request.platforms or ["instagram", "facebook", "youtube"]
    run_type = request.runType or "cron"
    credentials = request.credentials
    
    logger.info(f"Processing comments for workspace {workspace_id}, platforms: {platforms}")
    
    # Create log entry if Supabase is configured
    log_id: Optional[str] = None
    if is_supabase_configured():
        try:
            result = await db_insert("comment_agent_logs", {
                "workspace_id": workspace_id,
                "run_type": run_type,
                "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            if result.get("success") and result.get("data"):
                log_id = result["data"][0].get("id")
        except Exception as e:
            logger.warning(f"Could not create log entry: {e}")
    
    try:
        # Build tools list based on available credentials
        all_tools = []
        
        # Knowledge and escalation tools are always available
        knowledge_tools = create_knowledge_tools(workspace_id)
        escalate_tools = create_escalate_tools(workspace_id)
        all_tools.extend(knowledge_tools)
        all_tools.extend(escalate_tools)
        
        # Check for Meta platforms (Instagram/Facebook)
        has_meta_platforms = any(p in ["instagram", "facebook"] for p in platforms)
        has_youtube = "youtube" in platforms
        
        if has_meta_platforms and credentials and credentials.accessToken:
            # Create Meta API tools with real credentials
            logger.info("Creating Meta API tools with access token")
            meta_fetch_tools = create_fetch_tools(
                access_token=credentials.accessToken,
                instagram_user_id=credentials.instagramUserId,
                facebook_page_id=credentials.facebookPageId,
            )
            meta_reply_tools = create_reply_tools(
                access_token=credentials.accessToken,
            )
            all_tools.extend(meta_fetch_tools)
            all_tools.extend(meta_reply_tools)
        elif has_meta_platforms:
            logger.warning("Meta platforms requested but no access token provided")
        
        if has_youtube and credentials and credentials.youtubeAccessToken:
            # Create YouTube API tools with real credentials
            logger.info("Creating YouTube API tools with access token")
            youtube_fetch_tools = create_youtube_fetch_tools(
                access_token=credentials.youtubeAccessToken,
                channel_id=credentials.youtubeChannelId,
            )
            youtube_reply_tools = create_youtube_reply_tools(
                access_token=credentials.youtubeAccessToken,
            )
            all_tools.extend(youtube_fetch_tools)
            all_tools.extend(youtube_reply_tools)
        elif has_youtube:
            logger.warning("YouTube requested but no access token provided")
        
        # Initialize LLM - Google Gemini
        model = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-exp",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.3,
        )
        
        # Create agent with tools
        agent = create_agent(
            model=model,
            tools=all_tools,
            system_prompt=get_comment_agent_system_prompt(),
        )
        
        # Build instruction for the agent
        platform_list = " and ".join(platforms)
        if request.postIds and len(request.postIds) > 0:
            instruction = (
                f"Process comments for these specific posts: {', '.join(request.postIds)} on {platform_list}. "
                f"For each comment, search knowledge first, then either reply or escalate."
            )
        else:
            instruction = (
                f"Fetch recent posts from {platform_list} and process their unanswered comments. "
                f"For each comment, search the knowledge base first, then either auto-reply if you find relevant info, "
                f"or escalate to the user if you need their expertise."
            )
        
        logger.info(f"Running comment agent with instruction: {instruction[:100]}...")
        
        # Run the agent
        result = await agent.ainvoke({
            "messages": [{"role": "user", "content": instruction}]
        })
        
        # Parse response - extract counts from tool results if possible
        messages = result.get("messages", [])
        
        # Default stats
        auto_replied = 0
        escalated = 0
        skipped = 0
        errors = 0
        
        # Try to count actions from messages
        for msg in messages:
            content = str(msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", ""))
            if "Reply posted successfully" in content:
                auto_replied += 1
            if "Escalated to user" in content:
                escalated += 1
            if "Already escalated" in content or "duplicate prevented" in content:
                skipped += 1
            if '"success": false' in content.lower():
                errors += 1
        
        execution_time = int((time.time() - start_time) * 1000)
        
        # Update log entry
        if log_id and is_supabase_configured():
            try:
                await db_update("comment_agent_logs", {
                    "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "comments_fetched": auto_replied + escalated + skipped,
                    "auto_replied": auto_replied,
                    "escalated": escalated,
                    "errors": errors,
                }, {"id": log_id})
            except Exception as e:
                logger.warning(f"Could not update log entry: {e}")
        
        logger.info(f"Comment processing complete in {execution_time}ms - auto_replied: {auto_replied}, escalated: {escalated}")
        
        return ProcessCommentsResponse(
            success=True,
            commentsFetched=auto_replied + escalated + skipped,
            autoReplied=auto_replied,
            escalated=escalated,
            errors=errors,
            executionTime=execution_time
        )
        
    except Exception as e:
        error_message = str(e)
        logger.error(f"Comment processing error: {e}", exc_info=True)
        
        execution_time = int((time.time() - start_time) * 1000)
        
        # Update log with error
        if log_id and is_supabase_configured():
            try:
                await db_update("comment_agent_logs", {
                    "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "errors": 1,
                    "error_message": error_message,
                }, {"id": log_id})
            except Exception as log_error:
                logger.warning(f"Could not update log entry: {log_error}")
        
        return ProcessCommentsResponse(
            success=False,
            commentsFetched=0,
            autoReplied=0,
            escalated=0,
            errors=1,
            executionTime=execution_time,
            errorMessage=error_message
        )
