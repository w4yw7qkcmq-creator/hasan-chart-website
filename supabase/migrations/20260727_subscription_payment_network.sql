-- Payment network selection for subscription requests (DO NOT apply until approved)
-- Stores the crypto transfer network chosen by the user during checkout.

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS payment_network text;

ALTER TABLE public.subscription_upload_sessions
  ADD COLUMN IF NOT EXISTS payment_network text;

ALTER TABLE public.subscription_requests
  DROP CONSTRAINT IF EXISTS subscription_requests_payment_network_check;

ALTER TABLE public.subscription_requests
  ADD CONSTRAINT subscription_requests_payment_network_check
  CHECK (payment_network IS NULL OR payment_network IN ('TRC20', 'BEP20'));

ALTER TABLE public.subscription_upload_sessions
  DROP CONSTRAINT IF EXISTS subscription_upload_sessions_payment_network_check;

ALTER TABLE public.subscription_upload_sessions
  ADD CONSTRAINT subscription_upload_sessions_payment_network_check
  CHECK (payment_network IS NULL OR payment_network IN ('TRC20', 'BEP20'));

COMMENT ON COLUMN public.subscription_requests.payment_network IS
  'User-selected crypto transfer network: TRC20 or BEP20. Nullable for legacy requests.';

COMMENT ON COLUMN public.subscription_upload_sessions.payment_network IS
  'Selected payment network captured at upload session init. Copied to subscription_requests on finalize.';
