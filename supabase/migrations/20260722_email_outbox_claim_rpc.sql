-- Atomic claim and stale-release helpers for email_outbox queue processing (Phase 3).

CREATE OR REPLACE FUNCTION public.claim_email_outbox_batch(p_limit integer DEFAULT 25)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.email_outbox o
    WHERE o.status = 'pending'
      AND o.scheduled_at <= now()
      AND o.attempts < o.max_attempts
    ORDER BY o.scheduled_at ASC, o.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox o
  SET
    status = 'processing',
    claimed_at = now(),
    attempts = o.attempts + 1,
    updated_at = now()
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_email_outbox_processing(p_stale_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked_failed integer := 0;
  v_released_pending integer := 0;
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - make_interval(mins => GREATEST(1, COALESCE(p_stale_minutes, 15)));

  UPDATE public.email_outbox
  SET
    status = 'failed',
    failed_at = now(),
    updated_at = now(),
    error = COALESCE(error, 'stale processing exceeded max attempts')
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at <= v_cutoff
    AND attempts >= max_attempts;

  GET DIAGNOSTICS v_marked_failed = ROW_COUNT;

  UPDATE public.email_outbox
  SET
    status = 'pending',
    claimed_at = NULL,
    updated_at = now(),
    error = COALESCE(error, 'stale processing released')
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at <= v_cutoff
    AND attempts < max_attempts;

  GET DIAGNOSTICS v_released_pending = ROW_COUNT;

  RETURN jsonb_build_object(
    'releasedPending', v_released_pending,
    'markedFailed', v_marked_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_email_outbox_processing(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_email_outbox_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_email_outbox_processing(integer) TO service_role;
