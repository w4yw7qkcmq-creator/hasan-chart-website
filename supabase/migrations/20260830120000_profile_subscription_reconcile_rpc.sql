-- Narrow backend reconciliation for profiles.subscription_status / subscription_plan.
-- Derives cache fields from authoritative subscription_requests only.
-- Scope: service_role RPC + trigger bypass flag for subscription cache columns.

BEGIN;

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

  IF current_setting('app.profile_subscription_reconcile', true) = '1' THEN
    NEW.role := OLD.role;
    NEW.admin_role := OLD.admin_role;
    NEW.email := OLD.email;
    NEW.created_at := OLD.created_at;
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

CREATE OR REPLACE FUNCTION public.reconcile_profile_subscription_from_requests(p_user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_user_email, '')));
  v_plan_text text;
  v_status text;
  v_active_count integer := 0;
  v_profiles_updated integer := 0;
  v_final_status text;
  v_final_plan text;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invalid-email'
    );
  END IF;

  SELECT
    count(*)::integer,
    coalesce(
      nullif(
        string_agg(
          trim(both ' ' from concat_ws(' ', nullif(trim(sr.plan_name), ''), nullif(trim(sr.category), ''))),
          ' | '
          ORDER BY sr.created_at DESC
        ),
        ''
      ),
      'بدون اشتراك'
    )
  INTO v_active_count, v_plan_text
  FROM public.subscription_requests sr
  WHERE lower(sr.user_email) = v_email
    AND sr.status IN ('مفعل', 'نشط', 'active')
    AND coalesce(sr.admin_disabled, false) = false
    AND (sr.expires_at IS NULL OR sr.expires_at > now());

  IF v_active_count > 0 THEN
    v_status := 'نشط';
    v_plan_text := coalesce(nullif(v_plan_text, ''), 'بدون اشتراك');
  ELSE
    v_status := 'غير نشط';
    v_plan_text := 'بدون اشتراك';
  END IF;

  PERFORM set_config('app.profile_subscription_reconcile', '1', true);

  UPDATE public.profiles p
  SET
    subscription_status = v_status,
    subscription_plan = v_plan_text
  WHERE lower(p.email) = v_email;

  GET DIAGNOSTICS v_profiles_updated = ROW_COUNT;

  SELECT p.subscription_status, p.subscription_plan
  INTO v_final_status, v_final_plan
  FROM public.profiles p
  WHERE lower(p.email) = v_email;

  RETURN jsonb_build_object(
    'success', true,
    'profiles_updated', v_profiles_updated,
    'active_request_count', v_active_count,
    'expected_status', v_status,
    'expected_plan', v_plan_text,
    'actual_status', v_final_status,
    'actual_plan', v_final_plan,
    'profile_matched', (
      v_final_status IS NOT DISTINCT FROM v_status
      AND v_final_plan IS NOT DISTINCT FROM v_plan_text
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_profile_subscription_from_requests(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_profile_subscription_from_requests(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_profile_subscription_from_requests(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_profile_subscription_from_requests(text) TO service_role;

COMMENT ON FUNCTION public.reconcile_profile_subscription_from_requests(text) IS
  'Derives profiles.subscription_status/subscription_plan from active subscription_requests for one email. service_role only.';

COMMIT;
