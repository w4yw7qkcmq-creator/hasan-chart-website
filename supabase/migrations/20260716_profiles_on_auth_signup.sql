-- Ensure profiles row exists when auth user is created (required for partner VIP hooks).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, role)
  VALUES (
    NEW.id,
    lower(trim(NEW.email)),
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
      split_part(lower(trim(NEW.email)), '@', 1),
      'مستخدم'
    ),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'role'), ''), 'user')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    role = COALESCE(public.profiles.role, EXCLUDED.role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles for existing auth users.
INSERT INTO public.profiles (id, email, username, role)
SELECT
  u.id,
  lower(trim(u.email)),
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
    split_part(lower(trim(u.email)), '@', 1),
    'مستخدم'
  ),
  COALESCE(NULLIF(trim(u.raw_user_meta_data->>'role'), ''), 'user')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL;
