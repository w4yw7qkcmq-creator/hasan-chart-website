-- P0 signup repair. NOT applied to production by this change.
--
-- Replaces the live handle_new_user body, which copies role from
-- raw_user_meta_data. Username and email behavior are unchanged.
-- ON CONFLICT does not update role, so existing profiles, including
-- administrators, are not rewritten.
-- The BEFORE UPDATE protection trigger is intentionally not modified.

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
    'user'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    username = COALESCE(public.profiles.username, EXCLUDED.username);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
