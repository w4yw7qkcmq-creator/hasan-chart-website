-- IAM RLS dual-mode policies
-- Phase: legacy is_admin() OR iam_has_permission(...)
-- Skips tables absent on target database (Staging-safe guards).

CREATE OR REPLACE FUNCTION public._iam_dual_apply_policy(
  p_table regclass,
  p_policy_name text,
  p_command text,
  p_using_expr text,
  p_check_expr text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sql text;
BEGIN
  IF p_table IS NULL THEN
    RAISE NOTICE 'IAM dual RLS skip: table missing for policy %', p_policy_name;
    RETURN;
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', p_policy_name, p_table);

  IF upper(p_command) = 'SELECT' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (%s)',
      p_policy_name,
      p_table,
      p_using_expr
    );
  ELSIF upper(p_command) = 'UPDATE' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      p_policy_name,
      p_table,
      p_using_expr,
      COALESCE(p_check_expr, p_using_expr)
    );
  ELSIF upper(p_command) = 'ALL' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      p_policy_name,
      p_table,
      p_using_expr,
      COALESCE(p_check_expr, p_using_expr)
    );
  ELSE
    RAISE EXCEPTION 'Unsupported policy command: %', p_command;
  END IF;

  EXECUTE v_sql;
  RAISE NOTICE 'IAM dual RLS applied: % on %', p_policy_name, p_table;
END;
$$;

REVOKE ALL ON FUNCTION public._iam_dual_apply_policy(regclass, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._iam_dual_apply_policy(regclass, text, text, text, text) TO service_role;

DO $$
BEGIN
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.profiles'),
    'iam_dual_profiles_admin_select',
    'SELECT',
    'public.is_admin() OR public.iam_has_permission(''users.read'')'
  );
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.profiles'),
    'iam_dual_profiles_admin_update',
    'UPDATE',
    'public.is_admin() OR public.iam_has_permission(''users.manage'')'
  );

  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.analysis_requests'),
    'iam_dual_analysis_requests_admin_select',
    'SELECT',
    'public.is_admin() OR public.iam_has_permission(''analysis.read'')'
  );
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.analysis_requests'),
    'iam_dual_analysis_requests_admin_update',
    'UPDATE',
    'public.is_admin() OR public.iam_has_permission(''analysis.manage'')'
  );

  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.subscription_requests'),
    'iam_dual_subscription_requests_admin_select',
    'SELECT',
    'public.is_admin() OR public.iam_has_permission(''subscriptions.read'')'
  );
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.subscription_requests'),
    'iam_dual_subscription_requests_admin_update',
    'UPDATE',
    'public.is_admin() OR public.iam_has_permission(''subscriptions.manage'')'
  );

  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.account_management_requests'),
    'iam_dual_account_mgmt_admin_select',
    'SELECT',
    'public.is_admin() OR public.iam_has_permission(''accounts.read'')'
  );
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.account_management_requests'),
    'iam_dual_account_mgmt_admin_update',
    'UPDATE',
    'public.is_admin() OR public.iam_has_permission(''accounts.secrets.manage'')'
  );

  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.daily_analysis'),
    'iam_dual_daily_analysis_admin_select',
    'SELECT',
    'public.is_admin() OR public.iam_has_permission(''analysis.read'')'
  );
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.daily_analysis'),
    'iam_dual_daily_analysis_admin_write',
    'ALL',
    'public.is_admin() OR public.iam_has_permission(''analysis.publish'')'
  );

  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.partner_withdrawals'),
    'iam_dual_partner_withdrawals_admin_select',
    'SELECT',
    'public.is_admin() OR public.iam_has_permission(''partners.withdrawals.read'')'
  );
  PERFORM public._iam_dual_apply_policy(
    to_regclass('public.partner_withdrawals'),
    'iam_dual_partner_withdrawals_admin_update',
    'UPDATE',
    'public.is_admin() OR public.iam_has_permission(''partners.withdrawals.manage'')'
  );
END;
$$;

COMMENT ON FUNCTION public._iam_dual_apply_policy(regclass, text, text, text, text) IS
  'Internal helper: apply IAM dual RLS policy when target table exists.';
