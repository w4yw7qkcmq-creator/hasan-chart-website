-- Soft-archive timestamp for partner smart links (status=disabled remains source of truth).
BEGIN;

ALTER TABLE public.partner_smart_links
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMIT;
