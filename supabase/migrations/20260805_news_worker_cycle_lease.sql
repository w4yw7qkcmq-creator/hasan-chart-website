-- Distributed cycle lease for News Worker (single active cycle across replicas).

BEGIN;

CREATE TABLE IF NOT EXISTS public.news_worker_cycle_leases (
  lock_name text PRIMARY KEY,
  owner_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_worker_cycle_leases_expires_at_idx
  ON public.news_worker_cycle_leases (expires_at);

CREATE OR REPLACE FUNCTION public.try_acquire_news_worker_cycle_lock(
  p_owner_id text,
  p_ttl_seconds integer DEFAULT 180,
  p_lock_name text DEFAULT 'news_worker_cycle'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_ttl_seconds, 180), 600));
  v_expires timestamptz := v_now + make_interval(secs => v_ttl);
  v_lock_name text := COALESCE(NULLIF(trim(p_lock_name), ''), 'news_worker_cycle');
  v_existing public.news_worker_cycle_leases%ROWTYPE;
BEGIN
  IF COALESCE(trim(p_owner_id), '') = '' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'missing_owner');
  END IF;

  IF v_lock_name !~ '^[a-z0-9_:-]{3,64}$' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_lock_name');
  END IF;

  DELETE FROM public.news_worker_cycle_leases
  WHERE lock_name = v_lock_name
    AND expires_at <= v_now;

  SELECT * INTO v_existing
  FROM public.news_worker_cycle_leases
  WHERE lock_name = v_lock_name
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.news_worker_cycle_leases (lock_name, owner_id, acquired_at, expires_at, heartbeat_at)
    VALUES (v_lock_name, p_owner_id, v_now, v_expires, v_now);

    RETURN jsonb_build_object(
      'acquired', true,
      'owner', p_owner_id,
      'lockName', v_lock_name,
      'expiresAt', v_expires,
      'recovered', false
    );
  END IF;

  IF v_existing.owner_id = p_owner_id THEN
    UPDATE public.news_worker_cycle_leases
    SET expires_at = v_expires,
        heartbeat_at = v_now
    WHERE lock_name = v_lock_name;

    RETURN jsonb_build_object(
      'acquired', true,
      'owner', p_owner_id,
      'lockName', v_lock_name,
      'expiresAt', v_expires,
      'renewed', true
    );
  END IF;

  IF v_existing.expires_at <= v_now THEN
    UPDATE public.news_worker_cycle_leases
    SET owner_id = p_owner_id,
        acquired_at = v_now,
        expires_at = v_expires,
        heartbeat_at = v_now
    WHERE lock_name = v_lock_name;

    RETURN jsonb_build_object(
      'acquired', true,
      'owner', p_owner_id,
      'lockName', v_lock_name,
      'expiresAt', v_expires,
      'recovered', true
    );
  END IF;

  RETURN jsonb_build_object(
    'acquired', false,
    'reason', 'contended',
    'owner', v_existing.owner_id,
    'lockName', v_lock_name,
    'expiresAt', v_existing.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_news_worker_cycle_lock(
  p_owner_id text,
  p_ttl_seconds integer DEFAULT 180,
  p_lock_name text DEFAULT 'news_worker_cycle'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_ttl_seconds, 180), 600));
  v_expires timestamptz := v_now + make_interval(secs => v_ttl);
  v_lock_name text := COALESCE(NULLIF(trim(p_lock_name), ''), 'news_worker_cycle');
  v_updated integer;
BEGIN
  UPDATE public.news_worker_cycle_leases
  SET expires_at = v_expires,
      heartbeat_at = v_now
  WHERE lock_name = v_lock_name
    AND owner_id = p_owner_id
    AND expires_at > v_now;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN jsonb_build_object('renewed', true, 'expiresAt', v_expires, 'lockName', v_lock_name);
  END IF;

  RETURN jsonb_build_object('renewed', false, 'reason', 'not_owner_or_expired', 'lockName', v_lock_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_news_worker_cycle_lock(
  p_owner_id text,
  p_lock_name text DEFAULT 'news_worker_cycle'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_lock_name text := COALESCE(NULLIF(trim(p_lock_name), ''), 'news_worker_cycle');
BEGIN
  DELETE FROM public.news_worker_cycle_leases
  WHERE lock_name = v_lock_name
    AND owner_id = p_owner_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('released', v_deleted = 1, 'lockName', v_lock_name);
END;
$$;

ALTER TABLE public.news_worker_cycle_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.news_worker_cycle_leases FROM PUBLIC;
REVOKE ALL ON TABLE public.news_worker_cycle_leases FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_news_worker_cycle_lock(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_news_worker_cycle_lock(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_news_worker_cycle_lock(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_acquire_news_worker_cycle_lock(text, integer, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_news_worker_cycle_lock(text, integer, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_news_worker_cycle_lock(text, text) FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.news_worker_cycle_leases TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_news_worker_cycle_lock(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_news_worker_cycle_lock(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_news_worker_cycle_lock(text, text) TO service_role;

COMMIT;
