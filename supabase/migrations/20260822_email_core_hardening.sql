-- Phase E1: Email core hardening — outbox provider idempotency, analytics correlation,
-- suppression foundation, marketing preferences, IAM permissions.

-- ---------------------------------------------------------------------------
-- email_outbox: provider acceptance tracking + extended statuses
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS provider_idempotency_key text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_submission_state text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_outbox_status_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox DROP CONSTRAINT email_outbox_status_check;
  END IF;
END $$;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'accepted', 'sent', 'failed', 'skipped'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_outbox_provider_submission_state_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_provider_submission_state_check
      CHECK (provider_submission_state IN ('none', 'submitted', 'accepted', 'uncertain'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_provider_idempotency_key_idx
  ON public.email_outbox (provider_idempotency_key)
  WHERE provider_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_outbox_resend_id_idx
  ON public.email_outbox (resend_id)
  WHERE resend_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_outbox_accepted_at_idx
  ON public.email_outbox (accepted_at DESC)
  WHERE accepted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- email_messages: correlate analytics rows to outbox
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS outbox_id uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_messages_outbox_id_idx
  ON public.email_messages (outbox_id)
  WHERE outbox_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- email_suppressions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_suppressions_reason_check'
      AND conrelid = 'public.email_suppressions'::regclass
  ) THEN
    ALTER TABLE public.email_suppressions
      ADD CONSTRAINT email_suppressions_reason_check
      CHECK (reason IN (
        'hard_bounce',
        'complaint',
        'unsubscribe',
        'admin_block',
        'invalid_address',
        'provider_suppressed'
      ));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_active_email_unique
  ON public.email_suppressions (normalized_email)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS email_suppressions_normalized_email_idx
  ON public.email_suppressions (normalized_email);

CREATE INDEX IF NOT EXISTS email_suppressions_reason_idx
  ON public.email_suppressions (reason);

CREATE OR REPLACE FUNCTION public.set_email_suppressions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_suppressions_set_updated_at ON public.email_suppressions;

CREATE TRIGGER email_suppressions_set_updated_at
BEFORE UPDATE ON public.email_suppressions
FOR EACH ROW
EXECUTE FUNCTION public.set_email_suppressions_updated_at();

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_suppressions FROM anon, authenticated;
GRANT ALL ON public.email_suppressions TO service_role;

-- ---------------------------------------------------------------------------
-- email_marketing_preferences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_marketing_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  global_unsubscribed_at timestamptz,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_email_marketing_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_marketing_preferences_set_updated_at ON public.email_marketing_preferences;

CREATE TRIGGER email_marketing_preferences_set_updated_at
BEFORE UPDATE ON public.email_marketing_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_email_marketing_preferences_updated_at();

ALTER TABLE public.email_marketing_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_marketing_preferences FROM anon, authenticated;
GRANT ALL ON public.email_marketing_preferences TO service_role;

-- ---------------------------------------------------------------------------
-- Stale recovery: finalize rows already accepted by provider
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_stale_email_outbox_processing(p_stale_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked_failed integer := 0;
  v_released_pending integer := 0;
  v_finalized_sent integer := 0;
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - make_interval(mins => GREATEST(1, COALESCE(p_stale_minutes, 15)));

  UPDATE public.email_outbox
  SET
    status = 'sent',
    sent_at = COALESCE(sent_at, accepted_at, now()),
    updated_at = now(),
    error = NULL,
    claimed_at = NULL,
    provider_submission_state = 'accepted'
  WHERE status IN ('processing', 'accepted')
    AND claimed_at IS NOT NULL
    AND claimed_at <= v_cutoff
    AND resend_id IS NOT NULL;

  GET DIAGNOSTICS v_finalized_sent = ROW_COUNT;

  UPDATE public.email_outbox
  SET
    status = 'failed',
    failed_at = now(),
    updated_at = now(),
    error = COALESCE(error, 'stale processing exceeded max attempts')
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at <= v_cutoff
    AND attempts >= max_attempts
    AND resend_id IS NULL;

  GET DIAGNOSTICS v_marked_failed = ROW_COUNT;

  UPDATE public.email_outbox
  SET
    status = 'pending',
    claimed_at = NULL,
    updated_at = now(),
    error = COALESCE(error, 'stale processing released')
  WHERE status IN ('processing', 'accepted')
    AND claimed_at IS NOT NULL
    AND claimed_at <= v_cutoff
    AND attempts < max_attempts
    AND resend_id IS NULL;

  GET DIAGNOSTICS v_released_pending = ROW_COUNT;

  RETURN jsonb_build_object(
    'releasedPending', v_released_pending,
    'markedFailed', v_marked_failed,
    'finalizedSent', v_finalized_sent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_email_outbox_processing(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stale_email_outbox_processing(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- IAM permissions for email operations (Phase E2 prep — not auto-granted)
-- ---------------------------------------------------------------------------

INSERT INTO public.iam_permissions (id, label, category, description) VALUES
  ('email.campaign.read', 'Email Campaign Read', 'email', 'View email campaign drafts and history'),
  ('email.campaign.create', 'Email Campaign Create', 'email', 'Create and edit email campaign drafts'),
  ('email.campaign.send', 'Email Campaign Send', 'email', 'Send email campaigns to audiences'),
  ('email.suppression.manage', 'Email Suppression Manage', 'email', 'Manage email suppression list'),
  ('email.outbox.read', 'Email Outbox Read', 'email', 'View operational email outbox metrics')
ON CONFLICT (id) DO NOTHING;
