"""
Content Strategist Agent - Calendar Tools
Tools for managing the content calendar via the agent.

These tools use a module-level _workspace_id that MUST be set before use.
Call set_workspace_id(id) before invoking the agent.

Simplified tools - no IDs required from the user!
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional, List

from langchain_core.tools import tool

# Import the shared Supabase client
from ....services.supabase_service import get_supabase_admin_client

logger = logging.getLogger(__name__)

# Module-level workspace_id - set this before agent runs
_workspace_id: Optional[str] = None


def set_workspace_id(workspace_id: str):
    """Set the workspace ID for calendar tools. Call before invoking agent."""
    global _workspace_id
    _workspace_id = workspace_id
    logger.info(f"Calendar tools workspace_id set to: {workspace_id}")


def get_workspace_id() -> Optional[str]:
    """Get the current workspace ID."""
    return _workspace_id


def _format_entry(entry: dict) -> dict:
    """Normalize an entry payload for tool output."""
    return {
        "id": entry.get("id"),
        "scheduled_date": entry.get("scheduled_date"),
        "scheduled_time": entry.get("scheduled_time"),
        "platform": entry.get("platform"),
        "content_type": entry.get("content_type"),
        "post_type": entry.get("post_type"),
        "title": entry.get("title"),
        "content": entry.get("content"),
        "hashtags": entry.get("hashtags"),
        "image_prompt": entry.get("image_prompt"),
        "image_url": entry.get("image_url"),
        "video_script": entry.get("video_script"),
        "video_url": entry.get("video_url"),
        "notes": entry.get("notes"),
        "status": entry.get("status"),
        "color": entry.get("color"),
    }


def _entry_search_blob(entry: dict) -> str:
    """Build a searchable blob from entry fields."""
    parts = [
        entry.get("title"),
        entry.get("content"),
        entry.get("image_prompt"),
        entry.get("image_url"),
        entry.get("video_script"),
        entry.get("video_url"),
        entry.get("notes"),
    ]
    hashtags = entry.get("hashtags")
    if isinstance(hashtags, list):
        parts.extend(hashtags)
    elif isinstance(hashtags, str):
        parts.append(hashtags)
    return " ".join([str(p) for p in parts if p]).lower()


# Content types and platforms matching the API
PLATFORMS = ["instagram", "linkedin", "twitter", "tiktok", "youtube", "facebook", "pinterest"]
CONTENT_TYPES = [
    "educational", "fun", "inspirational", "promotional",
    "interactive", "brand_related", "evergreen", "holiday_themed"
]

# Platform-specific post types
POST_TYPES_BY_PLATFORM = {
    "instagram": ["post", "reel", "story", "carousel", "live"],
    "twitter": ["text", "image", "video", "thread", "poll"],
    "linkedin": ["post", "article", "carousel", "document", "poll"],
    "youtube": ["video", "short", "premiere", "live"],
    "tiktok": ["video", "duet", "stitch", "live"],
    "facebook": ["post", "reel", "story", "event", "live"],
    "pinterest": ["pin", "idea_pin", "video_pin"],
}

# Color mapping for content types (modern, professional palette)
COLORS = {
    "educational": "#6366F1",    # Indigo
    "fun": "#10B981",            # Emerald
    "inspirational": "#F59E0B",  # Amber
    "promotional": "#F97316",    # Orange
    "interactive": "#8B5CF6",    # Violet
    "brand_related": "#06B6D4",  # Cyan
    "evergreen": "#22C55E",      # Green
    "holiday_themed": "#EC4899", # Pink
}


# =============================================================================
# QUICK VIEW TOOLS
# =============================================================================

@tool
def get_today_entries() -> dict:
    """Get all calendar entries for today.
    
    Quick way to see what's scheduled for today.
        
    Returns:
        List of today's entries with titles, platforms, and times
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        today = date.today().isoformat()
        
        supabase = get_supabase_admin_client()
        
        result = supabase.table("content_calendar_entries")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .eq("scheduled_date", today)\
            .order("scheduled_time")\
            .execute()
        
        entries = result.data if result.data else []
        
        return {
            "success": True,
            "date": today,
            "day": "today",
            "count": len(entries),
            "entries": [_format_entry(e) for e in entries]
        }
        
    except Exception as e:
        logger.error(f"Error getting today's entries: {e}")
        return {"error": str(e)}


