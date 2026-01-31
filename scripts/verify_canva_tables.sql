-- Verify Canva Integration Tables Exist
-- Run this in your Supabase SQL Editor

-- 1. Check if user_integrations table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_integrations'
) as user_integrations_exists;

-- 2. Check if canva_oauth_states table exists  
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'canva_oauth_states'
) as canva_oauth_states_exists;

-- 3. Check for ALL Canva credentials (to find your user_id)
SELECT user_id, provider, created_at, updated_at, expires_at, scopes
FROM public.user_integrations 
WHERE provider = 'canva';

-- 4. If you need to filter by a specific user after finding their ID:
-- SELECT * FROM public.user_integrations 
-- WHERE provider = 'canva' 
-- AND user_id = 'actual-uuid-here';

-- 4. Check table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_integrations';
