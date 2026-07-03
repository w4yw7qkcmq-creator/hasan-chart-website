-- Optional event fields for Notification Center (backward compatible).

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS notification_key text;

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS url text;

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.notification_key IS
  'Notification Center key, e.g. price_alert, vip_signal';

COMMENT ON COLUMN public.notifications.url IS
  'Target URL when the notification is clicked';

COMMENT ON COLUMN public.notifications.metadata IS
  'Extra JSON payload for Notification Center rendering';
