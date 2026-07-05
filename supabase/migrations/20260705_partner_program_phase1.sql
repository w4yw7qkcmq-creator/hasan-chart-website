-- Partner Program — Phase 1
-- Tables: partners, partner_referrals, partner_commissions, partner_withdrawals, partner_campaigns
-- Access: server-only via service_role (Next.js API routes)

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  visit_count bigint NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  signup_count bigint NOT NULL DEFAULT 0 CHECK (signup_count >= 0),
  active_account_count bigint NOT NULL DEFAULT 0 CHECK (active_account_count >= 0),
  balance_withdrawable numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_withdrawable >= 0),
  balance_pending numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_pending >= 0),
  balance_bonus_pending numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance_bonus_pending >= 0),
  total_earnings numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_earnings >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_referral_code_idx
  ON public.partners (lower(referral_code));

CREATE INDEX IF NOT EXISTS partners_user_id_idx
  ON public.partners (user_id);

CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'pending_activation', 'active', 'inactive')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_referrals_partner_id_idx
  ON public.partner_referrals (partner_id);

CREATE INDEX IF NOT EXISTS partner_referrals_status_idx
  ON public.partner_referrals (status);

CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.partner_referrals(id) ON DELETE SET NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('signup_bonus', 'vip_subscription', 'account_management')),
  source_ref text,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  is_withdrawable boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_commissions_partner_id_idx
  ON public.partner_commissions (partner_id);

CREATE INDEX IF NOT EXISTS partner_commissions_status_idx
  ON public.partner_commissions (status);

CREATE TABLE IF NOT EXISTS public.partner_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USDT',
  network text NOT NULL CHECK (network IN ('TRC20', 'BEP20', 'ERC20', 'TON')),
  wallet_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_withdrawals_partner_id_idx
  ON public.partner_withdrawals (partner_id);

CREATE INDEX IF NOT EXISTS partner_withdrawals_status_idx
  ON public.partner_withdrawals (status);

CREATE TABLE IF NOT EXISTS public.partner_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  visit_count bigint NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  signup_count bigint NOT NULL DEFAULT 0 CHECK (signup_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_campaigns_partner_id_idx
  ON public.partner_campaigns (partner_id);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partners FROM anon, authenticated;
REVOKE ALL ON public.partner_referrals FROM anon, authenticated;
REVOKE ALL ON public.partner_commissions FROM anon, authenticated;
REVOKE ALL ON public.partner_withdrawals FROM anon, authenticated;
REVOKE ALL ON public.partner_campaigns FROM anon, authenticated;

GRANT ALL ON public.partners TO service_role;
GRANT ALL ON public.partner_referrals TO service_role;
GRANT ALL ON public.partner_commissions TO service_role;
GRANT ALL ON public.partner_withdrawals TO service_role;
GRANT ALL ON public.partner_campaigns TO service_role;
