-- HasaN CharT World — IAM RLS dual-mode functions
-- Phase 4: iam_has_permission + iam_is_admin alongside legacy is_admin()

CREATE OR REPLACE FUNCTION public.iam_user_has_active_assignment(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.iam_user_assignments ua
    WHERE ua.user_id = COALESCE(p_user_id, auth.uid())
      AND ua.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.iam_has_permission(p_permission text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_denied boolean;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL OR p_permission IS NULL OR btrim(p_permission) = '' THEN
    RETURN false;
  END IF;

  -- Deny overrides (user overrides + role permissions)
  SELECT EXISTS (
    SELECT 1
    FROM public.iam_user_assignments ua
    JOIN public.iam_role_permissions rp ON rp.role_id = ua.role_id
    WHERE ua.user_id = v_uid
      AND ua.revoked_at IS NULL
      AND rp.permission_id = p_permission
      AND rp.effect = 'deny'
      AND (
        ua.organization_id IS NULL
        OR rp.organization_id IS NULL
        OR ua.organization_id = rp.organization_id
      )
    UNION ALL
    SELECT 1
    FROM public.iam_user_permission_overrides o
    WHERE o.user_id = v_uid
      AND o.permission_id = p_permission
      AND o.effect = 'deny'
      AND o.revoked_at IS NULL
  ) INTO v_denied;

  IF v_denied THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.iam_user_assignments ua
    JOIN public.iam_role_permissions rp ON rp.role_id = ua.role_id
    WHERE ua.user_id = v_uid
      AND ua.revoked_at IS NULL
      AND rp.permission_id = p_permission
      AND rp.effect = 'allow'
      AND (
        ua.organization_id IS NULL
        OR rp.organization_id IS NULL
        OR ua.organization_id = rp.organization_id
      )
    UNION ALL
    SELECT 1
    FROM public.iam_user_permission_overrides o
    WHERE o.user_id = v_uid
      AND o.permission_id = p_permission
      AND o.effect = 'allow'
      AND o.revoked_at IS NULL
  ) INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.iam_is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.iam_user_has_active_assignment(p_user_id);
$$;

COMMENT ON FUNCTION public.iam_has_permission(text, uuid) IS
  'RBAC permission check with deny-wins-over-allow semantics.';

COMMENT ON FUNCTION public.iam_is_admin(uuid) IS
  'True when user has any active IAM role assignment.';

-- Dual-mode admin check: IAM assignment OR legacy profiles.role = admin
CREATE OR REPLACE FUNCTION public.is_admin_dual()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.iam_is_admin()
    OR public.is_admin();
$$;

COMMENT ON FUNCTION public.is_admin_dual() IS
  'Dual-mode: IAM assignment OR legacy profiles.role=admin. Use during migration only.';

-- Grants: iam_has_permission required inside RLS policies for authenticated role
REVOKE ALL ON FUNCTION public.iam_has_permission(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iam_has_permission(text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.iam_user_has_active_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iam_user_has_active_assignment(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.iam_is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iam_is_admin(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_admin_dual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_dual() TO service_role;

-- Harden legacy is_admin search_path (dual-mode only — not used in enforce policies)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Health probe RPC (service_role only) — optional DB snapshot for /api/iam/health
CREATE OR REPLACE FUNCTION public.iam_rls_health_probe()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_policies_without_rls text[];
  v_missing_own text[];
BEGIN
  SELECT coalesce(array_agg(c.relname), ARRAY[]::text[])
  INTO v_policies_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false
    AND EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
        AND (p.policyname LIKE 'iam_%' OR p.policyname LIKE '%admin%')
    );

  SELECT coalesce(array_agg(t), ARRAY[]::text[])
  INTO v_missing_own
  FROM (
    SELECT 'profiles' AS t WHERE to_regclass('public.profiles') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'iam_own_profiles_select')
    UNION ALL
    SELECT 'analysis_requests' WHERE to_regclass('public.analysis_requests') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analysis_requests' AND policyname = 'iam_own_analysis_requests_select')
  ) s;

  RETURN jsonb_build_object(
    'policiesWithoutRls', to_jsonb(v_policies_without_rls),
    'missingOwnPolicy', to_jsonb(v_missing_own),
    'dualPoliciesPresent', EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'iam_dual_%'),
    'enforcePoliciesPresent', EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'iam_enforce_%'),
    'mixedDualEnforce', EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'iam_dual_%')
      AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'iam_enforce_%'),
    'rlsEnabled', EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'profiles' AND c.relrowsecurity
    ),
    'rollbackValidated', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iam_rls_health_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iam_rls_health_probe() TO service_role;
