-- PROPOSED ONLY — do not apply automatically.
-- Review and run manually in Supabase SQL Editor after staging validation.
-- Complements existing indexes from:
--   202607048_notifications_hub_pin.sql (notifications_user_pinned_created_idx)
--   20260718_database_audit_indexes.sql (notifications_user_email_read_created_idx)
--   20260719_vip_signals_list_index.sql (vip_signals_type_created_idx)

-- Speeds unread badge count: head=true count filtered by user + is_read=false.
-- Partial index keeps the btree small (unread rows only).
CREATE INDEX IF NOT EXISTS notifications_user_email_unread_created_idx
  ON public.notifications (lower(user_email), created_at DESC)
  WHERE is_read = false;

COMMENT ON INDEX notifications_user_email_unread_created_idx IS
  'Proposed: faster unread count for notification bell and hub feed.';

-- Covers hub feed default ordering (pinned first, then recency) per user.
-- May overlap notifications_user_pinned_created_idx; compare pg_stat_user_indexes before adding.
CREATE INDEX IF NOT EXISTS notifications_user_email_pinned_created_id_idx
  ON public.notifications (lower(user_email), is_pinned DESC, created_at DESC, id DESC);

COMMENT ON INDEX notifications_user_email_pinned_created_id_idx IS
  'Proposed: list query with is_pinned + created_at + id ordering for notification hub.';

-- Supports VIP signals paginated list (signal_type filter + created_at DESC + offset/limit).
-- vip_signals_type_created_idx may already cover this; verify with EXPLAIN ANALYZE first.
CREATE INDEX IF NOT EXISTS vip_signals_type_created_id_idx
  ON public.vip_signals (signal_type, created_at DESC, id DESC);

COMMENT ON INDEX vip_signals_type_created_id_idx IS
  'Proposed: stable pagination for VIP signals by type and recency.';
