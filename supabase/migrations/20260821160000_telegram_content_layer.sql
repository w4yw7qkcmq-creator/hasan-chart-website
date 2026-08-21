-- =============================================================================
-- HasaN CharT World — Telegram Content Sync Layer (Phase 2A)
-- Independent from daily_analysis and content_posts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Published posts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  content_source text NOT NULL DEFAULT 'telegram',

  telegram_channel_id bigint NOT NULL,
  telegram_message_id bigint NOT NULL,
  telegram_media_group_id text,

  body text NOT NULL,
  body_entities jsonb,

  public_slug text NOT NULL,
  display_title text,

  sync_status text NOT NULL DEFAULT 'published',
  qualification_status text NOT NULL DEFAULT 'eligible',
  ineligible_reason text,
  review_flag text,

  aggregation_key text,
  message_count integer,

  published_at timestamptz NOT NULL,
  telegram_edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT telegram_content_posts_section_check
    CHECK (section IN ('daily_analysis', 'academy', 'result')),

  CONSTRAINT telegram_content_posts_content_source_check
    CHECK (content_source = 'telegram'),

  CONSTRAINT telegram_content_posts_sync_status_check
    CHECK (sync_status IN ('published', 'rejected')),

  CONSTRAINT telegram_content_posts_qualification_status_check
    CHECK (qualification_status IN ('eligible', 'ineligible')),

  CONSTRAINT telegram_content_posts_body_not_blank
    CHECK (length(trim(body)) > 0)
);

COMMENT ON TABLE public.telegram_content_posts IS
  'Telegram-sourced content posts synced to the website. Independent from manual CMS tables.';

-- Single-message published posts
CREATE UNIQUE INDEX IF NOT EXISTS telegram_content_posts_single_msg_unique_idx
  ON public.telegram_content_posts (telegram_channel_id, telegram_message_id)
  WHERE telegram_media_group_id IS NULL
    AND sync_status = 'published'
    AND qualification_status = 'eligible';

-- Album published posts
CREATE UNIQUE INDEX IF NOT EXISTS telegram_content_posts_album_unique_idx
  ON public.telegram_content_posts (telegram_channel_id, telegram_media_group_id)
  WHERE telegram_media_group_id IS NOT NULL
    AND sync_status = 'published'
    AND qualification_status = 'eligible';

CREATE UNIQUE INDEX IF NOT EXISTS telegram_content_posts_public_slug_section_idx
  ON public.telegram_content_posts (section, public_slug)
  WHERE sync_status = 'published';

CREATE INDEX IF NOT EXISTS telegram_content_posts_section_published_idx
  ON public.telegram_content_posts (section, published_at DESC)
  WHERE sync_status = 'published' AND qualification_status = 'eligible';

CREATE INDEX IF NOT EXISTS telegram_content_posts_section_retention_idx
  ON public.telegram_content_posts (section, published_at ASC)
  WHERE sync_status = 'published' AND qualification_status = 'eligible';

CREATE INDEX IF NOT EXISTS telegram_content_posts_channel_msg_idx
  ON public.telegram_content_posts (telegram_channel_id, telegram_message_id);

-- -----------------------------------------------------------------------------
-- 2) Images (one-to-many)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_content_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.telegram_content_posts(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'telegram-content-images',

  telegram_file_id text NOT NULL,
  telegram_file_unique_id text,
  source_message_id bigint NOT NULL,

  mime_type text NOT NULL,
  width integer,
  height integer,
  file_size_bytes integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT telegram_content_images_sort_order_check
    CHECK (sort_order >= 0),

  CONSTRAINT telegram_content_images_file_size_check
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 8388608),

  CONSTRAINT telegram_content_images_mime_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_content_images_post_sort_unique_idx
  ON public.telegram_content_images (post_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_content_images_post_source_msg_unique_idx
  ON public.telegram_content_images (post_id, source_message_id);

CREATE INDEX IF NOT EXISTS telegram_content_images_post_sort_idx
  ON public.telegram_content_images (post_id, sort_order);

-- -----------------------------------------------------------------------------
-- 3) Album buffer (per message)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_media_group_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_channel_id bigint NOT NULL,
  telegram_media_group_id text NOT NULL,
  telegram_message_id bigint NOT NULL,
  section text NOT NULL,

  has_video boolean NOT NULL DEFAULT false,
  has_animation boolean NOT NULL DEFAULT false,
  has_video_note boolean NOT NULL DEFAULT false,

  body text,
  body_entities jsonb,
  photo_file_id text,
  photo_file_unique_id text,
  photo_width integer,
  photo_height integer,

  raw_update_id bigint,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  processing_status text NOT NULL DEFAULT 'pending',

  CONSTRAINT telegram_media_group_buffer_section_check
    CHECK (section IN ('daily_analysis', 'academy', 'result')),

  CONSTRAINT telegram_media_group_buffer_processing_status_check
    CHECK (processing_status IN ('pending', 'consumed', 'rejected', 'poison'))
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_media_group_buffer_message_unique_idx
  ON public.telegram_media_group_buffer (telegram_channel_id, telegram_message_id);

