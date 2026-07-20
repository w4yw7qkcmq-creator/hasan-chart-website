-- Admin dashboard performance indexes (APPLY MANUALLY — not auto-deployed).
-- Run each statement separately in Supabase SQL Editor outside a transaction.
-- Required because CREATE INDEX CONCURRENTLY cannot run inside BEGIN/COMMIT.
--
-- Serves loadAdminDashboardSection() in lib/admin-dashboard-sections.js:
--   stats counts, overview pending feeds, and tab lists (LIMIT 20).
--
-- Existing related indexes (NOT duplicated here):
--   analysis_requests_user_email_created_idx        (lower(user_email), created_at DESC)
--   subscription_requests_user_email_created_idx    (lower(user_email), created_at DESC)
--   account_mgmt_user_id_created_idx              (user_id, created_at DESC)
--   partner_withdrawals_status_idx                  (status) — reused for stats pending count
--   partner_withdrawals_partner_status_idx          (partner_id, status)
--   notifications_user_email_read_created_idx       (admin hub — not dashboard section queries)

-- section=analysis: ORDER BY created_at DESC LIMIT 20
CREATE INDEX CONCURRENTLY IF NOT EXISTS analysis_requests_admin_created_at_idx
  ON public.analysis_requests (created_at DESC);

COMMENT ON INDEX public.analysis_requests_admin_created_at_idx IS
  'Admin analysis tab: recent requests ordered by created_at DESC with LIMIT.';

-- section=overview + stats: status IN (...) ORDER BY created_at DESC LIMIT 3; counts filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS analysis_requests_admin_status_created_at_idx
  ON public.analysis_requests (status, created_at DESC);

COMMENT ON INDEX public.analysis_requests_admin_status_created_at_idx IS
  'Admin overview pending analysis feed and stats counts filtered by status.';

-- section=accounts: ORDER BY created_at DESC LIMIT 20
CREATE INDEX CONCURRENTLY IF NOT EXISTS account_management_requests_admin_created_at_idx
  ON public.account_management_requests (created_at DESC);

COMMENT ON INDEX public.account_management_requests_admin_created_at_idx IS
  'Admin accounts tab: recent account management requests by created_at DESC.';

-- section=overview + stats: status IN (...) ORDER BY created_at DESC LIMIT 3; counts filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS account_management_requests_admin_status_created_at_idx
  ON public.account_management_requests (status, created_at DESC);

COMMENT ON INDEX public.account_management_requests_admin_status_created_at_idx IS
  'Admin overview pending accounts feed and stats counts filtered by status.';

-- section=subscriptions: ORDER BY created_at DESC LIMIT 20
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscription_requests_admin_created_at_idx
  ON public.subscription_requests (created_at DESC);

COMMENT ON INDEX public.subscription_requests_admin_created_at_idx IS
  'Admin subscriptions tab: recent subscription requests by created_at DESC.';

-- section=overview + stats: status IN (...) ORDER BY created_at DESC LIMIT 3; counts filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscription_requests_admin_status_created_at_idx
  ON public.subscription_requests (status, created_at DESC);

COMMENT ON INDEX public.subscription_requests_admin_status_created_at_idx IS
  'Admin overview pending subscriptions feed and stats counts filtered by status.';

-- section=users: ORDER BY created_at DESC LIMIT 20
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_admin_created_at_idx
  ON public.profiles (created_at DESC);

COMMENT ON INDEX public.profiles_admin_created_at_idx IS
  'Admin users section: recent profiles ordered by created_at DESC.';

-- section=withdrawals + overview: status = pending ORDER BY created_at DESC LIMIT 5/20
CREATE INDEX CONCURRENTLY IF NOT EXISTS partner_withdrawals_admin_pending_created_at_idx
  ON public.partner_withdrawals (created_at DESC)
  WHERE status = 'pending';

COMMENT ON INDEX public.partner_withdrawals_admin_pending_created_at_idx IS
  'Admin pending partner withdrawals feed ordered by created_at DESC.';
