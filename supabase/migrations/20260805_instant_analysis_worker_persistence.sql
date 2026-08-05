-- Instant Analysis: persistent worker jobs, atomic claim, result storage, telemetry.

BEGIN;

ALTER TABLE public.instant_analysis_requests
  ADD COLUMN IF NOT EXISTS result_version text,
  ADD COLUMN IF NOT EXISTS analysis_result jsonb,
  ADD COLUMN IF NOT EXISTS result_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS chart_alt text;

CREATE TABLE IF NOT EXISTS public.instant_analysis_jobs (
  job_id text PRIMARY KEY,
  request_id uuid REFERENCES public.instant_analysis_requests(id) ON DELETE SET NULL,
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 2 AND 20),
  execution_timeframe text,
  status text NOT NULL CHECK (
    status IN ('queued', 'claimed', 'processing', 'completed', 'failed', 'timed_out', 'cancelled')
  ),
  claimed_by text,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code_safe text,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  analysis_result jsonb,
  result_version text,
  result_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instant_analysis_jobs_completed_has_result CHECK (
    status <> 'completed' OR analysis_result IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS instant_analysis_jobs_status_claim_idx
  ON public.instant_analysis_jobs (status, claim_expires_at)
  WHERE status IN ('queued', 'claimed', 'processing');

CREATE INDEX IF NOT EXISTS instant_analysis_jobs_request_idx
  ON public.instant_analysis_jobs (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.instant_analysis_worker_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  worker_instance text,
  deployment_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  status text NOT NULL,
  auth_mode text,
  candles_count integer,
  market_provider text DEFAULT 'okx',
  ai_calls integer NOT NULL DEFAULT 0,
  result_version text,
  error_code_safe text,
  build_commit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instant_analysis_worker_runs_job_idx
  ON public.instant_analysis_worker_runs (job_id, created_at DESC);

ALTER TABLE public.instant_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instant_analysis_worker_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.instant_analysis_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.instant_analysis_worker_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.instant_analysis_jobs TO service_role;
GRANT ALL ON TABLE public.instant_analysis_worker_runs TO service_role;

CREATE OR REPLACE FUNCTION public.promote_instant_analysis_reservation(
  p_request_id uuid,
  p_job_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id text := trim(p_job_id);
  v_row public.instant_analysis_requests%ROWTYPE;
BEGIN
  IF v_job_id IS NULL OR char_length(v_job_id) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_JOB_ID');
  END IF;

  UPDATE public.instant_analysis_requests
  SET
    job_id = v_job_id,
    status = 'processing',
    cooldown_starts_at = COALESCE(cooldown_starts_at, now()),
    updated_at = now()
  WHERE id = p_request_id
    AND status = 'reserving'
    AND job_id IS NULL
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'promoted', true);
  END IF;

  SELECT * INTO v_row
  FROM public.instant_analysis_requests
  WHERE id = p_request_id
    AND job_id = v_job_id
    AND status = 'processing';

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'promoted', false, 'already_processing', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_instant_analysis_job(
  p_job_id text,
  p_symbol text,
  p_execution_timeframe text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id text := trim(p_job_id);
  v_symbol text := upper(trim(p_symbol));
  v_inserted integer;
BEGIN
  IF v_job_id IS NULL OR char_length(v_job_id) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_JOB_ID');
  END IF;
  IF v_symbol IS NULL OR char_length(v_symbol) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SYMBOL_INVALID');
  END IF;

  INSERT INTO public.instant_analysis_jobs (job_id, request_id, symbol, execution_timeframe, status)
  VALUES (v_job_id, p_request_id, v_symbol, p_execution_timeframe, 'queued')
  ON CONFLICT (job_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'existing', v_inserted = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_instant_analysis_job(
  p_job_id text,
  p_owner_id text,
  p_claim_ttl_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_claim_ttl_seconds, 120), 600));
  v_row public.instant_analysis_jobs%ROWTYPE;
BEGIN
  IF COALESCE(trim(p_owner_id), '') = '' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'missing_owner');
  END IF;

  SELECT * INTO v_row FROM public.instant_analysis_jobs WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF v_row.status IN ('completed', 'failed', 'timed_out', 'cancelled') THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'terminal', 'status', v_row.status);
  END IF;

  IF v_row.claimed_by IS NOT NULL
     AND v_row.claimed_by <> p_owner_id
     AND v_row.claim_expires_at IS NOT NULL
     AND v_row.claim_expires_at > v_now THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'contended', 'owner', v_row.claimed_by);
  END IF;

  IF v_row.attempt_count >= v_row.max_attempts AND v_row.status IN ('failed', 'timed_out') THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'max_attempts');
  END IF;

  UPDATE public.instant_analysis_jobs
  SET status = 'claimed',
      claimed_by = p_owner_id,
      claimed_at = v_now,
      claim_expires_at = v_now + make_interval(secs => v_ttl),
      attempt_count = attempt_count + 1,
      updated_at = v_now
  WHERE job_id = p_job_id;

  RETURN jsonb_build_object('claimed', true, 'job_id', p_job_id, 'symbol', v_row.symbol);
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_instant_analysis_job_claim(
  p_job_id text,
  p_owner_id text,
  p_claim_ttl_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_claim_ttl_seconds, 120), 600));
  v_updated integer;
