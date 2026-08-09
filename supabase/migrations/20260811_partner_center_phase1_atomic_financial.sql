-- Partner Center Phase 1 — Atomic financial gateway (local/test review only)
-- Single-transaction commission, signup bonus, release, reversal.
-- Fail-closed: no partial financial state.

BEGIN;

-- Partner self-read required for RLS subqueries on ledger/events
GRANT SELECT ON public.partners TO authenticated;

DROP POLICY IF EXISTS partners_own_select ON public.partners;
CREATE POLICY partners_own_select ON public.partners
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Risk hold / payout eligibility on commissions (auditable, no amount zeroing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS payout_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_hold_reason text,
  ADD COLUMN IF NOT EXISTS payout_hold_risk_level text
    CHECK (payout_hold_risk_level IS NULL OR payout_hold_risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED'));

CREATE INDEX IF NOT EXISTS partner_commissions_payout_hold_idx
  ON public.partner_commissions (partner_id, payout_hold)
  WHERE payout_hold IS TRUE;

-- ---------------------------------------------------------------------------
-- Financial risk hold audit (entitlement vs payout eligibility)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_financial_risk_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  commission_id uuid REFERENCES public.partner_commissions(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.partner_referrals(id) ON DELETE SET NULL,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED')),
  hold_reason text NOT NULL,
  source_assessment_id uuid REFERENCES public.partner_fraud_assessments(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  release_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_financial_risk_holds_active_idx
  ON public.partner_financial_risk_holds (partner_id, active)
  WHERE active IS TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS partner_financial_risk_holds_commission_active_uidx
  ON public.partner_financial_risk_holds (commission_id)
  WHERE active IS TRUE AND commission_id IS NOT NULL;

-- Signup bonus idempotency (one bonus per referral)
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_signup_bonus_referral_uidx
  ON public.partner_commissions (referral_id)
  WHERE source_type = 'signup_bonus';

-- ---------------------------------------------------------------------------
-- Append-only enforcement on canonical financial ledger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_financial_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'partner_financial_ledger_append_only_violation'
    USING ERRCODE = '42501',
          DETAIL = 'Use reversal entries; monetary ledger rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS partner_financial_ledger_no_update ON public.partner_financial_ledger_entries;
CREATE TRIGGER partner_financial_ledger_no_update
  BEFORE UPDATE ON public.partner_financial_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.partner_financial_ledger_append_only();

DROP TRIGGER IF EXISTS partner_financial_ledger_no_delete ON public.partner_financial_ledger_entries;
CREATE TRIGGER partner_financial_ledger_no_delete
  BEFORE DELETE ON public.partner_financial_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.partner_financial_ledger_append_only();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_center_signup_bonus_amount()
RETURNS numeric(12, 2)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 0.20::numeric(12, 2);
$$;

CREATE OR REPLACE FUNCTION public.partner_center_calculate_commission_amount(
  p_base_amount numeric,
  p_percent numeric,
  p_mode text,
  p_fixed_amount numeric
)
RETURNS numeric(12, 2)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base numeric(12, 2) := round(coalesce(p_base_amount, 0), 2);
  v_percent numeric(12, 4) := coalesce(p_percent, 0);
  v_mode text := lower(coalesce(p_mode, 'percent'));
  v_fixed numeric(12, 2) := round(coalesce(p_fixed_amount, 0), 2);
BEGIN
  IF v_mode = 'fixed' THEN
    RETURN CASE WHEN v_fixed > 0 THEN v_fixed ELSE 0 END;
  END IF;

  IF v_base <= 0 THEN
    RETURN 0;
  END IF;

  RETURN round((v_base * v_percent) / 100.0, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_center_latest_fraud_risk(
  p_partner_id uuid,
  p_referral_id uuid DEFAULT NULL,
  p_referred_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.partner_fraud_assessments%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.partner_fraud_assessments fa
  WHERE fa.partner_id = p_partner_id
    AND (
      (p_referral_id IS NOT NULL AND fa.referral_id = p_referral_id)
      OR (p_referred_user_id IS NOT NULL AND fa.referred_user_id = p_referred_user_id)
      OR (p_referral_id IS NULL AND p_referred_user_id IS NULL)
    )
  ORDER BY fa.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('risk_level', 'LOW', 'decision', 'allow', 'blocks_payable', false);
  END IF;

  RETURN jsonb_build_object(
    'risk_level', v_row.risk_level,
    'decision', v_row.decision,
    'blocks_payable', v_row.risk_level IN ('HIGH', 'BLOCKED'),
    'assessment_id', v_row.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_center_apply_payout_hold(
  p_partner_id uuid,
  p_commission_id uuid,
  p_referral_id uuid,
  p_referred_user_id uuid,
  p_risk jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_risk_level text := coalesce(p_risk->>'risk_level', 'LOW');
  v_blocks boolean := coalesce((p_risk->>'blocks_payable')::boolean, false);
  v_assessment_id uuid := NULLIF(p_risk->>'assessment_id', '')::uuid;
BEGIN
  IF NOT v_blocks THEN
    RETURN;
  END IF;

  UPDATE public.partner_commissions
  SET
    payout_hold = true,
    payout_hold_reason = 'fraud_risk_' || lower(v_risk_level),
    payout_hold_risk_level = v_risk_level,
    updated_at = now()
  WHERE id = p_commission_id;

  INSERT INTO public.partner_financial_risk_holds (
    partner_id,
    commission_id,
    referral_id,
    referred_user_id,
    risk_level,
    hold_reason,
    source_assessment_id,
    active
  ) VALUES (
    p_partner_id,
    p_commission_id,
    p_referral_id,
    p_referred_user_id,
    v_risk_level,
    'automatic_fraud_gate',
    v_assessment_id,
    true
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic service commission creation
-- ---------------------------------------------------------------------------
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
  p_source_type text DEFAULT 'service'
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
BEGIN
  IF p_partner_id IS NULL OR p_referral_id IS NULL OR p_referred_user_id IS NULL
     OR v_service_type = '' OR v_source_id = '' OR v_idempotency = '' THEN
    RAISE EXCEPTION 'missing_required_fields' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.partner_commissions c
  WHERE c.partner_id = p_partner_id
    AND c.user_id = p_referred_user_id
    AND c.service_type = v_service_type
    AND c.source_id::text = v_source_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created', false,
      'duplicate', true,
      'commission_id', v_existing.id,
      'status', v_existing.status
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

  SELECT *
  INTO v_rule
  FROM public.partner_commission_rules r
  WHERE r.service_type = v_service_type
    AND r.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inactive_commission_rule' USING ERRCODE = '22023';
  END IF;

  v_amount := public.partner_center_calculate_commission_amount(
    p_base_amount,
    coalesce(p_commission_percent, v_rule.commission_percent),
    v_rule.commission_mode,
    v_rule.fixed_amount
  );

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'zero_commission_amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.partner_commissions (
    partner_id,
    referral_id,
    user_id,
    subscription_id,
    source_id,
    source_type,
    source_ref,
    service_type,
    reason,
    description,
    invited_username,
    commission_percent,
    base_amount,
    amount,
    currency,
    status,
    is_withdrawable,
    idempotency_key
  ) VALUES (
    p_partner_id,
    p_referral_id,
    p_referred_user_id,
    NULLIF(v_source_id, '')::uuid,
    v_source_id,
    coalesce(nullif(btrim(p_source_type), ''), 'service'),
    v_source_id,
    v_service_type,
    coalesce(nullif(btrim(p_reason), ''), v_rule.notes),
    coalesce(nullif(btrim(p_reason), ''), v_rule.notes),
    coalesce(nullif(btrim(p_invited_username), ''), 'مستخدم'),
    coalesce(p_commission_percent, v_rule.commission_percent),
    round(coalesce(p_base_amount, 0), 2),
    v_amount,
    'USD',
    v_status,
    false,
    v_idempotency
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
    'commission_created',
    'commission_created:' || v_commission.id::text,
    p_partner_id,
    p_referred_user_id,
    p_referral_id,
    'system',
    jsonb_build_object(
      'commissionId', v_commission.id,
      'amount', v_amount,
      'serviceType', v_service_type,
      'sourceId', v_source_id
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
    'pending',
    v_event_id,
    'commission',
    v_commission.id::text,
    v_commission.id,
    'ledger:commission:credit:' || v_commission.id::text,
    jsonb_build_object(
      'source', 'ledger_native',
      'serviceType', v_service_type
    )
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.partners p
  SET
    balance_pending = round(coalesce(p.balance_pending, 0) + v_amount, 2),
    total_earnings = round(coalesce(p.total_earnings, 0) + v_amount, 2),
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
    'status', v_commission.status,
    'ledger_entry_id', v_ledger_id,
    'event_id', v_event_id,
    'payout_hold', coalesce((v_fraud->>'blocks_payable')::boolean, false),
    'fraud_risk', v_fraud->>'risk_level'
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM public.partner_commissions c
    WHERE c.idempotency_key = v_idempotency
       OR (
         c.partner_id = p_partner_id
         AND c.user_id = p_referred_user_id
         AND c.service_type = v_service_type
         AND c.source_id::text = v_source_id
       )
    LIMIT 1;

    RETURN jsonb_build_object(
      'created', false,
      'duplicate', true,
      'commission_id', v_existing.id,
      'status', v_existing.status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic signup bonus
-- ---------------------------------------------------------------------------
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
    idempotency_key
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
    'legacy_signup_bonus:' || p_referral_id::text
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
      'kind', 'signup_bonus'
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
    jsonb_build_object('source', 'ledger_native', 'kind', 'signup_bonus')
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.partners p
  SET
    signup_count = coalesce(p.signup_count, 0) + 1,
    balance_bonus_pending = round(coalesce(p.balance_bonus_pending, 0) + v_amount, 2),
    total_earnings = round(coalesce(p.total_earnings, 0) + v_amount, 2),
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
    'payout_hold', coalesce((v_fraud->>'blocks_payable')::boolean, false)
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

-- ---------------------------------------------------------------------------
-- Atomic release to withdrawable (fraud gate enforced)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_partner_commission_atomic(p_commission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_commission public.partner_commissions%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_amount numeric(12, 2);
  v_fraud jsonb;
  v_debit_id uuid;
  v_credit_id uuid;
BEGIN
  IF p_commission_id IS NULL THEN
    RAISE EXCEPTION 'missing_commission_id' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_commission
  FROM public.partner_commissions c
  WHERE c.id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_commission.status = 'withdrawable' THEN
    RETURN jsonb_build_object('released', false, 'reason', 'already_withdrawable', 'commission_id', v_commission.id);
  END IF;

  IF v_commission.payout_hold IS TRUE THEN
    RAISE EXCEPTION 'payout_hold_active'
      USING ERRCODE = '22023',
            DETAIL = coalesce(v_commission.payout_hold_reason, 'risk_hold');
  END IF;

  v_fraud := public.partner_center_latest_fraud_risk(
    v_commission.partner_id,
    v_commission.referral_id,
    v_commission.user_id
  );

  IF coalesce((v_fraud->>'blocks_payable')::boolean, false) THEN
    PERFORM public.partner_center_apply_payout_hold(
      v_commission.partner_id,
      v_commission.id,
      v_commission.referral_id,
      v_commission.user_id,
      v_fraud
    );
    RETURN jsonb_build_object(
      'released', false,
      'blocked', true,
      'reason', 'fraud_blocks_payable',
      'risk_level', v_fraud->>'risk_level',
      'commission_id', v_commission.id,
      'payout_hold', true
    );
  END IF;

  IF v_commission.status NOT IN ('approved', 'pending_activation') THEN
    RAISE EXCEPTION 'invalid_commission_status' USING ERRCODE = '22023', DETAIL = v_commission.status;
  END IF;

  v_amount := round(coalesce(v_commission.amount, 0), 2);

  SELECT *
  INTO v_partner
  FROM public.partners p
  WHERE p.id = v_commission.partner_id
  FOR UPDATE;

  UPDATE public.partner_commissions
  SET status = 'withdrawable', is_withdrawable = true, updated_at = now()
  WHERE id = v_commission.id
    AND status IN ('approved', 'pending_activation');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_commission_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.partners
  SET
    balance_pending = round(greatest(coalesce(balance_pending, 0) - v_amount, 0), 2),
    balance_withdrawable = round(coalesce(balance_withdrawable, 0) + v_amount, 2),
    updated_at = now()
  WHERE id = v_commission.partner_id;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, balance_bucket,
    reference_type, reference_id, legacy_commission_id, idempotency_key, metadata
  ) VALUES (
    v_commission.partner_id, 'commission', 'debit', 'payable', v_amount, 'pending',
    'commission_release', v_commission.id::text, v_commission.id,
    'ledger:release:debit_pending:' || v_commission.id::text,
    jsonb_build_object('source', 'ledger_native', 'phase', 'release_from_pending')
  )
  RETURNING id INTO v_debit_id;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, balance_bucket,
    reference_type, reference_id, legacy_commission_id, idempotency_key, metadata
  ) VALUES (
    v_commission.partner_id, 'commission', 'credit', 'payable', v_amount, 'withdrawable',
    'commission_release', v_commission.id::text, v_commission.id,
    'ledger:release:credit_withdrawable:' || v_commission.id::text,
    jsonb_build_object('source', 'ledger_native', 'phase', 'release_to_withdrawable')
  )
  RETURNING id INTO v_credit_id;

  RETURN jsonb_build_object(
    'released', true,
    'commission_id', v_commission.id,
    'amount', v_amount,
    'debit_ledger_id', v_debit_id,
    'credit_ledger_id', v_credit_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic reversal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_partner_ledger_entry_atomic(
  p_original_entry_id uuid,
  p_reason text DEFAULT 'reversal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_original public.partner_financial_ledger_entries%ROWTYPE;
  v_existing uuid;
  v_reversal_id uuid;
  v_idempotency text;
BEGIN
  SELECT *
  INTO v_original
  FROM public.partner_financial_ledger_entries e
  WHERE e.id = p_original_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_original.entry_direction <> 'credit' THEN
    RAISE EXCEPTION 'can_only_reverse_credits' USING ERRCODE = '22023';
  END IF;

  v_idempotency := 'ledger:reversal:' || v_original.id::text;

  SELECT id
  INTO v_existing
  FROM public.partner_financial_ledger_entries
  WHERE idempotency_key = v_idempotency;

  IF FOUND THEN
    RETURN jsonb_build_object('reversed', false, 'duplicate', true, 'reversal_id', v_existing);
  END IF;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id,
    entry_type,
    entry_direction,
    lifecycle_status,
    amount,
    balance_bucket,
    reverses_entry_id,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) VALUES (
    v_original.partner_id,
    'reversal',
    'debit',
    'reversed',
    v_original.amount,
    v_original.balance_bucket,
    v_original.id,
    'reversal',
    v_original.id::text,
    v_idempotency,
    jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'reversal'))
  )
  RETURNING id INTO v_reversal_id;

  RETURN jsonb_build_object(
    'reversed', true,
    'duplicate', false,
    'reversal_id', v_reversal_id,
    'original_id', v_original.id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('reversed', false, 'duplicate', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fraud review release (IAM-enforced in DB + application gateway)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_partner_commission_payout_hold(
  p_commission_id uuid,
  p_reviewer_user_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_commission public.partner_commissions%ROWTYPE;
BEGIN
  IF p_reviewer_user_id IS NULL THEN
    RAISE EXCEPTION 'reviewer_user_id_required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.iam_has_permission('partners.fraud.review', p_reviewer_user_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_commission
  FROM public.partner_commissions
  WHERE id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.partner_commissions
  SET
    payout_hold = false,
    payout_hold_reason = NULL,
    payout_hold_risk_level = NULL,
    updated_at = now()
  WHERE id = p_commission_id;

  UPDATE public.partner_financial_risk_holds
  SET
    active = false,
    released_at = now(),
    released_by = p_reviewer_user_id,
    release_note = coalesce(nullif(btrim(p_note), ''), 'manual_fraud_review_release')
  WHERE commission_id = p_commission_id
    AND active IS TRUE;

  RETURN jsonb_build_object('released_hold', true, 'commission_id', p_commission_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Failure injection test hook (test only — raises after commission insert)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_commission_atomic_test_fail(
  p_fail_after text DEFAULT 'commission'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('partner_center.test_fail_after', coalesce(p_fail_after, 'commission'), true);
END;
$$;

-- ---------------------------------------------------------------------------
-- EXECUTE grants — server-only (service_role)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_partner_commission_atomic(uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_partner_signup_bonus_atomic(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_partner_commission_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_partner_ledger_entry_atomic(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_partner_commission_payout_hold(uuid, uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_partner_commission_atomic(uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_partner_signup_bonus_atomic(uuid, uuid, uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_partner_commission_atomic(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_partner_ledger_entry_atomic(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_partner_commission_payout_hold(uuid, uuid, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_partner_commission_atomic(uuid, uuid, uuid, text, text, numeric, numeric, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_partner_signup_bonus_atomic(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_partner_commission_atomic(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_partner_ledger_entry_atomic(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_partner_commission_payout_hold(uuid, uuid, text) TO service_role;

-- RLS for new tables
ALTER TABLE public.partner_financial_risk_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_financial_risk_holds FROM anon;
GRANT SELECT ON public.partner_financial_risk_holds TO authenticated;
GRANT ALL ON public.partner_financial_risk_holds TO service_role;

CREATE POLICY partner_financial_risk_holds_own_select ON public.partner_financial_risk_holds
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

DO $policy$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_iam_enforce_apply_policy') THEN
    PERFORM public._iam_enforce_apply_policy(
      'public.partner_financial_risk_holds'::regclass,
      'iam_enforce_partner_financial_risk_holds_admin_select',
      'SELECT',
      'partners.fraud.review'
    );
    PERFORM public._iam_enforce_apply_policy(
      'public.partner_financial_risk_holds'::regclass,
      'iam_enforce_partner_financial_risk_holds_admin_update',
      'UPDATE',
      'partners.fraud.review'
    );
  END IF;
END
$policy$;

COMMIT;
