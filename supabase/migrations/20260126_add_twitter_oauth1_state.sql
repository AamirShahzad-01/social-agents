-- Migration: Add OAuth1 token fields to oauth_states table
-- Date: 2026-01-26
-- Description: Store Twitter OAuth1 request tokens for callback validation

ALTER TABLE public.oauth_states
ADD COLUMN IF NOT EXISTS oauth_token text;

ALTER TABLE public.oauth_states
ADD COLUMN IF NOT EXISTS oauth_token_secret text;
