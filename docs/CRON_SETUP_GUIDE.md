# Complete Cron-Job.org Setup Guide

This guide walks you through setting up **cron-job.org** to automatically publish your scheduled posts.

---

## 📋 Prerequisites

Before setting up cron-job.org, make sure you have:

1. ✅ Your Python backend deployed and accessible via HTTPS
2. ✅ Environment variable `CRON_SECRET` set in your backend
3. ✅ Your backend URL (e.g., `https://your-backend.onrender.com`)

---

## 🔐 Step 1: Set Up CRON_SECRET Environment Variable

### For Python Backend (FastAPI)

1. **Generate a secure secret** (use a random string):
   ```bash
   # Option 1: Using openssl
   openssl rand -hex 32
   
   # Option 2: Using Python
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. **Add to your backend environment variables**:
   - **Render**: Go to your service → Environment → Add `CRON_SECRET`
   - **Railway**: Go to Variables → Add `CRON_SECRET`
   - **Docker**: Add to `.env` file or docker-compose.yml
   - **Local**: Add to `.env` file

   Example:
   ```
   CRON_SECRET=your-super-secret-random-string-here-123456789
   ```

3. **Restart your backend** after adding the variable.

---

## 🌐 Step 2: Get Your Backend URL

Your backend URL should be:
- **Production**: `https://your-backend-service.onrender.com` (or your domain)
- **Development**: `http://localhost:8000` (only for testing)

**Full cron endpoint URL**:
```
https://your-backend-service.onrender.com/api/v1/cron/publish-scheduled
```

---

## 🚀 Step 3: Create Account on cron-job.org

1. Go to **https://cron-job.org**
2. Click **"Sign Up"** (or **"Login"** if you have an account)
3. Complete registration (free account is sufficient)

---

## ⚙️ Step 4: Create Your Cron Job

### 4.1 Navigate to Cron Jobs

1. After logging in, click **"Cronjobs"** in the top menu
2. Click **"Create cronjob"** button

### 4.2 Configure Basic Settings

Fill in the form:

| Field | Value |
|------|-------|
| **Title** | `Publish Scheduled Posts` (or any name you like) |
| **Address (URL)** | `https://your-backend-service.onrender.com/api/v1/cron/publish-scheduled` |
| **Request method** | `GET` |
| **Schedule** | `Every minute` (or select `* * * * *` in custom) |

### 4.3 Add Authentication Header

1. Scroll down to **"Request headers"** section
2. Click **"Add header"**
3. Fill in:
   - **Header name**: `X-Cron-Secret`
   - **Header value**: `your-super-secret-random-string-here-123456789` (same as CRON_SECRET)

### 4.4 Configure Notifications (Optional but Recommended)

1. Scroll to **"Notifications"** section
2. Enable **"Email notifications"** for failures
3. Enter your email address

### 4.5 Save the Cron Job

1. Click **"Create cronjob"** button at the bottom
2. Your cron job is now active! ✅

---

## ✅ Step 5: Test Your Setup

### 5.1 Test the Endpoint Manually

You can test if your endpoint works by running this in your terminal:

```bash
# Replace with your actual values
curl -H "X-Cron-Secret: your-cron-secret" \
     https://your-backend-service.onrender.com/api/v1/cron/publish-scheduled
```

**Expected response** (if no posts are scheduled):
```json
{
  "success": true,
  "message": "No scheduled posts to process",
  "processed": 0,
  "published": 0,
  "failed": 0
}
```

**If you get "Unauthorized"**:
- Check that `CRON_SECRET` is set correctly in your backend
- Verify the header value matches exactly

### 5.2 Test with a Scheduled Post

1. **Create a test post** in your app
2. **Schedule it** for 1-2 minutes in the future
3. **Wait** for the scheduled time
4. **Check** if the post was published automatically
5. **Check cron-job.org dashboard** to see execution logs

---

## 📊 Step 6: Monitor Your Cron Job

### View Execution History

1. Go to **cron-job.org** dashboard
2. Click on your cron job
3. View **"Execution history"** tab
4. You'll see:
   - ✅ Green = Success
   - ❌ Red = Failure
   - ⏱️ Execution time

### Check Backend Logs

Your backend should log cron executions. Look for:
```
INFO: Cron job started: publish-scheduled
INFO: Found X scheduled posts to process
INFO: Post {id} processed: published (X/Y)
```

---

## 🔧 Troubleshooting

### Problem: "Unauthorized" Error

**Solution**:
- ✅ Verify `CRON_SECRET` environment variable is set
- ✅ Check header name is exactly `X-Cron-Secret` (case-sensitive)
- ✅ Ensure header value matches `CRON_SECRET` exactly
- ✅ Restart backend after setting environment variable

### Problem: Cron Job Runs But Posts Don't Publish

**Check**:
1. ✅ Are posts actually scheduled? (status = "scheduled")
2. ✅ Is `scheduled_at` time in the past?
3. ✅ Are platform credentials connected?
4. ✅ Check backend logs for error messages
5. ✅ Check `_publishLog` in post content for errors

### Problem: Cron Job Not Running

**Check**:
1. ✅ Is cron job **enabled** in cron-job.org dashboard?
2. ✅ Check execution history - are there any errors?
3. ✅ Verify URL is correct and accessible
4. ✅ Test endpoint manually with curl

### Problem: Posts Stuck in "Failed" Status

**Solution**:
- Posts fail after 3 retry attempts
- Check `_publishLog.error` in post content
- Common causes:
  - Platform credentials expired
  - Network timeout
  - Invalid media URLs
  - Platform API rate limits

---

## 📝 Quick Reference

### Cron Endpoint URL Format
```
https://<YOUR_BACKEND_DOMAIN>/api/v1/cron/publish-scheduled
```

### Required Header
```
X-Cron-Secret: <YOUR_CRON_SECRET>
```

### Schedule
- **Recommended**: Every 1 minute (`* * * * *`)
- **Alternative**: Every 5 minutes (`*/5 * * * *`)

### Environment Variable
```bash
CRON_SECRET=your-random-secret-string-here
```

---

## 🎯 Next Steps

After setup:
1. ✅ Schedule a test post
2. ✅ Monitor cron execution
3. ✅ Check published posts on your platforms
4. ✅ Review activity logs in your app

---

## 📚 Additional Resources

- **Architecture Overview**: See `docs/SCHEDULED_PUBLISHING.md`
- **API Documentation**: See `python_backend/src/api/v1/cron.py`
- **cron-job.org Help**: https://cron-job.org/en/help/

---

**Need Help?** Check the troubleshooting section above or review your backend logs for detailed error messages.
