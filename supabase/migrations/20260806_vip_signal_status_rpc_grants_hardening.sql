-- VIP status RPC grant hardening — restrict EXECUTE to service_role only.
-- No function body or business logic changes.

BEGIN;

REVOKE ALL ON FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text)
  TO service_role;

ALTER FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text)
  SET search_path = public;

COMMIT;
