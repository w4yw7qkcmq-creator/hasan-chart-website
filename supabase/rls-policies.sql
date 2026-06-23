-- =============================================================================
-- HasaN CharT World — Row Level Security (RLS) Policies (Final Review)
-- =============================================================================
--
-- تعليمات:
--   1. انسخ هذا الملف بالكامل إلى Supabase Dashboard → SQL Editor
--   2. نفّذه يدوياً (لا يُنفَّذ تلقائياً من المشروع)
--   3. تأكد أن حسابات الأدmin لديها profiles.role = 'admin'
--   4. service_role (SUPABASE_SERVICE_ROLE_KEY) يتجاوز RLS تلقائياً — لا تغيير مطلوب
--
-- ملاحظة vip_signals:
--   app/layout.js ما زال يقرأ vip_signals مباشرة (polling + Realtime).
--   /api/vip-signals موجود ويتحقق من session + اشتراك VIP — لكن layout.js لم يُ migrat بعد.
--   لذلك: سياسة SELECT مؤقتة للـ authenticated حتى يُحدَّث layout.js لاستخدام API.
--   بعد migration: احذف vip_signals_authenticated_select_temp
--
-- =============================================================================


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

COMMENT ON FUNCTION public.current_user_email() IS
  'Returns the authenticated user email from JWT (lowercased). Empty string if missing.';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Returns true when the authenticated user has profiles.role = admin.';


-- =============================================================================
-- profiles — TRIGGER: منع تعديل الأعمدة الحساسة (backup فوق GRANT/REVOKE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.profiles_protect_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.role := OLD.role;
  NEW.email := OLD.email;
  NEW.subscription_plan := OLD.subscription_plan;
  NEW.subscription_status := OLD.subscription_status;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_sensitive_columns_trigger ON public.profiles;

CREATE TRIGGER profiles_protect_sensitive_columns_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_protect_sensitive_columns();

-- =============================================================================
-- TABLE: profiles
-- =============================================================================
--
-- المستخدم العادي:
--   - SELECT: صفه فقط
--   - INSERT: صفه فقط — بدون role=admin أو اشتراك مفعل
--   - UPDATE: صفه فقط — أعمدة username / telegram
--             (عبر REVOKE/GRANT + trigger للأعمدة الحساسة)
--
-- الأدمن:
--   - SELECT / INSERT / UPDATE / DELETE: كل الصفوف
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR lower(email) = public.current_user_email()
);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  (id = auth.uid() OR lower(email) = public.current_user_email())
  AND coalesce(role, 'user') = 'user'
  AND coalesce(subscription_status, 'غير نشط') NOT IN ('مفعل', 'نشط', 'active')
  AND (
    subscription_plan IS NULL
    OR trim(subscription_plan) = ''
    OR trim(subscription_plan) = 'بدون اشتراك'
  )
);

DROP POLICY IF EXISTS "profiles_update_own_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR lower(email) = public.current_user_email()
)
WITH CHECK (
  id = auth.uid()
  OR lower(email) = public.current_user_email()
);

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Column-level privileges: المستخدم العادي يعدّل الحقول الآمنة فقط
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

DO $$
DECLARE
  safe_column text;
BEGIN
  FOREACH safe_column IN ARRAY ARRAY['username', 'telegram']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = safe_column
    ) THEN
      EXECUTE format(
        'GRANT UPDATE (%I) ON TABLE public.profiles TO authenticated',
        safe_column
      );
    END IF;
  END LOOP;
END $$;


-- =============================================================================
-- TABLE: analysis_requests
-- =============================================================================
--
-- المستخدم العادي:
--   - SELECT: طلباته فقط
--   - INSERT: طلبات باسمه فقط
--
-- الأدمن:
--   - SELECT / INSERT / UPDATE / DELETE: كل الطلبات
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.analysis_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analysis_requests_select_own" ON public.analysis_requests;
CREATE POLICY "analysis_requests_select_own"
ON public.analysis_requests
FOR SELECT
TO authenticated
USING (lower(user_email) = public.current_user_email());