-- -----------------------------------------------------------------------------
-- 4) Album group state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_media_group_state (
  telegram_channel_id bigint NOT NULL,
  telegram_media_group_id text NOT NULL,
  section text NOT NULL,

  has_ineligible_media boolean NOT NULL DEFAULT false,
  ineligible_reason text,
  message_count integer NOT NULL DEFAULT 0,

  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  finalize_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'buffering',
  finalize_attempts integer NOT NULL DEFAULT 0,
  last_error text,

  PRIMARY KEY (telegram_channel_id, telegram_media_group_id),

  CONSTRAINT telegram_media_group_state_section_check
    CHECK (section IN ('daily_analysis', 'academy', 'result')),

  CONSTRAINT telegram_media_group_state_status_check
    CHECK (status IN ('buffering', 'finalizing', 'finalized', 'rejected', 'poison'))
);

CREATE INDEX IF NOT EXISTS telegram_media_group_state_finalize_idx
  ON public.telegram_media_group_state (finalize_after)
  WHERE status = 'buffering';

-- -----------------------------------------------------------------------------
-- 5) Webhook ingress log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_webhook_ingress_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_update_id bigint NOT NULL,
  telegram_channel_id bigint,
  telegram_message_id bigint,
  update_type text NOT NULL,
  processing_result text NOT NULL,
  error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT telegram_webhook_ingress_log_update_type_check
    CHECK (update_type IN ('channel_post', 'edited_channel_post', 'ignored')),

  CONSTRAINT telegram_webhook_ingress_log_processing_result_check
    CHECK (
      processing_result IN (
        'accepted',
        'ignored',
        'duplicate',
        'rejected',
        'error',
        'buffered',
        'finalized'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_webhook_ingress_log_update_id_unique_idx
  ON public.telegram_webhook_ingress_log (telegram_update_id);

CREATE INDEX IF NOT EXISTS telegram_webhook_ingress_log_received_at_idx
  ON public.telegram_webhook_ingress_log (received_at DESC);

-- -----------------------------------------------------------------------------
-- 6) updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.telegram_content_posts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_content_posts_updated_at_trigger ON public.telegram_content_posts;
CREATE TRIGGER telegram_content_posts_updated_at_trigger
  BEFORE UPDATE ON public.telegram_content_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.telegram_content_posts_set_updated_at();

CREATE OR REPLACE FUNCTION public.telegram_content_images_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_content_images_updated_at_trigger ON public.telegram_content_images;
CREATE TRIGGER telegram_content_images_updated_at_trigger
  BEFORE UPDATE ON public.telegram_content_images
  FOR EACH ROW
  EXECUTE FUNCTION public.telegram_content_images_set_updated_at();

-- -----------------------------------------------------------------------------
-- 7) Retention RPC — returns victims; storage delete happens in application layer
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_telegram_section_retention(
  p_section text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  deleted_post_id uuid,
  storage_paths text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excess integer;
BEGIN
  IF p_section NOT IN ('daily_analysis', 'academy', 'result') THEN
    RAISE EXCEPTION 'invalid section';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'invalid retention limit';
  END IF;

  SELECT COUNT(*)::integer - p_limit
  INTO v_excess
  FROM public.telegram_content_posts
  WHERE section = p_section
    AND sync_status = 'published'
    AND qualification_status = 'eligible';

  IF v_excess IS NULL OR v_excess <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH victims AS (
    SELECT p.id
    FROM public.telegram_content_posts p
    WHERE p.section = p_section
      AND p.sync_status = 'published'
      AND p.qualification_status = 'eligible'
    ORDER BY p.published_at ASC, p.created_at ASC
    LIMIT v_excess
    FOR UPDATE SKIP LOCKED
  ),
  path_agg AS (
    SELECT i.post_id, array_agg(i.storage_path ORDER BY i.sort_order) AS paths
    FROM public.telegram_content_images i
    WHERE i.post_id IN (SELECT id FROM victims)
    GROUP BY i.post_id
  )
  SELECT v.id, COALESCE(pa.paths, ARRAY[]::text[])
  FROM victims v
  LEFT JOIN path_agg pa ON pa.post_id = v.id;
END;
$$;

COMMENT ON FUNCTION public.enforce_telegram_section_retention IS
  'Returns oldest eligible Telegram posts exceeding per-section limit. Application deletes storage then DB row.';

-- -----------------------------------------------------------------------------
-- 8) Operational cleanup RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_telegram_content_operational_tables(
  p_ingress_retention_days integer DEFAULT 30,
  p_buffer_terminal_retention_days integer DEFAULT 7
)
RETURNS TABLE (
  ingress_deleted bigint,
  buffer_deleted bigint,
  group_state_deleted bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ingress_deleted bigint := 0;
  v_buffer_deleted bigint := 0;
  v_group_deleted bigint := 0;
BEGIN
  IF p_ingress_retention_days < 7 OR p_ingress_retention_days > 365 THEN
    RAISE EXCEPTION 'ingress retention out of bounds';
  END IF;

  IF p_buffer_terminal_retention_days < 1 OR p_buffer_terminal_retention_days > 90 THEN
    RAISE EXCEPTION 'buffer retention out of bounds';
  END IF;

  DELETE FROM public.telegram_webhook_ingress_log
  WHERE received_at < now() - make_interval(days => p_ingress_retention_days);
  GET DIAGNOSTICS v_ingress_deleted = ROW_COUNT;

  DELETE FROM public.telegram_media_group_buffer
  WHERE processing_status IN ('consumed', 'rejected', 'poison')
    AND last_seen_at < now() - make_interval(days => p_buffer_terminal_retention_days);
  GET DIAGNOSTICS v_buffer_deleted = ROW_COUNT;

  DELETE FROM public.telegram_media_group_state
  WHERE status IN ('finalized', 'rejected', 'poison')
    AND last_received_at < now() - make_interval(days => p_buffer_terminal_retention_days);
  GET DIAGNOSTICS v_group_deleted = ROW_COUNT;

  ingress_deleted := v_ingress_deleted;
  buffer_deleted := v_buffer_deleted;
  group_state_deleted := v_group_deleted;
  RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9) RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.telegram_content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_content_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_media_group_buffer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_media_group_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_webhook_ingress_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.telegram_content_posts TO anon, authenticated;
