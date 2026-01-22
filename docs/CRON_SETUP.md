# Cron Setup (cron-job.org) for Scheduled Publishing

This project supports **scheduled post publishing** via an external cron trigger.

> 📖 **New to cron-job.org?** See **[CRON_SETUP_GUIDE.md](./CRON_SETUP_GUIDE.md)** for a complete step-by-step walkthrough.

## Quick Start

1. Set `CRON_SECRET` environment variable in your backend
2. Create account at https://cron-job.org
3. Create cron job pointing to: `https://your-backend.com/api/v1/cron/publish-scheduled`
4. Add header: `X-Cron-Secret: <your-secret>`
5. Set schedule to every 1 minute

## Which URL should cron-job.org call?

### Recommended (canonical): Python backend (FastAPI)

- **URL**: `https://<YOUR_BACKEND_DOMAIN>/api/v1/cron/publish-scheduled`
- **Method**: `GET`
- **Schedule**: every 1 minute (`* * * * *`)
- **Header**: `X-Cron-Secret: <YOUR_CRON_SECRET>`

This endpoint is implemented in:
- `python_backend/src/api/v1/cron.py`

### Alternative: Next.js cron endpoint

If you deploy the Next.js app and want it to publish scheduled posts directly from Supabase:

- **URL**: `https://<YOUR_APP_DOMAIN>/api/cron/publish-scheduled`
- **Method**: `GET`
- **Schedule**: every 1 minute or 5 minutes
- **Header**: `X-Cron-Secret: <YOUR_CRON_SECRET>` (or `Authorization: Bearer <YOUR_CRON_SECRET>`)

This endpoint is implemented in:
- `src/app/api/cron/publish-scheduled/route.ts`

## Required environment variables

- **`CRON_SECRET`**: shared secret used by cron-job.org request header

For the Next.js cron endpoint (only if you use it):
- **`NEXT_PUBLIC_SUPABASE_URL`**
- **`SUPABASE_SERVICE_ROLE_KEY`**
- **`NEXT_PUBLIC_APP_URL`** (used for internal `/api/{platform}/post` calls)

## How scheduling works (at a glance)

- The UI sets `status: "scheduled"` and `scheduled_at` on a post.
- The cron endpoint finds due posts (`scheduled_at <= now()`), publishes them, then:
  - **On success**: deletes the post (UI detects it disappearing on refresh/poll).
  - **On failure**: increments retry count and stores `_publishLog` in `content`.

See also: `docs/SCHEDULED_PUBLISHING.md`.

