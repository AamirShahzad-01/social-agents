# Cron Job Setup Guide

This guide explains how to set up automated cron jobs for the Content Creator platform using **cron-job.org** (free external cron service). This works with any deployment method (Docker, AWS, GCP, Azure, etc.).

## Required Environment Variables

Add these to your `.env` file:

```env
# Cron job authentication secret (generate a secure random string)
CRON_SECRET=your-secure-random-secret-here

# Your app's public URL (used for internal API calls)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Available Cron Endpoints

| Endpoint | Purpose | Recommended Schedule |
|----------|---------|---------------------|
| `/api/cron/publish-scheduled` | Publish scheduled posts | Every 5 minutes |
| `/api/cron/process-comments` | Process & reply to comments | Every hour |

## Setup with cron-job.org

1. **Create Account**: Go to [cron-job.org](https://cron-job.org) and sign up (free)

2. **Create Cron Job for Scheduled Publishing**:
   - Title: `Publish Scheduled Posts`
   - URL: `https://your-domain.com/api/cron/publish-scheduled`
   - Schedule: Every 5 minutes (`*/5 * * * *`)
   - Request Method: `GET`
   - Headers:
     ```
     x-cron-secret: YOUR_CRON_SECRET
     ```

3. **Create Cron Job for Comment Processing**:
   - Title: `Process Comments`
   - URL: `https://your-domain.com/api/cron/process-comments`
   - Schedule: Every hour (`0 * * * *`)
   - Request Method: `GET`
   - Headers:
     ```
     x-cron-secret: YOUR_CRON_SECRET
     ```

## Alternative: Docker with Built-in Cron

If you prefer running cron inside your Docker container, add this to your `Dockerfile`:

```dockerfile
# Install cron
RUN apt-get update && apt-get install -y cron

# Add crontab file
COPY crontab /etc/cron.d/app-cron
RUN chmod 0644 /etc/cron.d/app-cron
RUN crontab /etc/cron.d/app-cron

# Start cron and app
CMD cron && npm start
```

Create a `crontab` file:
```cron
# Publish scheduled posts every 5 minutes
*/5 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/publish-scheduled

# Process comments every hour
0 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/process-comments
```

## Security

- The `CRON_SECRET` prevents unauthorized access to cron endpoints
- Never expose the secret in client-side code
- Rotate the secret periodically
- Monitor cron job logs for failures

## Monitoring

Check cron job status via:
- cron-job.org dashboard (shows success/failure history)
- Your application logs
- Supabase `activity_logs` table (for publish events)
- Supabase `comment_agent_logs` table (for comment processing)

## Troubleshooting

1. **401 Unauthorized**: Check that `x-cron-secret` header matches `CRON_SECRET` env var
2. **Timeout errors**: Increase timeout in cron-job.org settings (up to 30s for free tier)
3. **No posts published**: Verify posts have `status = 'scheduled'` and `scheduled_at <= now()`
