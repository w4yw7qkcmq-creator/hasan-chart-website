-- ⚠️ EMERGENCY ONLY — Staging / controlled environments
-- Restores dual admin policies BEFORE any RLS disable attempt.
-- Does NOT auto-run. Requires explicit operator invocation.
-- Never use on Production without runbook approval.

BEGIN;

-- Step 1: Restore dual policies via _iam_dual_apply_policy (from dual migration)
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'iam_dual_profiles_admin_select'
  ) THEN
    PERFORM public._iam_dual_apply_policy(
      'public.profiles'::regclass,
      'iam_dual_profiles_admin_select',
      'SELECT',
      'public.is_admin() OR public.iam_has_permission(''users.read'')'
    );
  END IF;
END;
$$;

-- Step 2: Drop enforce policies if present
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'iam_enforce_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;

-- Step 3: OPTIONAL disable RLS — commented out by default (unsafe without ops approval)
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Post-check: own-user policies must remain
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'iam_own_profiles_select'
  ) THEN
    RAISE EXCEPTION 'Emergency rollback: iam_own_profiles_select missing — aborting';
  END IF;
END;
$$;

COMMIT;

COMMENT ON SCHEMA public IS 'IAM emergency disable migration applied — dual policies restored; RLS NOT disabled by default';
