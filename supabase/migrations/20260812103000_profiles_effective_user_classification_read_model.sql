-- Effective user classification read model (DB-side authority for admin list/filter/KPI).
-- Mirrors lib/user-classification.js authority + heuristic using profiles columns only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS effective_user_classification text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS effective_user_classification_source text,
  ADD COLUMN IF NOT EXISTS effective_user_classification_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_effective_user_classification_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_effective_user_classification_check
      CHECK (
        effective_user_classification IN ('real', 'test', 'e2e', 'internal', 'suspected', 'unknown')
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.compute_profile_classification_heuristic(
  p_email text,
  p_username text,
  p_role text,
  p_created_at timestamptz,
  p_last_sign_in_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := btrim(coalesce(p_username, ''));
  v_role text := lower(btrim(coalesce(p_role, 'user')));
  v_domain text := '';
  v_local text := '';
  v_real_signals integer := 0;
BEGIN
  IF v_email <> '' AND position('@' IN v_email) > 0 THEN
    v_domain := split_part(v_email, '@', 2);
    v_local := split_part(v_email, '@', 1);
  END IF;

  -- E2E signals (same order as resolveUserClassificationSignals)
  IF lower(v_username) IN ('smoke-e2e-user', 'smoke-e2e-admin')
     OR v_domain = 'e2e.hasanchartworld.test'
     OR v_local ~* '^e2e[-_]'
     OR v_local LIKE '%smoke-e2e%'
  THEN
    RETURN 'e2e';
  END IF;

  -- TEST signals
  IF v_domain = 'test.local'
     OR (v_local ~* '^e2e-pay-' AND v_domain = 'test.local')
     OR (
       v_domain = 'test.local'
       AND (
         v_username LIKE 'PayE2E%'
         OR v_username LIKE 'ProdA%'
         OR v_username LIKE 'e2e-%'
         OR v_local ~* '\ytest\y'
       )
     )
  THEN
    RETURN 'test';
  END IF;

  -- INTERNAL
  IF v_role = 'admin'
     AND v_email <> ''
     AND v_domain NOT IN ('test.local', 'e2e.hasanchartworld.test')
  THEN
    RETURN 'internal';
  END IF;

  -- SUSPECTED
  IF (v_local ~* '\ytest\y' AND v_domain <> 'test.local')
     OR (
       (v_username LIKE 'PayE2E%' OR v_username LIKE 'ProdA%' OR v_username LIKE 'e2e-%')
       AND v_domain <> 'test.local'
     )
     OR (v_username ~* '^prod[a-z]?\d')
  THEN
    RETURN 'suspected';
  END IF;

  -- REAL (requires >= 2 positive non-test signals)
  IF v_email <> ''
     AND v_domain <> ''
     AND v_domain NOT IN ('test.local', 'e2e.hasanchartworld.test')
     AND v_local !~* '^e2e[-_]'
  THEN
    v_real_signals := v_real_signals + 1;
  END IF;
  IF p_last_sign_in_at IS NOT NULL THEN
    v_real_signals := v_real_signals + 1;
  END IF;
  IF p_created_at IS NOT NULL THEN
    v_real_signals := v_real_signals + 1;
  END IF;

  IF v_real_signals >= 2 THEN
    RETURN 'real';
  END IF;

  RETURN 'unknown';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_profile_effective_classification(
  p_email text,
  p_username text,
  p_role text,
  p_created_at timestamptz,
  p_last_sign_in_at timestamptz,
  p_user_classification text,
  p_user_classification_source text
)
RETURNS TABLE (
  effective_classification text,
  effective_source text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_stored text := lower(btrim(coalesce(p_user_classification, '')));
  v_source text := lower(btrim(coalesce(p_user_classification_source, '')));
  v_valid constant text[] := ARRAY['real','test','e2e','internal','suspected','unknown'];
BEGIN
  IF v_source = 'admin_manual' AND v_stored = ANY (v_valid) THEN
    RETURN QUERY SELECT v_stored, 'admin_manual';
    RETURN;
  END IF;

  IF v_source = 'backfill_high_confidence'
     AND v_stored <> ''
     AND v_stored <> 'unknown'
     AND v_stored = ANY (v_valid)
  THEN
    RETURN QUERY SELECT v_stored, 'backfill_high_confidence';
    RETURN;
  END IF;

  IF v_stored <> ''
     AND v_stored <> 'unknown'
     AND v_stored = ANY (v_valid)
  THEN
    RETURN QUERY SELECT v_stored, coalesce(nullif(v_source, ''), 'stored');
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    public.compute_profile_classification_heuristic(
      p_email, p_username, p_role, p_created_at, p_last_sign_in_at
    ),
    'computed';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_effective_user_classification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT *
  INTO v
  FROM public.resolve_profile_effective_classification(
    NEW.email,
    NEW.username,
    NEW.role,
    NEW.created_at,
    NEW.last_sign_in_at,
    NEW.user_classification,
    NEW.user_classification_source
  );

  NEW.effective_user_classification := v.effective_classification;
  NEW.effective_user_classification_source := v.effective_source;
  NEW.effective_user_classification_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_effective_user_classification ON public.profiles;

CREATE TRIGGER profiles_sync_effective_user_classification
  BEFORE INSERT OR UPDATE OF
    email,
    username,
    role,
    created_at,
    last_sign_in_at,
    user_classification,
    user_classification_source
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_effective_user_classification();

-- Initial backfill / reconcile (idempotent)
UPDATE public.profiles p
SET
  effective_user_classification = r.effective_classification,
  effective_user_classification_source = r.effective_source,
  effective_user_classification_at = now()
FROM (
  SELECT
    id,
    eff.effective_classification,
    eff.effective_source
  FROM public.profiles pr
  CROSS JOIN LATERAL public.resolve_profile_effective_classification(
    pr.email,
    pr.username,
    pr.role,
    pr.created_at,
    pr.last_sign_in_at,
    pr.user_classification,
    pr.user_classification_source
  ) AS eff
) AS r
WHERE p.id = r.id
  AND (
    p.effective_user_classification IS DISTINCT FROM r.effective_classification
    OR p.effective_user_classification_source IS DISTINCT FROM r.effective_source
  );

CREATE INDEX IF NOT EXISTS profiles_effective_user_classification_idx
  ON public.profiles (effective_user_classification);

CREATE INDEX IF NOT EXISTS profiles_effective_user_classification_created_at_idx
  ON public.profiles (effective_user_classification, created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_effective_user_classification_last_sign_in_idx
  ON public.profiles (effective_user_classification, last_sign_in_at DESC NULLS LAST);

COMMENT ON COLUMN public.profiles.effective_user_classification IS
  'Read-model effective classification for admin filters/KPI (authority chain + heuristic).';

CREATE OR REPLACE FUNCTION public.admin_profiles_effective_classification_counts()
RETURNS TABLE (
  classification text,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT effective_user_classification AS classification, count(*)::bigint AS total
  FROM public.profiles
  GROUP BY effective_user_classification;
$$;

REVOKE ALL ON FUNCTION public.compute_profile_classification_heuristic(text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_profile_effective_classification(text, text, text, timestamptz, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_profile_effective_user_classification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_profiles_effective_classification_counts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.compute_profile_classification_heuristic(text, text, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_profile_effective_classification(text, text, text, timestamptz, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_profiles_effective_classification_counts() TO service_role;
