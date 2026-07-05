-- Partner Program — Phase 2
-- Unique visits tracking + enriched commission/referral fields

CREATE TABLE IF NOT EXISTS public.partner_unique_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, visitor_key)
);

CREATE INDEX IF NOT EXISTS partner_unique_visits_partner_id_idx
  ON public.partner_unique_visits (partner_id);

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS invited_username text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.partner_referrals
  ADD COLUMN IF NOT EXISTS referred_username text;

ALTER TABLE public.partner_unique_visits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_unique_visits FROM anon, authenticated;
GRANT ALL ON public.partner_unique_visits TO service_role;
