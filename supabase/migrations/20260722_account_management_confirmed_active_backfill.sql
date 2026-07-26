-- Account Management — confirmed-active status backfill (2026-07-22)
--
-- Purpose:
--   Promote ONLY legacy account_management_requests that remain in a reviewed-like
--   status while auditable evidence proves an admin activate_service ran for the
--   same request/user.
--
-- Evidence sources (in priority order):
--   1) admin_logs direct CRM path:
--        action = activate_service
--        target_table = account_management_requests
--        target_id = request.id
--        details.after.status IN (نشط, active, مفعل)
--   2) admin_logs lifecycle path (inconsistency recovery only):
--        action = activate_service
--        details.service IN (account_management, accountManagement)
--        details.next_state = active
--        matched to the user's latest reviewed request when no later deactivate log exists
--   3) admin_audit_logs (only if table exists and populated):
--        action = activate_service
--        entity_type = account_management_requests
--        after_data.status IN (نشط, active, مفعل)
--   4) manual_allowlist UUIDs vetted by admin (empty by default)
--
-- NOT used as evidence:
--   status = تمت المراجعة / reviewed / approved / completed alone
--   capital, API keys, age, approval emails, update-request-status only
--
-- Safety:
--   - Idempotent backup table with PK on request_id
--   - Skips already-active, pending, rejected, closed rows
--   - Hard cap (default 50) — raises exception if exceeded
--   - Zero candidates is OK (no-op update)

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_management_status_backfill_20260722 (
  request_id uuid PRIMARY KEY,
  user_id uuid,
  email text,
  previous_status text NOT NULL,
  new_status text NOT NULL DEFAULT 'نشط',
  evidence_type text NOT NULL,
  evidence_reference text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_management_status_backfill_20260722 IS
  'One row per account_management_requests row promoted to نشط by migration 20260722. Used for rollback.';

DO $$
DECLARE
  v_max_updates constant integer := 50;
  v_candidate_count integer := 0;
  v_inserted_backup integer := 0;
  v_updated integer := 0;
BEGIN
  CREATE TEMP TABLE tmp_confirmed_active_requests ON COMMIT DROP AS
  WITH eligible_statuses AS (
    SELECT unnest(
      ARRAY['تمت المراجعة', 'reviewed', 'approved', 'completed']::text[]
    ) AS status_value
  ),
  excluded_current_statuses AS (
    SELECT unnest(
      ARRAY[
        'نشط', 'مفعل', 'active',
        'موقوف',
        'pending', 'new', 'reviewing',
        'جديد', 'قيد المراجعة', 'بانتظار المراجعة', 'قيد المعالجة',
        'مرفوض', 'rejected', 'ملغى', 'cancelled',
        'مغلق', 'closed', 'مؤرشف', 'archived'
      ]::text[]
    ) AS status_value
  ),
  manual_allowlist AS (
    -- Admin-reviewed UUIDs only. Keep empty unless manually vetted.
    SELECT unnest(ARRAY[]::uuid[]) AS request_id
  ),
  log_direct_activation AS (
    SELECT DISTINCT
      amr.id AS request_id,
      amr.user_id,
      amr.email,
      amr.status AS previous_status,
      'admin_logs_direct'::text AS evidence_type,
      al.id::text AS evidence_reference,
      al.created_at AS evidence_at
    FROM public.admin_logs al
    INNER JOIN public.account_management_requests amr
      ON amr.id::text = btrim(al.target_id)
    WHERE al.action = 'activate_service'
      AND al.target_table = 'account_management_requests'
      AND amr.status IN (SELECT status_value FROM eligible_statuses)
      AND amr.status NOT IN (SELECT status_value FROM excluded_current_statuses)
      AND COALESCE(al.details->'after'->>'status', '') IN ('نشط', 'active', 'مفعل')
      AND NOT EXISTS (
        SELECT 1
        FROM public.admin_logs al_deactivate
        WHERE al_deactivate.action = 'deactivate_service'
          AND al_deactivate.target_table = 'account_management_requests'
          AND al_deactivate.target_id = amr.id::text
          AND al_deactivate.created_at > al.created_at
      )
  ),
  log_lifecycle_activation AS (
    SELECT DISTINCT ON (amr.id)
      amr.id AS request_id,
      amr.user_id,
      amr.email,
      amr.status AS previous_status,
      'admin_logs_lifecycle'::text AS evidence_type,
      al.id::text AS evidence_reference,
      al.created_at AS evidence_at
    FROM public.admin_logs al
    INNER JOIN public.account_management_requests amr
      ON amr.user_id::text = COALESCE(al.details->>'target_user_id', btrim(al.target_id))
    WHERE al.action = 'activate_service'
      AND COALESCE(al.details->>'service', al.details->'metadata'->>'serviceKey', '') IN (
        'account_management',
        'accountManagement'
      )
      AND COALESCE(al.details->>'next_state', '') = 'active'
      AND amr.status IN (SELECT status_value FROM eligible_statuses)
      AND amr.status NOT IN (SELECT status_value FROM excluded_current_statuses)
      AND (
        amr.id::text = COALESCE(al.details->'after'->>'id', al.details->'before'->>'id', '')
        OR (
          SELECT COUNT(*)
          FROM public.account_management_requests amr_one
          WHERE amr_one.user_id = amr.user_id
            AND amr_one.status IN (SELECT status_value FROM eligible_statuses)
        ) = 1
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.admin_logs al_deactivate
        WHERE al_deactivate.action = 'deactivate_service'
          AND COALESCE(al_deactivate.details->>'service', al_deactivate.details->'metadata'->>'serviceKey', '') IN (
            'account_management',
            'accountManagement'
          )
          AND COALESCE(al_deactivate.details->>'target_user_id', btrim(al_deactivate.target_id)) = amr.user_id::text
          AND al_deactivate.created_at > al.created_at
      )
    ORDER BY amr.id, al.created_at DESC
  ),
  audit_log_activation AS (
    SELECT DISTINCT
      amr.id AS request_id,
      amr.user_id,
      amr.email,
      amr.status AS previous_status,
      'admin_audit_logs'::text AS evidence_type,
      aal.id::text AS evidence_reference,
      aal.created_at AS evidence_at
    FROM public.admin_audit_logs aal
    INNER JOIN public.account_management_requests amr
      ON amr.id::text = btrim(aal.entity_id)
    WHERE aal.action = 'activate_service'
      AND aal.entity_type = 'account_management_requests'
      AND amr.status IN (SELECT status_value FROM eligible_statuses)
      AND amr.status NOT IN (SELECT status_value FROM excluded_current_statuses)
      AND COALESCE(aal.after_data->>'status', '') IN ('نشط', 'active', 'مفعل')
  ),
  manual_activation AS (
    SELECT
      amr.id AS request_id,
      amr.user_id,
      amr.email,
      amr.status AS previous_status,
      'manual_allowlist'::text AS evidence_type,
      ma.request_id::text AS evidence_reference,
      now() AS evidence_at
    FROM manual_allowlist ma
    INNER JOIN public.account_management_requests amr
      ON amr.id = ma.request_id
    WHERE amr.status IN (SELECT status_value FROM eligible_statuses)
      AND amr.status NOT IN (SELECT status_value FROM excluded_current_statuses)
  ),
  ranked_candidates AS (
    SELECT DISTINCT ON (request_id)
      request_id,
      user_id,
      email,
      previous_status,
      evidence_type,
      evidence_reference
    FROM (
      SELECT * FROM log_direct_activation
      UNION ALL
      SELECT * FROM log_lifecycle_activation
      UNION ALL
      SELECT * FROM audit_log_activation
      UNION ALL
      SELECT * FROM manual_activation
    ) combined
    ORDER BY
      request_id,
      CASE evidence_type
        WHEN 'manual_allowlist' THEN 1
        WHEN 'admin_logs_direct' THEN 2
        WHEN 'admin_audit_logs' THEN 3
        WHEN 'admin_logs_lifecycle' THEN 4
        ELSE 99
      END,
      evidence_at DESC
  )
  SELECT
    request_id,
    user_id,
    email,
    previous_status,
    evidence_type,
    evidence_reference
  FROM ranked_candidates;

  SELECT COUNT(*) INTO v_candidate_count FROM tmp_confirmed_active_requests;

  RAISE NOTICE 'account_management backfill: candidate_count=% (max=%)', v_candidate_count, v_max_updates;

  IF v_candidate_count > v_max_updates THEN
    RAISE EXCEPTION
      'account_management backfill aborted: % candidates exceed safety cap %. Review tmp query output and raise cap only after manual verification.',
      v_candidate_count,
      v_max_updates;
  END IF;

  INSERT INTO public.account_management_status_backfill_20260722 (
    request_id,
    user_id,
    email,
    previous_status,
    new_status,
    evidence_type,
    evidence_reference
  )
  SELECT
    c.request_id,
    c.user_id,
    c.email,
    c.previous_status,
    'نشط',
    c.evidence_type,
    c.evidence_reference
  FROM tmp_confirmed_active_requests c
  ON CONFLICT (request_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_backup = ROW_COUNT;

  UPDATE public.account_management_requests amr
  SET status = 'نشط'
  FROM tmp_confirmed_active_requests c
  WHERE amr.id = c.request_id
    AND amr.status IN ('تمت المراجعة', 'reviewed', 'approved', 'completed');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE 'account_management backfill: backup_inserted=% updated=%', v_inserted_backup, v_updated;
END $$;

-- Verification (safe to re-run)
DO $$
DECLARE
  rec record;
BEGIN
  RAISE NOTICE '--- backfill verification ---';
  RAISE NOTICE 'backup_rows=%', (SELECT COUNT(*) FROM public.account_management_status_backfill_20260722);

  FOR rec IN
    SELECT status, COUNT(*) AS row_count
    FROM public.account_management_requests
    GROUP BY status
    ORDER BY row_count DESC, status
  LOOP
    RAISE NOTICE 'status_distribution: % = %', rec.status, rec.row_count;
  END LOOP;

  FOR rec IN
    SELECT
      b.request_id,
      b.user_id,
      b.email,
      b.previous_status,
      b.evidence_type,
      b.evidence_reference,
      amr.status AS current_status
    FROM public.account_management_status_backfill_20260722 b
    LEFT JOIN public.account_management_requests amr ON amr.id = b.request_id
    ORDER BY b.backed_up_at DESC
    LIMIT 100
  LOOP
    RAISE NOTICE 'updated_row: id=% user=% email=% prev=% evidence=% ref=% current=%',
      rec.request_id, rec.user_id, rec.email, rec.previous_status,
      rec.evidence_type, rec.evidence_reference, rec.current_status;
  END LOOP;

  FOR rec IN
    SELECT
      amr.id AS request_id,
      amr.user_id,
      amr.email,
      amr.status
    FROM public.account_management_requests amr
    WHERE amr.status IN ('تمت المراجعة', 'reviewed', 'approved', 'completed')
    ORDER BY amr.created_at DESC
    LIMIT 100
  LOOP
    RAISE NOTICE 'remaining_reviewed_without_confirmed_evidence: id=% user=% email=% status=%',
      rec.request_id, rec.user_id, rec.email, rec.status;
  END LOOP;
END $$;

COMMIT;

-- Pre/post manual analysis (run in SQL editor anytime):
--
-- SELECT status, COUNT(*) FROM public.account_management_requests GROUP BY 1 ORDER BY 2 DESC;
--
-- WITH eligible AS (
--   SELECT unnest(ARRAY['تمت المراجعة','reviewed','approved','completed']::text[]) AS status_value
-- )
-- SELECT amr.id, amr.user_id, amr.email, amr.status, amr.created_at
-- FROM public.account_management_requests amr
-- WHERE amr.status IN (SELECT status_value FROM eligible)
-- ORDER BY amr.created_at DESC;
--
-- SELECT al.id, al.action, al.target_table, al.target_id, al.details, al.created_at
-- FROM public.admin_logs al
-- WHERE al.action IN ('activate_service', 'deactivate_service')
--   AND (
--     al.target_table = 'account_management_requests'
--     OR COALESCE(al.details->>'service', '') IN ('account_management', 'accountManagement')
--   )
-- ORDER BY al.created_at DESC
-- LIMIT 200;
