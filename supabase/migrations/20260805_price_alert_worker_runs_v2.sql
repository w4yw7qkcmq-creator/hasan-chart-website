-- Extend price alert worker run telemetry (cadence diagnostics).

BEGIN;

ALTER TABLE public.price_alert_worker_runs
  ADD COLUMN IF NOT EXISTS trigger_source text,
  ADD COLUMN IF NOT EXISTS deployment_id text,
  ADD COLUMN IF NOT EXISTS process_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS retries_processed integer NOT NULL DEFAULT 0;

COMMIT;
