-- IAM RLS: own-user and public-read policies (safe layer — does NOT enable RLS)
-- Apply BEFORE enforce migration. Skips absent tables via to_regclass guards.

BEGIN;

CREATE OR REPLACE FUNCTION public._iam_own_apply_policy(
  p_table regclass,
  p_policy_name text,
  p_command text,
  p_using_expr text,
  p_check_expr text DEFAULT NULL,
  p_roles text[] DEFAULT ARRAY['authenticated']::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sql text;
  v_roles text;
BEGIN
  IF p_table IS NULL THEN
    RAISE NOTICE 'IAM own RLS skip: table missing for policy %', p_policy_name;
    RETURN;
  END IF;

  v_roles := array_to_string(
    ARRAY(SELECT format('%I', r) FROM unnest(p_roles) AS r),
    ', '
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', p_policy_name, p_table);

  IF upper(p_command) = 'SELECT' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR SELECT TO %s USING (%s)',
      p_policy_name, p_table, v_roles, p_using_expr
    );
  ELSIF upper(p_command) = 'INSERT' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR INSERT TO %s WITH CHECK (%s)',
      p_policy_name, p_table, v_roles, COALESCE(p_check_expr, p_using_expr)
    );
  ELSIF upper(p_command) = 'UPDATE' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
      p_policy_name, p_table, v_roles, p_using_expr, COALESCE(p_check_expr, p_using_expr)
    );
  ELSIF upper(p_command) = 'DELETE' THEN
    v_sql := format(
      'CREATE POLICY %I ON %s FOR DELETE TO %s USING (%s)',
      p_policy_name, p_table, v_roles, p_using_expr
    );
  ELSE
    RAISE EXCEPTION 'Unsupported policy command: %', p_command;
  END IF;

  EXECUTE v_sql;
  RAISE NOTICE 'IAM own RLS applied: % on %', p_policy_name, p_table;
END;
$$;