@tool
def get_tomorrow_entries() -> dict:
    """Get all calendar entries for tomorrow.
        
    Returns:
        List of tomorrow's entries
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        
        supabase = get_supabase_admin_client()
        
        result = supabase.table("content_calendar_entries")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .eq("scheduled_date", tomorrow)\
            .order("scheduled_time")\
            .execute()
        
        entries = result.data if result.data else []
        
        return {
            "success": True,
            "date": tomorrow,
            "day": "tomorrow",
            "count": len(entries),
            "entries": [_format_entry(e) for e in entries]
        }
        
    except Exception as e:
        logger.error(f"Error getting tomorrow's entries: {e}")
        return {"error": str(e)}


@tool
def get_week_calendar(week_start_date: str = None) -> dict:
    """Get all calendar entries for a full week organized by day.
    
    Args:
        week_start_date: Optional start date (YYYY-MM-DD). Defaults to current week.
        
    Returns:
        Week schedule organized by day (Sunday-Saturday)
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        # Calculate week range
        if week_start_date:
            try:
                start = datetime.strptime(week_start_date, "%Y-%m-%d").date()
            except ValueError:
                return {"error": "Invalid date format. Use YYYY-MM-DD"}
        else:
            today = date.today()
            start = today - timedelta(days=today.weekday() + 1)
            if today.weekday() == 6:
                start = today
        
        end = start + timedelta(days=6)
        
        supabase = get_supabase_admin_client()
        
        result = supabase.table("content_calendar_entries")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .gte("scheduled_date", start.isoformat())\
            .lte("scheduled_date", end.isoformat())\
            .order("scheduled_date")\
            .execute()
        
        days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        week_data = {day: [] for day in days}
        
        if result.data:
            for entry in result.data:
                entry_date = datetime.strptime(entry["scheduled_date"], "%Y-%m-%d").date()
                day_index = (entry_date - start).days
                if 0 <= day_index <= 6:
                    week_data[days[day_index]].append(_format_entry(entry))
        
        return {
            "success": True,
            "week_start": start.isoformat(),
            "week_end": end.isoformat(),
            "total_entries": len(result.data) if result.data else 0,
            "schedule": week_data
        }
        
    except Exception as e:
        logger.error(f"Error getting week calendar: {e}")
        return {"error": str(e)}


# =============================================================================
# PLANNING / SUGGESTIONS
# =============================================================================

@tool
def suggest_weekly_plan(
    brand_goal: str,
    platforms: List[str],
    cadence: str | dict = "medium",
) -> dict:
    """Suggest a weekly content skeleton with type distribution.

    Args:
        brand_goal: High-level goal (e.g., "drive leads", "increase engagement")
        platforms: List of platforms to include (instagram, linkedin, twitter, etc.)
        cadence: "low" (3/wk), "medium" (5/wk), "high" (7/wk) or a dict
            like {"instagram": 5, "twitter": 7}

    Returns:
        Suggested weekly plan with per-day slots, content types, and platform
    """
    try:
        if not brand_goal or not isinstance(brand_goal, str):
            return {"error": "brand_goal is required"}

        if not platforms or not isinstance(platforms, list):
            return {"error": "platforms must be a non-empty list"}

        normalized_platforms = [p.lower().strip() for p in platforms if p and isinstance(p, str)]
        normalized_platforms = [p for p in normalized_platforms if p in PLATFORMS]
        if not normalized_platforms:
            return {"error": f"No valid platforms provided. Use: {PLATFORMS}"}

        cadence_map: dict[str, int] = {}
        if isinstance(cadence, dict):
            for platform, count in cadence.items():
                if isinstance(platform, str) and isinstance(count, int) and count > 0:
                    key = platform.lower().strip()
                    if key in PLATFORMS:
                        cadence_map[key] = min(count, 14)
        elif isinstance(cadence, str):
            cadence_key = cadence.lower().strip()
            cadence_value = {"low": 3, "medium": 5, "high": 7}.get(cadence_key)
            if cadence_value is None:
                return {"error": "Invalid cadence. Use low/medium/high or a dict per platform."}
            cadence_map = {platform: cadence_value for platform in normalized_platforms}
        else:
            return {"error": "Invalid cadence. Use low/medium/high or a dict per platform."}

        type_distribution = [
            "educational",
            "inspirational",
            "educational",
            "interactive",
            "promotional",
            "brand_related",
            "fun",
        ]

        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        plan = {day: [] for day in days}
        schedule_idx = 0

        for platform in normalized_platforms:
            posts_per_week = cadence_map.get(platform, 5)
            for i in range(posts_per_week):
                day = days[(schedule_idx + i) % len(days)]
                content_type = type_distribution[(schedule_idx + i) % len(type_distribution)]
                plan[day].append({
                    "platform": platform,
                    "content_type": content_type,
                    "title": f"{brand_goal.title()} - {content_type.replace('_', ' ').title()}"
                })
            schedule_idx += 1

        return {
            "success": True,
            "brand_goal": brand_goal,
            "platforms": normalized_platforms,
            "cadence": cadence_map,
            "plan": plan,
        }
    except Exception as e:
        logger.error(f"Error suggesting weekly plan: {e}")
        return {"error": str(e)}


