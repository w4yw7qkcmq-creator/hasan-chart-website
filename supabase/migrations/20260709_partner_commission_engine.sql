-- Partner Commission Engine — rules table + commission schema upgrades

CREATE TABLE IF NOT EXISTS public.partner_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL UNIQUE,
  commission_percent numeric(7, 4) NOT NULL DEFAULT 10 CHECK (commission_percent >= 0),
  commission_mode text NOT NULL DEFAULT 'percent'
    CHECK (commission_mode IN ('fixed', 'percent', 'profit_share')),
  fixed_amount numeric(12, 2),
  is_active boolean NOT NULL DEFAULT true,
  release_policy text NOT NULL DEFAULT 'on_service_activation',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS source_id uuid;

UPDATE public.partner_commissions
SET source_id = subscription_id
WHERE source_id IS NULL AND subscription_id IS NOT NULL;

ALTER TABLE public.partner_commissions
  DROP CONSTRAINT IF EXISTS partner_commissions_status_check;

ALTER TABLE public.partner_commissions
  ADD CONSTRAINT partner_commissions_status_check
  CHECK (status IN (
    'pending',
    'pending_activation',
    'approved',
    'withdrawable',
    'rejected',
    'paid'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_dedupe_uidx
  ON public.partner_commissions (partner_id, user_id, service_type, source_id)
  WHERE source_id IS NOT NULL AND service_type IS NOT NULL;

INSERT INTO public.partner_commission_rules (
  service_type,
  commission_percent,
  commission_mode,
  is_active,
  release_policy,
  notes
) VALUES
  ('vip_signal', 10, 'percent', true, 'on_service_activation', 'VIP Signals / Futures subscriptions'),
  ('vip_spot', 10, 'percent', true, 'on_service_activation', 'VIP Spot subscriptions'),
  ('account_management', 10, 'profit_share', true, 'on_profit_approval', 'Profit share after management profits approval'),
  ('academy', 10, 'percent', true, 'on_service_activation', 'Academy paid services'),
  ('subscription', 10, 'percent', true, 'on_service_activation', 'Generic paid subscriptions'),
  ('future_service', 10, 'percent', true, 'on_service_activation', 'Template for future services')
ON CONFLICT (service_type) DO NOTHING;

ALTER TABLE public.partner_commission_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_commission_rules FROM anon, authenticated;
GRANT ALL ON public.partner_commission_rules TO service_role;
