-- Enhanced email analytics fields for professional dashboard.

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS email_messages_open_count_idx
  ON public.email_messages (open_count DESC);

CREATE INDEX IF NOT EXISTS email_messages_click_count_idx
  ON public.email_messages (click_count DESC);
