-- Store admin payment proof for partner withdrawal mark-as-paid emails.

ALTER TABLE public.partner_withdrawals
  ADD COLUMN IF NOT EXISTS payment_proof text;
