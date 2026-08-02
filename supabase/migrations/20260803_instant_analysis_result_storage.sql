-- Instant Analysis v2: persist structured results (DO NOT apply from automation)
-- Rollback: see supabase/migrations/20260803_instant_analysis_result_storage_rollback.sql

ALTER TABLE public.instant_analysis_requests
  ADD COLUMN IF NOT EXISTS result_version text,
  ADD COLUMN IF NOT EXISTS analysis_result jsonb,
  ADD COLUMN IF NOT EXISTS result_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS chart_alt text;

COMMENT ON COLUMN public.instant_analysis_requests.analysis_result IS
  'Structured Instant Analysis v2 JSON snapshot for user replay after refresh.';

COMMENT ON COLUMN public.instant_analysis_requests.result_version IS
  'Analysis schema version, e.g. 2.0';

CREATE INDEX IF NOT EXISTS instant_analysis_requests_user_completed_idx
  ON public.instant_analysis_requests (user_id, completed_at DESC)
  WHERE status = 'completed' AND analysis_result IS NOT NULL;
