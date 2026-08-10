-- Round 8: Service commission hardening — qualification gate, versioning, vip_forex, reversals

-- ---------------------------------------------------------------------------
-- Extend commission rules (versioned; single active per service_type)
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_commission_rules
  ADD COLUMN IF NOT EXISTS tier_policy text NOT NULL DEFAULT 'use_partner_tier'
    CHECK (tier_policy IN ('use_partner_tier', 'fixed_service_rate')),
  ADD COLUMN IF NOT EXISTS is_enabled boolean,
  ADD COLUMN IF NOT EXISTS rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_to timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name_ar text;

UPDATE public.partner_commission_rules
SET is_enabled = COALESCE(is_enabled, is_active)
WHERE is_enabled IS NULL;

ALTER TABLE public.partner_commission_rules
  ALTER COLUMN is_enabled SET DEFAULT true;

ALTER TABLE public.partner_commission_rules
  DROP CONSTRAINT IF EXISTS partner_commission_rules_service_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commission_rules_one_active_per_service_idx
  ON public.partner_commission_rules (service_type)
  WHERE status = 'active';

-- VIP Forex rule (missing in production)
INSERT INTO public.partner_commission_rules (
  service_type, commission_percent, commission_mode, is_active, is_enabled,
  release_policy, notes, tier_policy, display_name_ar, status, rule_version
)
SELECT
  'vip_forex', 10, 'percent', true, true,
  'on_service_activation', 'VIP Forex subscriptions', 'use_partner_tier', 'VIP فوركس', 'active', 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_commission_rules WHERE service_type = 'vip_forex' AND status = 'active'
);

-- Fail-closed: account_management until profit approval flow exists
UPDATE public.partner_commission_rules
SET
  is_active = false,
  is_enabled = false,
  notes = 'Disabled until approved profit settlement flow is implemented',
  display_name_ar = COALESCE(display_name_ar, 'إدارة الحسابات')
WHERE service_type = 'account_management';

UPDATE public.partner_commission_rules
SET display_name_ar = CASE service_type
  WHEN 'vip_signal' THEN 'VIP الإشارات'
  WHEN 'vip_spot' THEN 'VIP سبوت'
  WHEN 'academy' THEN 'الأكاديمية'
  WHEN 'subscription' THEN 'الاشتراكات'
  WHEN 'future_service' THEN 'خدمات مستقبلية'
  WHEN 'account_management' THEN 'إدارة الحسابات'
  ELSE display_name_ar
END
WHERE display_name_ar IS NULL;

-- ---------------------------------------------------------------------------
-- Pending qualification entitlements (no balance until qualified)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_service_commission_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL REFERENCES public.partner_referrals(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL,
  service_type text NOT NULL,
  source_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'service',
  base_amount numeric(12, 2) NOT NULL CHECK (base_amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending_qualification' CHECK (status IN (
    'pending_qualification', 'credited', 'skipped', 'reversed', 'blocked_fraud'
  )),
  commission_id uuid REFERENCES public.partner_commissions(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.partner_commission_rules(id) ON DELETE SET NULL,
  rule_version integer,
  tier_key text,
  tier_percent numeric(7, 4),
  calculated_amount numeric(12, 2),
  idempotency_key text NOT NULL UNIQUE,
  commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_service_commission_entitlements_source_unique
    UNIQUE (partner_id, referred_user_id, service_type, source_id)
);

CREATE INDEX IF NOT EXISTS partner_service_commission_entitlements_referral_idx
  ON public.partner_service_commission_entitlements (referral_id, status);

-- Commission metadata snapshot column
ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Extend status check for pending_qualification + reversed
ALTER TABLE public.partner_commissions
  DROP CONSTRAINT IF EXISTS partner_commissions_status_check;

ALTER TABLE public.partner_commissions
  ADD CONSTRAINT partner_commissions_status_check
  CHECK (status IN (
    'pending',
    'pending_activation',
    'pending_qualification',
    'approved',
    'withdrawable',
    'rejected',
    'reversed',
    'paid'
  ));

