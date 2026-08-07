-- Allow forex VIP recommendations in vip_signals.signal_type.

ALTER TABLE public.vip_signals
  DROP CONSTRAINT IF EXISTS vip_signals_signal_type_check;

ALTER TABLE public.vip_signals
  ADD CONSTRAINT vip_signals_signal_type_check
  CHECK (signal_type = ANY (ARRAY['spot'::text, 'futures'::text, 'forex'::text]));

COMMENT ON CONSTRAINT vip_signals_signal_type_check ON public.vip_signals IS
  'Allowed VIP recommendation channels: spot, futures, forex.';