# =============================================================================
# ADD ENTRIES
# =============================================================================

@tool
def add_calendar_entry(
    scheduled_date: str,
    platform: str,
    content_type: str,
    title: str,
    content: str,
    post_type: str = None,
    scheduled_time: str = None,
    hashtags: str = None,
    image_prompt: str = None,
    image_url: str = None,
    video_script: str = None,
    video_url: str = None,
    notes: str = None,
) -> dict:
    """Add a new entry to the content calendar.
    
    Auto-sets: color (based on content_type), status (scheduled), time (current time if not specified)
    
    Args:
        scheduled_date: Date in YYYY-MM-DD format (e.g., "2026-01-20")
        platform: Target platform (instagram, linkedin, twitter, tiktok, youtube, facebook, pinterest)
        content_type: Type (educational, fun, inspirational, promotional, interactive, brand_related, evergreen, holiday_themed)
        title: Short title for the entry
        content: Full post content/caption text
        post_type: Optional - platform-specific type (e.g., "reel" for Instagram). Auto-defaults to platform's main type.
        scheduled_time: Optional - time in HH:MM format. Defaults to current time.
        hashtags: Optional - comma-separated hashtags (e.g., "fitness,health,workout")
        image_prompt: Optional - prompt used for image generation
        image_url: Optional - generated image URL
        video_script: Optional - script for video content
        video_url: Optional - generated video URL
        notes: Optional - internal notes
        
    Returns:
        Created entry confirmation
    """
    try:
        from uuid import uuid4
        
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        if platform not in PLATFORMS:
            return {"error": f"Invalid platform. Use: {PLATFORMS}"}
        if content_type not in CONTENT_TYPES:
            return {"error": f"Invalid content_type. Use: {CONTENT_TYPES}"}
        
        # Validate and set post_type
        available_post_types = POST_TYPES_BY_PLATFORM.get(platform, ["post"])
        if post_type:
            if post_type not in available_post_types:
                return {"error": f"Invalid post_type for {platform}. Use: {available_post_types}"}
        else:
            post_type = available_post_types[0]  # Default to first type for platform
        
        try:
            datetime.strptime(scheduled_date, "%Y-%m-%d")
        except ValueError:
            return {"error": "Invalid date format. Use YYYY-MM-DD"}
        
        # Auto-set time to current time if not provided
        if not scheduled_time:
            scheduled_time = datetime.now().strftime("%H:%M")
        
        hashtag_list = None
        if hashtags:
            if isinstance(hashtags, list):
                hashtag_list = [h for h in hashtags if h]
            else:
                hashtag_list = [h.strip() for h in str(hashtags).split(",") if h.strip()]
        
        entry_data = {
            "id": str(uuid4()),
            "workspace_id": workspace_id,
            "scheduled_date": scheduled_date,
            "scheduled_time": scheduled_time,
            "platform": platform,
            "content_type": content_type,
            "post_type": post_type,
            "title": title[:200],
            "content": content,
            "hashtags": hashtag_list,
            "image_prompt": image_prompt,
            "image_url": image_url,
            "video_script": video_script,
            "video_url": video_url,
            "notes": notes,
            "status": "scheduled",  # Auto-set to scheduled
            "color": COLORS.get(content_type, "#6B7280"),  # Auto-set based on content_type
        }
        
        supabase = get_supabase_admin_client()
        result = supabase.table("content_calendar_entries").insert(entry_data).execute()
        
        if result.data:
            return {
                "success": True,
                "message": f"Created: {title} ({post_type}) on {scheduled_date} for {platform}",
            }
        
        return {"error": "Failed to create entry"}
        
    except Exception as e:
        logger.error(f"Error adding calendar entry: {e}")
        return {"error": str(e)}


