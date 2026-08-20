import { createClient } from "@supabase/supabase-js";

const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function createAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase auth configuration");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function parseSyncSessionTokens(body) {
  const accessToken = String(body?.access_token || "").trim();
  const refreshToken = String(body?.refresh_token || "").trim();

  return { accessToken, refreshToken };
}

export async function verifySessionTokensForCookieSync(accessToken, refreshToken) {
  if (!accessToken || !refreshToken) {
    return { ok: false, status: 400, error: "Session tokens are required" };
  }

  let authClient;

  try {
    authClient = createAuthClient();
  } catch {
    return { ok: false, status: 503, error: "Authentication service unavailable" };
  }

  const { data, error } = await authClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error || !data?.session?.access_token || !data?.session?.refresh_token || !data?.user?.id) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  return {
    ok: true,
    session: data.session,
    user: data.user,
  };
}

export function applyVerifiedSessionCookies(response, session) {
  const isProduction = process.env.NODE_ENV === "production";
  const accessTokenMaxAge = Number(session.expires_in || 3600);

  response.cookies.set("hc_access_token", session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: accessTokenMaxAge,
  });

  response.cookies.set("hc_refresh_token", session.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
