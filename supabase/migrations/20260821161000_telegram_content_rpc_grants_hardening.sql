-- Staging hotfix: restrict SECURITY DEFINER Telegram RPCs to service_role only.
REVOKE ALL ON FUNCTION public.enforce_telegram_section_retention(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_telegram_section_retention(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_telegram_content_operational_tables(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_telegram_content_operational_tables(integer, integer) TO service_role;
