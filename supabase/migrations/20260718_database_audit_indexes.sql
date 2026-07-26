-- Database Audit 5.1 — performance indexes for high-traffic user/admin queries.
-- Safe: CREATE INDEX IF NOT EXISTS only; no data or business-logic changes.

CREATE INDEX IF NOT EXISTS notifications_user_email_read_created_idx
  ON public.notifications (lower(user_email), is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS analysis_requests_user_email_created_idx
  ON public.analysis_requests (lower(user_email), created_at DESC);

CREATE INDEX IF NOT EXISTS price_alerts_user_email_status_created_idx
  ON public.price_alerts (lower(user_email), status, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_requests_user_email_created_idx
  ON public.subscription_requests (lower(user_email), created_at DESC);

CREATE INDEX IF NOT EXISTS account_mgmt_user_id_created_idx
  ON public.account_management_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON public.profiles (lower(email));

CREATE INDEX IF NOT EXISTS news_posts_created_at_idx
  ON public.news_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS news_posts_slug_idx
  ON public.news_posts (slug)
  WHERE slug IS NOT NULL AND trim(slug) <> '';
