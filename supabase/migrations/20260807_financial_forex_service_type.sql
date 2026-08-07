-- Classify Forex subscription rows in financial center (no vip_signals constraint change needed).

CREATE OR REPLACE FUNCTION public.financial_resolve_service_type(
  p_category text,
  p_plan_name text
)
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
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(forex|فوركس)'
      THEN 'vip_forex'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(future|futures|فيوتشر)'
      THEN 'vip_futures'
    WHEN lower(coalesce(p_category, '') || ' ' || coalesce(p_plan_name, '')) ~ '(vip|signal|توص)'
      THEN 'vip_signals'
    ELSE 'unknown'
  END;
$$;
