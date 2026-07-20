-- Admin User Management — Phase 3
-- Run manually in Supabase SQL Editor. NOT applied automatically.

-- =============================================================================
-- profiles lifecycle columns
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS account_status_reason text,
  ADD COLUMN IF NOT EXISTS account_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_status_changed_by uuid,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'suspended', 'banned', 'deleted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_account_status_idx
  ON public.profiles (account_status);

CREATE INDEX IF NOT EXISTS profiles_admin_list_created_at_idx
  ON public.profiles (created_at DESC);

-- =============================================================================
-- subscription_requests admin control
-- =============================================================================

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS admin_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_disabled_by uuid,
  ADD COLUMN IF NOT EXISTS admin_disabled_reason text,
  ADD COLUMN IF NOT EXISTS activation_source text;

CREATE INDEX IF NOT EXISTS subscription_requests_user_email_status_idx
  ON public.subscription_requests (lower(user_email), status, created_at DESC);

-- =============================================================================
-- admin_user_notes
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_user_id uuid,
  admin_email text,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_user_notes_user_created_idx
  ON public.admin_user_notes (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_user_notes FROM anon, authenticated;
GRANT ALL ON public.admin_user_notes TO service_role;

-- =============================================================================
-- admin_audit_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  target_user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_created_idx
  ON public.admin_audit_logs (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_user_created_idx
  ON public.admin_audit_logs (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_action_created_idx
  ON public.admin_audit_logs (action, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
