-- E2E-only financial settlement RPC (design migration — DO NOT apply without explicit approval).
-- Reverses test partner financial impact for subscription requests 44/45/46 pattern.
--
-- Idempotency: structured partial unique index on
--   (reference_type, reference_id) WHERE type='adjustment' AND reference_type='test_financial_settlement'
-- Ledger adjustment amount=20 is documentary reversal magnitude; balance_before/after remain 0 (non-withdrawable).

DROP INDEX IF EXISTS public.partner_wallet_ledger_test_settlement_idempotency_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS partner_wallet_ledger_test_settlement_commission_uidx
  ON public.partner_wallet_ledger (reference_type, reference_id)
  WHERE type = 'adjustment'
    AND reference_type = 'test_financial_settlement';

CREATE OR REPLACE FUNCTION public.settle_test_partner_financial(
  p_partner_id uuid,
  p_commission_id uuid,
  p_withdrawal_id uuid,
  p_request_id bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settlement_amount numeric(12, 2) := 20.00;
  v_bonus_expected numeric(12, 2) := 0.20;
  v_reason text := 'test-data-financial-settlement';
  v_reference_type text := 'test_financial_settlement';
  v_operator text := 'cleanup-script';
  v_audit_action text := 'test-partner-financial-settlement';
  v_now timestamptz := now();

  v_request public.subscription_requests%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_commission public.partner_commissions%ROWTYPE;
  v_withdrawal public.partner_withdrawals%ROWTYPE;
  v_partner_profile public.profiles%ROWTYPE;
  v_referred_profile public.profiles%ROWTYPE;

  v_existing_adjustment public.partner_wallet_ledger%ROWTYPE;
  v_ledger_adjustment_id uuid;
  v_paid_withdrawal_count integer;
  v_other_withdrawable_commissions numeric(12, 2);
  v_bonus_remainder numeric(12, 2);
  v_pending_before numeric(12, 2);
  v_note text;
  v_external_notes text;
  v_wallet text;

  v_balances_before jsonb;
  v_balances_after jsonb;
  v_already_settled boolean := false;
BEGIN
  IF p_partner_id IS NULL
     OR p_commission_id IS NULL
     OR p_withdrawal_id IS NULL
     OR p_request_id IS NULL
     OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'missing_required_parameters'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key !~ '^test-financial-settlement:[0-9]+:[0-9a-f-]{36}:[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'invalid_idempotency_key_format'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_request
  FROM public.subscription_requests sr
  WHERE sr.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF lower(coalesce(v_request.user_email, '')) NOT LIKE '%@test.local' THEN
    RAISE EXCEPTION 'non_test_request_email'
      USING ERRCODE = '22023';
  END IF;

  -- Structured idempotency probe (not note-dependent).
  SELECT *
  INTO v_existing_adjustment
  FROM public.partner_wallet_ledger l
  WHERE l.type = 'adjustment'
    AND l.reference_type = v_reference_type
    AND l.reference_id = p_commission_id
  ORDER BY l.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    v_already_settled := true;

    SELECT *
    INTO v_partner
    FROM public.partners p
    WHERE p.id = p_partner_id;

    SELECT *
    INTO v_commission
    FROM public.partner_commissions c
    WHERE c.id = p_commission_id;

    SELECT *
    INTO v_withdrawal
    FROM public.partner_withdrawals w
    WHERE w.id = p_withdrawal_id;

    IF v_existing_adjustment.partner_id <> p_partner_id
       OR round(coalesce(v_existing_adjustment.amount, 0), 2) <> v_settlement_amount
       OR v_existing_adjustment.reference_id <> p_commission_id
       OR v_existing_adjustment.reference_type <> v_reference_type
       OR round(coalesce(v_existing_adjustment.balance_before, 0), 2) <> 0
       OR round(coalesce(v_existing_adjustment.balance_after, 0), 2) <> 0
       OR coalesce(v_existing_adjustment.note, '') NOT LIKE ('%requestId=' || p_request_id::text || '%')
       OR coalesce(v_existing_adjustment.note, '') NOT LIKE ('%withdrawalId=' || p_withdrawal_id::text || '%')
       OR coalesce(v_existing_adjustment.note, '') NOT LIKE ('%idempotencyKey=' || p_idempotency_key || '%')
       OR NOT FOUND
       OR v_commission.status <> 'rejected'
       OR coalesce(v_commission.is_withdrawable, false) IS TRUE
       OR round(coalesce(v_commission.amount, 0), 2) <> v_settlement_amount
       OR coalesce(v_commission.reason, '') <> v_reason
       OR v_withdrawal.status <> 'paid'
       OR round(coalesce(v_withdrawal.amount, 0), 2) <> v_settlement_amount
       OR round(coalesce(v_partner.balance_withdrawable, 0), 2) <> 0
       OR round(coalesce(v_partner.total_withdrawn, 0), 2) <> 0
       OR coalesce(
            (substring(v_existing_adjustment.note from 'balancePendingAtSettlement=([0-9.]+)'))::numeric,
            -1
          ) <> round(coalesce(v_partner.balance_pending, 0), 2)
       OR abs(round(coalesce(v_partner.total_earnings, 0), 2) - v_bonus_expected) > 0.01 THEN
      RAISE EXCEPTION 'partial_settlement_detected'
        USING ERRCODE = '22023',
              DETAIL = jsonb_build_object(
                'commission_id', p_commission_id,
                'adjustment_id', v_existing_adjustment.id,
                'commission_status', v_commission.status,
                'is_withdrawable', v_commission.is_withdrawable,
                'total_withdrawn', v_partner.total_withdrawn,
                'total_earnings', v_partner.total_earnings
              )::text;
    END IF;

    RETURN jsonb_build_object(
      'status', 'already-settled',
      'request_id', p_request_id,
      'partner_id', p_partner_id,
      'commission_id', p_commission_id,
      'withdrawal_id', p_withdrawal_id,
      'ledger_adjustment_id', v_existing_adjustment.id,
      'idempotency_key', p_idempotency_key,
      'commission_status_before', 'rejected',
      'commission_status_after', v_commission.status,
      'balances_after', jsonb_build_object(
        'balanceWithdrawable', v_partner.balance_withdrawable,
        'balancePending', v_partner.balance_pending,
        'totalEarnings', v_partner.total_earnings,
        'totalWithdrawn', v_partner.total_withdrawn
      )
    );
  END IF;

  -- Lock order: partner -> commission -> withdrawal.
  SELECT *
  INTO v_partner
  FROM public.partners p
  WHERE p.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_pending_before := round(coalesce(v_partner.balance_pending, 0), 2);

  SELECT *
  INTO v_commission
  FROM public.partner_commissions c
  WHERE c.id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_withdrawal
  FROM public.partner_withdrawals w
  WHERE w.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_partner_profile
  FROM public.profiles pr
  WHERE pr.id = v_partner.user_id;

  IF NOT FOUND OR lower(coalesce(v_partner_profile.email, '')) NOT LIKE '%@test.local' THEN
    RAISE EXCEPTION 'non_test_partner_email'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_referred_profile
  FROM public.profiles pr
  WHERE pr.id = v_commission.user_id;

  IF NOT FOUND OR lower(coalesce(v_referred_profile.email, '')) NOT LIKE '%@test.local' THEN
    RAISE EXCEPTION 'non_test_referred_user_email'
      USING ERRCODE = '22023';
  END IF;

  IF lower(coalesce(v_referred_profile.email, '')) <> lower(coalesce(v_request.user_email, '')) THEN
    RAISE EXCEPTION 'referred_user_request_mismatch'
      USING ERRCODE = '22023';
  END IF;

  IF v_commission.partner_id <> p_partner_id THEN
    RAISE EXCEPTION 'commission_partner_mismatch'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_commission.subscription_id, v_commission.source_ref, '') <> p_request_id::text THEN
    RAISE EXCEPTION 'commission_request_mismatch'
      USING ERRCODE = '22023';
  END IF;

  IF v_commission.status <> 'withdrawable' THEN
    RAISE EXCEPTION 'commission_status_invalid'
      USING ERRCODE = '22023',
            DETAIL = v_commission.status;
  END IF;

  IF round(coalesce(v_commission.amount, 0), 2) <> v_settlement_amount THEN
    RAISE EXCEPTION 'commission_amount_invalid'
      USING ERRCODE = '22023',
            DETAIL = v_commission.amount::text;
  END IF;

  IF coalesce(v_commission.is_withdrawable, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commission_not_withdrawable'
      USING ERRCODE = '22023';
  END IF;

  IF v_withdrawal.partner_id <> p_partner_id THEN
    RAISE EXCEPTION 'withdrawal_partner_mismatch'
      USING ERRCODE = '22023';
  END IF;

  IF v_withdrawal.status <> 'paid' THEN
    RAISE EXCEPTION 'withdrawal_not_paid'
      USING ERRCODE = '22023',
            DETAIL = v_withdrawal.status;
  END IF;

  IF round(coalesce(v_withdrawal.amount, 0), 2) <> v_settlement_amount THEN
    RAISE EXCEPTION 'withdrawal_amount_invalid'
      USING ERRCODE = '22023',
            DETAIL = v_withdrawal.amount::text;
  END IF;

  v_wallet := coalesce(v_withdrawal.wallet_address, '');
  IF v_wallet !~ '^TXyz[0-9A-Za-z]+$' THEN
    RAISE EXCEPTION 'non_e2e_wallet_address'
      USING ERRCODE = '22023',
            DETAIL = v_wallet;
  END IF;

  IF v_withdrawal.payment_proof IS NOT NULL AND btrim(v_withdrawal.payment_proof) <> '' THEN
    IF length(v_withdrawal.payment_proof) > 100
       OR v_withdrawal.payment_proof ~* '^data:image/' THEN
      RAISE EXCEPTION 'external_payment_proof_present'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_external_notes := coalesce(v_withdrawal.admin_note, '') || ' ' || coalesce(v_withdrawal.partner_note, '');

  IF v_external_notes ~* '(0x[a-fA-F0-9]{40,64}|T[A-Za-z0-9]{33,}|[a-fA-F0-9]{64})' THEN
    RAISE EXCEPTION 'external_payout_tx_hash'
      USING ERRCODE = '22023';
  END IF;

  IF v_external_notes ~* '(mainnet|trc20|erc20|bsc|block explorer|confirmed on chain|etherscan|tronscan)' THEN
    RAISE EXCEPTION 'external_payout_reference'
      USING ERRCODE = '22023';
  END IF;

  IF v_external_notes !~* '(e2e|test|simulation|rej|paid)' THEN
    RAISE EXCEPTION 'non_e2e_withdrawal_note'
      USING ERRCODE = '22023';
  END IF;

  IF round(coalesce(v_partner.balance_withdrawable, 0), 2) <> 0 THEN
    RAISE EXCEPTION 'partner_balance_withdrawable_invalid'
      USING ERRCODE = '22023',
            DETAIL = v_partner.balance_withdrawable::text;
  END IF;

  IF round(coalesce(v_partner.total_withdrawn, 0), 2) < v_settlement_amount THEN
    RAISE EXCEPTION 'partner_total_withdrawn_too_low'
      USING ERRCODE = '22023',
            DETAIL = v_partner.total_withdrawn::text;
  END IF;

  IF round(coalesce(v_partner.total_earnings, 0), 2) < v_settlement_amount THEN
    RAISE EXCEPTION 'partner_total_earnings_too_low'
      USING ERRCODE = '22023',
            DETAIL = v_partner.total_earnings::text;
  END IF;

  SELECT count(*)::integer
  INTO v_paid_withdrawal_count
  FROM public.partner_withdrawals w
  WHERE w.partner_id = p_partner_id
    AND w.status = 'paid';

  IF v_paid_withdrawal_count <> 1 OR v_withdrawal.id <> (
    SELECT w2.id
    FROM public.partner_withdrawals w2
    WHERE w2.partner_id = p_partner_id
      AND w2.status = 'paid'
    ORDER BY w2.paid_at NULLS LAST, w2.created_at ASC
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'multiple_or_unlinked_paid_withdrawals'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(c.amount), 0)
  INTO v_other_withdrawable_commissions
  FROM public.partner_commissions c
  WHERE c.partner_id = p_partner_id
    AND c.id <> p_commission_id
    AND (c.status = 'withdrawable' OR coalesce(c.is_withdrawable, false));

  IF round(v_other_withdrawable_commissions, 2) <> 0 THEN
    RAISE EXCEPTION 'other_withdrawable_commissions_present'
      USING ERRCODE = '22023',
            DETAIL = v_other_withdrawable_commissions::text;
  END IF;

  v_bonus_remainder := round(coalesce(v_partner.total_earnings, 0) - v_settlement_amount, 2);
  IF v_bonus_remainder < 0 OR abs(v_bonus_remainder - v_bonus_expected) > 0.01 THEN
    RAISE EXCEPTION 'bonus_isolation_failed'
      USING ERRCODE = '22023',
            DETAIL = v_bonus_remainder::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_wallet_ledger l
    WHERE l.partner_id = p_partner_id
      AND l.type = 'commission_release'
      AND l.reference_type = 'commission'
      AND l.reference_id = p_commission_id
      AND round(l.amount, 2) = v_settlement_amount
  ) THEN
    RAISE EXCEPTION 'commission_release_ledger_missing'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_wallet_ledger l
    WHERE l.partner_id = p_partner_id
      AND l.type = 'withdrawal_paid'
      AND l.reference_type = 'withdrawal'
      AND l.reference_id = p_withdrawal_id
      AND round(l.amount, 2) = v_settlement_amount
  ) THEN
    RAISE EXCEPTION 'withdrawal_paid_ledger_missing'
      USING ERRCODE = '22023';
  END IF;

  v_balances_before := jsonb_build_object(
    'balanceWithdrawable', v_partner.balance_withdrawable,
    'balancePending', v_partner.balance_pending,
    'totalEarnings', v_partner.total_earnings,
    'totalWithdrawn', v_partner.total_withdrawn
  );

  v_note := v_reason
    || ' | accountingEffect=withdrawal_reversal_non_withdrawable'
    || ' | idempotencyKey=' || p_idempotency_key
    || ' | requestId=' || p_request_id::text
    || ' | commissionId=' || p_commission_id::text
    || ' | withdrawalId=' || p_withdrawal_id::text
    || ' | originalAmount=' || v_settlement_amount::text
    || ' | operator=' || v_operator
    || ' | balancePendingAtSettlement=' || round(v_pending_before, 2)::text
    || ' | timestamp=' || v_now::text;

  INSERT INTO public.partner_wallet_ledger (
    partner_id,
    type,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    note,
    created_at
  ) VALUES (
    p_partner_id,
    'adjustment',
    v_settlement_amount,
    0,
    0,
    v_reference_type,
    p_commission_id,
    v_note,
    v_now
  )
  RETURNING id INTO v_ledger_adjustment_id;

  UPDATE public.partners p
  SET
    total_withdrawn = round(greatest(coalesce(p.total_withdrawn, 0) - v_settlement_amount, 0), 2),
    total_earnings = round(greatest(coalesce(p.total_earnings, 0) - v_settlement_amount, 0), 2),
    updated_at = v_now
  WHERE p.id = p_partner_id
    AND round(coalesce(p.balance_withdrawable, 0), 2) = 0
    AND round(coalesce(p.balance_pending, 0), 2) = v_pending_before
  RETURNING
    jsonb_build_object(
      'balanceWithdrawable', p.balance_withdrawable,
      'balancePending', p.balance_pending,
      'totalEarnings', p.total_earnings,
      'totalWithdrawn', p.total_withdrawn
    )
  INTO v_balances_after;

  IF v_balances_after IS NULL THEN
    RAISE EXCEPTION 'partner_balance_update_failed'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.partner_commissions c
  SET
    status = 'rejected',
    is_withdrawable = false,
    reason = v_reason,
    description = v_reason,
    updated_at = v_now
  WHERE c.id = p_commission_id
    AND c.status = 'withdrawable'
    AND coalesce(c.is_withdrawable, false) IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_reject_failed'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_logs (
    admin_id,
    admin_email,
    action,
    target_table,
    target_id,
    details
  ) VALUES (
    NULL,
    'cleanup-script@system',
    v_audit_action,
    'partner_commissions',
    p_commission_id::text,
    jsonb_build_object(
      'eventType', 'partner.test_financial_settlement',
      'reason', v_reason,
      'requestId', p_request_id,
      'partnerId', p_partner_id,
      'commissionId', p_commission_id,
      'withdrawalId', p_withdrawal_id,
      'idempotencyKey', p_idempotency_key,
      'operator', v_operator,
      'timestamp', v_now,
      'before', v_balances_before,
      'after', v_balances_after,
      'ledgerAdjustmentId', v_ledger_adjustment_id,
      'testData', true
    )
  );

  RETURN jsonb_build_object(
    'status', 'settled',
    'request_id', p_request_id,
    'partner_id', p_partner_id,
    'commission_id', p_commission_id,
    'withdrawal_id', p_withdrawal_id,
    'balances_before', v_balances_before,
    'balances_after', v_balances_after,
    'commission_status_before', 'withdrawable',
    'commission_status_after', 'rejected',
    'ledger_adjustment_id', v_ledger_adjustment_id,
    'idempotency_key', p_idempotency_key,
    'ledger_balance_before', 0,
    'ledger_balance_after', 0,
    'ledger_accounting_effect', 'withdrawal_reversal_non_withdrawable'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_settlement_adjustment'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_test_partner_financial(uuid, uuid, uuid, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_test_partner_financial(uuid, uuid, uuid, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.settle_test_partner_financial(uuid, uuid, uuid, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_test_partner_financial(uuid, uuid, uuid, bigint, text) TO service_role;

COMMENT ON FUNCTION public.settle_test_partner_financial IS
  'E2E-only atomic test financial settlement. Not for production partner payouts. Fail-closed.';

COMMENT ON INDEX public.partner_wallet_ledger_test_settlement_commission_uidx IS
  'One test_financial_settlement adjustment per commission_id.';
