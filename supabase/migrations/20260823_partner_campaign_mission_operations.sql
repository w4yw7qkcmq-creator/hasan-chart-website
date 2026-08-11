-- Round 9: campaign mission operations — additive schema extensions
-- Extends Phase 2 growth engine (partner_campaign_programs, missions, attribution)

-- ---------------------------------------------------------------------------
-- partner_campaign_programs: localized fields, priority, capacity, status lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_campaign_programs
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_participants integer CHECK (max_participants IS NULL OR max_participants >= 1);

-- Migrate legacy ended status to completed before tightening CHECK
UPDATE public.partner_campaign_programs
SET status = 'completed', updated_at = now()
WHERE status = 'ended';

ALTER TABLE public.partner_campaign_programs
  DROP CONSTRAINT IF EXISTS partner_campaign_programs_status_check;

ALTER TABLE public.partner_campaign_programs
  ADD CONSTRAINT partner_campaign_programs_status_check
  CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS partner_campaign_programs_priority_idx
  ON public.partner_campaign_programs (priority DESC, start_at);

-- ---------------------------------------------------------------------------
-- Attribution: link sessions and referral attributions to campaign programs
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_attribution_sessions
  ADD COLUMN IF NOT EXISTS campaign_program_id uuid
    REFERENCES public.partner_campaign_programs(id) ON DELETE SET NULL;

ALTER TABLE public.partner_referral_attributions
  ADD COLUMN IF NOT EXISTS campaign_program_id uuid
    REFERENCES public.partner_campaign_programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS partner_attribution_sessions_campaign_program_idx
  ON public.partner_attribution_sessions (campaign_program_id)
  WHERE campaign_program_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS partner_referral_attributions_campaign_program_idx
  ON public.partner_referral_attributions (campaign_program_id)
  WHERE campaign_program_id IS NOT NULL;

COMMENT ON COLUMN public.partner_attribution_sessions.campaign_program_id IS
  'Platform campaign program (partner_campaign_programs.code slug), not partner_campaigns';
COMMENT ON COLUMN public.partner_referral_attributions.campaign_program_id IS
  'Platform campaign program (partner_campaign_programs.code slug), not partner_campaigns';

-- ---------------------------------------------------------------------------
-- Mission definitions: new mission types and campaign_lifetime period
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_mission_definitions
  DROP CONSTRAINT IF EXISTS partner_mission_definitions_mission_type_check;

ALTER TABLE public.partner_mission_definitions
  ADD CONSTRAINT partner_mission_definitions_mission_type_check
  CHECK (mission_type IN (
    'qualified_referrals_count', 'qualified_referrals_in_period',
    'customers_count', 'revenue_amount', 'subscriptions_count',
    'campaign_conversions', 'conversion_rate', 'first_customer',
    'streak_period', 'custom_rule',
    'service_sales_count', 'service_sales_amount', 'smart_link_conversions'
  ));

ALTER TABLE public.partner_mission_definitions
  DROP CONSTRAINT IF EXISTS partner_mission_definitions_period_type_check;

ALTER TABLE public.partner_mission_definitions
  ADD CONSTRAINT partner_mission_definitions_period_type_check
  CHECK (period_type IS NULL OR period_type IN (
    'once', 'daily', 'weekly', 'monthly', 'custom', 'campaign_lifetime'
  ));

-- ---------------------------------------------------------------------------
-- Mission progress: completion_sequence for repeatable missions
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_mission_progress
  ADD COLUMN IF NOT EXISTS completion_sequence integer NOT NULL DEFAULT 1
    CHECK (completion_sequence >= 1);

ALTER TABLE public.partner_mission_progress
  DROP CONSTRAINT IF EXISTS partner_mission_progress_unique;

ALTER TABLE public.partner_mission_progress
  ADD CONSTRAINT partner_mission_progress_unique
  UNIQUE (partner_id, mission_id, period_key, completion_sequence);

CREATE INDEX IF NOT EXISTS partner_mission_progress_completion_seq_idx
  ON public.partner_mission_progress (mission_id, partner_id, completion_sequence);

-- ---------------------------------------------------------------------------
-- Campaign participants (enrollment + first progress tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_campaign_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_program_id uuid NOT NULL
    REFERENCES public.partner_campaign_programs(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  first_progress_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_campaign_participants_unique UNIQUE (campaign_program_id, partner_id)
);

CREATE INDEX IF NOT EXISTS partner_campaign_participants_partner_idx
  ON public.partner_campaign_participants (partner_id, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS partner_campaign_participants_campaign_idx
  ON public.partner_campaign_participants (campaign_program_id, enrolled_at DESC);

ALTER TABLE public.partner_campaign_participants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_campaign_participants FROM anon;
GRANT SELECT ON public.partner_campaign_participants TO authenticated;
GRANT ALL ON public.partner_campaign_participants TO service_role;

CREATE POLICY partner_campaign_participants_own_select ON public.partner_campaign_participants
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));
