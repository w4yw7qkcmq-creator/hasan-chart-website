-- Financial Center: DB-level list pagination (C1.4 root fix).
-- Read-only RPCs; SECURITY INVOKER preserves RLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers (immutable / stable)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financial_price_is_complimentary(p_price text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(trim(p_price), '') ~* '^(مجاني|free|complimentary|0|٠)$';
$$;

CREATE OR REPLACE FUNCTION public.financial_price_amount(p_price text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
  m text[];
BEGIN
  v := trim(coalesce(p_price, ''));
  IF v = '' THEN
    RETURN NULL;
  END IF;
  IF public.financial_price_is_complimentary(v) THEN
    RETURN 0;
  END IF;

  m := regexp_match(v, '([0-9]+(?:[.,][0-9]+)?)\s*usdt', 'i');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric;
  END IF;

  m := regexp_match(v, 'usdt\s*([0-9]+(?:[.,][0-9]+)?)', 'i');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric;
  END IF;

  m := regexp_match(v, '\$\s*([0-9]+(?:[.,][0-9]+)?)');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric;
  END IF;

  m := regexp_match(v, '([0-9]+(?:[.,][0-9]+)?)\s*usd', 'i');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric;
  END IF;

  m := regexp_match(v, '^([0-9]+(?:[.,][0-9]+)?)$');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.financial_resolve_service(p_category text, p_plan_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(account|إدارة|management)'
      THEN 'account_management'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(academy|أكاديم)'
      THEN 'academy'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(spot|سبوت)'
      THEN 'vip_spot'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(future|futures|فيوتشر)'
      THEN 'vip_futures'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(vip|signal|توص)'
      THEN 'vip_signals'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.financial_has_payment_proof(
  p_payment_proof_path text,
  p_payment_proof text,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    coalesce(trim(p_payment_proof_path), '') <> ''
    OR (
      p_legacy_read_enabled
      AND coalesce(trim(p_payment_proof), '') <> ''
    );
$$;

CREATE OR REPLACE FUNCTION public.financial_normalize_subscription_status(
  p_status text,
  p_admin_disabled boolean,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_admin_disabled, false)
      OR lower(trim(coalesce(p_status, ''))) = 'suspended'
      OR trim(coalesce(p_status, '')) = 'موقوف'
      THEN 'suspended'
    WHEN trim(coalesce(p_status, '')) IN ('منتهي', 'expired', 'ended')
      OR lower(trim(coalesce(p_status, ''))) = 'expired'
      OR (
        trim(coalesce(p_status, '')) IN ('مفعل', 'نشط', 'active')
        AND p_expires_at IS NOT NULL
        AND p_expires_at <= now()
      )
      THEN 'expired'
    WHEN trim(coalesce(p_status, '')) IN ('مفعل', 'نشط', 'active')
      AND NOT coalesce(p_admin_disabled, false)
      AND (p_expires_at IS NULL OR p_expires_at > now())
      THEN 'active'
    WHEN trim(coalesce(p_status, '')) IN (
        'pending', 'new', 'reviewing', 'قيد المراجعة', 'بانتظار المراجعة',
        'جديد', 'قيد المعالجة', 'قيد التحليل', 'بانتظار الدفع'
      )
      OR lower(trim(coalesce(p_status, ''))) IN ('pending', 'new', 'reviewing')
      THEN 'pending'
    WHEN trim(coalesce(p_status, '')) IN ('مرفوض', 'rejected', 'declined')
      OR lower(trim(coalesce(p_status, ''))) IN ('rejected', 'declined')
      THEN 'rejected'
    WHEN trim(coalesce(p_status, '')) IN ('ملغى', 'cancelled', 'canceled')
      OR lower(trim(coalesce(p_status, ''))) IN ('cancelled', 'canceled')
      THEN 'cancelled'
    WHEN trim(coalesce(p_status, '')) IN ('مؤرشف', 'archived')
      OR lower(trim(coalesce(p_status, ''))) = 'archived'
      THEN 'archived'
    WHEN trim(coalesce(p_status, '')) <> '' THEN 'unknown'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.financial_infer_activation_source(
  p_activation_source text,
  p_status text,
  p_started_at timestamptz,
  p_price text,
  p_payment_proof_path text,
  p_payment_proof text,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN public.financial_price_is_complimentary(p_price)
      OR lower(trim(coalesce(p_activation_source, ''))) = 'complimentary'
      THEN 'complimentary'
    WHEN lower(trim(coalesce(p_activation_source, ''))) = 'payment' THEN 'payment'
    WHEN lower(trim(coalesce(p_activation_source, ''))) = 'admin' THEN 'admin'
    WHEN lower(trim(coalesce(p_activation_source, ''))) = 'referral' THEN 'referral'
    WHEN public.financial_price_amount(p_price) > 0
      AND public.financial_has_payment_proof(p_payment_proof_path, p_payment_proof, p_legacy_read_enabled)
      THEN 'payment'
    WHEN trim(coalesce(p_status, '')) IN ('مفعل', 'نشط', 'active')
      AND p_started_at IS NOT NULL
      THEN 'admin'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.financial_is_pending_admin_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN trim(coalesce(p_status, '')) = '' THEN true
    WHEN trim(coalesce(p_status, '')) IN (
      'pending', 'new', 'reviewing', 'waiting',
      'قيد المراجعة', 'بانتظار المراجعة', 'بانتظار المعالجة',
      'جديد', 'قيد المعالجة', 'قيد التحليل'
    ) THEN true
    WHEN lower(trim(coalesce(p_status, ''))) IN ('pending', 'new', 'reviewing', 'waiting') THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.financial_is_pending_payment_review_row(
  p_status text,
  p_started_at timestamptz,
  p_payment_proof_path text,
  p_payment_proof text,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.financial_has_payment_proof(p_payment_proof_path, p_payment_proof, p_legacy_read_enabled)
    AND public.financial_is_pending_admin_status(p_status)
    AND NOT (
      trim(coalesce(p_status, '')) IN ('مرفوض', 'rejected', 'declined')
      OR lower(trim(coalesce(p_status, ''))) IN ('rejected', 'declined')
      OR (
        trim(coalesce(p_status, '')) IN ('مفعل', 'نشط', 'active')
        AND p_started_at IS NOT NULL
      )
      OR trim(coalesce(p_status, '')) IN ('منتهي', 'expired', 'ended', 'مؤرشف', 'archived')
      OR lower(trim(coalesce(p_status, ''))) IN ('expired', 'archived', 'cancelled', 'canceled')
      OR trim(coalesce(p_status, '')) IN ('ملغى', 'cancelled', 'canceled')
    );
$$;

CREATE OR REPLACE FUNCTION public.financial_resolve_payment_review_status(
  p_status text,
  p_started_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN trim(coalesce(p_status, '')) IN ('مرفوض', 'rejected', 'declined')
      OR lower(trim(coalesce(p_status, ''))) IN ('rejected', 'declined')
      THEN 'rejected'
    WHEN public.financial_is_pending_admin_status(p_status)
      THEN 'pending_review'
    WHEN trim(coalesce(p_status, '')) IN ('مفعل', 'نشط', 'active')
      AND p_started_at IS NOT NULL
      THEN 'confirmed'
    WHEN trim(coalesce(p_status, '')) IN ('ملغى', 'cancelled', 'canceled')
      OR lower(trim(coalesce(p_status, ''))) IN ('cancelled', 'canceled')
      THEN 'cancelled'
    ELSE 'unknown'
  END;
$$;

-- ---------------------------------------------------------------------------
-- Shared filter predicate for subscription lists
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financial_subscription_matches_filters(
  sr public.subscription_requests,
  p_search text,
  p_status text,
  p_service text,
  p_source text,
  p_paid text,
  p_started_from timestamptz,
  p_started_to timestamptz,
  p_expires_from timestamptz,
  p_expires_to timestamptz,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    (
      p_search IS NULL
      OR trim(p_search) = ''
      OR length(trim(p_search)) < 2
      OR lower(coalesce(sr.user_email, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(coalesce(sr.username, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(coalesce(sr.telegram_username, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(coalesce(sr.plan_name, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(coalesce(sr.category, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR sr.id::text = trim(p_search)
    )
    AND (
      coalesce(p_status, 'all') = 'all'
      OR p_status = 'complimentary'
      OR public.financial_normalize_subscription_status(sr.status, sr.admin_disabled, sr.expires_at) = p_status
    )
    AND (
      coalesce(p_status, 'all') <> 'complimentary'
      OR public.financial_price_is_complimentary(sr.price)
    )
    AND (
      coalesce(p_service, 'all') = 'all'
      OR public.financial_resolve_service(sr.category, sr.plan_name) = p_service
    )
    AND (
      coalesce(p_source, 'all') = 'all'
      OR public.financial_infer_activation_source(
        sr.activation_source,
        sr.status,
        sr.started_at,
        sr.price,
        sr.payment_proof_path,
        sr.payment_proof,
        p_legacy_read_enabled
      ) = p_source
    )
    AND (
      coalesce(p_paid, 'all') = 'all'
      OR (
        p_paid = 'complimentary'
        AND public.financial_price_is_complimentary(sr.price)
      )
      OR (
        p_paid = 'paid'
        AND public.financial_price_amount(sr.price) > 0
      )
      OR (
        p_paid = 'unparseable'
        AND NOT public.financial_price_is_complimentary(sr.price)
        AND public.financial_price_amount(sr.price) IS NULL
      )
    )
    AND (p_started_from IS NULL OR sr.started_at IS NULL OR sr.started_at >= p_started_from)
    AND (p_started_to IS NULL OR sr.started_at IS NULL OR sr.started_at <= p_started_to)
    AND (p_expires_from IS NULL OR sr.expires_at IS NULL OR sr.expires_at >= p_expires_from)
    AND (p_expires_to IS NULL OR sr.expires_at IS NULL OR sr.expires_at <= p_expires_to);
$$;

-- ---------------------------------------------------------------------------
-- List subscriptions (cursor pagination)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_financial_subscriptions(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_service text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_paid text DEFAULT 'all',
  p_started_from timestamptz DEFAULT NULL,
  p_started_to timestamptz DEFAULT NULL,
  p_expires_from timestamptz DEFAULT NULL,
  p_expires_to timestamptz DEFAULT NULL,
  p_sort text DEFAULT 'created_at',
  p_order text DEFAULT 'desc',
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS TABLE (
  id bigint,
  user_email text,
  username text,
  telegram_username text,
  plan_name text,
  category text,
  price text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  admin_disabled boolean,
  activation_source text,
  payment_proof_available boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    sr.id,
    sr.user_email,
    sr.username,
    sr.telegram_username,
    sr.plan_name,
    sr.category,
    sr.price,
    sr.status,
    sr.started_at,
    sr.expires_at,
    sr.created_at,
    sr.admin_disabled,
    sr.activation_source,
    public.financial_has_payment_proof(
      sr.payment_proof_path,
      sr.payment_proof,
      p_legacy_read_enabled
    ) AS payment_proof_available
  FROM public.subscription_requests sr
  WHERE public.financial_subscription_matches_filters(
    sr,
    p_search,
    p_status,
    p_service,
    p_source,
    p_paid,
    p_started_from,
    p_started_to,
    p_expires_from,
    p_expires_to,
    p_legacy_read_enabled
  )
  AND (
    p_cursor_created_at IS NULL
    OR p_cursor_id IS NULL
    OR (sr.created_at, sr.id) < (p_cursor_created_at, p_cursor_id)
  )
  ORDER BY
    CASE WHEN coalesce(p_sort, 'created_at') = 'started_at' AND coalesce(p_order, 'desc') = 'asc'
      THEN sr.started_at END ASC NULLS LAST,
    CASE WHEN coalesce(p_sort, 'created_at') = 'started_at' AND coalesce(p_order, 'desc') <> 'asc'
      THEN sr.started_at END DESC NULLS LAST,
    CASE WHEN coalesce(p_sort, 'created_at') <> 'started_at' AND coalesce(p_order, 'desc') = 'asc'
      THEN sr.created_at END ASC NULLS LAST,
    CASE WHEN coalesce(p_sort, 'created_at') <> 'started_at' AND coalesce(p_order, 'desc') <> 'asc'
      THEN sr.created_at END DESC NULLS LAST,
    sr.id DESC
  LIMIT GREATEST(LEAST(coalesce(p_limit, 25), 100), 1) + 1;
$$;

CREATE OR REPLACE FUNCTION public.count_financial_subscriptions(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_service text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_paid text DEFAULT 'all',
  p_started_from timestamptz DEFAULT NULL,
  p_started_to timestamptz DEFAULT NULL,
  p_expires_from timestamptz DEFAULT NULL,
  p_expires_to timestamptz DEFAULT NULL,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT count(*)::bigint
  FROM public.subscription_requests sr
  WHERE public.financial_subscription_matches_filters(
    sr,
    p_search,
    p_status,
    p_service,
    p_source,
    p_paid,
    p_started_from,
    p_started_to,
    p_expires_from,
    p_expires_to,
    p_legacy_read_enabled
  );
$$;

-- ---------------------------------------------------------------------------
-- Payment review list + count
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financial_payment_review_matches_filters(
  sr public.subscription_requests,
  p_search text,
  p_review_status text,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.financial_has_payment_proof(sr.payment_proof_path, sr.payment_proof, p_legacy_read_enabled)
    AND (
      p_search IS NULL
      OR trim(p_search) = ''
      OR length(trim(p_search)) < 2
      OR lower(coalesce(sr.user_email, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(coalesce(sr.username, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(coalesce(sr.plan_name, '')) LIKE '%' || lower(trim(p_search)) || '%'
      OR sr.id::text = trim(p_search)
    )
    AND (
      coalesce(p_review_status, 'all') = 'all'
      OR public.financial_resolve_payment_review_status(sr.status, sr.started_at) = p_review_status
    )
    AND (
      coalesce(p_review_status, 'all') <> 'pending_review'
      OR public.financial_is_pending_payment_review_row(
        sr.status,
        sr.started_at,
        sr.payment_proof_path,
        sr.payment_proof,
        p_legacy_read_enabled
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.list_financial_payment_reviews(
  p_search text DEFAULT NULL,
  p_review_status text DEFAULT 'all',
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS TABLE (
  id bigint,
  user_email text,
  username text,
  plan_name text,
  category text,
  price text,
  status text,
  started_at timestamptz,
  created_at timestamptz,
  payment_proof_path text,
  payment_proof_mime_type text,
  payment_proof_size_bytes bigint,
  activation_source text,
  proof_available boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    sr.id,
    sr.user_email,
    sr.username,
    sr.plan_name,
    sr.category,
    sr.price,
    sr.status,
    sr.started_at,
    sr.created_at,
    sr.payment_proof_path,
    sr.payment_proof_mime_type,
    sr.payment_proof_size_bytes,
    sr.activation_source,
    public.financial_has_payment_proof(
      sr.payment_proof_path,
      sr.payment_proof,
      p_legacy_read_enabled
    ) AS proof_available
  FROM public.subscription_requests sr
  WHERE public.financial_payment_review_matches_filters(
    sr,
    p_search,
    p_review_status,
    p_legacy_read_enabled
  )
  AND (
    p_cursor_created_at IS NULL
    OR p_cursor_id IS NULL
    OR (sr.created_at, sr.id) < (p_cursor_created_at, p_cursor_id)
  )
  ORDER BY sr.created_at DESC, sr.id DESC
  LIMIT GREATEST(LEAST(coalesce(p_limit, 25), 100), 1) + 1;
$$;

CREATE OR REPLACE FUNCTION public.count_financial_payment_reviews(
  p_search text DEFAULT NULL,
  p_review_status text DEFAULT 'all',
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT count(*)::bigint
  FROM public.subscription_requests sr
  WHERE public.financial_payment_review_matches_filters(
    sr,
    p_search,
    p_review_status,
    p_legacy_read_enabled
  );
$$;

CREATE OR REPLACE FUNCTION public.count_pending_payment_reviews_db(
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT count(*)::bigint
  FROM public.subscription_requests sr
  WHERE public.financial_is_pending_payment_review_row(
    sr.status,
    sr.started_at,
    sr.payment_proof_path,
    sr.payment_proof,
    p_legacy_read_enabled
  );
$$;

-- Cursor pagination index (created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS subscription_requests_admin_created_at_id_idx
  ON public.subscription_requests (created_at DESC, id DESC);

COMMENT ON INDEX public.subscription_requests_admin_created_at_id_idx IS
  'Financial Center cursor pagination: stable created_at DESC, id DESC ordering.';

COMMIT;
