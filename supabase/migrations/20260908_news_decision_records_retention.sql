-- News decision records: 30-day retention via existing balanced daily cron.
-- Idempotent; safe to rerun. Does not alter other retention windows.

BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_news_decision_records(p_retention_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(7, LEAST(COALESCE(p_retention_days, 30), 365));
  v_cutoff timestamptz := now() - make_interval(days => v_days);
  v_deleted integer;
BEGIN
  DELETE FROM public.news_decision_records
  WHERE decision_at < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'table', 'news_decision_records',
    'deleted', v_deleted,
    'retentionDays', v_days,
    'cutoff', v_cutoff
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_balanced_retention_cleanup(
  p_market_retention_days integer DEFAULT 7,
  p_snapshot_retention_days integer DEFAULT 7,
  p_worker_retention_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market_days integer := GREATEST(1, LEAST(COALESCE(p_market_retention_days, 7), 90));
  v_snapshot_days integer := GREATEST(1, LEAST(COALESCE(p_snapshot_retention_days, 7), 90));
  v_worker_days integer := GREATEST(7, LEAST(COALESCE(p_worker_retention_days, 14), 365));
  v_decision_days integer := 30;
  v_result jsonb := '[]'::jsonb;
BEGIN
  v_result := v_result || jsonb_build_array(public.cleanup_market_flow_buckets(v_market_days));
  v_result := v_result || jsonb_build_array(public.cleanup_market_large_trades(v_market_days));
  v_result := v_result || jsonb_build_array(public.cleanup_market_liquidity_walls(v_market_days));
  v_result := v_result || jsonb_build_array(public.cleanup_news_system_metric_snapshots(v_snapshot_days));
  v_result := v_result || jsonb_build_array(public.cleanup_price_alert_worker_runs(v_worker_days));
  v_result := v_result || jsonb_build_array(public.cleanup_news_worker_cycle_runs(v_worker_days));
  v_result := v_result || jsonb_build_array(public.cleanup_news_decision_records(v_decision_days));

  RETURN jsonb_build_object(
    'policy', 'balanced',
    'marketRetentionDays', v_market_days,
    'snapshotRetentionDays', v_snapshot_days,
    'workerRetentionDays', v_worker_days,
    'decisionRetentionDays', v_decision_days,
    'results', v_result,
    'completedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_news_decision_records(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_balanced_retention_cleanup(integer, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_news_decision_records(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_balanced_retention_cleanup(integer, integer, integer) TO service_role;

COMMIT;
