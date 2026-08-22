-- Phase E3 — Email consent evidence columns (append-only, no marketing backfill)

ALTER TABLE public.email_marketing_preferences
  ADD COLUMN IF NOT EXISTS normalized_email text,
  ADD COLUMN IF NOT EXISTS opted_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.email_marketing_preferences.normalized_email IS
  'Normalized email at time of preference change (audit evidence).';
COMMENT ON COLUMN public.email_marketing_preferences.opted_in_at IS
  'Timestamp of most recent explicit marketing opt-in.';
COMMENT ON COLUMN public.email_marketing_preferences.opted_out_at IS
  'Timestamp of most recent marketing opt-out.';
COMMENT ON COLUMN public.email_marketing_preferences.policy_version IS
  'Consent policy version active when preference was recorded.';
COMMENT ON COLUMN public.email_marketing_preferences.metadata IS
  'Limited audit metadata (flow, campaign correlation). No IP by default.';

CREATE INDEX IF NOT EXISTS idx_email_marketing_preferences_opt_in
  ON public.email_marketing_preferences (marketing_opt_in)
  WHERE marketing_opt_in = true;

CREATE INDEX IF NOT EXISTS idx_email_marketing_preferences_unsubscribed
  ON public.email_marketing_preferences (global_unsubscribed_at)
  WHERE global_unsubscribed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_marketing_preferences_normalized_email
  ON public.email_marketing_preferences (normalized_email)
  WHERE normalized_email IS NOT NULL;

-- Backfill normalized_email from profiles only (NOT marketing_opt_in)
UPDATE public.email_marketing_preferences p
SET normalized_email = lower(trim(pr.email))
FROM public.profiles pr
WHERE p.user_id = pr.id
  AND p.normalized_email IS NULL
  AND pr.email IS NOT NULL;
