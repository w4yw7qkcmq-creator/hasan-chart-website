-- VIP status async delivery worker: queue claim RPCs and processing metadata.
-- Do NOT apply to production until reviewed and deployed with vip-status-delivery-worker.

BEGIN;

-- Extend delivery state machine with processing + worker metadata.
ALTER TABLE public.vip_signal_status_deliveries
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_worker_id text;

UPDATE public.vip_signal_status_deliveries
SET status = 'processing'
WHERE status = 'sending';

ALTER TABLE public.vip_signal_status_deliveries
  DROP CONSTRAINT IF EXISTS vip_signal_status_deliveries_status_check;

ALTER TABLE public.vip_signal_status_deliveries
  ADD CONSTRAINT vip_signal_status_deliveries_status_check
  CHECK (status IN (
    'pending', 'processing', 'delivered', 'failed', 'unavailable', 'skipped'
  ));

DROP INDEX IF EXISTS vip_signal_status_deliveries_retry_idx;

CREATE INDEX IF NOT EXISTS vip_signal_status_deliveries_claim_idx
  ON public.vip_signal_status_deliveries (status, next_retry_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS vip_signal_status_deliveries_processing_stale_idx
  ON public.vip_signal_status_deliveries (processing_started_at)
  WHERE status = 'processing';

-- Atomic claim for VIP status delivery worker (FOR UPDATE SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.claim_vip_status_deliveries(
  p_worker_id text,
  p_limit integer DEFAULT 25,
  p_max_attempts integer DEFAULT 3
)
RETURNS SETOF public.vip_signal_status_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM public.vip_signal_status_deliveries d
    WHERE (
      d.status = 'pending'
      OR (
        d.status = 'failed'
        AND d.attempt_count < GREATEST(1, COALESCE(p_max_attempts, 3))
        AND (d.next_retry_at IS NULL OR d.next_retry_at <= now())
      )
    )
    ORDER BY COALESCE(d.next_retry_at, d.created_at) ASC, d.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.vip_signal_status_deliveries d
  SET
    status = 'processing',
    processing_started_at = now(),
    processing_worker_id = NULLIF(trim(COALESCE(p_worker_id, '')), ''),
    attempt_count = d.attempt_count + 1,
    last_attempt_at = now(),
    updated_at = now()
  FROM candidates c
  WHERE d.id = c.id
  RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_vip_status_deliveries(
  p_stale_minutes integer DEFAULT 15,
  p_max_attempts integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marked_failed integer := 0;
  v_released_pending integer := 0;
  v_cutoff timestamptz;
  v_max integer;
BEGIN
  v_cutoff := now() - make_interval(mins => GREATEST(1, COALESCE(p_stale_minutes, 15)));
  v_max := GREATEST(1, COALESCE(p_max_attempts, 3));

  UPDATE public.vip_signal_status_deliveries
  SET
    status = 'failed',
    failed_at = now(),
    processing_started_at = NULL,
    processing_worker_id = NULL,
    updated_at = now(),
    error_code = COALESCE(error_code, 'stale-processing'),
    error_message_safe = COALESCE(error_message_safe, 'stale processing exceeded max attempts')
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at <= v_cutoff
    AND attempt_count >= v_max;

  GET DIAGNOSTICS v_marked_failed = ROW_COUNT;

  UPDATE public.vip_signal_status_deliveries
  SET
    status = 'pending',
    processing_started_at = NULL,
    processing_worker_id = NULL,
    updated_at = now(),
    error_message_safe = COALESCE(error_message_safe, 'stale processing released')
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at <= v_cutoff
    AND attempt_count < v_max;

  GET DIAGNOSTICS v_released_pending = ROW_COUNT;

  RETURN jsonb_build_object(
    'releasedPending', v_released_pending,
    'markedFailed', v_marked_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_vip_status_deliveries(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_vip_status_deliveries(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_vip_status_deliveries(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_vip_status_deliveries(text, integer, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.release_stale_vip_status_deliveries(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.release_stale_vip_status_deliveries(integer, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.claim_vip_status_deliveries(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_vip_status_deliveries(integer, integer) TO service_role;

COMMIT;
