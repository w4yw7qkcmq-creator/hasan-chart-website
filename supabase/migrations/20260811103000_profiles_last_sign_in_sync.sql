-- Minimal profiles.last_sign_in_at sync (idempotent)
-- Scope: column sync from auth.users.last_sign_in_at only.
-- Does NOT touch IAM, financial tables, or auth.users schema.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_last_sign_in_at_idx
  ON public.profiles (last_sign_in_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.sync_profile_last_sign_in_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.profiles
    SET last_sign_in_at = NEW.last_sign_in_at
    WHERE id = NEW.id
      AND (last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_last_sign_in ON auth.users;

CREATE TRIGGER on_auth_user_last_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_last_sign_in_at();

CREATE OR REPLACE FUNCTION public.reconcile_profiles_last_sign_in_at()
RETURNS TABLE(updated_count bigint, eligible_auth_populated bigint, remaining_mismatch bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint;
  v_eligible bigint;
  v_remaining bigint;
BEGIN
  SELECT count(*)::bigint
  INTO v_eligible
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE u.last_sign_in_at IS NOT NULL
    AND (p.last_sign_in_at IS DISTINCT FROM u.last_sign_in_at);

  WITH upd AS (
    UPDATE public.profiles p
    SET last_sign_in_at = u.last_sign_in_at
    FROM auth.users u
    WHERE p.id = u.id
      AND u.last_sign_in_at IS NOT NULL
      AND (p.last_sign_in_at IS DISTINCT FROM u.last_sign_in_at)
    RETURNING p.id
  )
  SELECT count(*)::bigint INTO v_updated FROM upd;

  SELECT count(*)::bigint
  INTO v_remaining
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE u.last_sign_in_at IS NOT NULL
    AND (p.last_sign_in_at IS DISTINCT FROM u.last_sign_in_at);

  updated_count := v_updated;
  eligible_auth_populated := v_eligible;
  remaining_mismatch := v_remaining;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_profiles_last_sign_in_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_profiles_last_sign_in_at() TO service_role;

COMMENT ON FUNCTION public.reconcile_profiles_last_sign_in_at IS
  'Idempotent backfill/reconciliation: copies auth.users.last_sign_in_at into profiles.last_sign_in_at when mismatched.';
