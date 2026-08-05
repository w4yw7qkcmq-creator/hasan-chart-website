-- Persistent cycle telemetry for News Worker (one summary row per cycle).

BEGIN;

CREATE TABLE IF NOT EXISTS public.news_worker_cycle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  worker_instance text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_ms integer,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'overlap')),
  fetched_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  duplicates_count integer NOT NULL DEFAULT 0,
  site_published_count integer NOT NULL DEFAULT 0,
  telegram_published_count integer NOT NULL DEFAULT 0,
  ai_calls integer NOT NULL DEFAULT 0,
  image_failures integer NOT NULL DEFAULT 0,
  lock_acquired boolean NOT NULL DEFAULT false,
  lock_contended boolean NOT NULL DEFAULT false,
  error_code_safe text,
  build_commit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_worker_cycle_runs_started_at_idx
  ON public.news_worker_cycle_runs (started_at DESC);

CREATE OR REPLACE FUNCTION public.cleanup_news_worker_cycle_runs(p_retention_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(7, LEAST(COALESCE(p_retention_days, 90), 365));
  v_cutoff timestamptz := now() - make_interval(days => v_days);
  v_deleted integer;
BEGIN
  DELETE FROM public.news_worker_cycle_runs
  WHERE started_at < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'retentionDays', v_days, 'cutoff', v_cutoff);
END;
$$;

ALTER TABLE public.news_worker_cycle_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.news_worker_cycle_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.news_worker_cycle_runs FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_news_worker_cycle_runs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_news_worker_cycle_runs(integer) FROM anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.news_worker_cycle_runs TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_news_worker_cycle_runs(integer) TO service_role;

COMMIT;
