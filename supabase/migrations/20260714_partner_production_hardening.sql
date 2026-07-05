-- Partner Production Hardening — Phase 10

CREATE UNIQUE INDEX IF NOT EXISTS partner_user_achievements_unique
  ON public.partner_user_achievements (partner_id, achievement_key);

CREATE UNIQUE INDEX IF NOT EXISTS partner_user_milestones_unique
  ON public.partner_user_milestones (partner_id, tier_key, milestone_percent);

CREATE UNIQUE INDEX IF NOT EXISTS partner_monthly_bonus_grants_unique
  ON public.partner_monthly_bonus_grants (partner_id, bonus_period);

CREATE INDEX IF NOT EXISTS partner_commissions_partner_status_idx
  ON public.partner_commissions (partner_id, status);

CREATE INDEX IF NOT EXISTS partner_commissions_partner_service_idx
  ON public.partner_commissions (partner_id, service_type);

CREATE INDEX IF NOT EXISTS partner_withdrawals_partner_status_idx
  ON public.partner_withdrawals (partner_id, status);

CREATE INDEX IF NOT EXISTS partners_status_tier_idx
  ON public.partners (status, tier_key);

-- Prevent duplicate active withdrawal requests per partner (pending or approved)
CREATE UNIQUE INDEX IF NOT EXISTS partner_withdrawals_one_active_per_partner
  ON public.partner_withdrawals (partner_id)
  WHERE status IN ('pending', 'approved');
