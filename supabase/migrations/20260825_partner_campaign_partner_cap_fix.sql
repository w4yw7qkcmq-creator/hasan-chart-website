-- Fix per-partner cap double-count in create_partner_growth_reward_atomic
BEGIN;
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
  v_campaign_id uuid;
  v_campaign public.partner_campaign_programs%ROWTYPE;
  v_partner_spent numeric(12, 2);
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

  v_campaign_id := nullif(trim(coalesce(v_ent.metadata->>'campaignProgramId', v_ent.metadata->>'campaign_program_id', '')), '')::uuid;

  IF v_campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign
    FROM public.partner_campaign_programs
    WHERE id = v_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = '22023';
    END IF;

    IF v_campaign.status <> 'active' THEN
      RAISE EXCEPTION 'campaign_not_active' USING ERRCODE = '22023';
    END IF;

    IF v_campaign.global_budget_amount IS NOT NULL THEN
      IF round(coalesce(v_campaign.amount_spent, 0) + v_ent.amount, 2) > v_campaign.global_budget_amount THEN
        RAISE EXCEPTION 'campaign_budget_exhausted' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_campaign.per_partner_reward_cap IS NOT NULL THEN
      SELECT coalesce(sum(e.amount), 0) INTO v_partner_spent
      FROM public.partner_reward_entitlements e
      WHERE e.partner_id = v_ent.partner_id
        AND e.status NOT IN ('reversed')
        AND (
          e.metadata->>'campaignProgramId' = v_campaign_id::text
          OR e.metadata->>'campaign_program_id' = v_campaign_id::text
        );

      IF round(v_partner_spent, 2) > v_campaign.per_partner_reward_cap THEN
        RAISE EXCEPTION 'campaign_partner_cap_exceeded' USING ERRCODE = '22023';
      END IF;
    END IF;
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
      'periodKey', v_ent.period_key,
      'campaignProgramId', v_campaign_id
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
      'periodKey', v_ent.period_key,
      'campaignProgramId', v_campaign_id
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

  IF v_campaign_id IS NOT NULL AND v_campaign.global_budget_amount IS NOT NULL THEN
    UPDATE public.partner_campaign_programs
    SET amount_spent = round(coalesce(amount_spent, 0) + v_ent.amount, 2),
        updated_at = now()
    WHERE id = v_campaign_id;
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
    'fraud_risk', v_fraud->>'risk_level',
    'campaign_program_id', v_campaign_id,
    'campaign_amount_spent', CASE WHEN v_campaign_id IS NOT NULL THEN v_campaign.amount_spent + v_ent.amount ELSE NULL END
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
COMMIT;
