-- Partner Center Phase 2 — Hardening (failure injection, refund reversal, RLS deny policies)
-- Additive corrective migration. Safe for clean replay after 20260812.

BEGIN;

-- ---------------------------------------------------------------------------
-- Test-only failure injection hook (staging/PGlite — not used in production runtime)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_growth_reward_atomic_test_fail(
  p_fail_after text DEFAULT 'event'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('partner_center.growth_test_fail_after', coalesce(p_fail_after, 'event'), false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_growth_reward_atomic_test_fail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_partner_growth_reward_atomic_test_fail(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Growth reward atomic with failure injection + idempotent ledger guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_growth_reward_atomic(
  p_entitlement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ent public.partner_reward_entitlements%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_event_id uuid;
  v_ledger_id uuid;
  v_fraud jsonb;
  v_bucket text;
  v_blocks boolean;
  v_fail_after text;
  v_existing_ledger uuid;
BEGIN
  IF p_entitlement_id IS NULL THEN
    RAISE EXCEPTION 'missing_entitlement_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ent
  FROM public.partner_reward_entitlements
  WHERE id = p_entitlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entitlement_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ent.status IN ('reward_credited', 'paid', 'reversed') THEN
    RETURN jsonb_build_object(
      'credited', false, 'duplicate', true,
      'entitlement_id', v_ent.id,
      'ledger_entry_id', v_ent.ledger_entry_id
    );
  END IF;

  IF v_ent.ledger_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'credited', false, 'duplicate', true,
      'entitlement_id', v_ent.id,
      'ledger_entry_id', v_ent.ledger_entry_id
    );
  END IF;

  SELECT id INTO v_existing_ledger
  FROM public.partner_financial_ledger_entries
  WHERE idempotency_key = 'ledger:growth_reward:' || v_ent.id::text
  LIMIT 1;

  IF v_existing_ledger IS NOT NULL THEN
    UPDATE public.partner_reward_entitlements
    SET ledger_entry_id = v_existing_ledger, status = 'reward_credited', updated_at = now()
    WHERE id = v_ent.id;
    RETURN jsonb_build_object(
      'credited', false, 'duplicate', true,
      'entitlement_id', v_ent.id,
      'ledger_entry_id', v_existing_ledger
    );
  END IF;

  IF v_ent.amount <= 0 THEN
    RAISE EXCEPTION 'zero_reward_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = v_ent.partner_id FOR UPDATE;
  IF NOT FOUND OR v_partner.status <> 'active' THEN
    RAISE EXCEPTION 'inactive_or_missing_partner' USING ERRCODE = '22023';
  END IF;

  v_fraud := public.partner_center_latest_fraud_risk(v_ent.partner_id, NULL, NULL);
  v_blocks := coalesce((v_fraud->>'blocks_payable')::boolean, false);

  v_bucket := CASE v_ent.reward_type
    WHEN 'performance_bonus' THEN 'pending'
    ELSE 'bonus_pending'
  END;

  v_fail_after := nullif(current_setting('partner_center.growth_test_fail_after', true), '');

  INSERT INTO public.partner_events (
    event_type, idempotency_key, partner_id, source_system, payload
  ) VALUES (
    'reward_created',
    'reward_created:' || v_ent.id::text,
    v_ent.partner_id,
    'system',
    jsonb_build_object(
      'entitlementId', v_ent.id,
      'rewardType', v_ent.reward_type,
      'sourceType', v_ent.source_type,
      'sourceId', v_ent.source_id,
      'amount', v_ent.amount,
      'periodKey', v_ent.period_key
    )
  )
  RETURNING id INTO v_event_id;

  IF v_fail_after = 'event' THEN
    RAISE EXCEPTION 'growth_test_fail_injected'
      USING ERRCODE = '22023', DETAIL = 'after_event_before_ledger';
  END IF;

  INSERT INTO public.partner_financial_ledger_entries (
    partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
    balance_bucket, partner_event_id, reference_type, reference_id,
    idempotency_key, metadata
  ) VALUES (
    v_ent.partner_id,
    v_ent.reward_type,
    'credit',
    CASE WHEN v_blocks THEN 'pending' ELSE 'approved' END,
    v_ent.amount,
    v_ent.currency,
    v_bucket,
    v_event_id,
    v_ent.source_type,
    v_ent.source_id::text,
    'ledger:growth_reward:' || v_ent.id::text,
    jsonb_build_object(
      'source', 'ledger_native',
      'entitlementId', v_ent.id,
      'ruleVersion', v_ent.rule_version,
      'periodKey', v_ent.period_key
    )
  )
  RETURNING id INTO v_ledger_id;

  IF v_fail_after = 'ledger' THEN
    RAISE EXCEPTION 'growth_test_fail_injected'
      USING ERRCODE = '22023', DETAIL = 'after_ledger_before_balance';
  END IF;

  IF v_bucket = 'pending' THEN
    UPDATE public.partners SET
      balance_pending = round(coalesce(balance_pending, 0) + v_ent.amount, 2),
      total_earnings = round(coalesce(total_earnings, 0) + v_ent.amount, 2),
      updated_at = now()
    WHERE id = v_ent.partner_id;
  ELSE
    UPDATE public.partners SET
      balance_bonus_pending = round(coalesce(balance_bonus_pending, 0) + v_ent.amount, 2),
      total_earnings = round(coalesce(total_earnings, 0) + v_ent.amount, 2),
      updated_at = now()
    WHERE id = v_ent.partner_id;
  END IF;

  IF v_blocks THEN
    UPDATE public.partner_reward_entitlements SET
      status = 'risk_hold',
      payout_hold = true,
      fraud_risk_level = v_fraud->>'risk_level',
      ledger_entry_id = v_ledger_id,
      partner_event_id = v_event_id,
      updated_at = now()
    WHERE id = v_ent.id;
  ELSE
    UPDATE public.partner_reward_entitlements SET
      status = 'reward_credited',
      payout_hold = false,
      fraud_risk_level = coalesce(v_fraud->>'risk_level', 'LOW'),
      ledger_entry_id = v_ledger_id,
      partner_event_id = v_event_id,
      updated_at = now()
    WHERE id = v_ent.id;
  END IF;

  UPDATE public.partner_mission_progress SET
    status = CASE WHEN v_blocks THEN 'reward_pending' ELSE 'reward_credited' END,
    updated_at = now()
  WHERE reward_entitlement_id = v_ent.id;

  UPDATE public.partner_milestone_grants SET
    status = CASE WHEN v_blocks THEN 'reward_pending' ELSE 'reward_credited' END
  WHERE reward_entitlement_id = v_ent.id;

  UPDATE public.partner_performance_bonus_grants SET
    status = CASE WHEN v_blocks THEN 'reward_pending' ELSE 'reward_credited' END
  WHERE reward_entitlement_id = v_ent.id;

  PERFORM set_config('partner_center.growth_test_fail_after', '', false);

  RETURN jsonb_build_object(
    'credited', true,
    'duplicate', false,
    'entitlement_id', v_ent.id,
    'ledger_entry_id', v_ledger_id,
    'event_id', v_event_id,
    'amount', v_ent.amount,
    'payout_hold', v_blocks,
    'fraud_risk', v_fraud->>'risk_level'
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_ent FROM public.partner_reward_entitlements WHERE id = p_entitlement_id;
    RETURN jsonb_build_object(
      'credited', false, 'duplicate', true,
      'entitlement_id', v_ent.id,
      'ledger_entry_id', v_ent.ledger_entry_id
    );
  WHEN OTHERS THEN
    PERFORM set_config('partner_center.growth_test_fail_after', '', false);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_growth_reward_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_partner_growth_reward_atomic(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_growth_reward_atomic(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_partner_growth_reward_atomic_test_invoke(
  p_entitlement_id uuid,
  p_fail_after text DEFAULT 'event'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.create_partner_growth_reward_atomic_test_fail(p_fail_after);
  RETURN public.create_partner_growth_reward_atomic(p_entitlement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_growth_reward_atomic_test_invoke(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_partner_growth_reward_atomic_test_invoke(uuid, text) TO service_role;

-- Deny partner writes on definitions / entitlements (explicit — SELECT policies remain separate)
DROP POLICY IF EXISTS partner_mission_definitions_deny_insert ON public.partner_mission_definitions;
CREATE POLICY partner_mission_definitions_deny_insert ON public.partner_mission_definitions
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS partner_mission_definitions_deny_update ON public.partner_mission_definitions;
CREATE POLICY partner_mission_definitions_deny_update ON public.partner_mission_definitions
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS partner_mission_definitions_deny_delete ON public.partner_mission_definitions;
CREATE POLICY partner_mission_definitions_deny_delete ON public.partner_mission_definitions
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS partner_reward_entitlements_deny_insert ON public.partner_reward_entitlements;
CREATE POLICY partner_reward_entitlements_deny_insert ON public.partner_reward_entitlements
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS partner_reward_entitlements_deny_update ON public.partner_reward_entitlements;
CREATE POLICY partner_reward_entitlements_deny_update ON public.partner_reward_entitlements
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS partner_reward_entitlements_deny_delete ON public.partner_reward_entitlements;
CREATE POLICY partner_reward_entitlements_deny_delete ON public.partner_reward_entitlements
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS partner_smart_links_deny_update ON public.partner_smart_links;
CREATE POLICY partner_smart_links_deny_update ON public.partner_smart_links
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS partner_level_history_deny_insert ON public.partner_level_history;
CREATE POLICY partner_level_history_deny_insert ON public.partner_level_history
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS partner_level_history_deny_update ON public.partner_level_history;
CREATE POLICY partner_level_history_deny_update ON public.partner_level_history
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS partner_milestone_grants_deny_insert ON public.partner_milestone_grants;
CREATE POLICY partner_milestone_grants_deny_insert ON public.partner_milestone_grants
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS partner_milestone_grants_deny_update ON public.partner_milestone_grants;
CREATE POLICY partner_milestone_grants_deny_update ON public.partner_milestone_grants
  FOR UPDATE TO authenticated USING (false);

-- Block streak_period from being activated (schema-reserved, not active)
ALTER TABLE public.partner_mission_definitions
  DROP CONSTRAINT IF EXISTS partner_mission_definitions_no_active_streak;

ALTER TABLE public.partner_mission_definitions
  ADD CONSTRAINT partner_mission_definitions_no_active_streak
  CHECK (NOT (status = 'active' AND mission_type = 'streak_period'));

COMMIT;
