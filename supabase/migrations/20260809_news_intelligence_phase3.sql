-- News Intelligence Engine — Phase 3
-- Central decision records, incidents, metrics snapshots, and persisted source health.

CREATE TABLE IF NOT EXISTS public.news_decision_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL,
  candidate_id text,
  event_key text,
  event_type text,
  event_family text,
  source_type text,
  source_id text,
  source_ref_hash text,
  received_at timestamptz,
  normalized_at timestamptz,
  decision_at timestamptz NOT NULL DEFAULT now(),
  decision text NOT NULL,
  reason_code text NOT NULL,
  importance text,
  confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_status text,
  quality_status text,
  image_status text,
  ai_used boolean,
  aggregation_state text,
  publication_id uuid,
  delivery_result jsonb,
  latency jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_decision_records_correlation_idx
  ON public.news_decision_records (correlation_id);

CREATE INDEX IF NOT EXISTS news_decision_records_event_key_idx
  ON public.news_decision_records (event_key);

CREATE INDEX IF NOT EXISTS news_decision_records_decision_at_idx
  ON public.news_decision_records (decision_at DESC);

CREATE INDEX IF NOT EXISTS news_decision_records_source_idx
  ON public.news_decision_records (source_type, source_id, decision_at DESC);

CREATE INDEX IF NOT EXISTS news_decision_records_reason_idx
  ON public.news_decision_records (reason_code, decision_at DESC);

CREATE TABLE IF NOT EXISTS public.news_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
  incident_type text NOT NULL,
  signature text NOT NULL,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  affected_source text,
  affected_event_type text,
  count integer NOT NULL DEFAULT 1,
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_state text NOT NULL DEFAULT 'open'
    CHECK (current_state IN ('open', 'acknowledged', 'resolved')),
  auto_action text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_incidents_signature_idx
  ON public.news_incidents (signature, current_state);

CREATE INDEX IF NOT EXISTS news_incidents_last_seen_idx
  ON public.news_incidents (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS news_incidents_state_idx
  ON public.news_incidents (current_state, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS news_incidents_type_idx
  ON public.news_incidents (incident_type, current_state);

CREATE TABLE IF NOT EXISTS public.news_system_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_key text NOT NULL,
  bucket_start timestamptz NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT news_system_metric_snapshots_unique UNIQUE (window_key, bucket_start)
);

CREATE INDEX IF NOT EXISTS news_system_metric_snapshots_bucket_idx
  ON public.news_system_metric_snapshots (bucket_start DESC);

CREATE TABLE IF NOT EXISTS public.news_source_health_states (
  source_key text PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('HEALTHY', 'DEGRADED', 'QUARANTINED', 'RECOVERING')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_source_health_states_state_idx
  ON public.news_source_health_states (state, updated_at DESC);

CREATE INDEX IF NOT EXISTS news_source_health_states_source_idx
  ON public.news_source_health_states (source_type, source_id);

COMMENT ON TABLE public.news_decision_records IS
  'Structured why-published / why-blocked audit trail. No raw source text.';

COMMENT ON TABLE public.news_incidents IS
  'Deduped operational incidents for news intelligence autonomy layer.';

COMMENT ON TABLE public.news_source_health_states IS
  'Persisted source health for deterministic restart semantics.';

ALTER TABLE public.news_decision_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_system_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_source_health_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY news_decision_records_service_role_all
  ON public.news_decision_records FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY news_incidents_service_role_all
  ON public.news_incidents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY news_system_metric_snapshots_service_role_all
  ON public.news_system_metric_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY news_source_health_states_service_role_all
  ON public.news_source_health_states FOR ALL TO service_role
  USING (true) WITH CHECK (true);
