-- News Intelligence Engine — Phase 1
-- Canonical publication identity + per-leg delivery state.
-- DO NOT execute on production until explicitly approved.

CREATE TABLE IF NOT EXISTS public.news_event_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  publication_type text NOT NULL DEFAULT 'RELEASE',
  source_type text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_leg_status text NOT NULL DEFAULT 'pending'
    CHECK (telegram_leg_status IN ('pending', 'success', 'failed', 'skipped')),
  site_leg_status text NOT NULL DEFAULT 'pending'
    CHECK (site_leg_status IN ('pending', 'success', 'failed', 'skipped')),
  CONSTRAINT news_event_publications_identity_unique
    UNIQUE (event_key, publication_type)
);

CREATE INDEX IF NOT EXISTS news_event_publications_event_key_idx
  ON public.news_event_publications (event_key);

CREATE INDEX IF NOT EXISTS news_event_publications_created_at_idx
  ON public.news_event_publications (created_at DESC);

COMMENT ON TABLE public.news_event_publications IS
  'One canonical RELEASE identity per event_key. Delivery legs tracked separately.';

COMMENT ON COLUMN public.news_event_publications.telegram_leg_status IS
  'Telegram delivery state for this canonical publication identity.';

COMMENT ON COLUMN public.news_event_publications.site_leg_status IS
  'Site delivery state for this canonical publication identity.';

ALTER TABLE public.news_event_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY news_event_publications_service_role_all
  ON public.news_event_publications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