@tool
def add_weekly_content_plan(
    monday_posts: str = None,
    tuesday_posts: str = None,
    wednesday_posts: str = None,
    thursday_posts: str = None,
    friday_posts: str = None,
    saturday_posts: str = None,
    sunday_posts: str = None,
    week_start: str = None,
) -> dict:
    """Add content for an entire week at once. Much easier than adding one by one!
    
    For each day, provide a pipe-separated list of posts in format:
    "platform|content_type|title|time|post_type|content|image_prompt|image_url|video_script|video_url|notes"
    (Only platform, content_type, title are required. Time, post_type, content, image_prompt, etc. are optional)
    
    Multiple posts per day are separated by semicolons.
    Color is auto-selected based on content_type.
    
    Args:
        monday_posts: Posts for Monday, e.g., "instagram|fun|Morning vibes|09:00|reel|Check out our new...|A bright morning scene..."
        tuesday_posts: Posts for Tuesday
        wednesday_posts: Posts for Wednesday
        thursday_posts: Posts for Thursday
        friday_posts: Posts for Friday
        saturday_posts: Posts for Saturday
        sunday_posts: Posts for Sunday
        week_start: Optional week start date (YYYY-MM-DD). Defaults to this week.
        
    Returns:
        Summary of created entries
    """
    try:
        from uuid import uuid4
        
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        # Calculate week dates
        if week_start:
            try:
                start = datetime.strptime(week_start, "%Y-%m-%d").date()
            except ValueError:
                return {"error": "Invalid week_start format. Use YYYY-MM-DD"}
        else:
            today = date.today()
            # Find this week's Sunday
            start = today - timedelta(days=(today.weekday() + 1) % 7)
        
        day_posts = {
            0: sunday_posts,    # Sunday
            1: monday_posts,    # Monday
            2: tuesday_posts,   # etc.
            3: wednesday_posts,
            4: thursday_posts,
            5: friday_posts,
            6: saturday_posts,
        }
        
        created = []
        errors = []
        supabase = get_supabase_admin_client()
        
        for day_offset, posts_str in day_posts.items():
            if not posts_str:
                continue
                
            entry_date = (start + timedelta(days=day_offset)).isoformat()
            
            # Split by semicolon for multiple posts per day
            for post in posts_str.split(";"):
                post = post.strip()
                if not post:
                    continue
                    
                parts = [p.strip() for p in post.split("|")]
                
                if len(parts) < 3:
                    errors.append(f"Invalid format on day {day_offset}: {post}")
                    continue
                
                platform = parts[0].lower()
                content_type = parts[1].lower()
                title = parts[2]
                time = parts[3] if len(parts) > 3 and parts[3] else None
                post_type = parts[4] if len(parts) > 4 and parts[4] else None
                content = parts[5] if len(parts) > 5 and parts[5] else ""
                image_prompt = parts[6] if len(parts) > 6 and parts[6] else None
                image_url = parts[7] if len(parts) > 7 and parts[7] else None
                video_script = parts[8] if len(parts) > 8 and parts[8] else None
                video_url = parts[9] if len(parts) > 9 and parts[9] else None
                notes = parts[10] if len(parts) > 10 and parts[10] else None
                
                if platform not in PLATFORMS:
                    errors.append(f"Invalid platform: {platform}")
                    continue
                if content_type not in CONTENT_TYPES:
                    errors.append(f"Invalid content_type: {content_type}")
                    continue
                
                # Auto-set post_type if not provided
                available_post_types = POST_TYPES_BY_PLATFORM.get(platform, ["post"])
                if post_type:
                    if post_type not in available_post_types:
                        errors.append(f"Invalid post_type {post_type} for {platform}. Using default.")
                        post_type = available_post_types[0]
                else:
                    post_type = available_post_types[0]
                
                # Auto-set time to current time if not provided
                if not time:
                    time = datetime.now().strftime("%H:%M")
                
                entry_data = {
                    "id": str(uuid4()),
                    "workspace_id": workspace_id,
                    "scheduled_date": entry_date,
                    "scheduled_time": time,
                    "platform": platform,
                    "content_type": content_type,
                    "post_type": post_type,
                    "title": title[:200],
                    "content": content,
                    "image_prompt": image_prompt,
                    "image_url": image_url,
                    "video_script": video_script,
                    "video_url": video_url,
                    "notes": notes,
                    "status": "scheduled",  # Auto-set
                    "color": COLORS.get(content_type, "#6B7280"),  # Auto-set based on content_type
                }
                
                result = supabase.table("content_calendar_entries").insert(entry_data).execute()
                if result.data:
                    created.append(f"{entry_date}: {platform} - {title}")
        
        return {
            "success": True,
            "created_count": len(created),
            "error_count": len(errors),
            "created": created,
            "errors": errors if errors else None
        }
        
    except Exception as e:
        logger.error(f"Error adding weekly content: {e}")
        return {"error": str(e)}


