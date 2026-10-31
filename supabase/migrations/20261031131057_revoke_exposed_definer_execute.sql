-- P0 grant repair. NOT applied to production by this change.
--
-- Live ACLs granted EXECUTE to anon and authenticated explicitly.
-- Earlier migrations only ran REVOKE ... FROM PUBLIC, which does not
-- remove those explicit grants.
--
-- Default privileges for postgres functions in schema public grant
-- anon and authenticated. The schema-specific REVOKE removes those
-- stored grants and leaves service_role. It does not remove PostgreSQL's
-- hard-wired PUBLIC EXECUTE, and it does not cancel a global default.
-- The global REVOKE removes that hard-wired PUBLIC EXECUTE for future
-- functions created by postgres. It does not grant service_role.
-- service_role is then granted explicitly on schema public so future
-- public functions do not depend on a surviving default entry.
-- supabase_admin defaults are unchanged. Existing function ACLs above
-- are unaffected by ALTER DEFAULT PRIVILEGES.

REVOKE ALL ON FUNCTION public._iam_enforce_apply_policy(regclass, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._iam_own_apply_policy(regclass, text, text, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._iam_require_policies_before_rls(text, text[]) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stale_email_outbox_processing(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_start_email_campaign_sending(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_email_campaign_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email_campaign_recipient_batch(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pause_email_campaign_outbox(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.partner_analytics_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_analytics_charts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_top_referrals(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_leaderboard(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_partner_analytics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_partner_timeline(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_top_partners(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_profiles_effective_classification_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backfill_profiles_user_classification_high_confidence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_profiles_last_sign_in_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_iam_context_v2(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_admin_session_activity_if_stale(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iam_rls_health_probe() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_protect_sensitive_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_profile_last_sign_in_at() FROM PUBLIC, anon, authenticated;

-- iam_has_permission stays executable by authenticated because RLS policies call it.
REVOKE ALL ON FUNCTION public.iam_has_permission(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_dual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_user_has_active_assignment(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._iam_enforce_apply_policy(regclass, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._iam_own_apply_policy(regclass, text, text, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public._iam_require_policies_before_rls(text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_email_outbox_processing(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_start_email_campaign_sending(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_email_campaign_recipients(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_campaign_recipient_batch(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pause_email_campaign_outbox(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_analytics_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_analytics_charts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_top_referrals(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_leaderboard(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_analytics() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_timeline(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_partners(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_profiles_effective_classification_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_profiles_user_classification_high_confidence() TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_profiles_last_sign_in_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_iam_context_v2(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_admin_session_activity_if_stale(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.iam_rls_health_probe() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_protect_sensitive_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_last_sign_in_at() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
