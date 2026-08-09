-- Persisted per-source ingestion checkpoints (SEEN/INGESTED vs PUBLISHED).
-- Restart-safe cursors for RSS feeds and approved Telegram channels.

CREATE TABLE IF NOT EXISTS public.news_source_ingestion_checkpoints (
  source_key text PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  cursor_type text NOT NULL CHECK (cursor_type IN ('rss_item_identity', 'telegram_message_id')),
  cursor_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  recent_seen_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_observed_at timestamptz,
  bootstrapped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT news_source_ingestion_checkpoints_source_unique UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS news_source_ingestion_checkpoints_type_idx
  ON public.news_source_ingestion_checkpoints (source_type, source_id);

CREATE INDEX IF NOT EXISTS news_source_ingestion_checkpoints_updated_idx
  ON public.news_source_ingestion_checkpoints (updated_at DESC);

COMMENT ON TABLE public.news_source_ingestion_checkpoints IS
  'Restart-safe ingestion cursors: tracks SEEN/INGESTED items per source, separate from publication dedupe.';

ALTER TABLE public.news_source_ingestion_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY news_source_ingestion_checkpoints_service_role_all
  ON public.news_source_ingestion_checkpoints FOR ALL TO service_role
  USING (true) WITH CHECK (true);
