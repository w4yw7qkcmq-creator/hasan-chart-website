-- IAM RLS rollback: remove enforce admin policies, restore dual-mode admin policies
-- Preserves own-user/public policies. Does NOT disable RLS if own policies remain valid.

BEGIN;

CREATE OR REPLACE FUNCTION public._iam_dual_restore_policy(
  p_table regclass,
  p_policy_name text,
  p_command text,
  p_permission text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expr text;
BEGIN
  IF p_table IS NULL THEN
    RETURN;
  END IF;

  v_expr := format(
    'public.is_admin() OR public.iam_has_permission(%L)',
    p_permission
  );

  PERFORM public._iam_dual_apply_policy(
    p_table,
    p_policy_name,
    p_command,
    v_expr,
    v_expr
  );
END;
$$;

REVOKE ALL ON FUNCTION public._iam_dual_restore_policy(regclass, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._iam_dual_restore_policy(regclass, text, text, text) TO service_role;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'iam_enforce_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END;
$$;

DO $$
BEGIN
  PERFORM public._iam_dual_restore_policy('public.profiles'::regclass, 'iam_dual_profiles_admin_select', 'SELECT', 'users.read');
  PERFORM public._iam_dual_restore_policy('public.profiles'::regclass, 'iam_dual_profiles_admin_update', 'UPDATE', 'users.manage');

  PERFORM public._iam_dual_restore_policy('public.analysis_requests'::regclass, 'iam_dual_analysis_requests_admin_select', 'SELECT', 'analysis.read');
  PERFORM public._iam_dual_restore_policy('public.analysis_requests'::regclass, 'iam_dual_analysis_requests_admin_update', 'UPDATE', 'analysis.manage');

  PERFORM public._iam_dual_restore_policy('public.subscription_requests'::regclass, 'iam_dual_subscription_requests_admin_select', 'SELECT', 'subscriptions.read');
  PERFORM public._iam_dual_restore_policy('public.subscription_requests'::regclass, 'iam_dual_subscription_requests_admin_update', 'UPDATE', 'subscriptions.manage');

  PERFORM public._iam_dual_restore_policy('public.account_management_requests'::regclass, 'iam_dual_account_mgmt_admin_select', 'SELECT', 'accounts.read');
  PERFORM public._iam_dual_restore_policy('public.account_management_requests'::regclass, 'iam_dual_account_mgmt_admin_update', 'UPDATE', 'accounts.secrets.manage');

  PERFORM public._iam_dual_restore_policy('public.daily_analysis'::regclass, 'iam_dual_daily_analysis_admin_select', 'SELECT', 'analysis.read');
  PERFORM public._iam_dual_restore_policy('public.daily_analysis'::regclass, 'iam_dual_daily_analysis_admin_write', 'ALL', 'analysis.publish');

  PERFORM public._iam_dual_restore_policy('public.partner_withdrawals'::regclass, 'iam_dual_partner_withdrawals_admin_select', 'SELECT', 'partners.withdrawals.read');
  PERFORM public._iam_dual_restore_policy('public.partner_withdrawals'::regclass, 'iam_dual_partner_withdrawals_admin_update', 'UPDATE', 'partners.withdrawals.manage');
END;
$$;

-- Post-check
DO $$
DECLARE
  v_enforce int;
  v_dual int;
  v_own_missing text[];
BEGIN
  SELECT count(*) INTO v_enforce FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'iam_enforce_%';
  IF v_enforce > 0 THEN
    RAISE EXCEPTION 'Rollback post-check: % enforce policies remain', v_enforce;
  END IF;

  SELECT count(*) INTO v_dual FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'iam_dual_%';
  IF v_dual < 12 THEN
    RAISE EXCEPTION 'Rollback post-check: expected >=12 dual policies, found %', v_dual;
  END IF;

  SELECT array_agg(t.table_name || ':' || t.policy_name)
  INTO v_own_missing
  FROM (
    VALUES
      ('profiles', 'iam_own_profiles_select'),
      ('analysis_requests', 'iam_own_analysis_requests_select'),
      ('subscription_requests', 'iam_own_subscription_requests_select')
  ) AS t(table_name, policy_name)
  WHERE to_regclass('public.' || t.table_name) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.table_name AND p.policyname = t.policy_name
    );

  IF v_own_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback post-check: own-user policies missing %', v_own_missing;
  END IF;
END;
$$;

COMMIT;
