-- Pin support for Notification Hub.

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS notifications_user_pinned_created_idx
  ON public.notifications (user_email, is_pinned DESC, created_at DESC);

COMMENT ON COLUMN public.notifications.is_pinned IS
  'Pinned notifications appear at the top of Notification Hub';