# =============================================================================
# FIND AND MODIFY ENTRIES (No IDs needed!)
# =============================================================================

@tool
def find_and_update_entry(
    search_title: str = None,
    search_date: str = None,
    search_platform: str = None,
    new_title: str = None,
    new_content: str = None,
    new_date: str = None,
    new_time: str = None,
    new_status: str = None,
) -> dict:
    """Find a calendar entry by title, date, or platform and update it.
    
    Args:
        search_title: Find entry with this title (partial match works)
        search_date: Find entry on this date (YYYY-MM-DD) or "today"/"tomorrow"
        search_platform: Find entry for this platform
        new_title: Update title to this
        new_content: Update content to this
        new_date: Move to this date (YYYY-MM-DD)
        new_time: Update time to this (HH:MM)
        new_status: Update status (draft, scheduled, published, archived)
        
    Returns:
        Updated entry or list of matches if multiple found
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        if not any([search_title, search_date, search_platform]):
            return {"error": "Provide at least one: search_title, search_date, or search_platform"}
        
        # Handle "today" and "tomorrow" shortcuts
        if search_date == "today":
            search_date = date.today().isoformat()
        elif search_date == "tomorrow":
            search_date = (date.today() + timedelta(days=1)).isoformat()
        
        supabase = get_supabase_admin_client()
        
        query = supabase.table("content_calendar_entries").select("*").eq("workspace_id", workspace_id)
        
        if search_date:
            query = query.eq("scheduled_date", search_date)
        if search_platform:
            query = query.eq("platform", search_platform.lower())
        
        result = query.execute()
        
        if not result.data:
            return {"error": "No entries found matching your criteria"}
        
        matches = result.data
        if search_title:
            search_lower = search_title.lower()
            matches = [e for e in matches if search_lower in _entry_search_blob(e)]
        
        if not matches:
            return {"error": f"No entries found with title containing '{search_title}'"}
        
        if len(matches) > 1:
            return {
                "message": "Multiple entries found. Be more specific:",
                "matches": [{"title": m["title"], "date": m["scheduled_date"], "platform": m["platform"]} for m in matches]
            }
        
        entry = matches[0]
        update_data = {}
        
        if new_title:
            update_data["title"] = new_title[:200]
        if new_content:
            update_data["content"] = new_content
        if new_date:
            if new_date == "today":
                new_date = date.today().isoformat()
            elif new_date == "tomorrow":
                new_date = (date.today() + timedelta(days=1)).isoformat()
            update_data["scheduled_date"] = new_date
        if new_time:
            update_data["scheduled_time"] = new_time
        if new_status:
            update_data["status"] = new_status
        
        if not update_data:
            return {"success": True, "message": "Entry found but no updates specified", "entry_title": entry["title"]}
        
        update_result = supabase.table("content_calendar_entries")\
            .update(update_data)\
            .eq("id", entry["id"])\
            .execute()
        
        if update_result.data:
            return {"success": True, "message": f"Updated '{entry['title']}'", "changes": list(update_data.keys())}
        
        return {"error": "Failed to update entry"}
        
    except Exception as e:
        logger.error(f"Error in find_and_update_entry: {e}")
        return {"error": str(e)}


@tool
def find_and_delete_entry(
    search_title: str = None,
    search_date: str = None,
    search_platform: str = None,
    delete_all_matches: bool = False,
) -> dict:
    """Find and delete calendar entries by title, date, or platform.
    
    Args:
        search_title: Find entry with this title (partial match)
        search_date: Find on this date (YYYY-MM-DD) or "today"/"tomorrow"
        search_platform: Find for this platform
        delete_all_matches: If True, deletes all matches. If False, only deletes if exactly one match.
        
    Returns:
        Deletion result
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        if not any([search_title, search_date, search_platform]):
            return {"error": "Provide at least one search parameter"}
        
        if search_date == "today":
            search_date = date.today().isoformat()
        elif search_date == "tomorrow":
            search_date = (date.today() + timedelta(days=1)).isoformat()
        
        supabase = get_supabase_admin_client()
        
        query = supabase.table("content_calendar_entries").select("*").eq("workspace_id", workspace_id)
        
        if search_date:
            query = query.eq("scheduled_date", search_date)
        if search_platform:
            query = query.eq("platform", search_platform.lower())
        
        result = query.execute()
        
        if not result.data:
            return {"error": "No entries found matching your criteria"}
        
        matches = result.data
        if search_title:
            search_lower = search_title.lower()
            matches = [e for e in matches if search_lower in _entry_search_blob(e)]
        
        if not matches:
            return {"error": "No entries found matching your criteria"}
        
        if len(matches) > 1 and not delete_all_matches:
            return {
                "message": f"Found {len(matches)} entries. Set delete_all_matches=True to delete all, or be more specific:",
                "entries": [{"title": m["title"], "date": m["scheduled_date"], "platform": m["platform"]} for m in matches]
            }
        
        deleted = []
        for entry in matches:
            supabase.table("content_calendar_entries").delete().eq("id", entry["id"]).execute()
            deleted.append(entry["title"])
        
        return {"success": True, "message": f"Deleted {len(deleted)} entries", "deleted_titles": deleted}
        
    except Exception as e:
        logger.error(f"Error in find_and_delete_entry: {e}")
        return {"error": str(e)}


