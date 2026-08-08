-- IAM permissions for Academy + Result content management.

INSERT INTO public.iam_permissions (id, label, category) VALUES
  ('content.read', 'قراءة المحتوى', 'content'),
  ('content.manage', 'إدارة المحتوى', 'content'),
  ('content.publish', 'نشر المحتوى', 'content')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('super_admin', 'content.read', 'allow'),
  ('super_admin', 'content.manage', 'allow'),
  ('super_admin', 'content.publish', 'allow'),
  ('admin', 'content.read', 'allow'),
  ('admin', 'content.manage', 'allow'),
  ('admin', 'content.publish', 'allow')
ON CONFLICT (role_id, permission_id) DO NOTHING;
