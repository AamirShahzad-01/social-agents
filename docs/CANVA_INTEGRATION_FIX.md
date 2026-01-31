# Canva Integration Fix Guide

## Issue Summary
Canva integration credentials are stored in the `user_integrations` table, but the frontend shows it as "not connected" even when credentials exist in the database.

## Root Cause
The most likely causes are:
1. **Missing database tables** - Migration not applied for `user_integrations` and `canva_oauth_states`
2. **RLS (Row Level Security) blocking reads** - User cannot read their own credentials
3. **Python backend connection issue** - Frontend cannot reach backend API

## Diagnostic Steps

### Step 1: Check if tables exist
Run in Supabase SQL Editor:
```sql
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_integrations', 'canva_oauth_states');
```

If no results, the migration needs to be applied.

### Step 2: Apply the Migration
Run the migration file:
```sql
-- File: supabase/migrations/20241229_canva_integration.sql
-- This creates:
-- 1. user_integrations table (if not exists)
-- 2. canva_oauth_states table
-- 3. RLS policies for secure access
-- 4. Indexes for performance
```

### Step 3: Verify RLS Policies
After migration, verify RLS is enabled:
```sql
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('user_integrations', 'canva_oauth_states');
```

### Step 4: Check User Credentials
```sql
-- Replace with actual user UUID
SELECT user_id, provider, created_at, expires_at, scopes
FROM public.user_integrations 
WHERE provider = 'canva' 
AND user_id = 'YOUR_USER_ID';
```

## Architecture Notes

### Why Canva is Separate from Social Platforms

| System | Table Used | Purpose |
|--------|-----------|---------|
| Social Platforms (Twitter, FB, etc.) | `social_accounts` | Workspace-scoped connections |
| Canva | `user_integrations` | User-scoped OAuth connections |

This is **intentional design**:
- Social platforms are workspace-wide (shared across workspace members)
- Canva is user-personal (individual user's Canva account)

### Flow Diagram
```
Frontend (AccountSettingsTab.tsx)
    ↓ GET /api/canva/auth/status?user_id=xxx
Next.js API Route (/api/canva/auth/status/route.ts)
    ↓ GET /api/v1/canva/auth/status?user_id=xxx (with Bearer token)
Python Backend (canva.py)
    ↓ queries
Canva Service (canva_service.py)
    ↓ SELECT from
Supabase (user_integrations table)
```

## Code Locations Reference

### Frontend
- UI: `src/components/settings/AccountSettingsTab.tsx:752-850`
- API Client: `src/lib/python-backend/api/canva.ts:51-57`
- Status Check: `src/components/settings/AccountSettingsTab.tsx:119-147`

### API Routes
- Status: `src/app/api/canva/auth/status/route.ts`
- Auth: `src/app/api/canva/auth/route.ts`
- Disconnect: `src/app/api/canva/disconnect/route.ts`

### Backend
- API: `python_backend/src/api/v1/canva.py:221-237`
- Service: `python_backend/src/services/canva_service.py:449-517`
- Token Retrieval: `python_backend/src/services/canva_service.py:252-305`

### Database
- Migration: `supabase/migrations/20241229_canva_integration.sql`

## Quick Fix Commands

```bash
# 1. Apply migration via Supabase CLI (if using CLI)
supabase db reset

# OR

# 2. Copy migration SQL and run in Supabase Dashboard SQL Editor
cat supabase/migrations/20241229_canva_integration.sql
```

## Verification After Fix

1. Connect Canva in UI
2. Check status shows "Connected"
3. Verify in database:
```sql
SELECT * FROM public.user_integrations WHERE provider = 'canva';
```

## If Still Not Working

Check these additional items:

1. **Python Backend URL** - Verify `PYTHON_BACKEND_URL` env var is set correctly
2. **JWT Authentication** - Ensure backend can validate Supabase JWT tokens
3. **Network** - Check frontend can reach backend (CORS, firewall)
4. **Logs** - Check Python backend logs for errors
