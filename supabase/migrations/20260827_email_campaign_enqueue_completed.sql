-- Phase E2.1: campaign enqueue completion timestamp (delivery metrics continue after).

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS enqueue_completed_at timestamptz;

COMMENT ON COLUMN public.email_campaigns.enqueue_completed_at IS
  'When all eligible recipients finished outbox enqueue; delivery webhooks may still update metrics afterward.';
