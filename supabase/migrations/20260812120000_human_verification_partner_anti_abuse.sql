-- Human verification + partner anti-abuse read models (Staging-first rollout).
-- Additive, idempotent. No financial table mutations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS human_verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS human_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_reward_eligibility_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS partner_reward_eligibility_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_reward_risk_level text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_human_verification_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_human_verification_status_check
      CHECK (
        human_verification_status IN (
          'unverified', 'turnstile_verified', 'email_verified', 'verified', 'challenged'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_partner_reward_eligibility_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_partner_reward_eligibility_status_check
      CHECK (
        partner_reward_eligibility_status IN (
          'pending', 'eligible', 'risk_hold', 'blocked', 'manual_review'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.account_risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  signal_type text NOT NULL,
  signal_hash text NOT NULL,
  risk_weight integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_risk_signals_signal_hash_idx
  ON public.account_risk_signals (signal_hash);

CREATE INDEX IF NOT EXISTS account_risk_signals_user_id_idx
  ON public.account_risk_signals (user_id);

CREATE INDEX IF NOT EXISTS account_risk_signals_signal_type_idx
  ON public.account_risk_signals (signal_type);

CREATE INDEX IF NOT EXISTS account_risk_signals_expires_at_idx
  ON public.account_risk_signals (expires_at);

CREATE INDEX IF NOT EXISTS account_risk_signals_last_seen_at_idx
  ON public.account_risk_signals (last_seen_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_risk_signals_type_hash_uidx
  ON public.account_risk_signals (signal_type, signal_hash);

COMMENT ON TABLE public.account_risk_signals IS
  'Privacy-conscious hashed risk signals (no raw IP/device). Service-managed only.';

ALTER TABLE public.account_risk_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_risk_signals_deny_all ON public.account_risk_signals;
CREATE POLICY account_risk_signals_deny_all ON public.account_risk_signals
  FOR ALL USING (false) WITH CHECK (false);

-- Conservative legacy backfill: email-confirmed users only (does NOT force REAL classification).
UPDATE public.profiles p
SET
  human_verification_status = CASE
    WHEN p.human_verification_status <> 'unverified' THEN p.human_verification_status
    WHEN EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p.id AND u.email_confirmed_at IS NOT NULL
    ) THEN 'verified'
    ELSE 'unverified'
  END,
  human_verified_at = COALESCE(
    p.human_verified_at,
    (SELECT u.email_confirmed_at FROM auth.users u WHERE u.id = p.id)
  )
WHERE p.human_verification_status = 'unverified';

COMMENT ON COLUMN public.profiles.human_verification_status IS
  'Server-authoritative human verification read model (Turnstile/email).';

COMMENT ON COLUMN public.profiles.partner_reward_eligibility_status IS
  'Partner monetary reward eligibility (independent from user_classification REAL).';
