-- IAM RLS: enable RLS on business tables ONLY when minimum policies exist
-- Apply AFTER own-user + enforce migrations

BEGIN;

CREATE OR REPLACE FUNCTION public._iam_require_policies_before_rls(
  p_table text,
  p_required_policies text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing text[];
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'RLS enable skip: table % missing', p_table;
    RETURN;
  END IF;

  SELECT array_agg(req)
  INTO v_missing
  FROM unnest(p_required_policies) AS req
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = p_table
      AND p.policyname = req
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS enable blocked on %: missing policies %', p_table, v_missing;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  RAISE NOTICE 'RLS enabled on public.%', p_table;
END;
$$;

REVOKE ALL ON FUNCTION public._iam_require_policies_before_rls(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._iam_require_policies_before_rls(text, text[]) TO service_role;

DO $$
BEGIN
  PERFORM public._iam_require_policies_before_rls(
    'profiles',
    ARRAY['iam_own_profiles_select', 'iam_enforce_profiles_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'analysis_requests',
    ARRAY['iam_own_analysis_requests_select', 'iam_enforce_analysis_requests_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'subscription_requests',
    ARRAY['iam_own_subscription_requests_select', 'iam_enforce_subscription_requests_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'account_management_requests',
    ARRAY['iam_own_account_mgmt_select', 'iam_enforce_account_mgmt_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'notifications',
    ARRAY['iam_own_notifications_select', 'iam_enforce_notifications_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'push_subscriptions',
    ARRAY['iam_own_push_subscriptions_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'news_posts',
    ARRAY['iam_public_news_posts_select', 'iam_enforce_news_posts_admin_insert']
  );
  PERFORM public._iam_require_policies_before_rls(
    'daily_analysis',
    ARRAY['iam_public_daily_analysis_select', 'iam_enforce_daily_analysis_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'partner_withdrawals',
    ARRAY['iam_enforce_partner_withdrawals_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'price_alerts',
    ARRAY['iam_enforce_price_alerts_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'vip_signals',
    ARRAY['iam_public_vip_signals_select_temp', 'iam_enforce_vip_signals_admin_insert']
  );
  PERFORM public._iam_require_policies_before_rls(
    'partners',
    ARRAY['iam_enforce_partners_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'partner_wallet_ledger',
    ARRAY['iam_enforce_partner_wallet_ledger_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'partner_commissions',
    ARRAY['iam_enforce_partner_commissions_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'partner_program_settings',
    ARRAY['iam_enforce_partner_program_settings_admin_select']
  );
  PERFORM public._iam_require_policies_before_rls(
    'admin_user_notes',
    ARRAY['iam_enforce_admin_user_notes_admin_select']
  );
END;
$$;

-- Post-check: RLS enabled where expected
DO $$
DECLARE
  v_off text[];
BEGIN
  SELECT array_agg(c.relname)
  INTO v_off
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      'profiles', 'analysis_requests', 'subscription_requests',
      'account_management_requests', 'notifications', 'push_subscriptions',
      'news_posts', 'daily_analysis', 'partner_withdrawals', 'price_alerts',
      'vip_signals', 'partners', 'partner_wallet_ledger', 'partner_commissions',
      'partner_program_settings', 'admin_user_notes'
    )
    AND c.relrowsecurity = false;

  IF v_off IS NOT NULL THEN
    RAISE EXCEPTION 'RLS enable post-check: RLS still OFF on %', v_off;
  END IF;
END;
$$;

COMMIT;
