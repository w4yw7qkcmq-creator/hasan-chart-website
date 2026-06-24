-- Email analytics: stores Resend webhook events and aggregated message rows.
-- Server-only access via service_role (webhook + admin API).

CREATE TABLE IF NOT EXISTS public.email_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_id text,
  event_type text NOT NULL,
  recipient_email text,
  message_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_analytics_events_resend_id_idx
  ON public.email_analytics_events (resend_id);

CREATE INDEX IF NOT EXISTS email_analytics_events_event_type_idx
  ON public.email_analytics_events (event_type);

CREATE INDEX IF NOT EXISTS email_analytics_events_created_at_idx
  ON public.email_analytics_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_id text UNIQUE NOT NULL,
  recipient_email text NOT NULL,
  subject text,
  message_type text,
  status text NOT NULL DEFAULT 'sent',
  opened boolean NOT NULL DEFAULT false,
  clicked boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_messages_sent_at_idx
  ON public.email_messages (sent_at DESC);

CREATE INDEX IF NOT EXISTS email_messages_status_idx
  ON public.email_messages (status);

CREATE INDEX IF NOT EXISTS email_messages_message_type_idx
  ON public.email_messages (message_type);

CREATE INDEX IF NOT EXISTS email_messages_recipient_email_idx
  ON public.email_messages (lower(recipient_email));

ALTER TABLE public.email_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_analytics_events FROM anon, authenticated;
REVOKE ALL ON public.email_messages FROM anon, authenticated;

GRANT ALL ON public.email_analytics_events TO service_role;
GRANT ALL ON public.email_messages TO service_role;
