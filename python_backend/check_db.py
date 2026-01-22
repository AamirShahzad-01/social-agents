
import os
import sys
import json
import asyncio
from datetime import datetime, timezone

# Add src to path
sys.path.append(os.getcwd())

from src.services.supabase_service import get_supabase_admin_client
from src.config import settings

async def check_posts():
    print("Checking Supabase Connection...")
    try:
        supabase = get_supabase_admin_client()
        
        # 1. Total counts
        result = supabase.table("posts").select("status", count="exact").execute()
        print(f"Total posts in DB: {len(result.data) if result.data else 0}")
        
        # 2. Status breakdown
        from collections import Counter
        statuses = [p.get("status") for p in (result.data or [])]
        breakdown = Counter(statuses)
        print("\nSTATUS BREAKDOWN:")
        for status, count in breakdown.items():
            print(f"- {status}: {count}")
        
        # 3. Details for all posts
        result = supabase.table("posts").select("id, status, topic, scheduled_at, workspace_id, publish_retry_count").execute()
        if result.data:
            first_post = result.data[0]
            print(f"\nTESTING: Attempting to update post {first_post['id']} to 'scheduled' status...")
            update_result = supabase.table("posts").update({
                "status": "scheduled",
                "scheduled_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", first_post["id"]).execute()
            
            if update_result.data:
                print(f"SUCCESS: Post {first_post['id']} updated. Status is now {update_result.data[0].get('status')}")
            else:
                print(f"FAILED: Could not update post {first_post['id']}. Result data is empty.")

        # 4. Final check for any post with status='scheduled'
        scheduled = supabase.table("posts").select("*").eq("status", "scheduled").execute()
        print(f"\nVERIFICATION: Found {len(scheduled.data)} posts with status='scheduled'")
        for p in scheduled.data:
            print(f"Post {p.get('id')}: Scheduled at {p.get('scheduled_at')}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_posts())
