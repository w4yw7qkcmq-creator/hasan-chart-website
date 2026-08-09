-- Partner Center Phase 2 — Growth Engine (Missions, Levels, Milestones, Campaigns, Rewards)
-- Additive only. Builds on Phase 1 financial gateway / ledger / fraud / IAM.

BEGIN;

-- ---------------------------------------------------------------------------
-- IAM permissions (Phase 2)
-- ---------------------------------------------------------------------------
INSERT INTO public.iam_permissions (id, label, category, description)
VALUES
  ('partners.campaigns.read', 'قراءة حملات الشركاء', 'partners', 'View partner campaign programs'),
  ('partners.campaigns.manage', 'إدارة حملات الشركاء', 'partners', 'Create/update partner campaign programs'),
  ('partners.missions.read', 'قراءة مهام الشركاء', 'partners', 'View partner mission definitions'),
  ('partners.missions.manage', 'إدارة مهام الشركاء', 'partners', 'Create/update partner missions'),
  ('partners.rewards.read', 'قراءة مكافآت الشركاء', 'partners', 'View partner reward entitlements'),
  ('partners.rewards.manage', 'إدارة مكافآت الشركاء', 'partners', 'Manage partner reward approvals'),
  ('partners.levels.manage', 'إدارة مستويات الشركاء', 'partners', 'Manage partner level definitions and overrides')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.iam_role_permissions (role_id, permission_id, effect)
SELECT r.role_id, p.id, 'allow'
FROM (VALUES
  ('admin', 'partners.campaigns.read'),
  ('admin', 'partners.campaigns.manage'),
  ('admin', 'partners.missions.read'),
  ('admin', 'partners.missions.manage'),
  ('admin', 'partners.rewards.read'),
  ('admin', 'partners.rewards.manage'),
  ('admin', 'partners.levels.manage'),
  ('super_admin', 'partners.campaigns.read'),
  ('super_admin', 'partners.campaigns.manage'),
  ('super_admin', 'partners.missions.read'),
  ('super_admin', 'partners.missions.manage'),
  ('super_admin', 'partners.rewards.read'),
  ('super_admin', 'partners.rewards.manage'),
  ('super_admin', 'partners.levels.manage')
) AS r(role_id, permission_id)
JOIN public.iam_permissions p ON p.id = r.permission_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Extend partner_tiers for configurable levels (reuse existing table)
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_tiers
  ADD COLUMN IF NOT EXISTS tier_code text,
  ADD COLUMN IF NOT EXISTS min_qualified_referrals integer NOT NULL DEFAULT 0 CHECK (min_qualified_referrals >= 0),
  ADD COLUMN IF NOT EXISTS min_customers integer NOT NULL DEFAULT 0 CHECK (min_customers >= 0),
  ADD COLUMN IF NOT EXISTS min_confirmed_revenue numeric(12, 2) NOT NULL DEFAULT 0 CHECK (min_confirmed_revenue >= 0),
  ADD COLUMN IF NOT EXISTS min_active_period_days integer NOT NULL DEFAULT 0 CHECK (min_active_period_days >= 0),
  ADD COLUMN IF NOT EXISTS benefits_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reward_multiplier numeric(8, 4) NOT NULL DEFAULT 1 CHECK (reward_multiplier > 0),
  ADD COLUMN IF NOT EXISTS rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1),
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to timestamptz;

UPDATE public.partner_tiers SET tier_code = tier_key WHERE tier_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_tiers_tier_code_idx ON public.partner_tiers (tier_code) WHERE tier_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_tiers_sort_order_active_idx
  ON public.partner_tiers (sort_order) WHERE is_active IS TRUE;

-- ---------------------------------------------------------------------------
-- Level history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_level_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  from_tier_key text,
  to_tier_key text NOT NULL,
  change_reason text NOT NULL,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_version integer,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_level_history_partner_idx
  ON public.partner_level_history (partner_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- Admin campaign programs (platform-wide, configurable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_campaign_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  start_at timestamptz,
  end_at timestamptz,
  landing_path text NOT NULL DEFAULT '/',
  allowed_sources text[] NOT NULL DEFAULT '{}',
  allowed_mediums text[] NOT NULL DEFAULT '{}',
  min_tier_key text,
  partner_eligibility jsonb NOT NULL DEFAULT '{"mode":"all"}'::jsonb,
  commission_override_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creative_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  tracking_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_campaign_programs_code_version_unique UNIQUE (code, rule_version),
  CONSTRAINT partner_campaign_programs_landing_internal CHECK (landing_path ~ '^/')
);

CREATE INDEX IF NOT EXISTS partner_campaign_programs_status_idx
  ON public.partner_campaign_programs (status, start_at, end_at);

-- ---------------------------------------------------------------------------
-- Smart links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_smart_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text,
  campaign_program_id uuid REFERENCES public.partner_campaign_programs(id) ON DELETE SET NULL,
  source text,
  medium text,
  destination_path text NOT NULL DEFAULT '/',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_smart_links_destination_internal CHECK (destination_path ~ '^/')
);