REVOKE ALL ON FUNCTION public._iam_own_apply_policy(regclass, text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._iam_own_apply_policy(regclass, text, text, text, text, text[]) TO service_role;

-- Ensure helper for email ownership exists
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated, service_role;

-- profiles sensitive column trigger (backup over column grants)
CREATE OR REPLACE FUNCTION public.profiles_protect_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.iam_has_permission('users.manage') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.role := OLD.role;
  NEW.admin_role := OLD.admin_role;
  NEW.email := OLD.email;
  NEW.subscription_plan := OLD.subscription_plan;
  NEW.subscription_status := OLD.subscription_status;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS profiles_protect_sensitive_columns_trigger ON public.profiles;
    CREATE TRIGGER profiles_protect_sensitive_columns_trigger
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.profiles_protect_sensitive_columns();

    PERFORM public._iam_own_apply_policy(
      'public.profiles'::regclass,
      'iam_own_profiles_select',
      'SELECT',
      'id = auth.uid() OR lower(email) = public.current_user_email()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.profiles'::regclass,
      'iam_own_profiles_insert',
      'INSERT',
      '(id = auth.uid() OR lower(email) = public.current_user_email())',
      $check$coalesce(role, 'user') = 'user'
        AND coalesce(subscription_status, 'غير نشط') NOT IN ('مفعل', 'نشط', 'active')
        AND (subscription_plan IS NULL OR trim(subscription_plan) = '' OR trim(subscription_plan) = 'بدون اشتراك')$check$
    );
    PERFORM public._iam_own_apply_policy(
      'public.profiles'::regclass,
      'iam_own_profiles_update',
      'UPDATE',
      'id = auth.uid() OR lower(email) = public.current_user_email()',
      'id = auth.uid() OR lower(email) = public.current_user_email()'
    );

    REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
    ) THEN
      GRANT UPDATE (username) ON TABLE public.profiles TO authenticated;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'telegram'
    ) THEN
      GRANT UPDATE (telegram) ON TABLE public.profiles TO authenticated;
    END IF;
  END IF;

  IF to_regclass('public.analysis_requests') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.analysis_requests'::regclass,
      'iam_own_analysis_requests_select',
      'SELECT',
      'lower(user_email) = public.current_user_email()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.analysis_requests'::regclass,
      'iam_own_analysis_requests_insert',
      'INSERT',
      'true',
      'lower(user_email) = public.current_user_email()'
    );
  END IF;

  IF to_regclass('public.subscription_requests') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.subscription_requests'::regclass,
      'iam_own_subscription_requests_select',
      'SELECT',
      'lower(user_email) = public.current_user_email()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.subscription_requests'::regclass,
      'iam_own_subscription_requests_insert',
      'INSERT',
      'true',
      'lower(user_email) = public.current_user_email()'
    );
  END IF;

  IF to_regclass('public.account_management_requests') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.account_management_requests'::regclass,
      'iam_own_account_mgmt_select',
      'SELECT',
      'user_id = auth.uid()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.account_management_requests'::regclass,
      'iam_own_account_mgmt_insert',
      'INSERT',
      'true',
      'user_id = auth.uid() AND lower(email) = public.current_user_email()'
    );
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.notifications'::regclass,
      'iam_own_notifications_select',
      'SELECT',
      'lower(user_email) = public.current_user_email()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.notifications'::regclass,
      'iam_own_notifications_update',
      'UPDATE',
      'lower(user_email) = public.current_user_email()',
      'lower(user_email) = public.current_user_email()'
    );
  END IF;

  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.push_subscriptions'::regclass,
      'iam_own_push_subscriptions_select',
      'SELECT',
      'user_id = auth.uid()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.push_subscriptions'::regclass,
      'iam_own_push_subscriptions_insert',
      'INSERT',
      'true',
      'user_id = auth.uid()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.push_subscriptions'::regclass,
      'iam_own_push_subscriptions_update',
      'UPDATE',
      'user_id = auth.uid()',
      'user_id = auth.uid()'
    );
    PERFORM public._iam_own_apply_policy(
      'public.push_subscriptions'::regclass,
      'iam_own_push_subscriptions_delete',
      'DELETE',
      'user_id = auth.uid()'
    );
  END IF;

  IF to_regclass('public.news_posts') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.news_posts'::regclass,
      'iam_public_news_posts_select',
      'SELECT',
      'true',
      NULL,
      ARRAY['anon', 'authenticated']::text[]
    );
  END IF;

  IF to_regclass('public.daily_analysis') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.daily_analysis'::regclass,
      'iam_public_daily_analysis_select',
      'SELECT',
      'published = true',
      NULL,
      ARRAY['anon', 'authenticated']::text[]
    );
  END IF;

  IF to_regclass('public.vip_signals') IS NOT NULL THEN
    PERFORM public._iam_own_apply_policy(
      'public.vip_signals'::regclass,
      'iam_public_vip_signals_select_temp',
      'SELECT',
      'true',
      NULL,
      ARRAY['authenticated']::text[]
    );
  END IF;
END;
$$;

-- Post-check: required own policies exist where tables exist
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(t.table_name || ':' || t.policy_name)
  INTO v_missing
  FROM (
    VALUES
      ('profiles', 'iam_own_profiles_select'),
      ('analysis_requests', 'iam_own_analysis_requests_select'),
      ('subscription_requests', 'iam_own_subscription_requests_select'),
      ('account_management_requests', 'iam_own_account_mgmt_select'),
      ('notifications', 'iam_own_notifications_select'),
      ('push_subscriptions', 'iam_own_push_subscriptions_select'),
      ('news_posts', 'iam_public_news_posts_select'),
      ('daily_analysis', 'iam_public_daily_analysis_select')
  ) AS t(table_name, policy_name)
  WHERE to_regclass('public.' || t.table_name) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = t.table_name
        AND p.policyname = t.policy_name
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'IAM own-user policy post-check failed: missing %', v_missing;
  END IF;
END;
$$;

COMMIT;

COMMENT ON FUNCTION public._iam_own_apply_policy(regclass, text, text, text, text, text[]) IS
  'Internal helper: apply IAM own-user/public RLS policy when target table exists.';
