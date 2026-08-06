-- VIP signal trade status, delivery state machine, atomic RPC, RLS
-- PROPOSED — review before apply. Do NOT apply to Production without approval.

BEGIN;

-- =============================================================================
-- vip_signals — status + publish metadata
-- =============================================================================
ALTER TABLE public.vip_signals
  ADD COLUMN IF NOT EXISTS coin text,
  ADD COLUMN IF NOT EXISTS entry text,
  ADD COLUMN IF NOT EXISTS targets text,
  ADD COLUMN IF NOT EXISTS stop_loss text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'نشطة',
  ADD COLUMN IF NOT EXISTS trade_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS target_1_hit_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_2_hit_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS last_status_event text,
  ADD COLUMN IF NOT EXISTS last_status_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_updated_by text,
  ADD COLUMN IF NOT EXISTS publish_recipient_count integer,
  ADD COLUMN IF NOT EXISTS published_by_email text,
  ADD COLUMN IF NOT EXISTS published_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vip_signals_trade_status_check'
  ) THEN
    ALTER TABLE public.vip_signals
      ADD CONSTRAINT vip_signals_trade_status_check
      CHECK (trade_status IN (
        'active',
        'target_1_hit',
        'target_2_hit',
        'closed_immediately',
        'completed',
        'cancelled'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.vip_signals.trade_status IS
  'active | target_1_hit | target_2_hit | closed_immediately | completed | cancelled';

CREATE INDEX IF NOT EXISTS vip_signals_created_at_desc_idx
  ON public.vip_signals (created_at DESC);

CREATE INDEX IF NOT EXISTS vip_signals_trade_status_idx
  ON public.vip_signals (trade_status, created_at DESC);

-- Legacy rows keep trade_status = active via DEFAULT; no data mutation.

-- =============================================================================
-- vip_signal_status_events — one event per signal + event_type
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.vip_signal_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id bigint NOT NULL REFERENCES public.vip_signals(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('target_1_hit', 'target_2_hit', 'close_now')),
  previous_trade_status text,
  new_trade_status text NOT NULL,
  admin_email text,
  admin_id uuid,
  eligible_recipient_count integer NOT NULL DEFAULT 0,
  site_notifications_sent integer NOT NULL DEFAULT 0,
  push_sent integer NOT NULL DEFAULT 0,
  push_unavailable integer NOT NULL DEFAULT 0,
  push_failed integer NOT NULL DEFAULT 0,
  email_sent integer NOT NULL DEFAULT 0,
  email_failed integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_signal_status_events_signal_event_unique UNIQUE (signal_id, event_type)
);

CREATE INDEX IF NOT EXISTS vip_signal_status_events_signal_id_idx
  ON public.vip_signal_status_events (signal_id, created_at DESC);

-- =============================================================================
-- vip_signal_status_deliveries — per-user per-channel delivery state machine
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.vip_signal_status_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id bigint NOT NULL REFERENCES public.vip_signals(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('target_1_hit', 'target_2_hit', 'close_now')),
  user_email text NOT NULL,
  user_id uuid,
  channel text NOT NULL CHECK (channel IN ('site', 'push', 'email')),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sending', 'delivered', 'failed', 'unavailable', 'skipped'
  )),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message_safe text,
  provider_message_id text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_signal_status_deliveries_signal_event_user_channel_unique
    UNIQUE (signal_id, event_type, user_email, channel)
);

CREATE INDEX IF NOT EXISTS vip_signal_status_deliveries_signal_event_idx
  ON public.vip_signal_status_deliveries (signal_id, event_type);

CREATE INDEX IF NOT EXISTS vip_signal_status_deliveries_retry_idx
  ON public.vip_signal_status_deliveries (signal_id, event_type, status)
  WHERE status IN ('failed', 'pending') AND attempt_count < 3;