CREATE INDEX IF NOT EXISTS partner_smart_links_partner_idx ON public.partner_smart_links (partner_id, status);
CREATE INDEX IF NOT EXISTS partner_smart_links_token_idx ON public.partner_smart_links (token);

-- ---------------------------------------------------------------------------
-- Mission definitions (admin-configurable, versioned)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_mission_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  mission_type text NOT NULL CHECK (mission_type IN (
    'qualified_referrals_count', 'customers_count', 'revenue_amount',
    'subscriptions_count', 'campaign_conversions', 'conversion_rate',
    'first_customer', 'streak_period', 'custom_rule'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  start_at timestamptz,
  end_at timestamptz,
  eligibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_metric text NOT NULL,
  target_value numeric(14, 4) NOT NULL CHECK (target_value > 0),
  reward_amount numeric(12, 2) NOT NULL CHECK (reward_amount >= 0),
  reward_currency text NOT NULL DEFAULT 'USD',
  max_completions integer CHECK (max_completions IS NULL OR max_completions >= 1),
  per_partner_limit integer NOT NULL DEFAULT 1 CHECK (per_partner_limit >= 1),
  min_tier_key text,
  campaign_program_id uuid REFERENCES public.partner_campaign_programs(id) ON DELETE SET NULL,
  qualification_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  fraud_policy jsonb NOT NULL DEFAULT '{"blockOnHigh":true,"blockOnBlocked":true}'::jsonb,
  period_type text CHECK (period_type IS NULL OR period_type IN ('once', 'daily', 'weekly', 'monthly', 'custom')),
  minimum_sample_size integer NOT NULL DEFAULT 0 CHECK (minimum_sample_size >= 0),
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_mission_definitions_code_version_unique UNIQUE (code, rule_version)
);

CREATE INDEX IF NOT EXISTS partner_mission_definitions_active_idx
  ON public.partner_mission_definitions (status, mission_type, start_at, end_at);

-- ---------------------------------------------------------------------------
-- Mission progress (per partner / mission / period)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.partner_mission_definitions(id) ON DELETE CASCADE,
  mission_version integer NOT NULL DEFAULT 1,
  period_key text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'eligible', 'active', 'in_progress', 'completed', 'reward_pending',
    'reward_approved', 'reward_credited', 'expired', 'disqualified'
  )),
  current_value numeric(14, 4) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  target_value numeric(14, 4) NOT NULL CHECK (target_value > 0),
  completed_at timestamptz,
  reward_entitlement_id uuid,
  disqualified_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_mission_progress_unique UNIQUE (partner_id, mission_id, period_key)
);

CREATE INDEX IF NOT EXISTS partner_mission_progress_partner_status_idx
  ON public.partner_mission_progress (partner_id, status);
CREATE INDEX IF NOT EXISTS partner_mission_progress_mission_idx
  ON public.partner_mission_progress (mission_id, status);

-- ---------------------------------------------------------------------------
-- Milestone definitions (configurable one-time achievements with rewards)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_milestone_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  metric text NOT NULL CHECK (metric IN (
    'qualified_referrals', 'customers', 'confirmed_revenue', 'first_customer'
  )),
  threshold_value numeric(14, 4) NOT NULL CHECK (threshold_value > 0),
  reward_amount numeric(12, 2) NOT NULL CHECK (reward_amount >= 0),
  reward_currency text NOT NULL DEFAULT 'USD',
  min_tier_key text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused')),
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_milestone_definitions_code_version_unique UNIQUE (code, rule_version)
);

-- ---------------------------------------------------------------------------
-- Milestone grants (one-time per partner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_milestone_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES public.partner_milestone_definitions(id) ON DELETE CASCADE,
  milestone_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'earned' CHECK (status IN (
    'earned', 'reward_pending', 'reward_credited', 'reversed'
  )),
  achieved_at timestamptz NOT NULL DEFAULT now(),
  reward_entitlement_id uuid,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT partner_milestone_grants_unique UNIQUE (partner_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS partner_milestone_grants_partner_idx ON public.partner_milestone_grants (partner_id);

-- ---------------------------------------------------------------------------
-- Performance bonus rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_performance_bonus_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  metric text NOT NULL CHECK (metric IN (
    'confirmed_revenue', 'qualified_referrals', 'customers', 'conversion_rate', 'growth_rate'
  )),
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'custom')),
  threshold_value numeric(14, 4) NOT NULL CHECK (threshold_value > 0),
  minimum_sample_size integer NOT NULL DEFAULT 1 CHECK (minimum_sample_size >= 1),
  reward_amount numeric(12, 2) NOT NULL CHECK (reward_amount >= 0),
  reward_currency text NOT NULL DEFAULT 'USD',
  min_tier_key text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused')),
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_performance_bonus_rules_code_version_unique UNIQUE (code, rule_version)
);

