-- Per-channel delivery attempts for Price Alerts (idempotency + partial recovery).

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_alert_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id bigint NOT NULL,
  channel text NOT NULL CHECK (channel IN ('site', 'push', 'email')),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code_safe text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT price_alert_delivery_attempts_alert_channel_unique UNIQUE (alert_id, channel),
  CONSTRAINT price_alert_delivery_attempts_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS price_alert_delivery_attempts_alert_id_idx
  ON public.price_alert_delivery_attempts (alert_id);

CREATE INDEX IF NOT EXISTS price_alert_delivery_attempts_status_idx
  ON public.price_alert_delivery_attempts (status, updated_at DESC);

ALTER TABLE public.price_alert_delivery_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.price_alert_delivery_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.price_alert_delivery_attempts FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.price_alert_delivery_attempts TO service_role;

COMMIT;
