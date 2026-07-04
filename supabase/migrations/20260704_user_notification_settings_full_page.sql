-- Full notification settings page: master toggle for all notification delivery.

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_notification_settings.notifications_enabled IS
  'Master toggle: when false, all notification delivery (in-app, push, email, sound) is blocked.';

COMMENT ON COLUMN public.user_notification_settings.channel_preferences IS
  'Per notification_key preferences: { "price_alert": { "enabled": true, "push_enabled": true, "email_enabled": true } }';
