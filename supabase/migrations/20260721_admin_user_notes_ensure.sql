-- Admin User Notes — ensure table exists (idempotent)
-- Run manually in Supabase SQL Editor. NOT applied automatically.
--
-- Compatible with existing API code:
--   admin_user_id, admin_email, note, deleted_at (soft delete)
-- Adds optional is_pinned when missing.

CREATE TABLE IF NOT EXISTS public.admin_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_user_id uuid,
  admin_email text,
  note text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.admin_user_notes
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.admin_user_notes
  ADD COLUMN IF NOT EXISTS admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS admin_email text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS admin_user_notes_user_created_idx
  ON public.admin_user_notes (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_user_notes_user_pinned_idx
  ON public.admin_user_notes (user_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_user_notes FROM anon, authenticated;
GRANT ALL ON public.admin_user_notes TO service_role;
