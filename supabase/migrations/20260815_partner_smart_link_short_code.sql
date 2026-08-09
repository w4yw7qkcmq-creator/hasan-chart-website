-- Additive short public code for partner smart links (canonical /r/<short_code> URLs).
BEGIN;

ALTER TABLE public.partner_smart_links
  ADD COLUMN IF NOT EXISTS short_code text;

ALTER TABLE public.partner_smart_links
  DROP CONSTRAINT IF EXISTS partner_smart_links_short_code_format;

ALTER TABLE public.partner_smart_links
  ADD CONSTRAINT partner_smart_links_short_code_format
  CHECK (short_code IS NULL OR short_code ~ '^[A-Za-z0-9]{6,10}$');

CREATE UNIQUE INDEX IF NOT EXISTS partner_smart_links_short_code_unique_idx
  ON public.partner_smart_links (short_code)
  WHERE short_code IS NOT NULL;

COMMIT;
