-- Recompute vip_signal_status_events delivery counters from delivery rows (idempotent).
-- Staging/production-safe: no data deletion, service_role RPC only.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_vip_status_event_delivery_summary(
  p_signal_id bigint,
  p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_signal_id IS NULL OR p_event_type IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.vip_signal_status_events e
  SET
    site_notifications_sent = COALESCE(agg.site_delivered, 0),
    push_sent = COALESCE(agg.push_delivered, 0),
    push_unavailable = COALESCE(agg.push_unavailable, 0),
    push_failed = COALESCE(agg.push_failed, 0),
    email_sent = COALESCE(agg.email_delivered, 0),
    email_failed = COALESCE(agg.email_failed, 0),
    updated_at = now()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE channel = 'site' AND status = 'delivered')::integer AS site_delivered,
      COUNT(*) FILTER (WHERE channel = 'push' AND status = 'delivered')::integer AS push_delivered,
      COUNT(*) FILTER (WHERE channel = 'push' AND status = 'unavailable')::integer AS push_unavailable,
      COUNT(*) FILTER (WHERE channel = 'push' AND status = 'failed')::integer AS push_failed,
      COUNT(*) FILTER (WHERE channel = 'email' AND status = 'delivered')::integer AS email_delivered,
      COUNT(*) FILTER (WHERE channel = 'email' AND status = 'failed')::integer AS email_failed
    FROM public.vip_signal_status_deliveries d
    WHERE d.signal_id = p_signal_id
      AND d.event_type = p_event_type
  ) agg
  WHERE e.signal_id = p_signal_id
    AND e.event_type = p_event_type;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_vip_status_event_delivery_summary(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_vip_status_event_delivery_summary(bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.sync_vip_status_event_delivery_summary(bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_vip_status_event_delivery_summary(bigint, text) TO service_role;

COMMIT;