GRANT SELECT ON public.telegram_content_images TO anon, authenticated;

GRANT ALL ON public.telegram_content_posts TO service_role;
GRANT ALL ON public.telegram_content_images TO service_role;
GRANT ALL ON public.telegram_media_group_buffer TO service_role;
GRANT ALL ON public.telegram_media_group_state TO service_role;
GRANT ALL ON public.telegram_webhook_ingress_log TO service_role;

REVOKE ALL ON FUNCTION public.enforce_telegram_section_retention(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_telegram_section_retention(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_telegram_content_operational_tables(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_telegram_content_operational_tables(integer, integer) TO service_role;

DROP POLICY IF EXISTS telegram_content_posts_public_read ON public.telegram_content_posts;
CREATE POLICY telegram_content_posts_public_read
  ON public.telegram_content_posts
  FOR SELECT
  TO anon, authenticated
  USING (sync_status = 'published' AND qualification_status = 'eligible');

DROP POLICY IF EXISTS telegram_content_images_public_read ON public.telegram_content_images;
CREATE POLICY telegram_content_images_public_read
  ON public.telegram_content_images
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.telegram_content_posts p
      WHERE p.id = post_id
        AND p.sync_status = 'published'
        AND p.qualification_status = 'eligible'
    )
  );

DROP POLICY IF EXISTS telegram_content_staging_service_role_all ON public.telegram_media_group_buffer;
CREATE POLICY telegram_content_staging_service_role_all
  ON public.telegram_media_group_buffer
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS telegram_content_group_state_service_role_all ON public.telegram_media_group_state;
CREATE POLICY telegram_content_group_state_service_role_all
  ON public.telegram_media_group_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS telegram_content_ingress_service_role_all ON public.telegram_webhook_ingress_log;
CREATE POLICY telegram_content_ingress_service_role_all
  ON public.telegram_webhook_ingress_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 10) Storage bucket
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'telegram-content-images',
  'telegram-content-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS telegram_content_images_public_read ON storage.objects;
CREATE POLICY telegram_content_images_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'telegram-content-images');
