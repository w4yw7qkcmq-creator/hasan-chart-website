-- Partner Automation & Rewards — Phase 9

CREATE TABLE IF NOT EXISTS public.partner_program_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enable_auto_upgrade boolean NOT NULL DEFAULT true,
  enable_auto_release boolean NOT NULL DEFAULT true,
  enable_monthly_bonus boolean NOT NULL DEFAULT true,
  enable_achievements boolean NOT NULL DEFAULT true,
  monthly_bonus_values jsonb NOT NULL DEFAULT '{
    "silver": 100,
    "gold": 300,
    "platinum": 800,
    "diamond": 2000
  }'::jsonb,
  minimum_sales_for_bonus numeric(12, 2) NOT NULL DEFAULT 0,
  minimum_referrals_for_bonus integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.partner_program_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.partner_program_settings);

CREATE TABLE IF NOT EXISTS public.partner_achievement_definitions (
  achievement_key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  badge_label text NOT NULL,
  badge_icon text NOT NULL DEFAULT '🏅',
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.partner_achievement_definitions (
  achievement_key, title, description, badge_label, badge_icon, sort_order
) VALUES
  ('first_referral', 'First Referral', 'First successful referral registered', 'First Referral', '🔗', 1),
  ('ten_referrals', '10 Referrals', 'Reached 10 registered referrals', '10 Referrals', '🔟', 2),
  ('thousand_usdt_sales', '1000 USDT Sales', 'Generated $1000 in approved sales', '$1K Sales', '💰', 3),
  ('first_withdrawal', 'First Withdrawal', 'Completed first withdrawal request', 'First Withdrawal', '🏦', 4),
  ('top_partner', 'Top Partner', 'Ranked in top partner leaderboard', 'Top Partner', '👑', 5),
  ('diamond_partner', 'Diamond Partner', 'Reached Diamond tier', 'Diamond Partner', '💎', 6)
ON CONFLICT (achievement_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.partner_achievement_definitions(achievement_key) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (partner_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS partner_user_achievements_partner_id_idx
  ON public.partner_user_achievements (partner_id);

CREATE TABLE IF NOT EXISTS public.partner_user_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  tier_key text NOT NULL,
  milestone_percent integer NOT NULL CHECK (milestone_percent IN (25, 50, 75, 100)),
  reached_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (partner_id, tier_key, milestone_percent)
);

CREATE INDEX IF NOT EXISTS partner_user_milestones_partner_id_idx
  ON public.partner_user_milestones (partner_id);

CREATE TABLE IF NOT EXISTS public.partner_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_notifications_partner_id_idx
  ON public.partner_notifications (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_notifications_user_id_idx
  ON public.partner_notifications (user_id, read_at);

CREATE TABLE IF NOT EXISTS public.partner_monthly_bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  bonus_period text NOT NULL,
  tier_key text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USDT',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, bonus_period)
);

CREATE INDEX IF NOT EXISTS partner_monthly_bonus_grants_period_idx
  ON public.partner_monthly_bonus_grants (bonus_period);

ALTER TABLE public.partner_program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_user_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_monthly_bonus_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_program_settings FROM anon, authenticated;
REVOKE ALL ON public.partner_achievement_definitions FROM anon, authenticated;
REVOKE ALL ON public.partner_user_achievements FROM anon, authenticated;
REVOKE ALL ON public.partner_user_milestones FROM anon, authenticated;
REVOKE ALL ON public.partner_notifications FROM anon, authenticated;
REVOKE ALL ON public.partner_monthly_bonus_grants FROM anon, authenticated;

GRANT ALL ON public.partner_program_settings TO service_role;
GRANT ALL ON public.partner_achievement_definitions TO service_role;
GRANT ALL ON public.partner_user_achievements TO service_role;
GRANT ALL ON public.partner_user_milestones TO service_role;
GRANT ALL ON public.partner_notifications TO service_role;
GRANT ALL ON public.partner_monthly_bonus_grants TO service_role;
