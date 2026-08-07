-- Public content images bucket for Academy + Result posts.
-- Writes via server-issued signed upload URLs (service role) only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read for published content images.
DROP POLICY IF EXISTS "content_images_public_read" ON storage.objects;
CREATE POLICY "content_images_public_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'content-images');