DROP POLICY IF EXISTS "analysis_requests_insert_own" ON public.analysis_requests;
CREATE POLICY "analysis_requests_insert_own"
ON public.analysis_requests
FOR INSERT
TO authenticated
WITH CHECK (lower(user_email) = public.current_user_email());

DROP POLICY IF EXISTS "analysis_requests_admin_all" ON public.analysis_requests;
CREATE POLICY "analysis_requests_admin_all"
ON public.analysis_requests
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- =============================================================================
-- TABLE: price_alerts
-- =============================================================================
--
-- المستخدم العادي:
--   - لا وصول مباشر (INSERT/SELECT عبر /api/alerts بـ service_role)
--
-- الأدمن:
--   - SELECT / UPDATE / DELETE: كل التنبيهات
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_alerts_admin_select" ON public.price_alerts;
CREATE POLICY "price_alerts_admin_select"
ON public.price_alerts
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "price_alerts_admin_update" ON public.price_alerts;
CREATE POLICY "price_alerts_admin_update"
ON public.price_alerts
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "price_alerts_admin_delete" ON public.price_alerts;
CREATE POLICY "price_alerts_admin_delete"
ON public.price_alerts
FOR DELETE
TO authenticated
USING (public.is_admin());


-- =============================================================================
-- TABLE: subscription_requests
-- =============================================================================
--
-- المستخدم العادي:
--   - SELECT: طلباته فقط
--   - INSERT: طلبات باسمه فقط
--
-- الأدمن:
--   - SELECT / INSERT / UPDATE / DELETE: كل الطلبات
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_requests_select_own" ON public.subscription_requests;
CREATE POLICY "subscription_requests_select_own"
ON public.subscription_requests
FOR SELECT
TO authenticated
USING (lower(user_email) = public.current_user_email());

DROP POLICY IF EXISTS "subscription_requests_insert_own" ON public.subscription_requests;
CREATE POLICY "subscription_requests_insert_own"
ON public.subscription_requests
FOR INSERT
TO authenticated
WITH CHECK (lower(user_email) = public.current_user_email());

DROP POLICY IF EXISTS "subscription_requests_admin_all" ON public.subscription_requests;
CREATE POLICY "subscription_requests_admin_all"
ON public.subscription_requests
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- =============================================================================
-- TABLE: account_management_requests
-- =============================================================================
--
-- المستخدم العادي:
--   - SELECT: طلباته فقط (user_id = auth.uid())
--   - INSERT: طلباته فقط
--
-- الأدmin:
--   - SELECT / INSERT / UPDATE / DELETE: كل الطلبات
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.account_management_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_mgmt_select_own" ON public.account_management_requests;
CREATE POLICY "account_mgmt_select_own"
ON public.account_management_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "account_mgmt_insert_own" ON public.account_management_requests;
CREATE POLICY "account_mgmt_insert_own"
ON public.account_management_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND lower(email) = public.current_user_email()
);

DROP POLICY IF EXISTS "account_mgmt_admin_all" ON public.account_management_requests;
CREATE POLICY "account_mgmt_admin_all"
ON public.account_management_requests
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- =============================================================================
-- TABLE: notifications
-- =============================================================================
--
-- المستخدم العادي:
--   - SELECT: إشعاراته فقط
--   - UPDATE: is_read لإشعاراته فقط
--
-- الأدمن:
--   - SELECT / INSERT / UPDATE / DELETE: كل الإشعارات
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
TO authenticated
USING (lower(user_email) = public.current_user_email());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
TO authenticated
USING (lower(user_email) = public.current_user_email())
WITH CHECK (lower(user_email) = public.current_user_email());

DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all"
ON public.notifications
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- =============================================================================
-- TABLE: vip_signals
-- =============================================================================
--
-- ⚠️ layout.js (app/layout.js) يقرأ vip_signals مباشرة:
--      - supabase.from('vip_signals').select('*')  (polling كل 5 ثوانٍ)
--      - Realtime INSERT على vip_signals
--
-- /api/vip-signals موجود: session cookie + فحص اشتراك VIP — لكن layout.js لم يُحدَّث بعد.
--
-- لذلك: SELECT مؤقت لـ authenticated (لا منع كامل حتى migration).
-- بعد تحديث layout.js لاستخدام /api/vip-signals:
--      DROP POLICY "vip_signals_authenticated_select_temp" ON public.vip_signals;
--
-- المستخدم العادي (مؤقت):
--   - SELECT: كل vip_signals (حتى يُ migrat layout.js)
--   - INSERT / UPDATE / DELETE: ممنوع
--
-- الأدمن:
--   - SELECT / INSERT / UPDATE / DELETE: الكل
--
-- anon:
--   - لا شيء
--
-- =============================================================================

ALTER TABLE public.vip_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vip_signals_admin_all" ON public.vip_signals;
DROP POLICY IF EXISTS "vip_signals_authenticated_select_temp" ON public.vip_signals;

CREATE POLICY "vip_signals_authenticated_select_temp"
ON public.vip_signals
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "vip_signals_admin_insert"
ON public.vip_signals
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "vip_signals_admin_update"
ON public.vip_signals
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "vip_signals_admin_delete"
ON public.vip_signals
FOR DELETE
TO authenticated
USING (public.is_admin());


-- =============================================================================
-- TABLE: news_posts
-- =============================================================================
--
-- anon + authenticated:
--   - SELECT: قراءة عامة
--
-- الأدمن:
--   - INSERT / UPDATE / DELETE
--
-- =============================================================================

ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_posts_public_read" ON public.news_posts;
CREATE POLICY "news_posts_public_read"
ON public.news_posts
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "news_posts_admin_write" ON public.news_posts;
CREATE POLICY "news_posts_admin_write"
ON public.news_posts
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "news_posts_admin_update" ON public.news_posts;
CREATE POLICY "news_posts_admin_update"
ON public.news_posts
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "news_posts_admin_delete" ON public.news_posts;
CREATE POLICY "news_posts_admin_delete"
ON public.news_posts
FOR DELETE
TO authenticated
USING (public.is_admin());


-- =============================================================================
-- TABLE: published_news
-- =============================================================================
--
-- anon + authenticated:
--   - لا شيء (deny all)
--
-- Worker / service_role:
--   - bypass
--
-- =============================================================================

ALTER TABLE public.published_news ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- POST-DEPLOY VERIFICATION
-- =============================================================================

-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'profiles',
--     'analysis_requests',
--     'price_alerts',
--     'subscription_requests',
--     'account_management_requests',
--     'notifications',
--     'vip_signals',
--     'news_posts',
--     'published_news'
--   )
-- ORDER BY tablename;

-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- SELECT column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public'
--   AND table_name = 'profiles'
--   AND grantee = 'authenticated'
-- ORDER BY column_name, privilege_type;


-- =============================================================================
-- TEST PLAN
-- =============================================================================
--
-- 1) anon
--    ✅ news_posts SELECT
--    ❌ profiles / vip_signals / analysis_requests / ...
--
-- 2) authenticated user
--    ✅ profiles SELECT صفه
--    ✅ profiles UPDATE username, telegram (وفقط الحقول الممنوحة)
--    ❌ profiles UPDATE role, email, subscription_plan, subscription_status
--    ✅ analysis_requests / subscription_requests / notifications (صفه)
--    ✅ vip_signals SELECT (مؤقت — حتى migration layout.js)
--    ❌ vip_signals INSERT
--
-- 3) admin (profiles.role = 'admin')
--    ✅ كل الجداols عبر policies admin
--    ✅ profiles UPDATE أي عمود
--
-- 4) service_role
--    ✅ bypass تلقائي
--
-- =============================================================================
--
-- TODO بعد migration layout.js → /api/vip-signals:
--
--   DROP POLICY IF EXISTS "vip_signals_authenticated_select_temp" ON public.vip_signals;
--
--   CREATE POLICY "vip_signals_admin_select"
--   ON public.vip_signals FOR SELECT TO authenticated
--   USING (public.is_admin());
--
-- =============================================================================
