-- IAM RLS integration tests — transaction fixtures with rollback
-- Run against Staging clone ONLY after migrations applied. Never Production.

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS iam_rls_test_log (
  id serial PRIMARY KEY,
  actor text NOT NULL,
  table_name text NOT NULL,
  action text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  passed boolean NOT NULL
);

CREATE OR REPLACE FUNCTION iam_rls_test_assert(
  p_actor text,
  p_table text,
  p_action text,
  p_expected text,
  p_actual boolean
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_expected_bool boolean := lower(p_expected) IN ('allow', 'true', 'pass');
BEGIN
  INSERT INTO iam_rls_test_log(actor, table_name, action, expected, actual, passed)
  VALUES (
    p_actor, p_table, p_action, p_expected,
    CASE WHEN p_actual THEN 'allow' ELSE 'deny' END,
    p_actual = v_expected_bool
  );
  IF p_actual IS DISTINCT FROM v_expected_bool THEN
    RAISE EXCEPTION 'RLS test failed: actor=% table=% action=% expected=% got=%',
      p_actor, p_table, p_action, p_expected, p_actual;
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_a uuid;
  v_super uuid;
  v_support uuid;
  v_accountant uuid;
  v_analyst uuid;
  v_news uuid;
  v_submgr uuid;
BEGIN
  SELECT id INTO v_super FROM public.profiles WHERE email = 'staging@hasanchartworld.com' LIMIT 1;
  SELECT id INTO v_user_a FROM public.profiles WHERE email = 'iam-test-normal-user@staging-hcw.test' LIMIT 1;
  SELECT id INTO v_support FROM public.profiles WHERE email = 'iam-test-support@staging-hcw.test' LIMIT 1;
  SELECT id INTO v_accountant FROM public.profiles WHERE email = 'iam-test-accountant@staging-hcw.test' LIMIT 1;
  SELECT id INTO v_analyst FROM public.profiles WHERE email = 'iam-test-analyst@staging-hcw.test' LIMIT 1;
  SELECT id INTO v_news FROM public.profiles WHERE email = 'iam-test-news-editor@staging-hcw.test' LIMIT 1;
  SELECT id INTO v_submgr FROM public.profiles WHERE email = 'iam-test-subscription-manager@staging-hcw.test' LIMIT 1;

  PERFORM iam_rls_test_assert('anonymous', 'iam_has_permission', 'users.read', 'deny',
    public.iam_has_permission('users.read', NULL));

  PERFORM iam_rls_test_assert('anonymous', 'iam_has_permission', 'empty_perm', 'deny',
    public.iam_has_permission('', v_super));

  PERFORM iam_rls_test_assert('super_admin', 'iam_has_permission', 'iam.manage', 'allow',
    public.iam_has_permission('iam.manage', v_super));

  PERFORM iam_rls_test_assert('normal', 'iam_has_permission', 'users.read', 'deny',
    public.iam_has_permission('users.read', v_user_a));

  PERFORM iam_rls_test_assert('support', 'iam_has_permission', 'users.read', 'allow',
    public.iam_has_permission('users.read', v_support));

  PERFORM iam_rls_test_assert('support', 'iam_has_permission', 'finance.read', 'deny',
    public.iam_has_permission('finance.read', v_support));

  PERFORM iam_rls_test_assert('accountant', 'iam_has_permission', 'finance.read', 'allow',
    public.iam_has_permission('finance.read', v_accountant));

  PERFORM iam_rls_test_assert('accountant', 'iam_has_permission', 'iam.manage', 'deny',
    public.iam_has_permission('iam.manage', v_accountant));

  PERFORM iam_rls_test_assert('analyst', 'iam_has_permission', 'analysis.read', 'allow',
    public.iam_has_permission('analysis.read', v_analyst));

  PERFORM iam_rls_test_assert('analyst', 'iam_has_permission', 'analysis.manage', 'allow',
    public.iam_has_permission('analysis.manage', v_analyst));

  PERFORM iam_rls_test_assert('news_editor', 'iam_has_permission', 'news.manage', 'allow',
    public.iam_has_permission('news.manage', v_news));

  PERFORM iam_rls_test_assert('news_editor', 'iam_has_permission', 'users.read', 'deny',
    public.iam_has_permission('users.read', v_news));

  PERFORM iam_rls_test_assert('subscription_manager', 'iam_has_permission', 'subscriptions.manage', 'allow',
    public.iam_has_permission('subscriptions.manage', v_submgr));

  PERFORM iam_rls_test_assert('subscription_manager', 'iam_has_permission', 'users.read', 'deny',
    public.iam_has_permission('users.read', v_submgr));

  -- Policy existence checks (static after migration)
  IF to_regclass('public.profiles') IS NOT NULL THEN
    PERFORM iam_rls_test_assert('schema', 'profiles', 'own_select_policy', 'allow',
      EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'iam_own_profiles_select'));
    PERFORM iam_rls_test_assert('schema', 'profiles', 'enforce_admin_select', 'allow',
      EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'iam_enforce_profiles_admin_select'));
  END IF;

  IF to_regclass('public.analysis_requests') IS NOT NULL THEN
    PERFORM iam_rls_test_assert('schema', 'analysis_requests', 'own_select_policy', 'allow',
      EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analysis_requests' AND policyname = 'iam_own_analysis_requests_select'));
  END IF;

  IF to_regclass('public.subscription_requests') IS NOT NULL THEN
    PERFORM iam_rls_test_assert('schema', 'subscription_requests', 'own_insert_policy', 'allow',
      EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscription_requests' AND policyname = 'iam_own_subscription_requests_insert'));
  END IF;

  -- No dual policies after enforce (only when enforce layer applied)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'iam_enforce_%') THEN
    PERFORM iam_rls_test_assert('schema', 'global', 'no_dual_after_enforce', 'deny',
      EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'iam_dual_%'));
  END IF;

  -- No legacy is_admin in enforce policies
  PERFORM iam_rls_test_assert('schema', 'global', 'no_legacy_is_admin_in_enforce', 'deny',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE policyname LIKE 'iam_enforce_%'
        AND (coalesce(qual, '') LIKE '%is_admin()%' OR coalesce(with_check, '') LIKE '%is_admin()%')
    ));

  -- RLS enabled on core tables after enable migration
  IF to_regclass('public.profiles') IS NOT NULL THEN
    PERFORM iam_rls_test_assert('schema', 'profiles', 'rls_enabled', 'allow',
      (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'profiles'));
  END IF;
END;
$$;

-- Live row-level tests (uncomment after fixture users seeded on Staging clone):
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
-- SELECT set_config('request.jwt.claim.email', 'iam-test-normal-user@staging-hcw.test', true);
-- PERFORM iam_rls_test_assert('normal_a', 'profiles', 'select_own', 'allow', EXISTS (
--   SELECT 1 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'
-- ));
-- PERFORM iam_rls_test_assert('normal_a', 'profiles', 'select_other', 'deny', NOT EXISTS (
--   SELECT 1 FROM public.profiles WHERE id <> '00000000-0000-0000-0000-000000000101' LIMIT 1
-- ));

SELECT
  count(*) FILTER (WHERE passed) AS passed,
  count(*) FILTER (WHERE NOT passed) AS failed,
  count(*) AS total
FROM iam_rls_test_log;

ROLLBACK;
