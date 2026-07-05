-- Partner Program — Phase 4 (Service Commissions)
-- Generic commission fields, expanded statuses, service counters

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(7, 4),
  ADD COLUMN IF NOT EXISTS base_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS vip_signal_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_spot_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_management_service_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS academy_count bigint NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_idempotency_key_uidx
  ON public.partner_commissions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_service_subscription_uidx
  ON public.partner_commissions (service_type, subscription_id)
  WHERE subscription_id IS NOT NULL AND service_type IS NOT NULL;

ALTER TABLE public.partner_commissions
  DROP CONSTRAINT IF EXISTS partner_commissions_status_check;

ALTER TABLE public.partner_commissions
  ADD CONSTRAINT partner_commissions_status_check
  CHECK (status IN ('pending', 'pending_activation', 'approved', 'rejected', 'paid'));

ALTER TABLE public.partner_commissions
  DROP CONSTRAINT IF EXISTS partner_commissions_source_type_check;

ALTER TABLE public.partner_commissions
  ADD CONSTRAINT partner_commissions_source_type_check
  CHECK (source_type IN (
    'signup_bonus',
    'vip_subscription',
    'account_management',
    'academy',
    'service'
  ));

ALTER TABLE public.partner_referrals
  DROP CONSTRAINT IF EXISTS partner_referrals_status_check;

ALTER TABLE public.partner_referrals
  ADD CONSTRAINT partner_referrals_status_check
  CHECK (status IN ('registered', 'pending_activation', 'active', 'inactive'));
