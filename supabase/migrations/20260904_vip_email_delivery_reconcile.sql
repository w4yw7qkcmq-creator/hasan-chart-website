-- VIP email delivery: reconcile sent outbox → delivered, skip sent-outbox rows in claim.
-- Fixes provider_accepted constraint violation (23514) on vip_signal_status_deliveries.

BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_vip_email_deliveries_from_sent_outbox(
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reconciled integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT
      d.id AS delivery_id,
      d.signal_id,
      d.event_type,
      d.status AS old_status,
      o.id AS outbox_id,
      o.status AS outbox_status,
      o.sent_at AS outbox_sent_at,
      COALESCE(o.resend_id, o.id::text) AS provider_ref
    FROM public.vip_signal_status_deliveries d
    JOIN public.email_outbox o ON (
      o.status = 'sent'
      AND o.message_type = 'vip_signal_status'
      AND (
        (d.provider_message_id IS NOT NULL AND o.id::text = d.provider_message_id)
        OR o.metadata->>'vipDeliveryId' = d.id::text
      )
    )
    WHERE d.channel = 'email'
      AND d.status IN ('pending', 'processing', 'failed')
    ORDER BY d.updated_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  LOOP
    UPDATE public.vip_signal_status_deliveries
    SET
      status = 'delivered',
      delivered_at = COALESCE(v_row.outbox_sent_at, now()),
      provider_message_id = v_row.provider_ref,
      error_code = NULL,
      error_message_safe = NULL,
      failed_at = NULL,
      processing_started_at = NULL,
      processing_worker_id = NULL,
      updated_at = now()
    WHERE id = v_row.delivery_id
      AND status IN ('pending', 'processing', 'failed');

    IF FOUND THEN
      v_reconciled := v_reconciled + 1;
      PERFORM public.sync_vip_status_event_delivery_summary(v_row.signal_id, v_row.event_type);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('reconciled', v_reconciled);
END;
$$;

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
    AND NOT (
      d.channel = 'email'
      AND EXISTS (
        SELECT 1
        FROM public.email_outbox o
        WHERE o.status = 'sent'
          AND o.message_type = 'vip_signal_status'
          AND (
            (d.provider_message_id IS NOT NULL AND o.id::text = d.provider_message_id)
            OR o.metadata->>'vipDeliveryId' = d.id::text
          )
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

REVOKE ALL ON FUNCTION public.reconcile_vip_email_deliveries_from_sent_outbox(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_vip_email_deliveries_from_sent_outbox(integer) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_vip_email_deliveries_from_sent_outbox(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_vip_email_deliveries_from_sent_outbox(integer) TO service_role;

COMMIT;
