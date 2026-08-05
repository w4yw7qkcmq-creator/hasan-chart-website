-- Subscription maintenance worker machine identity (least privilege)
INSERT INTO public.iam_service_accounts (id, label, description, secret_hash, enabled)
VALUES (
  'subscription-maintenance-worker',
  'Subscription Maintenance Worker',
  'Railway subscription expiry/maintenance worker HTTP /run',
  NULL,
  false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.iam_service_account_permissions (service_account_id, permission_id, effect)
VALUES
  ('subscription-maintenance-worker', 'system.cron.read', 'allow'),
  ('subscription-maintenance-worker', 'subscriptions.read', 'allow'),
  ('subscription-maintenance-worker', 'subscriptions.manage', 'allow')
ON CONFLICT DO NOTHING;
