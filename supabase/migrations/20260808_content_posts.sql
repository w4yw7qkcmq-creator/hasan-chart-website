-- HasaN CharT World — content_posts (Academy + Result CMS)
-- Single table for admin-managed educational content and results.

CREATE TABLE IF NOT EXISTS public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  body text NOT NULL,
  image_path text,
  category text,
  highlight_value text,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT content_posts_type_check
    CHECK (content_type IN ('academy', 'result')),

  CONSTRAINT content_posts_status_check
    CHECK (status IN ('draft', 'published', 'archived')),

  CONSTRAINT content_posts_title_not_blank
    CHECK (length(trim(title)) > 0),

  CONSTRAINT content_posts_body_not_blank
    CHECK (length(trim(body)) > 0),

  CONSTRAINT content_posts_slug_not_blank
    CHECK (length(trim(slug)) > 0)
);

COMMENT ON TABLE public.content_posts IS
  'Admin-managed Academy lessons and Result posts. Public read via RLS for published rows only.';

CREATE UNIQUE INDEX IF NOT EXISTS content_posts_active_slug_unique_idx
  ON public.content_posts (content_type, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS content_posts_type_status_published_idx
  ON public.content_posts (content_type, status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS content_posts_type_category_idx
  ON public.content_posts (content_type, category)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.content_posts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_posts_updated_at_trigger ON public.content_posts;
CREATE TRIGGER content_posts_updated_at_trigger
  BEFORE UPDATE ON public.content_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.content_posts_set_updated_at();

ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.content_posts TO anon, authenticated;
GRANT ALL ON TABLE public.content_posts TO service_role;

DROP POLICY IF EXISTS "content_posts_public_read_published" ON public.content_posts;
CREATE POLICY "content_posts_public_read_published"
ON public.content_posts
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  AND deleted_at IS NULL
);
