-- Backfill v2: classify high-confidence E2E/INTERNAL in addition to TEST (idempotent, unknown-only)

CREATE OR REPLACE FUNCTION public.backfill_profiles_user_classification_high_confidence()
RETURNS TABLE (
  updated_count bigint,
  remaining_unknown bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint := 0;
BEGIN
  WITH candidates AS (
    SELECT
      p.id,
      CASE
        WHEN lower(coalesce(p.email, '')) LIKE '%@e2e.hasanchartworld.test'
          OR lower(coalesce(p.username, '')) IN ('smoke-e2e-user', 'smoke-e2e-admin')
          OR lower(coalesce(p.email, '')) LIKE 'e2e-%'
          OR lower(coalesce(p.email, '')) LIKE 'e2e\_%'
          THEN 'e2e'
        WHEN lower(coalesce(p.email, '')) LIKE '%@test.local'
          OR lower(coalesce(p.username, '')) LIKE 'paye2e%'
          THEN 'test'
        WHEN lower(coalesce(p.role, '')) = 'admin'
          AND lower(coalesce(p.email, '')) NOT LIKE '%@test.local'
          AND lower(coalesce(p.email, '')) NOT LIKE '%@e2e.hasanchartworld.test'
          THEN 'internal'
        ELSE NULL
      END AS next_classification
    FROM public.profiles p
    WHERE p.user_classification = 'unknown'
      AND coalesce(p.user_classification_source, '') <> 'admin_manual'
  ),
  applied AS (
    UPDATE public.profiles p
    SET
      user_classification = c.next_classification,
      user_classification_source = 'backfill_high_confidence',
      user_classification_updated_at = now()
    FROM candidates c
    WHERE p.id = c.id
      AND c.next_classification IS NOT NULL
    RETURNING p.id
  )
  SELECT count(*)::bigint INTO v_updated FROM applied;

  RETURN QUERY
  SELECT
    v_updated,
    (SELECT count(*)::bigint FROM public.profiles WHERE user_classification = 'unknown');
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_profiles_user_classification_high_confidence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_profiles_user_classification_high_confidence() TO service_role;