-- ---------------------------------------------------------------------------
-- Atomic service commission reversal (append-only ledger + balance debit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_partner_service_commission_atomic(
  p_commission_id uuid,
  p_reason text DEFAULT 'refund_reversal',
  p_refund_event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comm public.partner_commissions%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_amount numeric(12, 2);
  v_idempotency text;
  v_existing uuid;
  v_ledger_id uuid;
  v_bucket text;
BEGIN
  IF p_commission_id IS NULL THEN
    RAISE EXCEPTION 'missing_commission_id' USING ERRCODE = '22023';
  END IF;

  v_idempotency := 'commission_refund:' || p_commission_id::text || ':' || coalesce(nullif(btrim(p_refund_event_id), ''), 'full');

  SELECT id INTO v_existing
  FROM public.partner_financial_ledger_entries
  WHERE idempotency_key = 'ledger:commission_reversal:' || v_idempotency
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('reversed', false, 'duplicate', true, 'commission_id', p_commission_id);
  END IF;

  SELECT * INTO v_comm
  FROM public.partner_commissions
  WHERE id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_comm.status = 'reversed' THEN
    RETURN jsonb_build_object('reversed', false, 'duplicate', true, 'commission_id', p_commission_id);
  END IF;

  IF v_comm.source_type = 'signup_bonus' THEN
    RAISE EXCEPTION 'cannot_reverse_signup_bonus_via_service_rpc' USING ERRCODE = '22023';
  END IF;

  v_amount := round(coalesce(v_comm.amount, 0), 2);
  IF v_amount <= 0 THEN
    UPDATE public.partner_commissions SET status = 'reversed', updated_at = now() WHERE id = p_commission_id;
    RETURN jsonb_build_object('reversed', true, 'amount', 0, 'commission_id', p_commission_id);
  END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = v_comm.partner_id FOR UPDATE;

  v_bucket := CASE WHEN v_comm.status = 'withdrawable' OR v_comm.is_withdrawable THEN 'withdrawable' ELSE 'pending' END;

  IF v_bucket = 'withdrawable' THEN
    UPDATE public.partners SET
      balance_withdrawable = round(greatest(coalesce(balance_withdrawable, 0) - v_amount, 0), 2),
      total_earnings = round(greatest(coalesce(total_earnings, 0) - v_amount, 0), 2),
      updated_at = now()
    WHERE id = v_comm.partner_id;
  ELSE
    UPDATE public.partners SET
      balance_pending = round(greatest(coalesce(balance_pending, 0) - v_amount, 0), 2),
      total_earnings = round(greatest(coalesce(total_earnings, 0) - v_amount, 0), 2),
      updated_at = now()
    WHERE id = v_comm.partner_id;
  END IF;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
    balance_bucket, reference_type, reference_id, legacy_commission_id,
    idempotency_key, metadata
  ) VALUES (
    v_comm.partner_id, 'reversal', 'debit', 'reversed', v_amount, coalesce(v_comm.currency, 'USD'),
    v_bucket, 'commission_reversal', v_comm.id::text, v_comm.id,
    'ledger:commission_reversal:' || v_idempotency,
    jsonb_build_object('reason', coalesce(p_reason, 'refund_reversal'), 'refundEventId', p_refund_event_id)
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.partner_commissions
  SET status = 'reversed', is_withdrawable = false, updated_at = now(),
      reason = coalesce(nullif(btrim(p_reason), ''), reason)
  WHERE id = p_commission_id;

  RETURN jsonb_build_object(
    'reversed', true,
    'duplicate', false,
    'commission_id', p_commission_id,
    'amount', v_amount,
    'bucket', v_bucket,
    'ledger_entry_id', v_ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_partner_service_commission_atomic(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_partner_service_commission_atomic(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_partner_service_commission_atomic(uuid, text, text) TO service_role;

ALTER TABLE public.partner_service_commission_entitlements ENABLE ROW LEVEL SECURITY;

-- Disable phantom future_service rule until a real product path exists
UPDATE public.partner_commission_rules
SET is_active = false, is_enabled = false,
    notes = 'Disabled until product activation path is implemented'
WHERE service_type = 'future_service' AND status = 'active';

REVOKE ALL ON TABLE public.partner_service_commission_entitlements FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_service_commission_entitlements TO service_role;

