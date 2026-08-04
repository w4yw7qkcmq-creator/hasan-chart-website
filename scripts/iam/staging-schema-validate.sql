-- IAM Staging schema validation (read-only)
SELECT current_database() AS db_name;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'iam_%'
ORDER BY table_name;

SELECT p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'iam_has_permission',
    'iam_is_admin',
    'iam_user_has_active_assignment',
    'is_admin_dual',
    '_iam_dual_apply_policy'
  )
ORDER BY p.proname;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'iam_%'
ORDER BY c.relname;

SELECT id, enabled, secret_hash IS NULL AS secret_null, revoked_at IS NOT NULL AS revoked
FROM public.iam_service_accounts
ORDER BY id;

SELECT id, completed_at, completed_by
FROM public.iam_bootstrap_state;

SELECT count(*)::int AS active_assignments
FROM public.iam_user_assignments
WHERE revoked_at IS NULL;

SELECT count(*)::int AS roles_seeded FROM public.iam_roles;
SELECT count(*)::int AS permissions_seeded FROM public.iam_permissions;

SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'iam_%'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
ORDER BY table_name, grantee, privilege_type;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) LIKE '%search_path = public, pg_temp%' AS search_path_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('iam_has_permission', 'iam_is_admin', 'iam_user_has_active_assignment', 'is_admin_dual', '_iam_dual_apply_policy');

SELECT pol.tablename, pol.policyname, pol.cmd
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.policyname LIKE 'iam_dual_%'
ORDER BY pol.tablename, pol.policyname;
