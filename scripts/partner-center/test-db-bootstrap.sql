CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_classification text DEFAULT 'real',
  effective_user_classification text DEFAULT 'real',
  human_verification_status text DEFAULT 'verified',
  partner_reward_eligibility_status text,
  partner_reward_risk_level text
);

CREATE TABLE IF NOT EXISTS public.iam_permissions (
  id text PRIMARY KEY,
  label text,
  category text,
  description text
);

CREATE TABLE IF NOT EXISTS public.iam_role_permissions (
  role_id text NOT NULL,
  permission_id text NOT NULL REFERENCES public.iam_permissions(id) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.iam_roles (
  id text PRIMARY KEY,
  label text
);

INSERT INTO public.iam_roles (id, label) VALUES
  ('super_admin', 'Super Admin'),
  ('admin', 'Admin')
ON CONFLICT DO NOTHING;
