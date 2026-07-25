-- Payment proof storage metadata (idempotent — DO NOT apply until approved)
-- Keeps legacy payment_proof text column for backward compatibility and migration.

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS payment_proof_path text,
  ADD COLUMN IF NOT EXISTS payment_proof_mime_type text,
  ADD COLUMN IF NOT EXISTS payment_proof_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_proof_storage_provider text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_requests_payment_proof_size_nonneg'
  ) THEN
    ALTER TABLE public.subscription_requests
      ADD CONSTRAINT subscription_requests_payment_proof_size_nonneg
      CHECK (payment_proof_size_bytes IS NULL OR payment_proof_size_bytes >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.subscription_requests.payment_proof_path IS
  'Private Supabase Storage object path (bucket-relative). Preferred source after storage rollout.';
COMMENT ON COLUMN public.subscription_requests.payment_proof_mime_type IS
  'Detected MIME type at upload time (image/jpeg, image/png, image/webp).';
COMMENT ON COLUMN public.subscription_requests.payment_proof_size_bytes IS
  'Raw file size in bytes at upload time.';
COMMENT ON COLUMN public.subscription_requests.payment_proof_uploaded_at IS
  'Timestamp when the proof file was stored in Storage.';
COMMENT ON COLUMN public.subscription_requests.payment_proof_storage_provider IS
  'Storage backend identifier. Default supabase when set by application.';

-- Partial index for migration batches (legacy inline proofs without path)
CREATE INDEX IF NOT EXISTS subscription_requests_payment_proof_legacy_migrate_idx
  ON public.subscription_requests (created_at ASC)
  WHERE payment_proof_path IS NULL
    AND payment_proof IS NOT NULL
    AND payment_proof <> ''
    AND left(payment_proof, 11) = 'data:image/';

-- Partial index for admin proof lookups by storage path
CREATE INDEX IF NOT EXISTS subscription_requests_payment_proof_path_idx
  ON public.subscription_requests (payment_proof_path)
  WHERE payment_proof_path IS NOT NULL;

-- Optional: set default provider only for new rows via application layer.
-- Do NOT backfill payment_proof_storage_provider here.
