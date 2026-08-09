-- Partner Center Phase 1 — Enterprise foundation (additive, non-destructive)
-- Canonical events, attribution, qualification audit, append-only financial ledger, anti-fraud.
-- NOT applied to production by agent; review locally before deploy.

BEGIN;

-- ---------------------------------------------------------------------------
-- IAM: fraud review permission
-- ---------------------------------------------------------------------------
INSERT INTO public.iam_permissions (id, label, category, description) VALUES
  ('partners.fraud.review', 'مراجعة مخاطر الشركاء', 'partners', 'Review partner fraud signals and high-risk referrals')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.iam_role_permissions (role_id, permission_id, effect)
SELECT 'super_admin', p.id, 'allow'
FROM public.iam_permissions p
WHERE p.id = 'partners.fraud.review'
ON CONFLICT DO NOTHING;

INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('admin', 'partners.fraud.review', 'allow')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Canonical partner events (idempotent business event log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'referral_click',
    'signup',
    'verified_signup',
    'qualified_referral',
    'subscription_created',
    'subscription_activated',
    'purchase',
    'revenue_confirmed',
    'refund',
    'chargeback',
    'commission_created',
    'reward_created',
    'reward_approved',
    'reward_reversed',
    'payout_requested',
    'payout_completed'
  )),
  idempotency_key text NOT NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_id uuid REFERENCES public.partner_referrals(id) ON DELETE SET NULL,
  source_system text NOT NULL DEFAULT 'api'
    CHECK (source_system IN ('api', 'worker', 'webhook', 'admin', 'migration_backfill', 'system')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_events_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS partner_events_partner_id_idx ON public.partner_events (partner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS partner_events_referral_id_idx ON public.partner_events (referral_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS partner_events_type_occurred_idx ON public.partner_events (event_type, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Attribution sessions (clicks / first-touch before signup)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_attribution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  visitor_key text NOT NULL,
  campaign_slug text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_path text,
  first_touch_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  linked_referral_id uuid REFERENCES public.partner_referrals(id) ON DELETE SET NULL,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'converted', 'expired', 'superseded')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_attribution_sessions_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT partner_attribution_sessions_visitor_partner_unique UNIQUE (partner_id, visitor_key)
);

CREATE INDEX IF NOT EXISTS partner_attribution_sessions_partner_idx
  ON public.partner_attribution_sessions (partner_id, first_touch_at DESC);

CREATE INDEX IF NOT EXISTS partner_attribution_sessions_linked_user_idx
  ON public.partner_attribution_sessions (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Referral attribution (immutable after signup — one row per referred user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL UNIQUE REFERENCES public.partner_referrals(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  attribution_session_id uuid REFERENCES public.partner_attribution_sessions(id) ON DELETE SET NULL,
  campaign_slug text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_path text,
  policy text NOT NULL DEFAULT 'first_touch',
  attributed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_referral_attributions_partner_idx
  ON public.partner_referral_attributions (partner_id, attributed_at DESC);

-- ---------------------------------------------------------------------------
-- Qualification state (separate from legacy partner_referrals.status)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_referral_qualifications (
  referral_id uuid PRIMARY KEY REFERENCES public.partner_referrals(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'signup'
    CHECK (state IN ('signup', 'verified', 'qualified', 'customer', 'disqualified')),
  qualified_at timestamptz,
  disqualified_at timestamptz,
  last_transition_reason text,
  source_event_id uuid REFERENCES public.partner_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_qualification_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.partner_referrals(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL,
  source_event_id uuid REFERENCES public.partner_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_qualification_transitions_unique_transition
    UNIQUE (referral_id, from_state, to_state, reason)
);

CREATE INDEX IF NOT EXISTS partner_qualification_transitions_referral_idx
  ON public.partner_qualification_transitions (referral_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only financial ledger (canonical; mirrors legacy balances during transition)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN (
    'commission',
    'mission_reward',
    'milestone_reward',
    'performance_bonus',
    'manual_adjustment',
    'reversal',
    'payout'
  )),
  entry_direction text NOT NULL CHECK (entry_direction IN ('credit', 'debit')),
  lifecycle_status text NOT NULL DEFAULT 'pending' CHECK (lifecycle_status IN (
    'pending',
    'approved',
    'payable',
    'paid',
    'reversed'
  )),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  balance_bucket text NOT NULL CHECK (balance_bucket IN (
    'pending',
    'withdrawable',
    'bonus_pending',
    'paid_out',
    'earnings_total'
  )),
  partner_event_id uuid REFERENCES public.partner_events(id) ON DELETE SET NULL,
  reference_type text,
  reference_id text,
  legacy_commission_id uuid REFERENCES public.partner_commissions(id) ON DELETE SET NULL,
  legacy_withdrawal_id uuid REFERENCES public.partner_withdrawals(id) ON DELETE SET NULL,
  reverses_entry_id uuid REFERENCES public.partner_financial_ledger_entries(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_financial_ledger_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT partner_financial_ledger_no_self_reversal CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id)
);

CREATE INDEX IF NOT EXISTS partner_financial_ledger_partner_created_idx
  ON public.partner_financial_ledger_entries (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_financial_ledger_reference_idx
  ON public.partner_financial_ledger_entries (reference_type, reference_id);

CREATE UNIQUE INDEX IF NOT EXISTS partner_financial_ledger_commission_credit_unique
  ON public.partner_financial_ledger_entries (legacy_commission_id, entry_type, entry_direction)
  WHERE legacy_commission_id IS NOT NULL AND entry_type = 'commission' AND entry_direction = 'credit';

-- ---------------------------------------------------------------------------
-- Anti-fraud assessments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_fraud_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_id uuid REFERENCES public.partner_referrals(id) ON DELETE SET NULL,
  context_type text NOT NULL CHECK (context_type IN (
    'referral_signup',
    'qualification',
    'commission',
    'payout',
    'manual_review'
  )),
  risk_level text NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED')),
  score numeric(5, 2) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL CHECK (decision IN ('allow', 'review', 'block')),
  source_event_id uuid REFERENCES public.partner_events(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_fraud_assessments_partner_idx
  ON public.partner_fraud_assessments (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_fraud_assessments_open_high_idx
  ON public.partner_fraud_assessments (risk_level, created_at DESC)
  WHERE resolved_at IS NULL AND risk_level IN ('HIGH', 'BLOCKED');

-- ---------------------------------------------------------------------------
-- RLS — service_role full access; partner self-read; IAM admin read/review
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_attribution_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referral_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_qualification_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_financial_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_fraud_assessments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_events FROM anon;
REVOKE ALL ON public.partner_attribution_sessions FROM anon;
REVOKE ALL ON public.partner_referral_attributions FROM anon;
REVOKE ALL ON public.partner_referral_qualifications FROM anon;
REVOKE ALL ON public.partner_qualification_transitions FROM anon;
REVOKE ALL ON public.partner_financial_ledger_entries FROM anon;
REVOKE ALL ON public.partner_fraud_assessments FROM anon;

GRANT SELECT ON public.partner_events TO authenticated;
GRANT SELECT ON public.partner_attribution_sessions TO authenticated;
GRANT SELECT ON public.partner_referral_attributions TO authenticated;
GRANT SELECT ON public.partner_referral_qualifications TO authenticated;
GRANT SELECT ON public.partner_qualification_transitions TO authenticated;
GRANT SELECT ON public.partner_financial_ledger_entries TO authenticated;
GRANT SELECT ON public.partner_fraud_assessments TO authenticated;

GRANT ALL ON public.partner_events TO service_role;
GRANT ALL ON public.partner_attribution_sessions TO service_role;
GRANT ALL ON public.partner_referral_attributions TO service_role;
GRANT ALL ON public.partner_referral_qualifications TO service_role;
GRANT ALL ON public.partner_qualification_transitions TO service_role;
GRANT ALL ON public.partner_financial_ledger_entries TO service_role;
GRANT ALL ON public.partner_fraud_assessments TO service_role;

-- Partner owns their rows (SELECT only for authenticated partner user)
CREATE POLICY partner_events_own_select ON public.partner_events
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

CREATE POLICY partner_attribution_sessions_own_select ON public.partner_attribution_sessions
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

CREATE POLICY partner_referral_attributions_own_select ON public.partner_referral_attributions
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

CREATE POLICY partner_referral_qualifications_own_select ON public.partner_referral_qualifications
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

CREATE POLICY partner_qualification_transitions_own_select ON public.partner_qualification_transitions
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

CREATE POLICY partner_financial_ledger_own_select ON public.partner_financial_ledger_entries
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid())
  );

-- Admin IAM policies (enforce mode when enabled)
DO $policy$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_iam_enforce_apply_policy') THEN
    PERFORM public._iam_enforce_apply_policy(
      'public.partner_events'::regclass,
      'iam_enforce_partner_events_admin_select',
      'SELECT',
      'partners.finance.read'
    );
    PERFORM public._iam_enforce_apply_policy(
      'public.partner_financial_ledger_entries'::regclass,
      'iam_enforce_partner_financial_ledger_admin_select',
      'SELECT',
      'partners.finance.read'
    );
    PERFORM public._iam_enforce_apply_policy(
      'public.partner_fraud_assessments'::regclass,
      'iam_enforce_partner_fraud_assessments_admin_select',
      'SELECT',
      'partners.fraud.review'
    );
    PERFORM public._iam_enforce_apply_policy(
      'public.partner_fraud_assessments'::regclass,
      'iam_enforce_partner_fraud_assessments_admin_update',
      'UPDATE',
      'partners.fraud.review'
    );
  END IF;
END
$policy$;

COMMIT;
