-- Round 7: Admin-configurable qualified referral reward (paid only on canonical qualified transition)

-- ---------------------------------------------------------------------------
-- Versioned admin policy (single active row enforced by partial unique index)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_qualified_referral_reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT 'qualified_referral_reward',
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0.01 AND amount <= 100.00),
  currency text NOT NULL DEFAULT 'USD',
  is_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  rule_version integer NOT NULL CHECK (rule_version >= 1),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_qrr_rules_one_active_idx
  ON public.partner_qualified_referral_reward_rules ((true))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS partner_qrr_rules_effective_idx
  ON public.partner_qualified_referral_reward_rules (effective_from DESC, rule_version DESC);

-- ---------------------------------------------------------------------------
-- Per-referral payout audit + idempotency authority
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_qualified_referral_reward_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL UNIQUE REFERENCES public.partner_referrals(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.partner_qualified_referral_reward_rules(id) ON DELETE SET NULL,
  rule_version integer,
  amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL CHECK (status IN (
    'credited', 'skipped_disabled', 'skipped_fraud', 'skipped_no_rule', 'skipped_inactive_partner'
  )),
  ledger_entry_id uuid REFERENCES public.partner_financial_ledger_entries(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_qrr_credits_partner_idx
  ON public.partner_qualified_referral_reward_credits (partner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Extend ledger entry_type for qualified referral reward
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_financial_ledger_entries
  DROP CONSTRAINT IF EXISTS partner_financial_ledger_entries_entry_type_check;

ALTER TABLE public.partner_financial_ledger_entries
  ADD CONSTRAINT partner_financial_ledger_entries_entry_type_check
  CHECK (entry_type IN (
    'commission',
    'mission_reward',
    'milestone_reward',
    'performance_bonus',
    'qualified_referral_reward',
    'manual_adjustment',
    'reversal',
    'payout'
  ));

-- ---------------------------------------------------------------------------
-- Atomic credit — amount read from rule record, never from caller
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_partner_qualified_referral_reward_atomic(
  p_referral_id uuid,
  p_partner_id uuid,
  p_rule_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule public.partner_qualified_referral_reward_rules%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_qual public.partner_referral_qualifications%ROWTYPE;
  v_existing public.partner_qualified_referral_reward_credits%ROWTYPE;
  v_fraud jsonb;
  v_blocks boolean;
  v_event_id uuid;
  v_ledger_id uuid;
  v_idempotency text;
BEGIN
  IF p_referral_id IS NULL OR p_partner_id IS NULL OR p_rule_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_fields' USING ERRCODE = '22023';
  END IF;

  v_idempotency := 'qualified_referral_reward:' || p_referral_id::text;

  SELECT * INTO v_existing
  FROM public.partner_qualified_referral_reward_credits
  WHERE referral_id = p_referral_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'credited', v_existing.status = 'credited',
      'duplicate', true,
      'status', v_existing.status,
      'credit_id', v_existing.id,
      'ledger_entry_id', v_existing.ledger_entry_id,
      'amount', v_existing.amount
    );
  END IF;

  SELECT * INTO v_rule
  FROM public.partner_qualified_referral_reward_rules
  WHERE id = p_rule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rule_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_rule.is_enabled OR v_rule.amount <= 0 THEN
    INSERT INTO public.partner_qualified_referral_reward_credits (
      referral_id, partner_id, rule_id, rule_version, amount, currency,
      status, idempotency_key, metadata
    ) VALUES (
      p_referral_id, p_partner_id, v_rule.id, v_rule.rule_version, 0, v_rule.currency,
      'skipped_disabled', v_idempotency,
      jsonb_build_object('reason', 'policy_disabled')
    );
    RETURN jsonb_build_object('credited', false, 'skipped', true, 'reason', 'policy_disabled');
  END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id FOR UPDATE;
  IF NOT FOUND OR v_partner.status <> 'active' THEN
    INSERT INTO public.partner_qualified_referral_reward_credits (
      referral_id, partner_id, rule_id, rule_version, amount, currency,
      status, idempotency_key, metadata
    ) VALUES (
      p_referral_id, p_partner_id, v_rule.id, v_rule.rule_version, 0, v_rule.currency,
      'skipped_inactive_partner', v_idempotency,
      jsonb_build_object('reason', 'inactive_partner')
    );
    RETURN jsonb_build_object('credited', false, 'skipped', true, 'reason', 'inactive_partner');
  END IF;

  SELECT * INTO v_qual
  FROM public.partner_referral_qualifications
  WHERE referral_id = p_referral_id;

  IF NOT FOUND OR v_qual.state NOT IN ('qualified', 'customer') THEN
    RAISE EXCEPTION 'referral_not_qualified' USING ERRCODE = '22023';
  END IF;

  v_fraud := public.partner_center_latest_fraud_risk(p_partner_id, p_referral_id, NULL);
  v_blocks := coalesce((v_fraud->>'blocks_payable')::boolean, false);

  IF v_blocks THEN
    INSERT INTO public.partner_qualified_referral_reward_credits (
      referral_id, partner_id, rule_id, rule_version, amount, currency,
      status, idempotency_key, metadata
    ) VALUES (
      p_referral_id, p_partner_id, v_rule.id, v_rule.rule_version, v_rule.amount, v_rule.currency,
      'skipped_fraud', v_idempotency,
      jsonb_build_object('fraudRisk', v_fraud)
    );
    RETURN jsonb_build_object('credited', false, 'skipped', true, 'reason', 'fraud_blocks_payable');
  END IF;

  INSERT INTO public.partner_events (
    event_type, idempotency_key, partner_id, source_system, payload
  ) VALUES (
    'reward_created',
    'qrr_reward:' || p_referral_id::text,
    p_partner_id,
    'system',
    jsonb_build_object(
      'rewardType', 'qualified_referral_reward',
      'referralId', p_referral_id,
      'ruleId', v_rule.id,
      'ruleVersion', v_rule.rule_version,
      'amount', v_rule.amount
    )
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
    balance_bucket, partner_event_id, reference_type, reference_id,
    idempotency_key, metadata
  ) VALUES (
    p_partner_id,
    'qualified_referral_reward',
    'credit',
    'approved',
    v_rule.amount,
    v_rule.currency,
    'bonus_pending',
    v_event_id,
    'referral',
    p_referral_id::text,
    'ledger:qualified_referral_reward:' || p_referral_id::text,
    jsonb_build_object(
      'source', 'ledger_native',
      'ruleId', v_rule.id,
      'ruleVersion', v_rule.rule_version,
      'referralId', p_referral_id
    )
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.partners SET
    balance_bonus_pending = round(coalesce(balance_bonus_pending, 0) + v_rule.amount, 2),
    total_earnings = round(coalesce(total_earnings, 0) + v_rule.amount, 2),
    updated_at = now()
  WHERE id = p_partner_id;

  INSERT INTO public.partner_qualified_referral_reward_credits (
    referral_id, partner_id, rule_id, rule_version, amount, currency,
    status, ledger_entry_id, idempotency_key, metadata
  ) VALUES (
    p_referral_id, p_partner_id, v_rule.id, v_rule.rule_version, v_rule.amount, v_rule.currency,
    'credited', v_ledger_id, v_idempotency,
    jsonb_build_object('ruleEffectiveFrom', v_rule.effective_from)
  );

  RETURN jsonb_build_object(
    'credited', true,
    'duplicate', false,
    'amount', v_rule.amount,
    'currency', v_rule.currency,
    'rule_version', v_rule.rule_version,
    'ledger_entry_id', v_ledger_id,
    'credit_id', (SELECT id FROM public.partner_qualified_referral_reward_credits WHERE referral_id = p_referral_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_partner_qualified_referral_reward_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_partner_qualified_referral_reward_atomic(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_partner_qualified_referral_reward_atomic(uuid, uuid, uuid) TO service_role;

ALTER TABLE public.partner_qualified_referral_reward_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_qualified_referral_reward_credits ENABLE ROW LEVEL SECURITY;
