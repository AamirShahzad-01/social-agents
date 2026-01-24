-- Migration: Align workspace_invites schema with production invite flow
-- Date: 2026-01-24
-- Description: Adds status and audit fields, allows nullable email for shareable links,
--              and adds indexes + unique constraint for non-null emails.

-- Allow email to be nullable for shareable invites
ALTER TABLE public.workspace_invites
  ALTER COLUMN email DROP NOT NULL;

-- Add columns if missing
ALTER TABLE public.workspace_invites
  ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_by uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Foreign keys (safe to run; will error if constraints exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_invites_used_by_fkey'
  ) THEN
    ALTER TABLE public.workspace_invites
      ADD CONSTRAINT workspace_invites_used_by_fkey
      FOREIGN KEY (used_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_invites_created_by_fkey'
  ) THEN
    ALTER TABLE public.workspace_invites
      ADD CONSTRAINT workspace_invites_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_invites_accepted_by_fkey'
  ) THEN
    ALTER TABLE public.workspace_invites
      ADD CONSTRAINT workspace_invites_accepted_by_fkey
      FOREIGN KEY (accepted_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_invites_status ON public.workspace_invites(status);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_expires_at ON public.workspace_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON public.workspace_invites(email);

-- Unique constraint for non-null email invites
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_workspace_email_unique
  ON public.workspace_invites(workspace_id, email)
  WHERE email IS NOT NULL;
