-- Upload session layer for payment proof (idempotent — DO NOT apply until approved)
-- subscription_requests holds real subscription requests only; upload phase is isolated here.

CREATE TABLE IF NOT EXISTS public.subscription_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL,
  user_email text NOT NULL,

  username text,
  plan_name text NOT NULL,
  category text NOT NULL,
  price text NOT NULL,
  telegram_username text NOT NULL,

  object_path text,
  declared_mime_type text,
  declared_size_bytes bigint,
  nonce text,

  status text NOT NULL DEFAULT 'open',

  subscription_request_id bigint NULL,
  failure_reason text,

  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscription_upload_sessions_status_check
    CHECK (status IN ('open', 'completed', 'failed', 'expired')),

  CONSTRAINT subscription_upload_sessions_declared_size_nonneg
    CHECK (declared_size_bytes IS NULL OR declared_size_bytes >= 0)
);

COMMENT ON TABLE public.subscription_upload_sessions IS
  'Ephemeral upload sessions for subscription payment proofs. Not visible in admin CRM.';

COMMENT ON COLUMN public.subscription_upload_sessions.subscription_request_id IS
  'References subscription_requests.id (bigint legacy PK). Set only when status=completed.';

CREATE UNIQUE INDEX IF NOT EXISTS subscription_upload_sessions_object_path_idx
  ON public.subscription_upload_sessions (object_path)
  WHERE object_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscription_upload_sessions_user_open_idx
  ON public.subscription_upload_sessions (user_id, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS subscription_upload_sessions_expires_idx
  ON public.subscription_upload_sessions (expires_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS subscription_upload_sessions_request_id_idx
  ON public.subscription_upload_sessions (subscription_request_id)
  WHERE subscription_request_id IS NOT NULL;

ALTER TABLE public.subscription_upload_sessions ENABLE ROW LEVEL SECURITY;

-- No client policies: all access via service role API routes only.
