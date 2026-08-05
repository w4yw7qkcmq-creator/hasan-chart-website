-- Retry processor fields + atomic attempt claim for Price Alerts delivery.

BEGIN;

ALTER TABLE public.price_alert_delivery_attempts
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS terminal_at timestamptz;

ALTER TABLE public.price_alert_delivery_attempts
  DROP CONSTRAINT IF EXISTS price_alert_delivery_attempts_status_check;

ALTER TABLE public.price_alert_delivery_attempts
  ADD CONSTRAINT price_alert_delivery_attempts_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'retryable_failed', 'terminal_failed'));

CREATE INDEX IF NOT EXISTS price_alert_delivery_attempts_retry_idx
  ON public.price_alert_delivery_attempts (status, next_attempt_at)
  WHERE status IN ('failed', 'retryable_failed');

CREATE OR REPLACE FUNCTION public.claim_price_alert_delivery_attempt(
  p_attempt_id uuid,
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
  v_row public.price_alert_delivery_attempts%ROWTYPE;
BEGIN
  IF COALESCE(trim(p_owner_id), '') = '' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'missing_owner');
  END IF;

  SELECT * INTO v_row
  FROM public.price_alert_delivery_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF v_row.status = 'sent' OR v_row.terminal_at IS NOT NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'terminal', 'status', v_row.status);
  END IF;

  IF v_row.claimed_by IS NOT NULL
     AND v_row.claimed_by <> p_owner_id
     AND v_row.claimed_at IS NOT NULL
     AND v_row.claimed_at > v_now - make_interval(secs => v_ttl) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'contended', 'owner', v_row.claimed_by);
  END IF;

  UPDATE public.price_alert_delivery_attempts
  SET claimed_by = p_owner_id,
      claimed_at = v_now,
      updated_at = v_now
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object('claimed', true, 'attemptId', p_attempt_id, 'alertId', v_row.alert_id, 'channel', v_row.channel);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_price_alert_delivery_attempt_claim(
  p_attempt_id uuid,
  p_owner_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.price_alert_delivery_attempts
  SET claimed_by = NULL,
      claimed_at = NULL,
      updated_at = now()
  WHERE id = p_attempt_id
    AND claimed_by = p_owner_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('released', v_updated = 1);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_price_alert_delivery_attempt(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_price_alert_delivery_attempt(uuid, text, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_price_alert_delivery_attempt_claim(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_price_alert_delivery_attempt_claim(uuid, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_price_alert_delivery_attempt(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_price_alert_delivery_attempt_claim(uuid, text) TO service_role;

COMMIT;
