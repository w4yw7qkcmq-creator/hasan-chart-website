-- VIP recommendation status IAM permissions (PROPOSED — apply before or with status migration)

BEGIN;

INSERT INTO public.iam_permissions (id, label, category, description) VALUES
  ('recommendations.status.read', 'قراءة حالة توصيات VIP', 'recommendations', 'View recent VIP recommendations and status history'),
  ('recommendations.status.update', 'تحديث حالة توصيات VIP', 'recommendations', 'Update VIP trade status (targets, close)'),
  ('recommendations.notifications.send', 'إرسال إشعارات حالة التوصيات', 'recommendations', 'Send site/push/email for VIP status events')
ON CONFLICT (id) DO NOTHING;

-- super_admin gets all via existing seed; grant explicitly for clarity
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect)
SELECT 'super_admin', p.id, 'allow'
FROM public.iam_permissions p
WHERE p.id IN (
  'recommendations.status.read',
  'recommendations.status.update',
  'recommendations.notifications.send'
)
ON CONFLICT DO NOTHING;

-- admin role: VIP status management (not analyst/support/accountant/news_editor)
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('admin', 'recommendations.status.read', 'allow'),
  ('admin', 'recommendations.status.update', 'allow'),
  ('admin', 'recommendations.notifications.send', 'allow')
ON CONFLICT DO NOTHING;

COMMIT;
