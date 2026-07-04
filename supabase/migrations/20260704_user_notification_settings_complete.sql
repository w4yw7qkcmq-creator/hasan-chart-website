-- Complete idempotent setup for user_notification_settings (mirrors supabase/sql/user_notification_settings_setup.sql)

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  sound_volume numeric NOT NULL DEFAULT 0.9,
  price_alert_sound_enabled boolean NOT NULL DEFAULT true,
  vip_signal_sound_enabled boolean NOT NULL DEFAULT true,
  breaking_news_sound_enabled boolean NOT NULL DEFAULT true,
  admin_sound_enabled boolean NOT NULL DEFAULT true,
  default_sound_enabled boolean NOT NULL DEFAULT true,
  sound_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_copy_enabled boolean NOT NULL DEFAULT false,
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_start_time text NOT NULL DEFAULT '22:00',
  dnd_end_time text NOT NULL DEFAULT '07:00',
  channel_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notification_settings_volume_range
    CHECK (sound_volume >= 0 AND sound_volume <= 1)
);

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_copy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnd_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnd_start_time text NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS dnd_end_time text NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS channel_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS user_notification_settings_user_id_idx
  ON public.user_notification_settings (user_id);

CREATE OR REPLACE FUNCTION public.set_user_notification_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notification_settings_set_updated_at ON public.user_notification_settings;
CREATE TRIGGER user_notification_settings_set_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.set_user_notification_settings_updated_at();

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users can read own notification settings" ON public.user_notification_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users can insert own notification settings" ON public.user_notification_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification settings" ON public.user_notification_settings;
CREATE POLICY "Users can update own notification settings" ON public.user_notification_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_notification_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_notification_settings TO service_role;
