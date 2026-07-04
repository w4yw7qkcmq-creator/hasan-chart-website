-- Phase 1: channel preferences, email copy, and do-not-disturb on user_notification_settings.

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS email_copy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnd_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnd_start_time text NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS dnd_end_time text NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS channel_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_notification_settings.channel_preferences IS
  'Per notification_key channel toggles: { "price_alert": { "enabled": true }, "vip_signal": { "enabled": true } }';

COMMENT ON COLUMN public.user_notification_settings.email_copy_enabled IS
  'When true, eligible notifications may also be sent as email copies.';

COMMENT ON COLUMN public.user_notification_settings.dnd_enabled IS
  'Do-not-disturb master toggle (stored for future enforcement).';

COMMENT ON COLUMN public.user_notification_settings.dnd_start_time IS
  'Local time HH:MM when DND starts.';

COMMENT ON COLUMN public.user_notification_settings.dnd_end_time IS
  'Local time HH:MM when DND ends.';
