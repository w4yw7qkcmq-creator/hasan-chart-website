-- Partner Wallet & Withdrawals — Phase 7

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS total_withdrawn numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_withdrawn >= 0);

ALTER TABLE public.partner_withdrawals
  ADD COLUMN IF NOT EXISTS partner_note text;

CREATE TABLE IF NOT EXISTS public.partner_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN (
      'commission_release',
      'withdrawal_request',
      'withdrawal_paid',
      'withdrawal_rejected',
      'adjustment'
    )
  ),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  balance_before numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_before >= 0),
  balance_after numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_wallet_ledger_partner_id_idx
  ON public.partner_wallet_ledger (partner_id);

CREATE INDEX IF NOT EXISTS partner_wallet_ledger_type_idx
  ON public.partner_wallet_ledger (type);

CREATE INDEX IF NOT EXISTS partner_wallet_ledger_reference_idx
  ON public.partner_wallet_ledger (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS partner_wallet_ledger_created_at_idx
  ON public.partner_wallet_ledger (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS partner_wallet_ledger_withdrawal_paid_unique
  ON public.partner_wallet_ledger (reference_id)
  WHERE type = 'withdrawal_paid' AND reference_type = 'withdrawal';

ALTER TABLE public.partner_wallet_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_wallet_ledger FROM anon, authenticated;
GRANT ALL ON public.partner_wallet_ledger TO service_role;
