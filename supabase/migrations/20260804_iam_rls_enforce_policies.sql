-- IAM RLS enforce-only admin policies (complete package)
-- Requires: 20260804_iam_rls_functions.sql + 20260804_iam_rls_user_ownership_policies.sql
-- Does NOT enable RLS — see 20260804_iam_rls_enable_business_tables.sql

BEGIN;

CREATE OR REPLACE FUNCTION public._iam_enforce_apply_policy(
  p_table regclass,
  p_policy_name text,
  p_command text,
  p_permission text,
  p_check_permission text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sql text;
  v_using text;
  v_check text;
BEGIN
  IF p_table IS NULL THEN
    RAISE NOTICE 'IAM enforce skip: table missing for policy %', p_policy_name;
    RETURN;
  END IF;

  v_using := format('public.iam_has_permission(%L)', p_permission);
  v_check := format('public.iam_has_permission(%L)', COALESCE(p_check_permission, p_permission));

  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', p_policy_name, p_table);

  IF upper(p_command) = 'SELECT' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (%s)',
      p_policy_name, p_table, v_using
    );
  ELSIF upper(p_command) = 'INSERT' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR INSERT TO authenticated WITH CHECK (%s)',
      p_policy_name, p_table, v_check
    );
  ELSIF upper(p_command) = 'UPDATE' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      p_policy_name, p_table, v_using, v_check
    );
  ELSIF upper(p_command) = 'DELETE' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR DELETE TO authenticated USING (%s)',
      p_policy_name, p_table, v_using
    );
  ELSE
    RAISE EXCEPTION 'Unsupported policy command: %', p_command;
  END IF;

  EXECUTE v_sql;
END;
$$;

