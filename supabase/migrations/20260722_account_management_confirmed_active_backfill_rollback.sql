-- Rollback for 20260722_account_management_confirmed_active_backfill.sql
--
-- Restores ONLY rows recorded in the backup table, and ONLY when the current
-- status still matches the migration's new_status (نشط). If an admin changed
-- the row manually after migration, it is left untouched.

BEGIN;

DO $$
DECLARE
  v_restored integer := 0;
  rec record;
BEGIN
  IF to_regclass('public.account_management_status_backfill_20260722') IS NULL THEN
    RAISE NOTICE 'Rollback skipped: backup table public.account_management_status_backfill_20260722 does not exist.';
    RETURN;
  END IF;

  UPDATE public.account_management_requests amr
  SET status = b.previous_status
  FROM public.account_management_status_backfill_20260722 b
  WHERE amr.id = b.request_id
    AND amr.status = b.new_status
    AND b.previous_status IS NOT NULL
    AND b.previous_status <> b.new_status;

  GET DIAGNOSTICS v_restored = ROW_COUNT;

  RAISE NOTICE 'account_management rollback: restored_rows=%', v_restored;

  FOR rec IN
    SELECT
      b.request_id,
      b.user_id,
      b.email,
      b.previous_status,
      b.new_status,
      amr.status AS current_status
    FROM public.account_management_status_backfill_20260722 b
    LEFT JOIN public.account_management_requests amr ON amr.id = b.request_id
    ORDER BY b.backed_up_at DESC
    LIMIT 100
  LOOP
    RAISE NOTICE 'rollback_check: id=% user=% email=% prev=% new=% current=%',
      rec.request_id, rec.user_id, rec.email,
      rec.previous_status, rec.new_status, rec.current_status;
  END LOOP;
END $$;

COMMIT;
