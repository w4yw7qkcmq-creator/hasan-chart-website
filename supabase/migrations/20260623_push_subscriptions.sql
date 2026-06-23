-- Web Push subscriptions for price alerts and site notifications.
-- Access is server-only via service_role (API routes + worker).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  anonymous_id text,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_email_idx
  ON public.push_subscriptions (lower(email));

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_anonymous_id_idx
  ON public.push_subscriptions (anonymous_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- No client policies: subscribe/unsubscribe go through Next.js API with service_role.

REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
