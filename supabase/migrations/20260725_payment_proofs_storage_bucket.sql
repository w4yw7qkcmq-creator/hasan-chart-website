-- Private payment proofs bucket (idempotent — DO NOT apply until approved)
-- Uploads happen via server-issued signed upload URLs (service role).
-- Direct authenticated storage access is intentionally not granted.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No authenticated INSERT/SELECT policies: all access via signed URLs issued server-side.
