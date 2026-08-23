-- IAM Performance Phase 2A — safe round-trip reduction
-- 1) Throttled session activity touch (conditional UPDATE)
-- 2) Unified IAM context resolution (single RPC round-trip)

-- ---------------------------------------------------------------------------
-- Throttled session touch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_admin_session_activity_if_stale(
  p_user_id uuid,
  p_session_id_hash text,
  p_stale_seconds integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_stale integer := GREATEST(15, LEAST(COALESCE(p_stale_seconds, 45), 300));
  v_cutoff timestamptz := v_now - make_interval(secs => v_stale);
  v_updated integer;
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_session_id_hash), '') = '' THEN
    RETURN jsonb_build_object('touched', false, 'throttled', false, 'found', false);
  END IF;

  UPDATE public.iam_session_logs
  SET last_activity_at = v_now
  WHERE user_id = p_user_id
    AND session_id_hash = p_session_id_hash
    AND ended_at IS NULL
    AND last_activity_at < v_cutoff;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RETURN jsonb_build_object('touched', true, 'throttled', false, 'found', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.iam_session_logs
    WHERE user_id = p_user_id
      AND session_id_hash = p_session_id_hash
      AND ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('touched', false, 'throttled', true, 'found', true);
  END IF;

  RETURN jsonb_build_object('touched', false, 'throttled', false, 'found', false);
END;
$$;

REVOKE ALL ON FUNCTION public.touch_admin_session_activity_if_stale(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_admin_session_activity_if_stale(uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Unified IAM resolver (raw data — Node applies deny-wins semantics)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_iam_context_v2(
  p_user_id uuid,
  p_organization_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_ids text[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'assignments', '[]'::jsonb,
      'roles', '[]'::jsonb,
      'role_permissions', '[]'::jsonb,
      'overrides', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT a.role_id), ARRAY[]::text[])
  INTO v_role_ids
  FROM public.iam_user_assignments a
  WHERE a.user_id = p_user_id
    AND a.revoked_at IS NULL
    AND (a.organization_id = p_organization_id OR a.organization_id IS NULL);

  RETURN jsonb_build_object(
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'role_id', a.role_id,
        'organization_id', a.organization_id,
        'granted_at', a.granted_at,
        'revoked_at', a.revoked_at
      ) ORDER BY a.granted_at NULLS LAST, a.id)
      FROM public.iam_user_assignments a
      WHERE a.user_id = p_user_id
        AND a.revoked_at IS NULL
        AND (a.organization_id = p_organization_id OR a.organization_id IS NULL)
    ), '[]'::jsonb),
    'roles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label) ORDER BY r.sort_order, r.id)
      FROM public.iam_roles r
      WHERE r.id = ANY(v_role_ids)
    ), '[]'::jsonb),
    'role_permissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role_id', rp.role_id,
        'permission_id', rp.permission_id,
        'effect', rp.effect
      ) ORDER BY rp.role_id, rp.permission_id)
      FROM public.iam_role_permissions rp
      WHERE rp.role_id = ANY(v_role_ids)
    ), '[]'::jsonb),
    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'permission_id', o.permission_id,
        'effect', o.effect
      ) ORDER BY o.permission_id)
      FROM public.iam_user_permission_overrides o
      WHERE o.user_id = p_user_id
        AND o.revoked_at IS NULL
        AND (o.organization_id = p_organization_id OR o.organization_id IS NULL)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_iam_context_v2(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_iam_context_v2(uuid, uuid) TO service_role;

-- Optional index for throttled touch lookups (active session by user+hash)
CREATE INDEX IF NOT EXISTS iam_session_logs_active_touch_idx
  ON public.iam_session_logs (user_id, session_id_hash)
  WHERE ended_at IS NULL;
