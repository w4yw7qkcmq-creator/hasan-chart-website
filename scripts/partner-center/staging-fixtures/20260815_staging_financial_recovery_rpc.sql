-- Staging-only harness recovery: compensate erroneous balance_restore_only operations.
-- Does NOT create ledger entries. Idempotent via partner_center_staging_recovery_events.

CREATE TABLE IF NOT EXISTS public.partner_center_staging_recovery_events (
  idempotency_key text PRIMARY KEY,
  run_id text NOT NULL,
  commission_id uuid,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  pending_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (pending_amount >= 0),
  earnings_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (earnings_amount >= 0),
  balance_bucket text NOT NULL DEFAULT 'pending',
  source_restore_idempotency text,
  reason text,
  ledger_mutation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_center_staging_recovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_center_staging_recovery_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_center_staging_recovery_events TO service_role;

CREATE OR REPLACE FUNCTION public.staging_compensate_erroneous_balance_restore(
  p_run_id text,
  p_commission_id uuid,
  p_partner_id uuid,
  p_pending_amount numeric,
  p_earnings_amount numeric,
  p_balance_bucket text DEFAULT 'pending',
  p_source_restore_idempotency text DEFAULT NULL,
  p_reason text DEFAULT 'staging_recovery_compensation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_email text;
  v_idempotency text;
  v_pending numeric(12, 2);
  v_earnings numeric(12, 2);
  v_bucket text;
BEGIN
  IF coalesce(btrim(p_run_id), '') = '' THEN
    RAISE EXCEPTION 'missing_run_id' USING ERRCODE = '22023';
  END IF;
  IF p_commission_id IS NULL OR p_partner_id IS NULL THEN
    RAISE EXCEPTION 'missing_commission_or_partner' USING ERRCODE = '22023';
  END IF;

  v_pending := round(greatest(coalesce(p_pending_amount, 0), 0), 2);
  v_earnings := round(greatest(coalesce(p_earnings_amount, 0), 0), 2);
  IF v_pending <= 0 AND v_earnings <= 0 THEN
    RETURN jsonb_build_object('compensated', false, 'reason', 'zero_amounts', 'commission_id', p_commission_id);
  END IF;

  v_idempotency := 'staging_recovery:' || btrim(p_run_id) || ':' || p_commission_id::text;

  IF EXISTS (
    SELECT 1 FROM public.partner_center_staging_recovery_events e
    WHERE e.idempotency_key = v_idempotency
  ) THEN
    RETURN jsonb_build_object(
      'compensated', false,
      'duplicate', true,
      'commission_id', p_commission_id,
      'idempotency_key', v_idempotency
    );
  END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT pr.email INTO v_email FROM public.profiles pr WHERE pr.id = v_partner.user_id;
  IF NOT FOUND OR coalesce(btrim(v_email), '') = '' THEN
    IF coalesce(v_partner.referral_code, '') ~* '^R[6789]' OR coalesce(v_partner.referral_code, '') ~* '^R8' THEN
      v_email := 'r8-recovery-fallback@staging-hcw.test';
    ELSE
      RAISE EXCEPTION 'fixture_profile_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF NOT (
    v_email ILIKE 'r8-%' OR
    v_email ILIKE 'r6-%' OR
    v_email ILIKE 'r7-%' OR
    v_email ILIKE 'r9-%' OR
    v_email ILIKE 'hv-%' OR
    v_email ILIKE 'sc-probe-%' OR
    v_email ILIKE 'mc-probe-%'
  ) THEN
    RAISE EXCEPTION 'refuse_non_fixture_partner' USING ERRCODE = '22023';
  END IF;

  v_bucket := lower(coalesce(nullif(btrim(p_balance_bucket), ''), 'pending'));

  IF v_pending > 0 THEN
    IF v_bucket = 'withdrawable' THEN
      UPDATE public.partners
      SET balance_withdrawable = round(coalesce(balance_withdrawable, 0) + v_pending, 2),
          updated_at = now()
      WHERE id = p_partner_id;
    ELSIF v_bucket = 'bonus_pending' THEN
      UPDATE public.partners
      SET balance_bonus_pending = round(coalesce(balance_bonus_pending, 0) + v_pending, 2),
          updated_at = now()
      WHERE id = p_partner_id;
    ELSE
      UPDATE public.partners
      SET balance_pending = round(coalesce(balance_pending, 0) + v_pending, 2),
          updated_at = now()
      WHERE id = p_partner_id;
    END IF;
  END IF;

  IF v_earnings > 0 THEN
    UPDATE public.partners
    SET total_earnings = round(coalesce(total_earnings, 0) + v_earnings, 2),
        updated_at = now()
    WHERE id = p_partner_id;
  END IF;

  INSERT INTO public.partner_center_staging_recovery_events (
    idempotency_key,
    run_id,
    commission_id,
    partner_id,
    pending_amount,
    earnings_amount,
    balance_bucket,
    source_restore_idempotency,
    reason,
    ledger_mutation
  ) VALUES (
    v_idempotency,
    btrim(p_run_id),
    p_commission_id,
    p_partner_id,
    v_pending,
    v_earnings,
    v_bucket,
    p_source_restore_idempotency,
    coalesce(p_reason, 'staging_recovery_compensation'),
    false
  );

  RETURN jsonb_build_object(
    'compensated', true,
    'commission_id', p_commission_id,
    'partner_id', p_partner_id,
    'pending_amount', v_pending,
    'earnings_amount', v_earnings,
    'balance_bucket', v_bucket,
    'idempotency_key', v_idempotency,
    'ledger_mutation', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.staging_compensate_erroneous_balance_restore(
  text, uuid, uuid, numeric, numeric, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staging_compensate_erroneous_balance_restore(
  text, uuid, uuid, numeric, numeric, text, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staging_compensate_erroneous_balance_restore(
  text, uuid, uuid, numeric, numeric, text, text, text
) TO service_role;
