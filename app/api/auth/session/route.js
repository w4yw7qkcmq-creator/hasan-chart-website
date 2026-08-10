import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAdminUser, normalizeEmail } from "../../../../lib/admin-emails";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { CACHE_PRIVATE_SHORT } from "../../../../lib/api-response";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { scheduleReferralQualificationReevaluation } from "../../../../lib/partner-center/qualification-evaluator.js";
import { withReadCache } from "../../../../lib/server-read-cache";

function buildSessionPayload(session) {
  if (!session?.access_token || !session?.refresh_token) return null;

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type || "bearer",
  };
}

function attachSessionCookies(response, session) {
  const isProduction = process.env.NODE_ENV === "production";

  response.cookies.set("hc_access_token", session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Number(session.expires_in || 3600),
  });

  response.cookies.set("hc_refresh_token", session.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

async function resolveSessionFromCookies(supabase, cookieStore) {
  const accessToken = cookieStore.get("hc_access_token")?.value;
  const refreshToken = cookieStore.get("hc_refresh_token")?.value;

  if (accessToken) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (!error && user?.email) {
      return {
        user,
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        },
      };
    }
  }

  if (!refreshToken) {
    return null;
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data?.session || !data?.user?.email) {
    return null;
  }

  return {
    user: data.user,
    session: data.session,
    refreshed: true,
  };
}

function hashSessionToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex").slice(0, 16);
}

async function buildSessionResponse(resolved) {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = normalizeEmail(resolved.user.email);

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .or(`id.eq.${resolved.user.id},email.eq.${normalizedEmail}`)
    .maybeSingle();

  const role = adminProfile?.role || "user";
  const user = {
    id: resolved.user.id,
    email: resolved.user.email,
    role,
  };

  const iam = await resolveIamContext(supabase, resolved.user);
  const isAdmin = iam.isAdmin || isAdminUser(user);

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    user,
    isAdmin,
    iam: iam.isAdmin
      ? {
          roleIds: iam.roleIds,
          primaryRoleId: iam.primaryRoleId,
          permissions: [...iam.permissions],
          source: iam.source,
        }
      : null,
    session: buildSessionPayload(resolved.session),
  });

  if (resolved.refreshed) {
    attachSessionCookies(response, resolved.session);
  }

  response.headers.set("Cache-Control", CACHE_PRIVATE_SHORT);
  response.headers.set("Vary", "Cookie");

  return response;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("hc_access_token")?.value;
    const refreshToken = cookieStore.get("hc_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json({
        ok: false,
        authenticated: false,
        user: null,
      });
    }

    let resolved = null;

    if (accessToken) {
      const cacheKey = `auth-session:${hashSessionToken(accessToken)}`;
      const { data } = await withReadCache(cacheKey, 4_000, async () => {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(accessToken);

        if (error || !user?.email) {
          return null;
        }

        return {
          user,
          session: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
          },
          refreshed: false,
        };
      });

      resolved = data;
    }

    if (!resolved?.user?.email) {
      resolved = await resolveSessionFromCookies(supabase, cookieStore);
    }

    if (!resolved?.user?.email) {
      return NextResponse.json({
        ok: false,
        authenticated: false,
        user: null,
      });
    }

    if (resolved.user.email_confirmed_at) {
      scheduleReferralQualificationReevaluation(
        getSupabaseAdmin(),
        resolved.user.id,
        "session_email_confirmed"
      );
    }

    return buildSessionResponse(resolved);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        user: null,
        error: error?.message || "تعذر قراءة الجلسة",
      },
      { status: 500 }
    );
  }
}