BEGIN
  UPDATE public.instant_analysis_jobs
  SET claim_expires_at = now() + make_interval(secs => v_ttl),
      status = CASE WHEN status = 'claimed' THEN 'processing' ELSE status END,
      processing_started_at = COALESCE(processing_started_at, now()),
      updated_at = now()
  WHERE job_id = p_job_id
    AND claimed_by = p_owner_id
    AND status IN ('claimed', 'processing');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('extended', v_updated = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_instant_analysis_job(
  p_job_id text,
  p_owner_id text,
  p_result jsonb,
  p_result_version text DEFAULT '2.0'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.instant_analysis_jobs%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  UPDATE public.instant_analysis_jobs
  SET status = 'completed',
      analysis_result = p_result,
      result_version = p_result_version,
      result_generated_at = v_now,
      completed_at = v_now,
      claimed_by = NULL,
      claim_expires_at = NULL,
      error_code_safe = NULL,
      updated_at = v_now
  WHERE job_id = p_job_id
    AND claimed_by = p_owner_id
    AND status IN ('claimed', 'processing')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_OWNER_OR_TERMINAL');
  END IF;

  IF v_row.request_id IS NOT NULL THEN
    UPDATE public.instant_analysis_requests
    SET status = 'completed',
        analysis_result = p_result,
        result_version = p_result_version,
        result_generated_at = v_now,
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_row.request_id
      AND status IN ('processing', 'reserving');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job_id', p_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_instant_analysis_job(
  p_job_id text,
  p_owner_id text,
  p_error_code text,
  p_terminal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.instant_analysis_jobs%ROWTYPE;
  v_status text;
BEGIN
  v_status := CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END;

  UPDATE public.instant_analysis_jobs
  SET status = v_status,
      error_code_safe = left(COALESCE(p_error_code, 'JOB_FAILED'), 120),
      failed_at = CASE WHEN p_terminal THEN now() ELSE failed_at END,
      claimed_by = NULL,
      claim_expires_at = NULL,
      updated_at = now()
  WHERE job_id = p_job_id
    AND claimed_by = p_owner_id
    AND status IN ('claimed', 'processing')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_OWNER_OR_TERMINAL');
  END IF;

  IF p_terminal AND v_row.request_id IS NOT NULL THEN
    UPDATE public.instant_analysis_requests
    SET status = 'failed',
        error_code = left(COALESCE(p_error_code, 'JOB_FAILED'), 120),
        completed_at = now(),
        updated_at = now()
    WHERE id = v_row.request_id AND status IN ('processing', 'reserving');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job_id', p_job_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_instant_analysis_job(p_job_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.instant_analysis_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.instant_analysis_jobs WHERE job_id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'job_id', v_row.job_id,
    'status', v_row.status,
    'symbol', v_row.symbol,
    'execution_timeframe', v_row.execution_timeframe,
    'error_code_safe', v_row.error_code_safe,
    'analysis_result', v_row.analysis_result,
    'result_version', v_row.result_version,
    'completed_at', v_row.completed_at,
    'failed_at', v_row.failed_at,
    'created_at', v_row.created_at,
    'attempt_count', v_row.attempt_count,
    'max_attempts', v_row.max_attempts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_instant_analysis_jobs(p_claim_ttl_seconds integer DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered integer := 0;
  v_stale integer := 0;
BEGIN
  UPDATE public.instant_analysis_jobs
  SET status = 'queued',
      claimed_by = NULL,
      claimed_at = NULL,
      claim_expires_at = NULL,
      updated_at = now()
  WHERE status IN ('claimed', 'processing')
    AND claim_expires_at IS NOT NULL
    AND claim_expires_at < now()
    AND attempt_count < max_attempts;

  GET DIAGNOSTICS v_stale = ROW_COUNT;

  UPDATE public.instant_analysis_jobs
  SET status = 'timed_out',
      error_code_safe = 'CLAIM_EXPIRED_MAX',
      failed_at = now(),
      claimed_by = NULL,
      claim_expires_at = NULL,
      updated_at = now()
  WHERE status IN ('claimed', 'processing')
    AND claim_expires_at IS NOT NULL
    AND claim_expires_at < now()
    AND attempt_count >= max_attempts;

  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  RETURN jsonb_build_object(
    'requeued', v_stale,
    'timed_out', v_recovered
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_instant_analysis_worker_runs(p_retention_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.instant_analysis_worker_runs
  WHERE created_at < now() - make_interval(days => GREATEST(7, LEAST(p_retention_days, 365)));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_instant_analysis_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_instant_analysis_job(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_instant_analysis_job(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extend_instant_analysis_job_claim(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_instant_analysis_job(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_instant_analysis_job(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_instant_analysis_job(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_instant_analysis_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_instant_analysis_worker_runs(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.promote_instant_analysis_reservation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_instant_analysis_job(text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_instant_analysis_job(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_instant_analysis_job_claim(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_instant_analysis_job(text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_instant_analysis_job(text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_instant_analysis_job(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_instant_analysis_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_instant_analysis_worker_runs(integer) TO service_role;

COMMIT;
