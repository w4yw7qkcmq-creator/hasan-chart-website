-- Manual SQL verification for instant_analysis_requests (run after migration apply).
-- Replace :user_a and :user_b with real auth.users UUIDs in a staging project.

-- 1) First reservation succeeds
-- SELECT public.reserve_instant_analysis_request(:user_a, 'BTCUSDT');

-- 2) Second reservation for same user should fail IN_PROGRESS or hit unique index
-- SELECT public.reserve_instant_analysis_request(:user_a, 'ETHUSDT');

-- 3) Another user succeeds independently
-- SELECT public.reserve_instant_analysis_request(:user_b, 'BTCUSDT');

-- 4) Release reservation (no cooldown)
-- SELECT public.release_instant_analysis_reservation(:request_id, :user_a, 'TEST_RELEASE');
-- SELECT public.get_instant_analysis_availability(:user_a);

-- 5) Confirm starts cooldown window
-- SELECT public.confirm_instant_analysis_job(:request_id, :user_a, 'job_1700000000000_ab12cd');
-- SELECT public.get_instant_analysis_availability(:user_a);

-- 6) Second request within 60 minutes returns cooldown
-- SELECT public.reserve_instant_analysis_request(:user_a, 'BTCUSDT');

-- 7) Simulate elapsed cooldown (staging only — do not run on production data casually)
-- UPDATE public.instant_analysis_requests
-- SET cooldown_starts_at = now() - interval '61 minutes'
-- WHERE user_id = :user_a;
-- SELECT public.get_instant_analysis_availability(:user_a);

-- 8) Stale reserving becomes released after 3 minutes
-- SELECT public.reserve_instant_analysis_request(:user_a, 'BTCUSDT');
-- UPDATE public.instant_analysis_requests
-- SET created_at = now() - interval '4 minutes'
-- WHERE user_id = :user_a AND status = 'reserving';
-- SELECT public.cleanup_stale_instant_analysis_reservations(:user_a);

-- 9) Cross-user confirm/release denied
-- SELECT public.confirm_instant_analysis_job(:request_id, :user_b, 'job_1700000000000_ab12cd');
-- SELECT public.release_instant_analysis_reservation(:request_id, :user_b, 'TEST');

-- 10) Invalid status transition rejected
-- SELECT public.update_instant_analysis_request_status(:request_id, :user_a, 'completed');

-- 11) Permissions — should fail for authenticated/anon
-- SET ROLE authenticated;
-- SELECT public.reserve_instant_analysis_request(:user_a, 'BTCUSDT');
-- RESET ROLE;

-- 12) Race simulation (run in two concurrent sessions)
-- Session A: SELECT public.reserve_instant_analysis_request(:user_a, 'BTCUSDT');
-- Session B: SELECT public.reserve_instant_analysis_request(:user_a, 'ETHUSDT');
-- Expect exactly one ok=true and one IN_PROGRESS/unique_violation path.
