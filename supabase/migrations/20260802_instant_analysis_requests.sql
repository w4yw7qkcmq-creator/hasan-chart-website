-- Instant analysis requests: per-user 60-minute cooldown with atomic reservation.
-- Apply manually after review. Do NOT run against production from automation.

CREATE TABLE IF NOT EXISTS public.instant_analysis_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 2 AND 20),
  job_id text CHECK (job_id IS NULL OR char_length(job_id) BETWEEN 3 AND 128),
  status text NOT NULL CHECK (
    status IN ('reserving', 'processing', 'completed', 'failed', 'released')
  ),
  requested_at timestamptz NOT NULL DEFAULT now(),
  cooldown_starts_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instant_analysis_job_required CHECK (
    status IN ('reserving', 'released') OR job_id IS NOT NULL
  ),
  CONSTRAINT instant_analysis_cooldown_required CHECK (
    status NOT IN ('processing', 'completed', 'failed') OR cooldown_starts_at IS NOT NULL
  ),
  CONSTRAINT instant_analysis_released_no_cooldown CHECK (
    status <> 'released' OR cooldown_starts_at IS NULL
  ),
  CONSTRAINT instant_analysis_completed_at CHECK (
    status NOT IN ('completed', 'failed') OR completed_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS instant_analysis_requests_one_reserving_per_user
  ON public.instant_analysis_requests (user_id)
  WHERE status = 'reserving';

CREATE INDEX IF NOT EXISTS instant_analysis_requests_user_cooldown_idx
  ON public.instant_analysis_requests (user_id, cooldown_starts_at DESC)
  WHERE cooldown_starts_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS instant_analysis_requests_user_job_idx
  ON public.instant_analysis_requests (user_id, job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON TABLE public.instant_analysis_requests IS
  'Instant AI analysis jobs with per-user cooldown. Server/API access only via service_role RPCs.';

ALTER TABLE public.instant_analysis_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.instant_analysis_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.instant_analysis_requests FROM anon;
REVOKE ALL ON TABLE public.instant_analysis_requests FROM authenticated;
GRANT ALL ON TABLE public.instant_analysis_requests TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_stale_instant_analysis_reservations(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.instant_analysis_requests
  SET
    status = 'released',
    error_code = COALESCE(error_code, 'RESERVATION_STALE'),
    updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'reserving'
    AND job_id IS NULL
    AND created_at < now() - interval '3 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_instant_analysis_availability(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_cooldown timestamptz;
  v_next_allowed timestamptz;
  v_retry integer;
BEGIN
  PERFORM public.cleanup_stale_instant_analysis_reservations(p_user_id);

  SELECT cooldown_starts_at
  INTO v_last_cooldown
  FROM public.instant_analysis_requests
  WHERE user_id = p_user_id
    AND cooldown_starts_at IS NOT NULL
  ORDER BY cooldown_starts_at DESC
  LIMIT 1;

  IF v_last_cooldown IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'retry_after_seconds', 0,
      'next_allowed_at', NULL
    );
  END IF;

  v_next_allowed := v_last_cooldown + interval '60 minutes';

  IF v_next_allowed <= now() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'retry_after_seconds', 0,
      'next_allowed_at', NULL
    );
  END IF;

  v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_next_allowed - now()))));

  RETURN jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', v_retry,
    'next_allowed_at', v_next_allowed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_instant_analysis_request(
  p_user_id uuid,
  p_symbol text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_cooldown timestamptz;
  v_next_allowed timestamptz;
  v_retry integer;
  v_request_id uuid;
  v_symbol text;
BEGIN
  v_symbol := upper(trim(p_symbol));

  IF v_symbol IS NULL OR char_length(v_symbol) < 2 OR char_length(v_symbol) > 20 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SYMBOL_INVALID'
    );
  END IF;

  PERFORM public.cleanup_stale_instant_analysis_reservations(p_user_id);

  SELECT cooldown_starts_at
  INTO v_last_cooldown
  FROM public.instant_analysis_requests
  WHERE user_id = p_user_id
    AND cooldown_starts_at IS NOT NULL
  ORDER BY cooldown_starts_at DESC
  LIMIT 1;

  IF v_last_cooldown IS NOT NULL THEN
    v_next_allowed := v_last_cooldown + interval '60 minutes';

    IF v_next_allowed > now() THEN
      v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_next_allowed - now()))));

      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INSTANT_ANALYSIS_COOLDOWN',
        'retry_after_seconds', v_retry,
        'next_allowed_at', v_next_allowed
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.instant_analysis_requests
    WHERE user_id = p_user_id
      AND status = 'reserving'
      AND created_at >= now() - interval '3 minutes'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INSTANT_ANALYSIS_IN_PROGRESS',
      'retry_after_seconds', 30,
      'next_allowed_at', NULL
    );
  END IF;

  INSERT INTO public.instant_analysis_requests (user_id, symbol, status)
  VALUES (p_user_id, v_symbol, 'reserving')
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INSTANT_ANALYSIS_IN_PROGRESS',
      'retry_after_seconds', 30,
      'next_allowed_at', NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_instant_analysis_job(
  p_request_id uuid,
  p_user_id uuid,
  p_job_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.instant_analysis_requests%ROWTYPE;
  v_job_id text;
BEGIN
  v_job_id := trim(p_job_id);

  IF v_job_id IS NULL OR char_length(v_job_id) < 3 OR char_length(v_job_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_JOB_ID');
  END IF;

  UPDATE public.instant_analysis_requests
  SET
    job_id = v_job_id,
    status = 'processing',
    cooldown_starts_at = now(),
    updated_at = now()
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND status = 'reserving'
    AND job_id IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_row.id,
    'cooldown_starts_at', v_row.cooldown_starts_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_instant_analysis_reservation(
  p_request_id uuid,
  p_user_id uuid,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.instant_analysis_requests
  SET
    status = 'released',
    error_code = COALESCE(p_error_code, 'WORKER_UNAVAILABLE'),
    updated_at = now()
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND status = 'reserving'
    AND job_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_instant_analysis_request_status(
  p_request_id uuid,
  p_user_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS');
  END IF;

  UPDATE public.instant_analysis_requests
  SET
    status = p_status,
    error_code = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_code, error_code) ELSE error_code END,
    completed_at = now(),
    updated_at = now()
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND status = 'processing'
    AND job_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_instant_analysis_reservations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_instant_analysis_availability(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_instant_analysis_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_instant_analysis_job(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_instant_analysis_reservation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_instant_analysis_request_status(uuid, uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.cleanup_stale_instant_analysis_reservations(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_instant_analysis_availability(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_instant_analysis_request(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_instant_analysis_job(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.release_instant_analysis_reservation(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_instant_analysis_request_status(uuid, uuid, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.cleanup_stale_instant_analysis_reservations(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_instant_analysis_availability(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.reserve_instant_analysis_request(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.confirm_instant_analysis_job(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.release_instant_analysis_reservation(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_instant_analysis_request_status(uuid, uuid, text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_instant_analysis_reservations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_instant_analysis_availability(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_instant_analysis_request(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_instant_analysis_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_instant_analysis_reservation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_instant_analysis_request_status(uuid, uuid, text, text) TO service_role;
