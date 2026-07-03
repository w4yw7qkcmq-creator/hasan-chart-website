-- Extensible per-key notification sound preferences (JSONB).

ALTER TABLE public.user_notification_settings
ADD COLUMN IF NOT EXISTS sound_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_notification_settings.sound_preferences IS
  'Per notification_key preferences: { "price_alert": { "enabled": true, "sound": "trading-alert", "volume": 0.9 } }';
