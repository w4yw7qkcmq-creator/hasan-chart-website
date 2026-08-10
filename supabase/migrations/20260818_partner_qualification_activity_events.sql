-- Round 6 follow-up — allow trusted qualification activity event types in partner_events.

ALTER TABLE public.partner_events
  DROP CONSTRAINT IF EXISTS partner_events_event_type_check;

ALTER TABLE public.partner_events
  ADD CONSTRAINT partner_events_event_type_check CHECK (event_type IN (
    'referral_click',
    'signup',
    'verified_signup',
    'qualified_referral',
    'subscription_created',
    'subscription_activated',
    'purchase',
    'revenue_confirmed',
    'refund',
    'chargeback',
    'commission_created',
    'reward_created',
    'reward_approved',
    'reward_reversed',
    'payout_requested',
    'payout_completed',
    'qualification_activity_price_alert',
    'qualification_activity_instant_analysis',
    'qualification_activity_analysis_request',
    'qualification_activity_service_activated'
  ));
