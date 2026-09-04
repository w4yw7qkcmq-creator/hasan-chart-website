-- VIP status delivery worker: single-row heartbeat + alert state (UPSERT).

BEGIN;

CREATE TABLE IF NOT EXISTS public.worker_service_heartbeats (
  worker_name text PRIMARY KEY,
  last_cycle_at timestamptz,
  last_success_at timestamptz,
  healthy boolean NOT NULL DEFAULT false,
  pending_count integer NOT NULL DEFAULT 0,
  processing_count integer NOT NULL DEFAULT 0,
  oldest_pending_age_seconds integer NOT NULL DEFAULT 0,
  stale_processing_count integer NOT NULL DEFAULT 0,
  alert_state text NOT NULL DEFAULT 'healthy'
    CHECK (alert_state IN ('healthy', 'unhealthy')),
  last_alert_at timestamptz,
  last_alert_reason text,
  build_commit text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_service_heartbeats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.worker_service_heartbeats FROM PUBLIC;
REVOKE ALL ON TABLE public.worker_service_heartbeats FROM anon;
REVOKE ALL ON TABLE public.worker_service_heartbeats FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.worker_service_heartbeats TO service_role;

COMMIT;