-- Site notifications: unique per user + event (via notification_key in app layer)
-- Optional index on notifications if table has notification_key column:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'notification_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'notifications_vip_status_key_user_unique_idx'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'user_id'
    ) THEN
      CREATE UNIQUE INDEX notifications_vip_status_key_user_unique_idx
        ON public.notifications (user_id, notification_key)
        WHERE notification_key LIKE 'vip_status:%';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'user_email'
    ) THEN
      CREATE UNIQUE INDEX notifications_vip_status_key_user_unique_idx
        ON public.notifications (user_email, notification_key)
        WHERE notification_key LIKE 'vip_status:%';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- Atomic status transition RPC (FOR UPDATE + single transaction)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_vip_signal_status_event(
  p_signal_id bigint,
  p_event_type text,
  p_admin_user_id uuid DEFAULT NULL,
  p_admin_email text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  previous_status text,
  new_status text,
  duplicate boolean,
  signal_coin text,
  signal_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signal public.vip_signals%ROWTYPE;
  v_current text;
  v_new text;
  v_now timestamptz := now();
  v_event_id uuid;
  v_idempotency text;
  v_existing uuid;
BEGIN
  IF p_event_type NOT IN ('target_1_hit', 'target_2_hit', 'close_now') THEN
    RAISE EXCEPTION 'invalid_event_type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_signal
  FROM public.vip_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signal_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_current := COALESCE(NULLIF(trim(v_signal.trade_status), ''), 'active');

  IF v_current IN ('closed_immediately', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'signal_closed' USING ERRCODE = '22023';
  END IF;

  IF p_event_type = 'target_1_hit' AND v_current IN ('target_1_hit', 'target_2_hit') THEN
    RAISE EXCEPTION 'duplicate_target_1' USING ERRCODE = '23505';
  END IF;

  IF p_event_type = 'target_2_hit' THEN
    IF v_current = 'target_2_hit' THEN
      RAISE EXCEPTION 'duplicate_target_2' USING ERRCODE = '23505';
    END IF;
    IF v_current <> 'target_1_hit' THEN
      RAISE EXCEPTION 'target_1_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_idempotency := 'vip_status_event:' || p_signal_id::text || ':' || p_event_type;

  SELECT id INTO v_existing
  FROM public.vip_signal_status_events
  WHERE signal_id = p_signal_id AND event_type = p_event_type;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY
    SELECT v_existing, v_current, v_signal.trade_status, true, v_signal.coin, v_signal.signal_type;
    RETURN;
  END IF;

  IF p_event_type = 'target_1_hit' THEN
    v_new := 'target_1_hit';
  ELSIF p_event_type = 'target_2_hit' THEN
    v_new := 'target_2_hit';
  ELSE
    v_new := 'closed_immediately';
  END IF;

  INSERT INTO public.vip_signal_status_events (
    signal_id, event_type, previous_trade_status, new_trade_status,
    admin_email, admin_id, idempotency_key, request_id
  ) VALUES (
    p_signal_id, p_event_type, v_current, v_new,
    p_admin_email, p_admin_user_id, v_idempotency, p_request_id
  )
  RETURNING id INTO v_event_id;

  UPDATE public.vip_signals SET
    trade_status = v_new,
    last_status_event = p_event_type,
    last_status_event_at = v_now,
    last_status_updated_by = p_admin_email,
    target_1_hit_at = CASE WHEN p_event_type = 'target_1_hit' THEN v_now ELSE target_1_hit_at END,
    target_2_hit_at = CASE WHEN p_event_type = 'target_2_hit' THEN v_now ELSE target_2_hit_at END,
    closed_at = CASE WHEN p_event_type = 'close_now' THEN v_now ELSE closed_at END,
    closed_reason = CASE WHEN p_event_type = 'close_now' THEN 'admin_close_now' ELSE closed_reason END,
    status = CASE WHEN p_event_type = 'close_now' THEN 'مغلقة' ELSE status END
  WHERE id = p_signal_id;

  RETURN QUERY
  SELECT v_event_id, v_current, v_new, false, v_signal.coin, v_signal.signal_type;
END;
$$;

REVOKE ALL ON FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_vip_signal_status_event(bigint, text, uuid, text, text)
  TO service_role;

-- =============================================================================
-- RLS — backend/service_role only; no open policies
-- =============================================================================
ALTER TABLE public.vip_signal_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_signal_status_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_signal_status_events_service_all ON public.vip_signal_status_events;
CREATE POLICY vip_signal_status_events_service_all
  ON public.vip_signal_status_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS vip_signal_status_deliveries_service_all ON public.vip_signal_status_deliveries;
CREATE POLICY vip_signal_status_deliveries_service_all
  ON public.vip_signal_status_deliveries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Deny authenticated/anon direct access (no permissive policies for them)

COMMIT;
