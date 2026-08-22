-- Phase E2: Email campaigns, recipients snapshot, outbox priority, processor RPCs.

-- ---------------------------------------------------------------------------
-- Outbox priority (lower = higher priority). Transactional defaults 0, bulk 10.
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_outbox_priority_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_priority_check
      CHECK (priority >= 0 AND priority <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_outbox_pending_priority_idx
  ON public.email_outbox (priority ASC, scheduled_at ASC, created_at ASC)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- email_campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  preview_text text,
  html_content text NOT NULL DEFAULT '',
  text_content text,
  category text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  audience_type text,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_snapshot_count integer NOT NULL DEFAULT 0,
  eligible_count integer NOT NULL DEFAULT 0,
  suppressed_count integer NOT NULL DEFAULT 0,
  queued_count integer NOT NULL DEFAULT 0,
  provider_accepted_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  complained_count integer NOT NULL DEFAULT 0,
  unsubscribed_count integer NOT NULL DEFAULT 0,
  enqueue_cursor uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT email_campaigns_status_check CHECK (
    status IN (
      'draft', 'preparing', 'ready', 'sending', 'paused',
      'completed', 'cancelled', 'failed'
    )
  ),
  CONSTRAINT email_campaigns_category_check CHECK (
    category IN ('marketing', 'bulk')
  )
);

CREATE INDEX IF NOT EXISTS email_campaigns_status_created_idx
  ON public.email_campaigns (status, created_at DESC);

CREATE INDEX IF NOT EXISTS email_campaigns_created_by_idx
  ON public.email_campaigns (created_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- email_campaign_recipients (immutable snapshot after launch)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  normalized_email text NOT NULL,
  eligibility_status text NOT NULL DEFAULT 'pending',
  eligibility_reason text,
  delivery_status text NOT NULL DEFAULT 'pending',
  outbox_id uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  resend_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  outbox_queued_at timestamptz,
  provider_accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT email_campaign_recipients_eligibility_check CHECK (
    eligibility_status IN ('eligible', 'excluded')
  ),
  CONSTRAINT email_campaign_recipients_delivery_status_check CHECK (
    delivery_status IN (
      'pending', 'queued', 'outbox_pending', 'outbox_processing', 'provider_accepted',
      'sent', 'delivered', 'failed', 'bounced', 'complained', 'skipped', 'cancelled', 'excluded'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_campaign_email_unique
  ON public.email_campaign_recipients (campaign_id, normalized_email);

CREATE INDEX IF NOT EXISTS email_campaign_recipients_campaign_delivery_idx
  ON public.email_campaign_recipients (campaign_id, delivery_status);

CREATE INDEX IF NOT EXISTS email_campaign_recipients_campaign_queued_idx
  ON public.email_campaign_recipients (campaign_id, id)
  WHERE delivery_status = 'queued';

CREATE INDEX IF NOT EXISTS email_campaign_recipients_outbox_idx
  ON public.email_campaign_recipients (outbox_id)
  WHERE outbox_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_email_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_campaigns_set_updated_at ON public.email_campaigns;
CREATE TRIGGER email_campaigns_set_updated_at
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_email_campaigns_updated_at();

CREATE OR REPLACE FUNCTION public.set_email_campaign_recipients_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_campaign_recipients_set_updated_at ON public.email_campaign_recipients;
CREATE TRIGGER email_campaign_recipients_set_updated_at
BEFORE UPDATE ON public.email_campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.set_email_campaign_recipients_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service_role only (admin APIs use service role)
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaigns FROM anon, authenticated;
REVOKE ALL ON public.email_campaign_recipients FROM anon, authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
GRANT ALL ON public.email_campaign_recipients TO service_role;

-- ---------------------------------------------------------------------------
-- Priority-aware outbox claim
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_email_outbox_batch(p_limit integer DEFAULT 25)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.email_outbox o
    WHERE o.status = 'pending'
      AND o.scheduled_at <= now()
      AND o.attempts < o.max_attempts
    ORDER BY o.priority ASC, o.scheduled_at ASC, o.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox o
  SET
    status = 'processing',
    claimed_at = now(),
    attempts = o.attempts + 1,
    updated_at = now()
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox_batch(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic campaign launch lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.try_start_email_campaign_sending(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.email_campaigns
  SET
    status = 'sending',
    started_at = COALESCE(started_at, now()),
    paused_at = NULL,
    updated_at = now()
  WHERE id = p_campaign_id
    AND status IN ('ready', 'paused');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.try_start_email_campaign_sending(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_start_email_campaign_sending(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Mark eligible recipients queued for processor
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_email_campaign_recipients(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.email_campaign_recipients
  SET
    delivery_status = 'queued',
    queued_at = now(),
    updated_at = now()
  WHERE campaign_id = p_campaign_id
    AND eligibility_status = 'eligible'
    AND delivery_status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.email_campaigns
  SET
    queued_count = (
      SELECT count(*)::integer FROM public.email_campaign_recipients
      WHERE campaign_id = p_campaign_id AND delivery_status NOT IN ('excluded', 'cancelled')
    ),
    updated_at = now()
  WHERE id = p_campaign_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_email_campaign_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_email_campaign_recipients(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Claim batch of campaign recipients for enqueue processor
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_email_campaign_recipient_batch(
  p_campaign_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.email_campaign_recipients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT r.id
    FROM public.email_campaign_recipients r
    JOIN public.email_campaigns c ON c.id = r.campaign_id
    WHERE r.campaign_id = p_campaign_id
      AND c.status = 'sending'
      AND r.eligibility_status = 'eligible'
      AND r.delivery_status = 'queued'
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_campaign_recipients r
  SET
    delivery_status = 'outbox_pending',
    updated_at = now()
  FROM candidates c
  WHERE r.id = c.id
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_campaign_recipient_batch(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_campaign_recipient_batch(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Pause: skip pending outbox rows for campaign
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pause_email_campaign_outbox(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.email_outbox o
  SET
    status = 'skipped',
    skipped_at = now(),
    updated_at = now(),
    error = COALESCE(o.error, 'campaign paused')
  WHERE o.status = 'pending'
    AND (
      o.metadata->>'campaign_id' = p_campaign_id::text
      OR o.metadata->>'campaignId' = p_campaign_id::text
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.email_campaign_recipients
  SET
    delivery_status = 'cancelled',
    cancelled_at = now(),
    updated_at = now(),
    error = COALESCE(error, 'campaign paused')
  WHERE campaign_id = p_campaign_id
    AND delivery_status IN ('queued', 'outbox_pending');

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_email_campaign_outbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_email_campaign_outbox(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- IAM: grant campaign permissions to admin role
-- ---------------------------------------------------------------------------

INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('admin', 'email.campaign.read', 'allow'),
  ('admin', 'email.campaign.create', 'allow'),
  ('admin', 'email.campaign.send', 'allow'),
  ('admin', 'email.outbox.read', 'allow'),
  ('admin', 'email.suppression.manage', 'allow')
ON CONFLICT DO NOTHING;

INSERT INTO public.iam_role_permissions (role_id, permission_id, effect)
SELECT 'super_admin', p.id, 'allow'
FROM public.iam_permissions p
WHERE p.id IN (
  'email.campaign.read',
  'email.campaign.create',
  'email.campaign.send',
  'email.outbox.read',
  'email.suppression.manage'
)
ON CONFLICT DO NOTHING;