@tool
def clear_day(target_date: str, platform: str = None) -> dict:
    """Clear all entries for a specific day, optionally filtered by platform.
    
    Args:
        target_date: Date to clear (YYYY-MM-DD) or "today"/"tomorrow"
        platform: Optional - only clear entries for this platform
        
    Returns:
        Number of deleted entries
    """
    try:
        workspace_id = get_workspace_id()
        if not workspace_id:
            return {"error": "Workspace ID not set."}
        
        if target_date == "today":
            target_date = date.today().isoformat()
        elif target_date == "tomorrow":
            target_date = (date.today() + timedelta(days=1)).isoformat()
        
        supabase = get_supabase_admin_client()
        
        query = supabase.table("content_calendar_entries")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .eq("scheduled_date", target_date)
        
        if platform:
            query = query.eq("platform", platform.lower())
        
        result = query.execute()
        
        if not result.data:
            return {"success": True, "message": "No entries to clear", "deleted_count": 0}
        
        for entry in result.data:
            supabase.table("content_calendar_entries").delete().eq("id", entry["id"]).execute()
        
        return {
            "success": True,
            "message": f"Cleared {len(result.data)} entries for {target_date}",
            "deleted_count": len(result.data)
        }
        
    except Exception as e:
        logger.error(f"Error clearing day: {e}")
        return {"error": str(e)}


__all__ = [
    # Quick view
    "get_today_entries",
    "get_tomorrow_entries",
    "get_week_calendar",
    # Planning
    "suggest_weekly_plan",
    # Add entries
    "add_calendar_entry",
    "add_weekly_content_plan",
    # Find and modify (no IDs needed!)
    "find_and_update_entry",
    "find_and_delete_entry",
    "clear_day",
    # Internal
    "set_workspace_id",
    "get_workspace_id",
]
