-- =============================================================================
-- HasaN CharT World — daily_analysis (التحليلات اليومية)
-- =============================================================================
-- نفّذ هذا الملف مرة واحدة في:
--   Supabase Dashboard → SQL Editor → New query → Run
--
-- آمن للتكرار: IF NOT EXISTS + DROP POLICY IF EXISTS
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0) Helper: is_admin() — مطلوب لسياسات INSERT/UPDATE/DELETE
--    (إذا كان موجوداً مسبقاً من supabase/rls-policies.sql يُستبدَل بنفس المنطق)
-- -----------------------------------------------------------------------------
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
      AND trim(coalesce(p.role, '')) = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'True when authenticated user has profiles.role = admin.';


-- -----------------------------------------------------------------------------
-- 1) الجدول
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  analysis_type text NOT NULL,
  content text NOT NULL,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published boolean NOT NULL DEFAULT true,

  CONSTRAINT daily_analysis_direction_check
    CHECK (direction IN ('bullish', 'bearish', 'neutral')),

  CONSTRAINT daily_analysis_type_check
    CHECK (analysis_type IN ('daily', 'weekly', 'urgent')),

  CONSTRAINT daily_analysis_title_not_blank
    CHECK (length(trim(title)) > 0),

  CONSTRAINT daily_analysis_symbol_not_blank
    CHECK (length(trim(symbol)) > 0),

  CONSTRAINT daily_analysis_content_not_blank
    CHECK (length(trim(content)) > 0)
);

COMMENT ON TABLE public.daily_analysis IS
  'Daily / weekly / urgent market analysis posts published by admins.';

COMMENT ON COLUMN public.daily_analysis.direction IS
  'bullish | bearish | neutral';

COMMENT ON COLUMN public.daily_analysis.analysis_type IS
  'daily | weekly | urgent';

COMMENT ON COLUMN public.daily_analysis.published IS
  'When true, visible to public readers via API and RLS SELECT policy.';


-- -----------------------------------------------------------------------------
-- 2) الفهارس
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS daily_analysis_published_created_idx
  ON public.daily_analysis (published, created_at DESC);

CREATE INDEX IF NOT EXISTS daily_analysis_created_at_idx
  ON public.daily_analysis (created_at DESC);

CREATE INDEX IF NOT EXISTS daily_analysis_symbol_idx
  ON public.daily_analysis (symbol);


-- -----------------------------------------------------------------------------
-- 3) Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_analysis ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 4) Grants
--    - anon/authenticated: SELECT (مقيّد بـ RLS)
--    - authenticated: INSERT/UPDATE/DELETE (مقيّد بـ RLS للأدمن فقط)
--    - service_role: كامل (يستخدمه /api/daily-analysis من السيرفر)
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.daily_analysis TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.daily_analysis TO authenticated;
GRANT ALL ON TABLE public.daily_analysis TO service_role;


-- -----------------------------------------------------------------------------
-- 5) Policies
-- -----------------------------------------------------------------------------

-- قراءة: الجميع (زائر + مسجل) — المنشور فقط
DROP POLICY IF EXISTS "daily_analysis_public_read_published" ON public.daily_analysis;
CREATE POLICY "daily_analysis_public_read_published"
ON public.daily_analysis
FOR SELECT
TO anon, authenticated
USING (published = true);


-- INSERT: الأدمن فقط
DROP POLICY IF EXISTS "daily_analysis_admin_insert" ON public.daily_analysis;
CREATE POLICY "daily_analysis_admin_insert"
ON public.daily_analysis
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());


-- UPDATE: الأدmin فقط
DROP POLICY IF EXISTS "daily_analysis_admin_update" ON public.daily_analysis;
CREATE POLICY "daily_analysis_admin_update"
ON public.daily_analysis
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- DELETE: الأدmin فقط
DROP POLICY IF EXISTS "daily_analysis_admin_delete" ON public.daily_analysis;
CREATE POLICY "daily_analysis_admin_delete"
ON public.daily_analysis
FOR DELETE
TO authenticated
USING (public.is_admin());


-- -----------------------------------------------------------------------------
-- 6) تحقق سريع (اختياري — يمكن حذف هذا القسم بعد التنفيذ)
-- -----------------------------------------------------------------------------
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'daily_analysis';
--
-- SELECT policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'daily_analysis';
