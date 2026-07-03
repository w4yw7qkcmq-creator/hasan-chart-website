-- Per-user notification sound preferences (browser/site sounds only).

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  sound_enabled boolean NOT NULL DEFAULT true,
  sound_volume numeric NOT NULL DEFAULT 0.9,
  price_alert_sound_enabled boolean NOT NULL DEFAULT true,
  vip_signal_sound_enabled boolean NOT NULL DEFAULT true,
  breaking_news_sound_enabled boolean NOT NULL DEFAULT true,
  admin_sound_enabled boolean NOT NULL DEFAULT true,
  default_sound_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notification_settings_volume_range
    CHECK (sound_volume >= 0 AND sound_volume <= 1)
);

CREATE INDEX IF NOT EXISTS user_notification_settings_user_id_idx
  ON public.user_notification_settings (user_id);

CREATE OR REPLACE FUNCTION public.set_user_notification_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notification_settings_set_updated_at
  ON public.user_notification_settings;

CREATE TRIGGER user_notification_settings_set_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_user_notification_settings_updated_at();

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notification settings"
  ON public.user_notification_settings;

CREATE POLICY "Users can read own notification settings"
  ON public.user_notification_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification settings"
  ON public.user_notification_settings;

CREATE POLICY "Users can insert own notification settings"
  ON public.user_notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification settings"
  ON public.user_notification_settings;

CREATE POLICY "Users can update own notification settings"
  ON public.user_notification_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_notification_settings TO authenticated;