CREATE TABLE IF NOT EXISTS public.partner_performance_bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.partner_performance_bonus_rules(id) ON DELETE CASCADE,
  rule_version integer NOT NULL DEFAULT 1,
  period_key text NOT NULL,
  status text NOT NULL DEFAULT 'earned' CHECK (status IN (
    'earned', 'reward_pending', 'reward_credited', 'reversed'
  )),
  achieved_value numeric(14, 4) NOT NULL DEFAULT 0,
  reward_entitlement_id uuid,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_performance_bonus_grants_unique UNIQUE (partner_id, rule_id, period_key)
);

CREATE INDEX IF NOT EXISTS partner_performance_bonus_grants_period_idx
  ON public.partner_performance_bonus_grants (period_key, status);

-- ---------------------------------------------------------------------------
-- Reward entitlements (mission/milestone/bonus — separate from financial ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_reward_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  reward_type text NOT NULL CHECK (reward_type IN (
    'mission_reward', 'milestone_reward', 'performance_bonus'
  )),
  source_type text NOT NULL CHECK (source_type IN ('mission', 'milestone', 'performance_bonus')),
  source_id uuid NOT NULL,
  period_key text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'earned' CHECK (status IN (
    'earned', 'pending', 'risk_hold', 'approved', 'payable', 'paid', 'reversed', 'reward_credited'
  )),
  rule_version integer,
  fraud_risk_level text,
  payout_hold boolean NOT NULL DEFAULT false,
  ledger_entry_id uuid REFERENCES public.partner_financial_ledger_entries(id) ON DELETE SET NULL,
  partner_event_id uuid REFERENCES public.partner_events(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_reward_entitlements_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT partner_reward_entitlements_source_unique UNIQUE (partner_id, source_type, source_id, period_key)
);

CREATE INDEX IF NOT EXISTS partner_reward_entitlements_partner_idx
  ON public.partner_reward_entitlements (partner_id, status);

-- ---------------------------------------------------------------------------
-- Partner metrics cache (reconcilable summaries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_metrics_daily (
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  signups integer NOT NULL DEFAULT 0 CHECK (signups >= 0),
  qualified_referrals integer NOT NULL DEFAULT 0 CHECK (qualified_referrals >= 0),
  customers integer NOT NULL DEFAULT 0 CHECK (customers >= 0),
  confirmed_revenue numeric(14, 2) NOT NULL DEFAULT 0 CHECK (confirmed_revenue >= 0),
  missions_completed integer NOT NULL DEFAULT 0 CHECK (missions_completed >= 0),
  milestones_completed integer NOT NULL DEFAULT 0 CHECK (milestones_completed >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, metric_date)
);

-- ---------------------------------------------------------------------------
-- Leaderboard snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL,
  ranking_metric text NOT NULL CHECK (ranking_metric IN (
    'confirmed_revenue', 'customers', 'qualified_referrals', 'growth_rate'
  )),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1),
  metric_value numeric(14, 4) NOT NULL DEFAULT 0,
  display_label text,
  tie_break_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_leaderboard_snapshots_unique UNIQUE (period_key, ranking_metric, partner_id)
);

CREATE INDEX IF NOT EXISTS partner_leaderboard_snapshots_period_idx
  ON public.partner_leaderboard_snapshots (period_key, ranking_metric, rank);

