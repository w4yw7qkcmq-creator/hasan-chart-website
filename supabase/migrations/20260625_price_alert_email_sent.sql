-- Idempotency for price alert emails (one email per alert_id).

ALTER TABLE public.price_alerts
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_resend_id text;

CREATE INDEX IF NOT EXISTS price_alerts_email_sent_at_idx
  ON public.price_alerts (email_sent_at DESC)
  WHERE email_sent_at IS NOT NULL;
