# Cron Setup Quick Checklist ✅

Use this checklist to set up cron-job.org for scheduled publishing.

---

## Pre-Setup

- [ ] Backend is deployed and accessible via HTTPS
- [ ] You have your backend URL (e.g., `https://your-backend.onrender.com`)

---

## Step 1: Environment Variable

- [ ] Generate a secure random secret (use `openssl rand -hex 32`)
- [ ] Add `CRON_SECRET` to your backend environment variables
- [ ] Restart backend after adding variable

---

## Step 2: cron-job.org Account

- [ ] Create account at https://cron-job.org
- [ ] Verify email (if required)

---

## Step 3: Create Cron Job

- [ ] Click "Create cronjob"
- [ ] **Title**: `Publish Scheduled Posts`
- [ ] **URL**: `https://your-backend.com/api/v1/cron/publish-scheduled`
- [ ] **Method**: `GET`
- [ ] **Schedule**: Every 1 minute (`* * * * *`)
- [ ] **Header**: `X-Cron-Secret` = `<your-CRON_SECRET-value>`
- [ ] Enable email notifications (optional)
- [ ] Click "Create cronjob"

---

## Step 4: Test

- [ ] Test endpoint manually with curl:
  ```bash
  curl -H "X-Cron-Secret: your-secret" \
       https://your-backend.com/api/v1/cron/publish-scheduled
  ```
- [ ] Should return JSON with `"success": true`
- [ ] Create a test scheduled post
- [ ] Wait for scheduled time
- [ ] Verify post was published
- [ ] Check cron-job.org execution history

---

## Verification

- [ ] Cron job shows as "Active" in dashboard
- [ ] Execution history shows successful runs (green checkmarks)
- [ ] Scheduled posts are publishing automatically
- [ ] Failed posts show error details in HistoryView

---

## Troubleshooting

If something doesn't work:

1. ✅ Check `CRON_SECRET` matches exactly (case-sensitive)
2. ✅ Verify header name is `X-Cron-Secret` (not `x-cron-secret`)
3. ✅ Check backend logs for errors
4. ✅ Test endpoint manually with curl
5. ✅ Verify cron job is enabled in dashboard

---

**Full Guide**: See [CRON_SETUP_GUIDE.md](./CRON_SETUP_GUIDE.md) for detailed instructions.
