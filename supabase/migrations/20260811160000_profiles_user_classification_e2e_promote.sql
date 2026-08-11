-- Idempotent fix: promote high-confidence e2e-prefix @test.local rows from TEST → E2E
-- Only touches backfill_high_confidence rows; never admin_manual.

UPDATE public.profiles
SET
  user_classification = 'e2e',
  user_classification_source = 'backfill_high_confidence',
  user_classification_updated_at = now()
WHERE user_classification = 'test'
  AND coalesce(user_classification_source, '') = 'backfill_high_confidence'
  AND (
    lower(coalesce(email, '')) LIKE 'e2e-%'
    OR lower(coalesce(email, '')) LIKE 'e2e\_%'
  );