REVOKE ALL ON FUNCTION public._iam_enforce_apply_policy(regclass, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._iam_enforce_apply_policy(regclass, text, text, text, text) TO service_role;

DO $$
BEGIN
  -- Drop legacy is_admin() admin policies replaced by IAM enforce
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
    DROP POLICY IF EXISTS iam_dual_profiles_admin_select ON public.profiles;
    DROP POLICY IF EXISTS iam_dual_profiles_admin_update ON public.profiles;
    PERFORM public._iam_enforce_apply_policy('public.profiles'::regclass, 'iam_enforce_profiles_admin_select', 'SELECT', 'users.read');
    PERFORM public._iam_enforce_apply_policy('public.profiles'::regclass, 'iam_enforce_profiles_admin_insert', 'INSERT', 'users.manage');
    PERFORM public._iam_enforce_apply_policy('public.profiles'::regclass, 'iam_enforce_profiles_admin_update', 'UPDATE', 'users.manage');
    PERFORM public._iam_enforce_apply_policy('public.profiles'::regclass, 'iam_enforce_profiles_admin_delete', 'DELETE', 'users.manage');
  END IF;

  IF to_regclass('public.analysis_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "analysis_requests_admin_all" ON public.analysis_requests;
    DROP POLICY IF EXISTS iam_dual_analysis_requests_admin_select ON public.analysis_requests;
    DROP POLICY IF EXISTS iam_dual_analysis_requests_admin_update ON public.analysis_requests;
    PERFORM public._iam_enforce_apply_policy('public.analysis_requests'::regclass, 'iam_enforce_analysis_requests_admin_select', 'SELECT', 'analysis.read');
    PERFORM public._iam_enforce_apply_policy('public.analysis_requests'::regclass, 'iam_enforce_analysis_requests_admin_update', 'UPDATE', 'analysis.manage');
    PERFORM public._iam_enforce_apply_policy('public.analysis_requests'::regclass, 'iam_enforce_analysis_requests_admin_delete', 'DELETE', 'analysis.manage');
  END IF;

  IF to_regclass('public.subscription_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "subscription_requests_admin_all" ON public.subscription_requests;
    DROP POLICY IF EXISTS iam_dual_subscription_requests_admin_select ON public.subscription_requests;
    DROP POLICY IF EXISTS iam_dual_subscription_requests_admin_update ON public.subscription_requests;
    PERFORM public._iam_enforce_apply_policy('public.subscription_requests'::regclass, 'iam_enforce_subscription_requests_admin_select', 'SELECT', 'subscriptions.read');
    PERFORM public._iam_enforce_apply_policy('public.subscription_requests'::regclass, 'iam_enforce_subscription_requests_admin_update', 'UPDATE', 'subscriptions.manage');
    PERFORM public._iam_enforce_apply_policy('public.subscription_requests'::regclass, 'iam_enforce_subscription_requests_admin_delete', 'DELETE', 'subscriptions.manage');
  END IF;

  IF to_regclass('public.account_management_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "account_mgmt_admin_all" ON public.account_management_requests;
    DROP POLICY IF EXISTS iam_dual_account_mgmt_admin_select ON public.account_management_requests;
    DROP POLICY IF EXISTS iam_dual_account_mgmt_admin_update ON public.account_management_requests;
    PERFORM public._iam_enforce_apply_policy('public.account_management_requests'::regclass, 'iam_enforce_account_mgmt_admin_select', 'SELECT', 'accounts.read');
    PERFORM public._iam_enforce_apply_policy('public.account_management_requests'::regclass, 'iam_enforce_account_mgmt_admin_update', 'UPDATE', 'accounts.secrets.manage');
    PERFORM public._iam_enforce_apply_policy('public.account_management_requests'::regclass, 'iam_enforce_account_mgmt_admin_delete', 'DELETE', 'accounts.secrets.manage');
  END IF;

  IF to_regclass('public.daily_analysis') IS NOT NULL THEN
    DROP POLICY IF EXISTS iam_dual_daily_analysis_admin_select ON public.daily_analysis;
    DROP POLICY IF EXISTS iam_dual_daily_analysis_admin_write ON public.daily_analysis;
    DROP POLICY IF EXISTS "daily_analysis_admin_insert" ON public.daily_analysis;
    DROP POLICY IF EXISTS "daily_analysis_admin_update" ON public.daily_analysis;
    DROP POLICY IF EXISTS "daily_analysis_admin_delete" ON public.daily_analysis;
    PERFORM public._iam_enforce_apply_policy('public.daily_analysis'::regclass, 'iam_enforce_daily_analysis_admin_select', 'SELECT', 'analysis.read');
    PERFORM public._iam_enforce_apply_policy('public.daily_analysis'::regclass, 'iam_enforce_daily_analysis_admin_insert', 'INSERT', 'analysis.publish');
    PERFORM public._iam_enforce_apply_policy('public.daily_analysis'::regclass, 'iam_enforce_daily_analysis_admin_update', 'UPDATE', 'analysis.publish');
    PERFORM public._iam_enforce_apply_policy('public.daily_analysis'::regclass, 'iam_enforce_daily_analysis_admin_delete', 'DELETE', 'analysis.publish');
  END IF;

  IF to_regclass('public.partner_withdrawals') IS NOT NULL THEN
    DROP POLICY IF EXISTS iam_dual_partner_withdrawals_admin_select ON public.partner_withdrawals;
    DROP POLICY IF EXISTS iam_dual_partner_withdrawals_admin_update ON public.partner_withdrawals;
    PERFORM public._iam_enforce_apply_policy('public.partner_withdrawals'::regclass, 'iam_enforce_partner_withdrawals_admin_select', 'SELECT', 'partners.withdrawals.read');
    PERFORM public._iam_enforce_apply_policy('public.partner_withdrawals'::regclass, 'iam_enforce_partner_withdrawals_admin_update', 'UPDATE', 'partners.withdrawals.manage');
  END IF;

  IF to_regclass('public.price_alerts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "price_alerts_admin_select" ON public.price_alerts;
    DROP POLICY IF EXISTS "price_alerts_admin_update" ON public.price_alerts;
    DROP POLICY IF EXISTS "price_alerts_admin_delete" ON public.price_alerts;
    PERFORM public._iam_enforce_apply_policy('public.price_alerts'::regclass, 'iam_enforce_price_alerts_admin_select', 'SELECT', 'dashboard.read');
    PERFORM public._iam_enforce_apply_policy('public.price_alerts'::regclass, 'iam_enforce_price_alerts_admin_update', 'UPDATE', 'dashboard.mutations');
    PERFORM public._iam_enforce_apply_policy('public.price_alerts'::regclass, 'iam_enforce_price_alerts_admin_delete', 'DELETE', 'dashboard.mutations');
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
    PERFORM public._iam_enforce_apply_policy('public.notifications'::regclass, 'iam_enforce_notifications_admin_select', 'SELECT', 'users.read');
    PERFORM public._iam_enforce_apply_policy('public.notifications'::regclass, 'iam_enforce_notifications_admin_insert', 'INSERT', 'support.manage');
    PERFORM public._iam_enforce_apply_policy('public.notifications'::regclass, 'iam_enforce_notifications_admin_update', 'UPDATE', 'support.manage');
    PERFORM public._iam_enforce_apply_policy('public.notifications'::regclass, 'iam_enforce_notifications_admin_delete', 'DELETE', 'support.manage');
  END IF;

  IF to_regclass('public.vip_signals') IS NOT NULL THEN
    DROP POLICY IF EXISTS "vip_signals_admin_insert" ON public.vip_signals;
    DROP POLICY IF EXISTS "vip_signals_admin_update" ON public.vip_signals;
    DROP POLICY IF EXISTS "vip_signals_admin_delete" ON public.vip_signals;
    DROP POLICY IF EXISTS "vip_signals_authenticated_select_temp" ON public.vip_signals;
    DROP POLICY IF EXISTS "vip_signals_admin_all" ON public.vip_signals;
    -- Keep iam_public_vip_signals_select_temp from ownership migration
    PERFORM public._iam_enforce_apply_policy('public.vip_signals'::regclass, 'iam_enforce_vip_signals_admin_insert', 'INSERT', 'dashboard.mutations');
    PERFORM public._iam_enforce_apply_policy('public.vip_signals'::regclass, 'iam_enforce_vip_signals_admin_update', 'UPDATE', 'dashboard.mutations');
    PERFORM public._iam_enforce_apply_policy('public.vip_signals'::regclass, 'iam_enforce_vip_signals_admin_delete', 'DELETE', 'dashboard.mutations');
  END IF;

  IF to_regclass('public.news_posts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "news_posts_admin_write" ON public.news_posts;
    DROP POLICY IF EXISTS "news_posts_admin_update" ON public.news_posts;
    DROP POLICY IF EXISTS "news_posts_admin_delete" ON public.news_posts;
    PERFORM public._iam_enforce_apply_policy('public.news_posts'::regclass, 'iam_enforce_news_posts_admin_insert', 'INSERT', 'news.manage');
    PERFORM public._iam_enforce_apply_policy('public.news_posts'::regclass, 'iam_enforce_news_posts_admin_update', 'UPDATE', 'news.manage');
    PERFORM public._iam_enforce_apply_policy('public.news_posts'::regclass, 'iam_enforce_news_posts_admin_delete', 'DELETE', 'news.manage');
  END IF;

  IF to_regclass('public.partners') IS NOT NULL THEN
    PERFORM public._iam_enforce_apply_policy('public.partners'::regclass, 'iam_enforce_partners_admin_select', 'SELECT', 'partners.read');
    PERFORM public._iam_enforce_apply_policy('public.partners'::regclass, 'iam_enforce_partners_admin_update', 'UPDATE', 'partners.settings.manage');
  END IF;

  IF to_regclass('public.partner_wallet_ledger') IS NOT NULL THEN
    PERFORM public._iam_enforce_apply_policy('public.partner_wallet_ledger'::regclass, 'iam_enforce_partner_wallet_ledger_admin_select', 'SELECT', 'partners.finance.read');
  END IF;

  IF to_regclass('public.partner_commissions') IS NOT NULL THEN
    PERFORM public._iam_enforce_apply_policy('public.partner_commissions'::regclass, 'iam_enforce_partner_commissions_admin_select', 'SELECT', 'partners.finance.read');
    PERFORM public._iam_enforce_apply_policy('public.partner_commissions'::regclass, 'iam_enforce_partner_commissions_admin_update', 'UPDATE', 'partners.jobs.run');
  END IF;

  IF to_regclass('public.partner_program_settings') IS NOT NULL THEN
    PERFORM public._iam_enforce_apply_policy('public.partner_program_settings'::regclass, 'iam_enforce_partner_program_settings_admin_select', 'SELECT', 'partners.settings.read');
    PERFORM public._iam_enforce_apply_policy('public.partner_program_settings'::regclass, 'iam_enforce_partner_program_settings_admin_update', 'UPDATE', 'partners.settings.manage');
  END IF;

  IF to_regclass('public.admin_user_notes') IS NOT NULL THEN
    PERFORM public._iam_enforce_apply_policy('public.admin_user_notes'::regclass, 'iam_enforce_admin_user_notes_admin_select', 'SELECT', 'users.notes.manage');
    PERFORM public._iam_enforce_apply_policy('public.admin_user_notes'::regclass, 'iam_enforce_admin_user_notes_admin_insert', 'INSERT', 'users.notes.manage');
    PERFORM public._iam_enforce_apply_policy('public.admin_user_notes'::regclass, 'iam_enforce_admin_user_notes_admin_update', 'UPDATE', 'users.notes.manage');
    PERFORM public._iam_enforce_apply_policy('public.admin_user_notes'::regclass, 'iam_enforce_admin_user_notes_admin_delete', 'DELETE', 'users.notes.manage');
  END IF;
END;
$$;

-- Post-check assertions
DO $$
DECLARE
  v_dual_remaining int;
  v_legacy_is_admin int;
  v_enforce_count int;
  v_open_policy int;
BEGIN
  SELECT count(*) INTO v_dual_remaining
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE 'iam_dual_%';

  IF v_dual_remaining > 0 THEN
    RAISE EXCEPTION 'Enforce post-check: % dual policies still present', v_dual_remaining;
  END IF;

  SELECT count(*) INTO v_legacy_is_admin
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      coalesce(qual, '') LIKE '%is_admin()%'
      OR coalesce(with_check, '') LIKE '%is_admin()%'
    )
    AND policyname NOT LIKE 'iam_%';

  IF v_legacy_is_admin > 0 THEN
    RAISE EXCEPTION 'Enforce post-check: % legacy is_admin() policies remain', v_legacy_is_admin;
  END IF;

  SELECT count(*) INTO v_enforce_count
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE 'iam_enforce_%';

  IF v_enforce_count < 43 THEN
    RAISE EXCEPTION 'Enforce post-check: expected >=43 enforce policies, found %', v_enforce_count;
  END IF;

  SELECT count(*) INTO v_open_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE 'iam_enforce_%'
    AND (
      (cmd IN ('SELECT', 'UPDATE', 'DELETE') AND coalesce(qual, '') IN ('true', '(true)'))
      OR (cmd = 'INSERT' AND coalesce(with_check, '') IN ('true', '(true)'))
    );

  IF v_open_policy > 0 THEN
    RAISE EXCEPTION 'Enforce post-check: % unrestricted authenticated enforce policies', v_open_policy;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual LIKE '%is_admin_dual%' OR with_check LIKE '%is_admin_dual%')
  ) THEN
    RAISE EXCEPTION 'Enforce post-check: is_admin_dual() found in policies';
  END IF;
END;
$$;

COMMIT;
