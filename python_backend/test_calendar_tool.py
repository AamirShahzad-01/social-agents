
from datetime import date, timedelta

from src.agents.deep_agents.tools.calendar_tools import (
    set_workspace_id,
    get_today_entries,
    get_tomorrow_entries,
    get_week_calendar,
    add_calendar_entry,
    add_weekly_content_plan,
)


def test_tool():
    # 1. Set a workspace ID (dummy but consistent)
    workspace_id = "72f4e5fd-00dc-415a-ac82-c58cba21d05b"
    set_workspace_id(workspace_id)

    print(f"Testing with Workspace ID: {workspace_id}")

    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    test_title = f"Test Entry {tomorrow}"

    print("\n1) add_calendar_entry (full data)")
    print(add_calendar_entry.invoke({
        "scheduled_date": tomorrow,
        "platform": "twitter",
        "content_type": "promotional",
        "title": test_title,
        "content": "This is a test post to verify the tool works.",
        "hashtags": "test,calendar",
        "image_prompt": "A vibrant promo banner with bold typography",
        "video_script": "Intro scene: show product close-up...",
        "notes": "QA: full-data test entry",
    }))

    print("\n2) add_weekly_content_plan (full data)")
    print(add_weekly_content_plan.invoke({
        "week_start": today,
        "monday_posts": "instagram|fun|Weekly Test IG|reel|Monday motivation post for the week!|A bright sunny morning with coffee and laptop|Start with energy, show workspace|Internal note: Use brand colors",
        "tuesday_posts": "twitter|promotional|Weekly Test X|text|Check out our latest features and updates!|Tech product showcase with clean UI|Quick product demo with voiceover|Tag engineering team",
    }))

    print("\n3) get_today_entries (full data)")
    print(get_today_entries.invoke({}))

    print("\n4) get_tomorrow_entries (full data)")
    print(get_tomorrow_entries.invoke({}))

    print("\n5) get_week_calendar (full data)")
    print(get_week_calendar.invoke({"week_start_date": today}))

if __name__ == "__main__":
    test_tool()
