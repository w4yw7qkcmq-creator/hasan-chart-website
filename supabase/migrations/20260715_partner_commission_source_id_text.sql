-- Align partner_commissions source identifiers with legacy subscription_requests.id (bigint).
-- subscription_requests and similar service tables use numeric/text IDs, not uuid.

DROP INDEX IF EXISTS public.partner_commissions_dedupe_uidx;
DROP INDEX IF EXISTS public.partner_commissions_service_subscription_uidx;

ALTER TABLE public.partner_commissions
  ALTER COLUMN subscription_id TYPE text USING subscription_id::text;

ALTER TABLE public.partner_commissions
  ALTER COLUMN source_id TYPE text USING source_id::text;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_dedupe_uidx
  ON public.partner_commissions (partner_id, user_id, service_type, source_id)
  WHERE source_id IS NOT NULL AND service_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_service_subscription_uidx
  ON public.partner_commissions (service_type, subscription_id)
  WHERE subscription_id IS NOT NULL AND service_type IS NOT NULL;
