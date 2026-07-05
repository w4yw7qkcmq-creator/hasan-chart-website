-- Partner Tiers & Levels — Phase 6

CREATE TABLE IF NOT EXISTS public.partner_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key text NOT NULL UNIQUE,
  tier_name text NOT NULL,
  commission_percent numeric(7, 4) NOT NULL CHECK (commission_percent >= 0),
  min_active_referrals integer NOT NULL DEFAULT 0 CHECK (min_active_referrals >= 0),
  min_total_sales numeric(12, 2) NOT NULL DEFAULT 0 CHECK (min_total_sales >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS tier_key text NOT NULL DEFAULT 'partner',
  ADD COLUMN IF NOT EXISTS tier_updated_at timestamptz;

UPDATE public.partners
SET tier_key = 'partner'
WHERE tier_key IS NULL OR tier_key = '' OR tier_key = 'standard';

INSERT INTO public.partner_tiers (
  tier_key,
  tier_name,
  commission_percent,
  min_active_referrals,
  min_total_sales,
  is_active,
  sort_order
) VALUES
  ('partner', 'Partner', 10, 0, 0, true, 1),
  ('silver', 'Silver', 15, 3, 100, true, 2),
  ('gold', 'Gold', 20, 10, 500, true, 3),
  ('platinum', 'Platinum', 25, 25, 1500, true, 4),
  ('diamond', 'Diamond', 30, 50, 5000, true, 5)
ON CONFLICT (tier_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS partners_tier_key_idx ON public.partners (tier_key);

ALTER TABLE public.partner_tiers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_tiers FROM anon, authenticated;
GRANT ALL ON public.partner_tiers TO service_role;
