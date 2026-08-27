import { getOptionalSessionUser } from "./auth-session";

/**
 * Lightweight server auth probe for P1 public SEO pages.
 * Validates hc_access_token via Supabase getUser — same path as API routes.
 * Returns only a boolean; no user secrets are passed to HTML or client props.
 */
export async function getPublicSeoInitialAuth() {
  const session = await getOptionalSessionUser();
  return { isAuthenticated: Boolean(session?.email) };
}
