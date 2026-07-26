-- Query optimization 5.2 — vip_signals list by type + recency.

CREATE INDEX IF NOT EXISTS vip_signals_type_created_idx
  ON public.vip_signals (signal_type, created_at DESC);
