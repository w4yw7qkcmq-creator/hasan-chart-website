-- Purge legacy open and duplicate admin policies before IAM enforce migration.
-- Safe: DROP POLICY IF EXISTS only; no data mutations.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname NOT LIKE 'iam_%'
      AND (
        coalesce(qual, '') IN ('true', '(true)')
        OR coalesce(with_check, '') IN ('true', '(true)')
        OR policyname IN (
          'Admins can manage subscriptions',
          'Admins full access',
          'Enable read own rows',
          'Enable insert for authenticated users',
          'Admins can manage price alerts',
          'Allow service role full access to price alerts',
          'Users can insert price alerts',
          'Users can insert subscriptions',
          'Admins can manage vip signals',
          'Anyone can read vip signals',
          'Allow public read news posts',
          'news_posts_public_read',
          'Allow public read published news'
        )
        OR policyname LIKE '%admin_all%'
        OR (coalesce(qual, '') LIKE '%is_admin()%' OR coalesce(with_check, '') LIKE '%is_admin()%')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped legacy policy % on %', r.policyname, r.tablename;
  END LOOP;
END;
$$;

-- Post-check: no sensitive open authenticated policies remain (except intentional public read via iam_public_*)
DO $$
DECLARE
  v_open int;
BEGIN
  SELECT count(*) INTO v_open
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname NOT LIKE 'iam_%'
    AND (
      coalesce(qual, '') IN ('true', '(true)')
      OR coalesce(with_check, '') IN ('true', '(true)')
    )
    AND tablename NOT IN ('published_news');

  IF v_open > 0 THEN
    RAISE EXCEPTION 'Purge post-check: % legacy open policies remain', v_open;
  END IF;
END;
$$;

COMMIT;
