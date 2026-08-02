-- Rollback for 20260803_instant_analysis_result_storage.sql

DROP INDEX IF EXISTS public.instant_analysis_requests_user_completed_idx;

ALTER TABLE public.instant_analysis_requests
  DROP COLUMN IF EXISTS chart_alt,
  DROP COLUMN IF EXISTS result_generated_at,
  DROP COLUMN IF EXISTS analysis_result,
  DROP COLUMN IF EXISTS result_version;
