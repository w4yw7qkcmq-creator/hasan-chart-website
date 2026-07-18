-- Email outbox: durable queue for transactional email dispatch (Phase 1 — storage only).
-- Server-only access via service_role. No anon/authenticated policies.

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  html text,
  text text,
  message_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  resend_id text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_outbox_idempotency_key_key'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_outbox_status_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_status_check
      CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_outbox_attempts_nonneg_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_attempts_nonneg_check
      CHECK (attempts >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_outbox_max_attempts_positive_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_max_attempts_positive_check
      CHECK (max_attempts > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_outbox_status_idx
  ON public.email_outbox (status);

CREATE INDEX IF NOT EXISTS email_outbox_scheduled_at_idx
  ON public.email_outbox (scheduled_at);

CREATE INDEX IF NOT EXISTS email_outbox_created_at_idx
  ON public.email_outbox (created_at DESC);

CREATE INDEX IF NOT EXISTS email_outbox_recipient_email_idx
  ON public.email_outbox (lower(recipient_email));

CREATE INDEX IF NOT EXISTS email_outbox_message_type_idx
  ON public.email_outbox (message_type);

CREATE OR REPLACE FUNCTION public.set_email_outbox_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_outbox_set_updated_at ON public.email_outbox;

CREATE TRIGGER email_outbox_set_updated_at
BEFORE UPDATE ON public.email_outbox
FOR EACH ROW
EXECUTE FUNCTION public.set_email_outbox_updated_at();

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_outbox FROM anon, authenticated;

GRANT ALL ON public.email_outbox TO service_role;