-- ---------------------------------------------------------------------------
-- Admin audit log (Phase 2 config changes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_admin_audit_log_entity_idx
  ON public.partner_admin_audit_log (entity_type, entity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Helper: business period key (UTC storage; business TZ applied in app layer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_center_period_key(
  p_period_type text,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_period_type, 'once'))
    WHEN 'daily' THEN to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    WHEN 'weekly' THEN to_char(p_at AT TIME ZONE 'UTC', 'IYYY') || '-W' || lpad(to_char(p_at AT TIME ZONE 'UTC', 'IW'), 2, '0')
    WHEN 'monthly' THEN to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM')
    WHEN 'once' THEN ''
    ELSE to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic growth reward (mission / milestone / performance bonus)
-- Amount read from entitlement — never trusted from caller.
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

  IF v_ent.status IN ('reward_credited', 'paid') THEN
    RETURN jsonb_build_object(
      'credited', false, 'duplicate', true,
      'entitlement_id', v_ent.id,
      'ledger_entry_id', v_ent.ledger_entry_id
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
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_growth_reward_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_partner_growth_reward_atomic(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_growth_reward_atomic(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_level_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_campaign_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_smart_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_mission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_milestone_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_milestone_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_performance_bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_performance_bonus_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_reward_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Partner read own progress/rewards/links; definitions read-only for active
REVOKE ALL ON public.partner_level_history FROM anon;
REVOKE ALL ON public.partner_campaign_programs FROM anon;
REVOKE ALL ON public.partner_smart_links FROM anon;
REVOKE ALL ON public.partner_mission_definitions FROM anon;
REVOKE ALL ON public.partner_mission_progress FROM anon;
REVOKE ALL ON public.partner_milestone_definitions FROM anon;
REVOKE ALL ON public.partner_milestone_grants FROM anon;
REVOKE ALL ON public.partner_performance_bonus_rules FROM anon;
REVOKE ALL ON public.partner_performance_bonus_grants FROM anon;
REVOKE ALL ON public.partner_reward_entitlements FROM anon;
REVOKE ALL ON public.partner_metrics_daily FROM anon;
REVOKE ALL ON public.partner_leaderboard_snapshots FROM anon;
REVOKE ALL ON public.partner_admin_audit_log FROM anon;

GRANT SELECT ON public.partner_level_history TO authenticated;
GRANT SELECT ON public.partner_campaign_programs TO authenticated;
GRANT SELECT, INSERT ON public.partner_smart_links TO authenticated;
GRANT SELECT ON public.partner_mission_definitions TO authenticated;
GRANT SELECT ON public.partner_mission_progress TO authenticated;
GRANT SELECT ON public.partner_milestone_definitions TO authenticated;
GRANT SELECT ON public.partner_milestone_grants TO authenticated;
GRANT SELECT ON public.partner_performance_bonus_rules TO authenticated;
GRANT SELECT ON public.partner_performance_bonus_grants TO authenticated;
GRANT SELECT ON public.partner_reward_entitlements TO authenticated;
GRANT SELECT ON public.partner_metrics_daily TO authenticated;
GRANT SELECT ON public.partner_leaderboard_snapshots TO authenticated;

GRANT ALL ON public.partner_level_history TO service_role;
GRANT ALL ON public.partner_campaign_programs TO service_role;
GRANT ALL ON public.partner_smart_links TO service_role;
GRANT ALL ON public.partner_mission_definitions TO service_role;
GRANT ALL ON public.partner_mission_progress TO service_role;
GRANT ALL ON public.partner_milestone_definitions TO service_role;
GRANT ALL ON public.partner_milestone_grants TO service_role;
GRANT ALL ON public.partner_performance_bonus_rules TO service_role;
GRANT ALL ON public.partner_performance_bonus_grants TO service_role;
GRANT ALL ON public.partner_reward_entitlements TO service_role;
GRANT ALL ON public.partner_metrics_daily TO service_role;
GRANT ALL ON public.partner_leaderboard_snapshots TO service_role;
GRANT ALL ON public.partner_admin_audit_log TO service_role;

CREATE POLICY partner_mission_progress_own_select ON public.partner_mission_progress
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid()));

CREATE POLICY partner_mission_progress_own_insert ON public.partner_mission_progress
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY partner_mission_progress_own_update ON public.partner_mission_progress
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY partner_reward_entitlements_own_select ON public.partner_reward_entitlements
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid()));

CREATE POLICY partner_smart_links_own_select ON public.partner_smart_links
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid()));

CREATE POLICY partner_smart_links_own_insert ON public.partner_smart_links
  FOR INSERT TO authenticated
  WITH CHECK (partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid()));

CREATE POLICY partner_milestone_grants_own_select ON public.partner_milestone_grants
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid()));

CREATE POLICY partner_mission_definitions_active_select ON public.partner_mission_definitions
  FOR SELECT TO authenticated
  USING (status = 'active');

CREATE POLICY partner_milestone_definitions_active_select ON public.partner_milestone_definitions
  FOR SELECT TO authenticated
  USING (status = 'active');

CREATE POLICY partner_campaign_programs_active_select ON public.partner_campaign_programs
  FOR SELECT TO authenticated
  USING (status = 'active');

CREATE POLICY partner_level_history_own_select ON public.partner_level_history
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT p.id FROM public.partners p WHERE p.user_id = auth.uid()));

CREATE POLICY partner_leaderboard_public_select ON public.partner_leaderboard_snapshots
  FOR SELECT TO authenticated
  USING (true);

COMMIT;
