-- Partner Center Round 6 — qualification hardening (additive)
-- Defers signup bonus balance credit until referral qualifies.

ALTER TABLE public.partner_referral_qualifications
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualification_policy_version int NOT NULL DEFAULT 1;

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS qualification_credited_at timestamptz;

CREATE INDEX IF NOT EXISTS partner_referral_qualifications_state_partner_idx
  ON public.partner_referral_qualifications (partner_id, state);

-- Signup bonus: record entitlement without crediting partner balances until qualification.
CREATE OR REPLACE FUNCTION public.create_partner_signup_bonus_atomic(
  p_partner_id uuid,
  p_referral_id uuid,
  p_referred_user_id uuid,
  p_referral_code text,
  p_invited_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_commission public.partner_commissions%ROWTYPE;
  v_existing public.partner_commissions%ROWTYPE;
  v_amount numeric(12, 2) := public.partner_center_signup_bonus_amount();
  v_event_id uuid;
  v_ledger_id uuid;
  v_reason text;
  v_fraud jsonb;
BEGIN
  IF p_partner_id IS NULL OR p_referral_id IS NULL OR p_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_fields' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.partner_commissions c
  WHERE c.referral_id = p_referral_id
    AND c.source_type = 'signup_bonus'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created', false,
      'duplicate', true,
      'commission_id', v_existing.id
    );
  END IF;

  SELECT *
  INTO v_partner
  FROM public.partners p
  WHERE p.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND OR v_partner.status <> 'active' THEN
    RAISE EXCEPTION 'inactive_or_missing_partner' USING ERRCODE = '22023';
  END IF;

  IF v_partner.user_id = p_referred_user_id THEN
    RAISE EXCEPTION 'self_referral' USING ERRCODE = '22023';
  END IF;

  v_reason := 'تسجيل المستخدم ' || coalesce(nullif(btrim(p_invited_username), ''), 'مستخدم') || ' عبر رابط الإحالة';

  INSERT INTO public.partner_commissions (
    partner_id,
    referral_id,
    user_id,
    source_type,
    source_ref,
    source_id,
    service_type,
    reason,
    description,
    invited_username,
    amount,
    currency,
    status,
    is_withdrawable,
    idempotency_key,
    payout_hold,
    payout_hold_reason,
    payout_hold_risk_level
  ) VALUES (
    p_partner_id,
    p_referral_id,
    p_referred_user_id,
    'signup_bonus',
    p_referral_id::text,
    p_referral_id::text,
    'registration',
    v_reason,
    v_reason,
    coalesce(nullif(btrim(p_invited_username), ''), 'مستخدم'),
    v_amount,
    'USD',
    'pending',
    false,
    'legacy_signup_bonus:' || p_referral_id::text,
    true,
    'pending_qualification',
    'LOW'
  )
  RETURNING * INTO v_commission;

  INSERT INTO public.partner_events (
    event_type,
    idempotency_key,
    partner_id,
    referred_user_id,
    referral_id,
    source_system,
    payload
  ) VALUES (
    'reward_created',
    'signup_bonus:' || p_referral_id::text,
    p_partner_id,
    p_referred_user_id,
    p_referral_id,
    'system',
    jsonb_build_object(
      'commissionId', v_commission.id,
      'amount', v_amount,
      'referralCode', p_referral_code,
      'kind', 'signup_bonus',
      'creditDeferred', true
    )
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id,
    entry_type,
    entry_direction,
    lifecycle_status,
    amount,
    balance_bucket,
    partner_event_id,
    reference_type,
    reference_id,
    legacy_commission_id,
    idempotency_key,
    metadata
  ) VALUES (
    p_partner_id,
    'commission',
    'credit',
    'pending',
    v_amount,
    'bonus_pending',
    v_event_id,
    'signup_bonus',
    p_referral_id::text,
    v_commission.id,
    'ledger:signup_bonus:credit:' || p_referral_id::text,
    jsonb_build_object(
      'source', 'ledger_native',
      'kind', 'signup_bonus',
      'creditDeferred', true
    )
  )
  RETURNING id INTO v_ledger_id;

  -- signup_count still tracks attributed signups; balances credit on qualification only.
  UPDATE public.partners p
  SET
    signup_count = coalesce(p.signup_count, 0) + 1,
    updated_at = now()
  WHERE p.id = p_partner_id;

  v_fraud := public.partner_center_latest_fraud_risk(p_partner_id, p_referral_id, p_referred_user_id);
  PERFORM public.partner_center_apply_payout_hold(
    p_partner_id,
    v_commission.id,
    p_referral_id,
    p_referred_user_id,
    v_fraud
  );

  RETURN jsonb_build_object(
    'created', true,
    'duplicate', false,
    'commission_id', v_commission.id,
    'amount', v_amount,
    'ledger_entry_id', v_ledger_id,
    'event_id', v_event_id,
    'payout_hold', true,
    'credit_deferred', true
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM public.partner_commissions c
    WHERE c.referral_id = p_referral_id
      AND c.source_type = 'signup_bonus'
    LIMIT 1;

    RETURN jsonb_build_object(
      'created', false,
      'duplicate', true,
      'commission_id', v_existing.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_partner_signup_bonus_on_qualification(
  p_referral_id uuid,
  p_partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_commission public.partner_commissions%ROWTYPE;
  v_amount numeric(12, 2);
  v_fraud jsonb;
  v_blocks boolean;
BEGIN
  IF p_referral_id IS NULL OR p_partner_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_fields' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_commission
  FROM public.partner_commissions c
  WHERE c.referral_id = p_referral_id
    AND c.partner_id = p_partner_id
    AND c.source_type = 'signup_bonus'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('released', false, 'reason', 'no_signup_bonus');
  END IF;

  IF v_commission.qualification_credited_at IS NOT NULL THEN
    RETURN jsonb_build_object('released', false, 'duplicate', true, 'commission_id', v_commission.id);
  END IF;

  v_fraud := public.partner_center_latest_fraud_risk(
    p_partner_id,
    p_referral_id,
    v_commission.user_id
  );
  v_blocks := coalesce((v_fraud->>'blocks_payable')::boolean, false);

  IF v_blocks THEN
    RETURN jsonb_build_object(
      'released', false,
      'reason', 'fraud_blocks_payable',
      'commission_id', v_commission.id
    );
  END IF;

  v_amount := coalesce(v_commission.amount, 0);

  UPDATE public.partners p
  SET
    balance_bonus_pending = round(coalesce(p.balance_bonus_pending, 0) + v_amount, 2),
    total_earnings = round(coalesce(p.total_earnings, 0) + v_amount, 2),
    updated_at = now()
  WHERE p.id = p_partner_id;

  UPDATE public.partner_commissions c
  SET
    payout_hold = CASE
      WHEN c.payout_hold_reason = 'pending_qualification' THEN false
      ELSE c.payout_hold
    END,
    payout_hold_reason = CASE
      WHEN c.payout_hold_reason = 'pending_qualification' THEN NULL
      ELSE c.payout_hold_reason
    END,
    qualification_credited_at = now(),
    updated_at = now()
  WHERE c.id = v_commission.id;

  RETURN jsonb_build_object(
    'released', true,
    'commission_id', v_commission.id,
    'amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_partner_signup_bonus_on_qualification(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_partner_signup_bonus_on_qualification(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_partner_signup_bonus_on_qualification(uuid, uuid) TO service_role;
