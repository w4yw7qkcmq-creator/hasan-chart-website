-- HasaN CharT World — Account Lifecycle Phase 3A
-- Run manually in Supabase SQL Editor. NOT applied automatically.

-- =============================================================================
-- 1) profiles lifecycle columns
-- Primary source of truth: profiles.account_status
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid;

-- Legacy aliases (optional compatibility with earlier drafts)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status_reason text,
  ADD COLUMN IF NOT EXISTS account_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_status_changed_by uuid;

-- Optional fine-grained admin role (Phase 3B UI)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role text;

COMMENT ON COLUMN public.profiles.account_status IS 'Account lifecycle: active | suspended | banned | deleted';
COMMENT ON COLUMN public.profiles.status_reason IS 'Human-readable reason for the latest status change';
COMMENT ON COLUMN public.profiles.status_updated_at IS 'Timestamp of the latest lifecycle status update';
COMMENT ON COLUMN public.profiles.status_updated_by IS 'Admin user id who changed account_status last';

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

-- Existing rows default to active via column default
UPDATE public.profiles
SET account_status = 'active'
WHERE account_status IS NULL OR btrim(account_status) = '';

-- =============================================================================
-- 2) indexes for admin list + lifecycle queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS profiles_account_status_created_at_idx
  ON public.profiles (account_status, created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- 3) subscription_requests admin control (only if lifecycle layer needs it)
-- =============================================================================

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS admin_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_disabled_by uuid,
  ADD COLUMN IF NOT EXISTS admin_disabled_reason text,
  ADD COLUMN IF NOT EXISTS activation_source text;

COMMENT ON COLUMN public.subscription_requests.admin_disabled IS 'When true, an active subscription is treated as inactive by admin override';

CREATE INDEX IF NOT EXISTS subscription_requests_email_status_created_idx
  ON public.subscription_requests (lower(user_email), status, created_at DESC);
