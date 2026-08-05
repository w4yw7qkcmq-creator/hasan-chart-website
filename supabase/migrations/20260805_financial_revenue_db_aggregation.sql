-- Financial Center: DB-level revenue aggregation (C1.4 revenue root fix).
-- Read-only RPC; SECURITY INVOKER preserves RLS.

BEGIN;

CREATE OR REPLACE FUNCTION public.financial_price_currency(p_price text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := trim(coalesce(p_price, ''));
  IF v = '' THEN
    RETURN NULL;
  END IF;
  IF public.financial_price_is_complimentary(v) THEN
    RETURN 'USD';
  END IF;
  IF v ~* 'usdt' THEN
    RETURN 'USDT';
  END IF;
  IF v ~* 'usd|\$' THEN
    RETURN 'USD';
  END IF;
  IF v ~ '^[0-9]+([.,][0-9]+)?$' THEN
    RETURN 'USD';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.financial_period_start(p_period text)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN coalesce(p_period, '30d') = '7d'
      THEN date_trunc('day', now() AT TIME ZONE 'UTC') - interval '7 days'
    WHEN coalesce(p_period, '30d') = '90d'
      THEN date_trunc('day', now() AT TIME ZONE 'UTC') - interval '90 days'
    WHEN coalesce(p_period, '30d') = 'year'
      THEN date_trunc('year', now() AT TIME ZONE 'UTC')
    ELSE date_trunc('day', now() AT TIME ZONE 'UTC') - interval '30 days'
  END;
$$;

CREATE OR REPLACE FUNCTION public.financial_is_recognized_revenue_candidate(
  p_row public.subscription_requests,
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    public.financial_normalize_subscription_status((p_row).status, (p_row).admin_disabled, (p_row).expires_at) = 'active'
    AND (p_row).started_at IS NOT NULL
    AND NOT coalesce((p_row).admin_disabled, false)
    AND public.financial_price_amount((p_row).price) > 0
    AND NOT public.financial_price_is_complimentary((p_row).price)
    AND public.financial_infer_activation_source(
      (p_row).activation_source,
      (p_row).status,
      (p_row).started_at,
      (p_row).price,
      (p_row).payment_proof_path,
      (p_row).payment_proof,
      p_legacy_read_enabled
    ) <> 'complimentary'
    AND public.financial_resolve_service((p_row).category, (p_row).plan_name) <> 'account_management';
$$;

CREATE OR REPLACE FUNCTION public.get_financial_revenue_summary(
  p_period text DEFAULT '30d',
  p_legacy_read_enabled boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT sr.*
    FROM public.subscription_requests sr
    WHERE trim(coalesce(sr.status, '')) IN ('مفعل', 'نشط', 'active')
      AND NOT coalesce(sr.admin_disabled, false)
      AND sr.started_at IS NOT NULL
      AND sr.started_at >= public.financial_period_start(p_period)
  ),
  recognized AS (
    SELECT
      c.*,
      public.financial_price_amount(c.price) AS amount,
      public.financial_price_currency(c.price) AS currency,
      public.financial_resolve_service(c.category, c.plan_name) AS service
    FROM candidates c
    WHERE public.financial_is_recognized_revenue_candidate(c, p_legacy_read_enabled)
  ),
  candidate_counts AS (
    SELECT
      count(*) FILTER (WHERE public.financial_price_is_complimentary(price)) AS complimentary_subscriptions,
      count(*) FILTER (
        WHERE public.financial_price_amount(price) IS NULL
          AND NOT public.financial_price_is_complimentary(price)
      ) AS unparseable_price_count
    FROM candidates
  ),
  currency_sums AS (
    SELECT
      coalesce(sum(CASE WHEN currency = 'USD' AND started_at >= date_trunc('day', now()) THEN amount ELSE 0 END), 0) AS today_usd,
      coalesce(sum(CASE WHEN currency = 'USDT' AND started_at >= date_trunc('day', now()) THEN amount ELSE 0 END), 0) AS today_usdt,
      coalesce(sum(CASE WHEN currency = 'USD' AND started_at >= date_trunc('day', now()) - interval '7 days' THEN amount ELSE 0 END), 0) AS week_usd,
      coalesce(sum(CASE WHEN currency = 'USDT' AND started_at >= date_trunc('day', now()) - interval '7 days' THEN amount ELSE 0 END), 0) AS week_usdt,
      coalesce(sum(CASE WHEN currency = 'USD' AND started_at >= date_trunc('day', now()) - interval '30 days' THEN amount ELSE 0 END), 0) AS month_usd,
      coalesce(sum(CASE WHEN currency = 'USDT' AND started_at >= date_trunc('day', now()) - interval '30 days' THEN amount ELSE 0 END), 0) AS month_usdt,
      coalesce(sum(CASE WHEN currency = 'USD' AND started_at >= date_trunc('year', now()) THEN amount ELSE 0 END), 0) AS year_usd,
      coalesce(sum(CASE WHEN currency = 'USDT' AND started_at >= date_trunc('year', now()) THEN amount ELSE 0 END), 0) AS year_usdt,
      coalesce(sum(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0) AS total_usd,
      coalesce(sum(CASE WHEN currency = 'USDT' THEN amount ELSE 0 END), 0) AS total_usdt
    FROM recognized
  ),
  service_totals AS (
    SELECT
      service,
      coalesce(sum(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0) AS usd,
      coalesce(sum(CASE WHEN currency = 'USDT' THEN amount ELSE 0 END), 0) AS usdt
    FROM recognized
    GROUP BY service
  ),
  daily_totals AS (
    SELECT
      to_char(date_trunc('day', started_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*)::int AS activated_count,
      coalesce(sum(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0) AS usd,
      coalesce(sum(CASE WHEN currency = 'USDT' THEN amount ELSE 0 END), 0) AS usdt
    FROM recognized
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 90
  ),
  counts AS (
    SELECT
      (SELECT count(*) FROM recognized) AS active_subscriptions,
      (SELECT count(*) FROM recognized) AS paid_subscriptions_count,
      (SELECT complimentary_subscriptions FROM candidate_counts) AS complimentary_subscriptions,
      (SELECT unparseable_price_count FROM candidate_counts) AS unparseable_price_count
    FROM (SELECT 1) x
  )
  SELECT jsonb_build_object(
    'recognizedRevenueToday', jsonb_build_object('USD', (SELECT today_usd FROM currency_sums), 'USDT', (SELECT today_usdt FROM currency_sums)),
    'recognizedRevenueWeek', jsonb_build_object('USD', (SELECT week_usd FROM currency_sums), 'USDT', (SELECT week_usdt FROM currency_sums)),
    'recognizedRevenueMonth', jsonb_build_object('USD', (SELECT month_usd FROM currency_sums), 'USDT', (SELECT month_usdt FROM currency_sums)),
    'recognizedRevenueYear', jsonb_build_object('USD', (SELECT year_usd FROM currency_sums), 'USDT', (SELECT year_usdt FROM currency_sums)),
    'recognizedRevenueTotal', jsonb_build_object('USD', (SELECT total_usd FROM currency_sums), 'USDT', (SELECT total_usdt FROM currency_sums)),
    'activeSubscriptions', (SELECT active_subscriptions FROM counts),
    'paidSubscriptionsCount', (SELECT paid_subscriptions_count FROM counts),
    'complimentarySubscriptions', (SELECT complimentary_subscriptions FROM counts),
    'unparseablePriceCount', (SELECT unparseable_price_count FROM counts),
    'revenueByService', coalesce(
      (SELECT jsonb_object_agg(
        service,
        jsonb_build_object('USD', usd, 'USDT', usdt)
      ) FROM service_totals),
      '{}'::jsonb
    ),
    'daily', coalesce(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'date', day,
          'activatedCount', activated_count,
          'revenue', jsonb_build_object('USD', usd, 'USDT', usdt)
        )
        ORDER BY day DESC
      ) FROM daily_totals),
      '[]'::jsonb
    ),
    'scanComplete', true,
    'scannedRows', 0
  );
$$;

CREATE INDEX IF NOT EXISTS subscription_requests_revenue_started_at_idx
  ON public.subscription_requests (started_at DESC)
  WHERE trim(coalesce(status, '')) IN ('مفعل', 'نشط', 'active')
    AND admin_disabled = false;

COMMENT ON INDEX public.subscription_requests_revenue_started_at_idx IS
  'Financial revenue summary: active subscriptions by started_at within period.';

COMMIT;
