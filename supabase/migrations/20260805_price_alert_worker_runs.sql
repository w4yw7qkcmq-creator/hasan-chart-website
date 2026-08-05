-- Persistent cycle telemetry for Price Alerts Worker (one summary row per cycle).

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_alert_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  worker_instance text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_ms integer,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'overlap')),
  alerts_fetched integer NOT NULL DEFAULT 0,
  alerts_evaluated integer NOT NULL DEFAULT 0,
  alerts_triggered integer NOT NULL DEFAULT 0,
  alerts_claimed integer NOT NULL DEFAULT 0,
  alerts_completed integer NOT NULL DEFAULT 0,
  site_sent integer NOT NULL DEFAULT 0,
  push_sent integer NOT NULL DEFAULT 0,
  push_failed integer NOT NULL DEFAULT 0,
  email_queued integer NOT NULL DEFAULT 0,
  email_failed integer NOT NULL DEFAULT 0,
  duplicate_claims integer NOT NULL DEFAULT 0,
  lock_acquired boolean NOT NULL DEFAULT false,
  lock_contended boolean NOT NULL DEFAULT false,
  stale_prices integer NOT NULL DEFAULT 0,
  error_code_safe text,
  build_commit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_alert_worker_runs_started_at_idx
  ON public.price_alert_worker_runs (started_at DESC);

CREATE OR REPLACE FUNCTION public.cleanup_price_alert_worker_runs(p_retention_days integer DEFAULT 90)
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
  DELETE FROM public.price_alert_worker_runs
  WHERE started_at < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'retentionDays', v_days, 'cutoff', v_cutoff);
END;
$$;

ALTER TABLE public.price_alert_worker_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.price_alert_worker_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.price_alert_worker_runs FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_price_alert_worker_runs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_price_alert_worker_runs(integer) FROM anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.price_alert_worker_runs TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_price_alert_worker_runs(integer) TO service_role;

COMMIT;
