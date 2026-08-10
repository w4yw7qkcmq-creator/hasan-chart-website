-- Round 8b: Partial refund reversal cap, paid recovery, DB qualification defense

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS amount_reversed numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount_reversed >= 0);

CREATE TABLE IF NOT EXISTS public.partner_service_commission_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.partner_commissions(id) ON DELETE CASCADE,
  refund_event_id text NOT NULL,
  reversal_amount numeric(12, 2) NOT NULL CHECK (reversal_amount > 0),
  original_commission_amount numeric(12, 2) NOT NULL,
  original_purchase_amount numeric(12, 2),
  approved_refund_amount numeric(12, 2),
  reason text,
  ledger_entry_id uuid REFERENCES public.partner_financial_ledger_entries(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_service_commission_reversals_event_unique
    UNIQUE (commission_id, refund_event_id)
);

ALTER TABLE public.partner_service_commission_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_service_commission_reversals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_service_commission_reversals TO service_role;

DROP FUNCTION IF EXISTS public.reverse_partner_service_commission_atomic(uuid, text, text);

CREATE OR REPLACE FUNCTION public.reverse_partner_service_commission_atomic(
  p_commission_id uuid,
  p_reason text DEFAULT 'refund_reversal',
  p_refund_event_id text DEFAULT NULL,
  p_approved_refund_amount numeric DEFAULT NULL,
  p_original_purchase_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comm public.partner_commissions%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_reversal_amount numeric(12, 2);
  v_remaining numeric(12, 2);
  v_already_reversed numeric(12, 2);
  v_idempotency text;
  v_ledger_id uuid;
  v_bucket text;
  v_purchase numeric(12, 2);
  v_event_id text;
BEGIN
  IF p_commission_id IS NULL THEN
    RAISE EXCEPTION 'missing_commission_id' USING ERRCODE = '22023';
  END IF;

  v_event_id := coalesce(nullif(btrim(p_refund_event_id), ''), 'full');
  v_idempotency := 'service_commission_refund:' || p_commission_id::text || ':' || v_event_id;

  IF EXISTS (SELECT 1 FROM public.partner_service_commission_reversals r WHERE r.idempotency_key = v_idempotency) THEN
    RETURN jsonb_build_object('reversed', false, 'duplicate', true, 'commission_id', p_commission_id);
  END IF;

  SELECT * INTO v_comm FROM public.partner_commissions WHERE id = p_commission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_comm.source_type = 'signup_bonus' THEN
    RAISE EXCEPTION 'cannot_reverse_signup_bonus_via_service_rpc' USING ERRCODE = '22023';
  END IF;

  v_already_reversed := round(coalesce(v_comm.amount_reversed, 0), 2);
  v_remaining := round(greatest(coalesce(v_comm.amount, 0) - v_already_reversed, 0), 2);

  IF v_remaining <= 0 OR v_comm.status = 'reversed' THEN
    RETURN jsonb_build_object('reversed', false, 'duplicate', true, 'commission_id', p_commission_id);
  END IF;

  IF p_approved_refund_amount IS NOT NULL AND p_approved_refund_amount > 0 THEN
    v_purchase := round(greatest(coalesce(p_original_purchase_amount, v_comm.base_amount, 0), 0.01), 2);
    v_reversal_amount := round((coalesce(v_comm.amount, 0) * p_approved_refund_amount) / v_purchase, 2);
    v_reversal_amount := least(v_reversal_amount, v_remaining);
  ELSE
    v_reversal_amount := v_remaining;
  END IF;

  IF v_reversal_amount <= 0 THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'zero_reversal_amount', 'commission_id', p_commission_id);
  END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = v_comm.partner_id FOR UPDATE;

  IF v_comm.status = 'paid' THEN
    v_bucket := 'paid_out';
    UPDATE public.partners SET
      total_earnings = round(greatest(coalesce(total_earnings, 0) - v_reversal_amount, 0), 2),
      updated_at = now()
    WHERE id = v_comm.partner_id;
  ELSIF v_comm.status = 'withdrawable' OR v_comm.is_withdrawable THEN
    v_bucket := 'withdrawable';
    UPDATE public.partners SET
      balance_withdrawable = round(greatest(coalesce(balance_withdrawable, 0) - v_reversal_amount, 0), 2),
      total_earnings = round(greatest(coalesce(total_earnings, 0) - v_reversal_amount, 0), 2),
      updated_at = now()
    WHERE id = v_comm.partner_id;
  ELSE
    v_bucket := 'pending';
    UPDATE public.partners SET
      balance_pending = round(greatest(coalesce(balance_pending, 0) - v_reversal_amount, 0), 2),
      total_earnings = round(greatest(coalesce(total_earnings, 0) - v_reversal_amount, 0), 2),
      updated_at = now()
    WHERE id = v_comm.partner_id;
  END IF;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
    balance_bucket, reference_type, reference_id, legacy_commission_id,
    idempotency_key, metadata
  ) VALUES (
    v_comm.partner_id, 'reversal', 'debit',
    CASE WHEN v_comm.status = 'paid' THEN 'reversed' ELSE 'reversed' END,
    v_reversal_amount, coalesce(v_comm.currency, 'USD'), v_bucket,
    'commission_reversal', v_comm.id::text, v_comm.id,
    'ledger:commission_reversal:' || v_idempotency,
    jsonb_build_object(
      'reason', coalesce(p_reason, 'refund_reversal'),
      'refundEventId', v_event_id,
      'recovery', v_comm.status = 'paid'
    )
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.partner_service_commission_reversals (
    commission_id, refund_event_id, reversal_amount, original_commission_amount,
    original_purchase_amount, approved_refund_amount, reason, ledger_entry_id, idempotency_key
  ) VALUES (
    v_comm.id, v_event_id, v_reversal_amount, coalesce(v_comm.amount, 0),
    p_original_purchase_amount, p_approved_refund_amount,
    coalesce(p_reason, 'refund_reversal'), v_ledger_id, v_idempotency
  );

  UPDATE public.partner_commissions
  SET
    amount_reversed = round(v_already_reversed + v_reversal_amount, 2),
    status = CASE
      WHEN round(v_already_reversed + v_reversal_amount, 2) >= round(coalesce(amount, 0), 2) THEN 'reversed'
      ELSE status
    END,
    is_withdrawable = CASE
      WHEN round(v_already_reversed + v_reversal_amount, 2) >= round(coalesce(amount, 0), 2) THEN false
      ELSE is_withdrawable
    END,
    updated_at = now(),
    reason = coalesce(nullif(btrim(p_reason), ''), reason)
  WHERE id = p_commission_id;

  RETURN jsonb_build_object(
    'reversed', true,
    'duplicate', false,
    'commission_id', p_commission_id,
    'amount', v_reversal_amount,
    'bucket', v_bucket,
    'ledger_entry_id', v_ledger_id,
    'fully_reversed', round(v_already_reversed + v_reversal_amount, 2) >= round(coalesce(v_comm.amount, 0), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_partner_service_commission_atomic(uuid, text, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_partner_service_commission_atomic(uuid, text, text, numeric, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_partner_service_commission_atomic(uuid, text, text, numeric, numeric) TO service_role;

-- Qualification defense helper (service_role only callers)
CREATE OR REPLACE FUNCTION public.partner_center_assert_service_commission_qualification(
  p_referral_id uuid,
  p_entitlement_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state text;
  v_ent public.partner_service_commission_entitlements%ROWTYPE;
BEGIN
  IF p_entitlement_id IS NOT NULL THEN
    SELECT * INTO v_ent
    FROM public.partner_service_commission_entitlements e
    WHERE e.id = p_entitlement_id
      AND e.referral_id = p_referral_id
      AND e.status = 'pending_qualification';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_entitlement_for_commission' USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  SELECT q.state INTO v_state
  FROM public.partner_referral_qualifications q
  WHERE q.referral_id = p_referral_id;

  IF v_state IS NULL OR v_state NOT IN ('qualified', 'customer') THEN
    RAISE EXCEPTION 'referral_not_qualified_for_commission' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_center_assert_service_commission_qualification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_center_assert_service_commission_qualification(uuid, uuid) TO service_role;

-- Extend create_partner_commission_atomic with entitlement + qualification gate
DROP FUNCTION IF EXISTS public.create_partner_commission_atomic(
  uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.create_partner_commission_atomic(
  p_partner_id uuid,
  p_referral_id uuid,
  p_referred_user_id uuid,
  p_service_type text,
  p_source_id text,
  p_base_amount numeric,
  p_commission_percent numeric,
  p_reason text,
  p_initial_status text,
  p_invited_username text,
  p_idempotency_key text,
  p_source_type text DEFAULT 'service',
  p_entitlement_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_rule public.partner_commission_rules%ROWTYPE;
  v_commission public.partner_commissions%ROWTYPE;
  v_existing public.partner_commissions%ROWTYPE;
  v_amount numeric(12, 2);
  v_event_id uuid;
  v_ledger_id uuid;
  v_fraud jsonb;
  v_service_type text := lower(btrim(coalesce(p_service_type, '')));
  v_source_id text := btrim(coalesce(p_source_id, ''));
  v_status text := coalesce(nullif(btrim(p_initial_status), ''), 'pending_activation');
  v_idempotency text := btrim(coalesce(p_idempotency_key, ''));
  v_effective_percent numeric;
  v_sub_email text;
  v_sub_owner_id uuid;
BEGIN
  IF p_partner_id IS NULL OR p_referral_id IS NULL OR p_referred_user_id IS NULL
     OR v_service_type = '' OR v_source_id = '' OR v_idempotency = '' THEN
    RAISE EXCEPTION 'missing_required_fields' USING ERRCODE = '22023';
  END IF;

  IF coalesce(nullif(btrim(p_source_type), ''), 'service') NOT IN ('signup_bonus') THEN
    PERFORM public.partner_center_assert_service_commission_qualification(p_referral_id, p_entitlement_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partner_service_commission_entitlements e
    WHERE e.partner_id = p_partner_id
      AND e.referred_user_id = p_referred_user_id
      AND e.service_type = v_service_type
      AND e.source_id = v_source_id
      AND e.status IN ('reversed', 'invalidated', 'refunded', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'entitlement_invalidated_for_commission' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_referrals r
    WHERE r.id = p_referral_id
      AND r.referred_user_id = p_referred_user_id
  ) THEN
    RAISE EXCEPTION 'source_ownership_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(sr.user_email)) INTO v_sub_email
  FROM public.subscription_requests sr
  WHERE sr.id::text = v_source_id
  LIMIT 1;

  IF v_sub_email IS NOT NULL AND v_sub_email <> '' THEN
    SELECT p.id INTO v_sub_owner_id
    FROM public.profiles p
    WHERE lower(btrim(p.email)) = v_sub_email
    LIMIT 1;

    IF v_sub_owner_id IS NOT NULL AND v_sub_owner_id <> p_referred_user_id THEN
      RAISE EXCEPTION 'source_ownership_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.partner_commissions c
  WHERE c.partner_id = p_partner_id
    AND c.user_id = p_referred_user_id
    AND c.service_type = v_service_type
    AND c.source_id::text = v_source_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created', false, 'duplicate', true,
      'commission_id', v_existing.id, 'status', v_existing.status
    );
  END IF;

  SELECT * INTO v_partner FROM public.partners p WHERE p.id = p_partner_id FOR UPDATE;
  IF NOT FOUND OR v_partner.status <> 'active' THEN
    RAISE EXCEPTION 'inactive_or_missing_partner' USING ERRCODE = '22023';
  END IF;
  IF v_partner.user_id = p_referred_user_id THEN
    RAISE EXCEPTION 'self_referral' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rule FROM public.partner_commission_rules r
  WHERE r.service_type = v_service_type
    AND r.is_active IS TRUE
    AND coalesce(r.is_enabled, r.is_active) IS TRUE
    AND coalesce(r.status, 'active') = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inactive_commission_rule' USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_rule.tier_policy, 'use_partner_tier') = 'fixed_service_rate' THEN
    v_effective_percent := coalesce(v_rule.commission_percent, p_commission_percent);
  ELSIF coalesce(v_rule.tier_policy, 'use_partner_tier') = 'use_partner_tier' THEN
    SELECT pt.commission_percent INTO v_effective_percent
    FROM public.partner_tiers pt
    WHERE pt.tier_key = v_partner.tier_key
    LIMIT 1;
    v_effective_percent := coalesce(v_effective_percent, p_commission_percent, v_rule.commission_percent);
  ELSE
    v_effective_percent := coalesce(p_commission_percent, v_rule.commission_percent);
  END IF;

  v_amount := public.partner_center_calculate_commission_amount(
    p_base_amount, v_effective_percent, v_rule.commission_mode, v_rule.fixed_amount
  );
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'zero_commission_amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.partner_commissions (
    partner_id, referral_id, user_id, subscription_id, source_id, source_type, source_ref,
    service_type, reason, description, invited_username, commission_percent, base_amount,
    amount, currency, status, is_withdrawable, idempotency_key
  ) VALUES (
    p_partner_id, p_referral_id, p_referred_user_id,
    CASE
      WHEN v_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN v_source_id::uuid
      ELSE NULL
    END,
    v_source_id, coalesce(nullif(btrim(p_source_type), ''), 'service'), v_source_id,
    v_service_type, coalesce(nullif(btrim(p_reason), ''), v_rule.notes),
    coalesce(nullif(btrim(p_reason), ''), v_rule.notes),
    coalesce(nullif(btrim(p_invited_username), ''), 'مستخدم'),
    v_effective_percent, round(coalesce(p_base_amount, 0), 2), v_amount, 'USD',
    v_status, false, v_idempotency
  )
  RETURNING * INTO v_commission;

  INSERT INTO public.partner_events (
    event_type, idempotency_key, partner_id, referred_user_id, referral_id, source_system, payload
  ) VALUES (
    'commission_created', 'commission_created:' || v_commission.id::text,
    p_partner_id, p_referred_user_id, p_referral_id, 'system',
    jsonb_build_object('commissionId', v_commission.id, 'amount', v_amount, 'serviceType', v_service_type, 'sourceId', v_source_id)
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, balance_bucket,
    partner_event_id, reference_type, reference_id, legacy_commission_id, idempotency_key, metadata
  ) VALUES (
    p_partner_id, 'commission', 'credit', 'pending', v_amount, 'pending', v_event_id,
    'commission', v_commission.id::text, v_commission.id,
    'ledger:commission:credit:' || v_commission.id::text,
    jsonb_build_object('source', 'ledger_native', 'serviceType', v_service_type)
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.partners p SET
    balance_pending = round(coalesce(p.balance_pending, 0) + v_amount, 2),
    total_earnings = round(coalesce(p.total_earnings, 0) + v_amount, 2),
    updated_at = now()
  WHERE p.id = p_partner_id;

  IF p_entitlement_id IS NOT NULL THEN
    UPDATE public.partner_service_commission_entitlements
    SET status = 'credited', commission_id = v_commission.id, updated_at = now()
    WHERE id = p_entitlement_id AND status = 'pending_qualification';
  END IF;

  v_fraud := public.partner_center_latest_fraud_risk(p_partner_id, p_referral_id, p_referred_user_id);
  PERFORM public.partner_center_apply_payout_hold(
    p_partner_id, v_commission.id, p_referral_id, p_referred_user_id, v_fraud
  );

  RETURN jsonb_build_object(
    'created', true, 'duplicate', false, 'commission_id', v_commission.id,
    'amount', v_amount, 'status', v_commission.status, 'ledger_entry_id', v_ledger_id,
    'event_id', v_event_id,
    'payout_hold', coalesce((v_fraud->>'blocks_payable')::boolean, false),
    'fraud_risk', v_fraud->>'risk_level'
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.partner_commissions c
    WHERE c.idempotency_key = v_idempotency
       OR (c.partner_id = p_partner_id AND c.user_id = p_referred_user_id
           AND c.service_type = v_service_type AND c.source_id::text = v_source_id)
    LIMIT 1;
    RETURN jsonb_build_object(
      'created', false, 'duplicate', true,
      'commission_id', v_existing.id, 'status', v_existing.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_commission_atomic(
  uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_commission_atomic(
  uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text, uuid
) TO service_role;

-- Prevent PostgREST from resolving an obsolete 12-arg overload without entitlement defense.
DROP FUNCTION IF EXISTS public.create_partner_commission_atomic(
  uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text
);
