-- Partner Center Phase 3 — Smart link per-link attribution identity (additive)
-- Links attribution sessions and referral attributions to partner_smart_links.

ALTER TABLE public.partner_attribution_sessions
  ADD COLUMN IF NOT EXISTS smart_link_id uuid REFERENCES public.partner_smart_links(id) ON DELETE SET NULL;

ALTER TABLE public.partner_referral_attributions
  ADD COLUMN IF NOT EXISTS smart_link_id uuid REFERENCES public.partner_smart_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS partner_attribution_sessions_smart_link_idx
  ON public.partner_attribution_sessions (smart_link_id, first_touch_at DESC)
  WHERE smart_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS partner_referral_attributions_smart_link_idx
  ON public.partner_referral_attributions (smart_link_id)
  WHERE smart_link_id IS NOT NULL;

COMMENT ON COLUMN public.partner_attribution_sessions.smart_link_id IS
  'Nullable FK to partner_smart_links — first-touch smart link for click attribution.';
COMMENT ON COLUMN public.partner_referral_attributions.smart_link_id IS
  'Nullable FK to partner_smart_links — preserved from session at signup (first-touch).';
