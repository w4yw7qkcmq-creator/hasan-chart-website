-- Partner Program — Phase 3 (Admin)
-- Partner tier + withdrawal payment timestamps

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard';

ALTER TABLE public.partner_withdrawals
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE INDEX IF NOT EXISTS partner_withdrawals_paid_at_idx
  ON public.partner_withdrawals (paid_at DESC);
