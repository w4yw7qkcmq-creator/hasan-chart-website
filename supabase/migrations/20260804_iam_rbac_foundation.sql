-- HasaN CharT World — Enterprise IAM / RBAC Foundation
-- Phase 0: tables, seeds, functions (dual-mode with legacy is_admin)

-- =============================================================================
-- Default organization (single-tenant placeholder)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.iam_organizations (id, slug, label)
VALUES ('00000000-0000-0000-0000-000000000001', 'hasan-chart-world', 'HasaN CharT World')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- Roles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_roles (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  organization_id uuid REFERENCES public.iam_organizations(id),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.iam_roles (id, label, description, sort_order) VALUES
  ('super_admin', 'مدير عام', 'Full system access including IAM', 10),
  ('admin', 'مدير', 'General administration', 20),
  ('analyst', 'محلل', 'Analysis and read access', 30),
  ('support', 'دعم', 'User support without ban', 40),
  ('accountant', 'محاسب', 'Financial read access', 50),
  ('news_editor', 'محرر أخبار', 'News management', 60)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Permissions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_permissions (
  id text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL,
  description text,
  organization_id uuid REFERENCES public.iam_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.iam_permissions (id, label, category) VALUES
  ('iam.read', 'قراءة IAM', 'iam'),
  ('iam.manage', 'إدارة IAM', 'iam'),
  ('iam.roles.manage', 'إدارة الأدوار', 'iam'),
  ('iam.assignments.grant', 'منح الأدوار', 'iam'),
  ('iam.assignments.revoke', 'سحب الأدوار', 'iam'),
  ('iam.audit.read', 'قراءة التدقيق', 'iam'),
  ('iam.sessions.read', 'قراءة الجلسات', 'iam'),
  ('iam.sessions.force_logout', 'إنهاء الجلسات', 'iam'),
  ('iam.security.read', 'قراءة الأحداث الأمنية', 'iam'),
  ('users.read', 'قراءة المستخدمين', 'users'),
  ('users.manage', 'إدارة المستخدمين', 'users'),
  ('users.ban', 'حظر المستخدمين', 'users'),
  ('users.notes.manage', 'إدارة ملاحظات المستخدمين', 'users'),
  ('users.secrets.read', 'قراءة أسرار الحسابات', 'users'),
  ('subscriptions.read', 'قراءة الاشتراكات', 'subscriptions'),
  ('subscriptions.manage', 'إدارة الاشتراكات', 'subscriptions'),
  ('finance.read', 'قراءة المالية', 'finance'),
  ('finance.proofs.read', 'قراءة إثباتات الدفع', 'finance'),
  ('finance.export', 'تصدير المالية', 'finance'),
  ('partners.read', 'قراءة الشركاء', 'partners'),
  ('partners.analytics.read', 'تحليلات الشركاء', 'partners'),
  ('partners.settings.read', 'قراءة إعدادات الشركاء', 'partners'),
  ('partners.settings.manage', 'إدارة إعدادات الشركاء', 'partners'),
  ('partners.withdrawals.read', 'قراءة السحوبات', 'partners'),
  ('partners.withdrawals.manage', 'إدارة السحوبات', 'partners'),
  ('partners.finance.read', 'مالية الشركاء', 'partners'),
  ('partners.jobs.run', 'تشغيل مهام الشركاء', 'partners'),
  ('analysis.read', 'قراءة التحليلات', 'analysis'),
  ('analysis.manage', 'إدارة التحليلات', 'analysis'),
  ('analysis.publish', 'نشر التحليلات', 'analysis'),
  ('news.read', 'قراءة الأخبار', 'news'),
  ('news.manage', 'إدارة الأخبار', 'news'),
  ('news.publish', 'نشر الأخبار', 'news'),
  ('email.analytics.read', 'تحليلات البريد', 'email'),
  ('dashboard.read', 'قراءة لوحة الإدارة', 'dashboard'),
  ('dashboard.mutations', 'تعديلات لوحة الإدارة', 'dashboard'),
  ('accounts.read', 'قراءة الحسابات', 'accounts'),
  ('accounts.secrets.manage', 'إدارة أسرار الحسابات', 'accounts'),
  ('system.notifications.test', 'اختبار الإشعارات', 'system'),
  ('system.cron.read', 'Cron jobs', 'system'),
  ('support.manage', 'إدارة الدعم', 'support')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Role permissions (allow/deny support)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_role_permissions (
  role_id text NOT NULL REFERENCES public.iam_roles(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES public.iam_permissions(id) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  organization_id uuid REFERENCES public.iam_organizations(id),
  PRIMARY KEY (role_id, permission_id)
);

-- super_admin: all permissions
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect)
SELECT 'super_admin', p.id, 'allow' FROM public.iam_permissions p
ON CONFLICT DO NOTHING;

-- admin role permissions
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('admin', 'users.read', 'allow'), ('admin', 'users.manage', 'allow'), ('admin', 'users.ban', 'allow'),
  ('admin', 'users.notes.manage', 'allow'), ('admin', 'subscriptions.read', 'allow'), ('admin', 'subscriptions.manage', 'allow'),
  ('admin', 'finance.read', 'allow'), ('admin', 'finance.proofs.read', 'allow'),
  ('admin', 'partners.read', 'allow'), ('admin', 'partners.analytics.read', 'allow'),
  ('admin', 'partners.settings.read', 'allow'), ('admin', 'partners.settings.manage', 'allow'),
  ('admin', 'partners.withdrawals.read', 'allow'), ('admin', 'partners.withdrawals.manage', 'allow'),
  ('admin', 'partners.finance.read', 'allow'), ('admin', 'partners.jobs.run', 'allow'),
  ('admin', 'analysis.read', 'allow'), ('admin', 'analysis.manage', 'allow'), ('admin', 'analysis.publish', 'allow'),
  ('admin', 'news.read', 'allow'), ('admin', 'news.manage', 'allow'), ('admin', 'news.publish', 'allow'),
  ('admin', 'email.analytics.read', 'allow'), ('admin', 'dashboard.read', 'allow'), ('admin', 'dashboard.mutations', 'allow'),
  ('admin', 'accounts.read', 'allow'), ('admin', 'accounts.secrets.manage', 'allow'),
  ('admin', 'system.notifications.test', 'allow'), ('admin', 'support.manage', 'allow'),
  ('admin', 'iam.read', 'allow')
ON CONFLICT DO NOTHING;

-- analyst
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('analyst', 'users.read', 'allow'), ('analyst', 'subscriptions.read', 'allow'),
  ('analyst', 'analysis.read', 'allow'), ('analyst', 'analysis.manage', 'allow'),
  ('analyst', 'dashboard.read', 'allow')
ON CONFLICT DO NOTHING;

-- support
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('support', 'users.read', 'allow'), ('support', 'users.manage', 'allow'),
  ('support', 'subscriptions.read', 'allow'), ('support', 'subscriptions.manage', 'allow'),
  ('support', 'support.manage', 'allow'), ('support', 'dashboard.read', 'allow')
ON CONFLICT DO NOTHING;

-- accountant
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('accountant', 'users.read', 'allow'), ('accountant', 'subscriptions.read', 'allow'),
  ('accountant', 'finance.read', 'allow'), ('accountant', 'finance.proofs.read', 'allow'),
  ('accountant', 'finance.export', 'allow'), ('accountant', 'dashboard.read', 'allow')
ON CONFLICT DO NOTHING;

-- news_editor
INSERT INTO public.iam_role_permissions (role_id, permission_id, effect) VALUES
  ('news_editor', 'news.read', 'allow'), ('news_editor', 'news.manage', 'allow'),
  ('news_editor', 'news.publish', 'allow'), ('news_editor', 'dashboard.read', 'allow')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Multi-role user assignments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES public.iam_roles(id),
  organization_id uuid REFERENCES public.iam_organizations(id),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  grant_reason text,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  revoke_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS iam_user_assignments_active_unique_idx
  ON public.iam_user_assignments (user_id, role_id, organization_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS iam_user_assignments_user_active_idx
  ON public.iam_user_assignments (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS iam_user_assignments_role_active_idx
  ON public.iam_user_assignments (role_id)
  WHERE revoked_at IS NULL;

-- =============================================================================
-- User permission overrides (allow/deny)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES public.iam_permissions(id) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  organization_id uuid REFERENCES public.iam_organizations(id),
  reason text,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS iam_user_overrides_active_unique_idx
  ON public.iam_user_permission_overrides (user_id, permission_id, organization_id)
  WHERE revoked_at IS NULL;

-- =============================================================================
-- Service accounts (workers — not users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_service_accounts (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text,
  secret_hash text,
  enabled boolean NOT NULL DEFAULT false,
  organization_id uuid REFERENCES public.iam_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.iam_service_account_permissions (
  service_account_id text NOT NULL REFERENCES public.iam_service_accounts(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES public.iam_permissions(id) ON DELETE CASCADE,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  PRIMARY KEY (service_account_id, permission_id)
);

-- Unconfigured service accounts — configure via rotateServiceSecret before enabling
INSERT INTO public.iam_service_accounts (id, label, description, secret_hash, enabled) VALUES
  ('cron', 'Cron Jobs', 'Scheduled maintenance tasks', NULL, false),
  ('news-worker', 'News Worker', 'News publishing worker', NULL, false),
  ('price-alert-worker', 'Price Alert Worker', 'Price alert processing', NULL, false),
  ('instant-analysis-worker', 'Instant Analysis Worker', 'Instant analysis pipeline', NULL, false),
  ('telegram-bot', 'Telegram Bot', 'Telegram integration', NULL, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.iam_service_account_permissions (service_account_id, permission_id, effect) VALUES
  ('cron', 'system.cron.read', 'allow'),
  ('cron', 'subscriptions.manage', 'allow'),
  ('news-worker', 'news.publish', 'allow'),
  ('news-worker', 'news.manage', 'allow'),
  ('price-alert-worker', 'system.cron.read', 'allow'),
  ('instant-analysis-worker', 'analysis.manage', 'allow'),
  ('telegram-bot', 'support.manage', 'allow')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Audit, sessions, security
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iam_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  actor_type text NOT NULL DEFAULT 'user',
  service_account_id text REFERENCES public.iam_service_accounts(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  request_id text,
  organization_id uuid REFERENCES public.iam_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iam_audit_logs_actor_created_idx ON public.iam_audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS iam_audit_logs_action_created_idx ON public.iam_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS iam_audit_logs_created_at_idx ON public.iam_audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.iam_session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id_hash text NOT NULL,
  ip_address text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  forced_by uuid REFERENCES auth.users(id),
  is_admin_session boolean NOT NULL DEFAULT false,
  role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  organization_id uuid REFERENCES public.iam_organizations(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS iam_session_logs_user_started_idx ON public.iam_session_logs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS iam_session_logs_active_idx ON public.iam_session_logs (user_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.iam_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_account_id text REFERENCES public.iam_service_accounts(id),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  request_id text,
  organization_id uuid REFERENCES public.iam_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iam_security_events_type_created_idx ON public.iam_security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS iam_security_events_severity_created_idx ON public.iam_security_events (severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.iam_session_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id_hash text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  revoked_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iam_session_revocations_user_idx ON public.iam_session_revocations (user_id, revoked_at DESC);

CREATE TABLE IF NOT EXISTS public.iam_user_session_revocations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  force_logout_after timestamptz NOT NULL,
  revoked_by uuid REFERENCES auth.users(id),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bootstrap state (singleton)
CREATE TABLE IF NOT EXISTS public.iam_bootstrap_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.iam_bootstrap_state (id) VALUES (true) ON CONFLICT DO NOTHING;

-- =============================================================================
-- RLS: service_role only (API access via server)
-- =============================================================================
ALTER TABLE public.iam_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_service_account_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_session_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_user_session_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_bootstrap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_organizations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.iam_roles FROM anon, authenticated;
REVOKE ALL ON public.iam_permissions FROM anon, authenticated;
REVOKE ALL ON public.iam_role_permissions FROM anon, authenticated;
REVOKE ALL ON public.iam_user_assignments FROM anon, authenticated;
REVOKE ALL ON public.iam_user_permission_overrides FROM anon, authenticated;
REVOKE ALL ON public.iam_service_accounts FROM anon, authenticated;
REVOKE ALL ON public.iam_service_account_permissions FROM anon, authenticated;
REVOKE ALL ON public.iam_audit_logs FROM anon, authenticated;
REVOKE ALL ON public.iam_session_logs FROM anon, authenticated;
REVOKE ALL ON public.iam_security_events FROM anon, authenticated;
REVOKE ALL ON public.iam_session_revocations FROM anon, authenticated;
REVOKE ALL ON public.iam_user_session_revocations FROM anon, authenticated;
REVOKE ALL ON public.iam_bootstrap_state FROM anon, authenticated;
REVOKE ALL ON public.iam_organizations FROM anon, authenticated;

GRANT ALL ON public.iam_roles TO service_role;
GRANT ALL ON public.iam_permissions TO service_role;
GRANT ALL ON public.iam_role_permissions TO service_role;
GRANT ALL ON public.iam_user_assignments TO service_role;
GRANT ALL ON public.iam_user_permission_overrides TO service_role;
GRANT ALL ON public.iam_service_accounts TO service_role;
GRANT ALL ON public.iam_service_account_permissions TO service_role;
GRANT ALL ON public.iam_audit_logs TO service_role;
GRANT ALL ON public.iam_session_logs TO service_role;
GRANT ALL ON public.iam_security_events TO service_role;
GRANT ALL ON public.iam_session_revocations TO service_role;
GRANT ALL ON public.iam_user_session_revocations TO service_role;
GRANT ALL ON public.iam_bootstrap_state TO service_role;
GRANT ALL ON public.iam_organizations TO service_role;
