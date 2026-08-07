-- Align notifications.message with production schema (site/in-app notifications body).
-- Safe for all environments: IF NOT EXISTS, nullable text, no data loss.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message text;

COMMENT ON COLUMN public.notifications.message IS
  'In-app notification body text shown in Notification Center';

COMMIT;
