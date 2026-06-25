import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAdminUser, normalizeEmail } from "../../../../lib/admin-emails";
import { getSupabaseAdmin } from "../../../../lib/auth-session";

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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const cookieStore = await cookies();
    const resolved = await resolveSessionFromCookies(supabase, cookieStore);

    if (!resolved?.user?.email) {
      return NextResponse.json({
        ok: false,
        authenticated: false,
        user: null,
      });
    }

    const normalizedEmail = normalizeEmail(resolved.user.email);

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .or(`id.eq.${resolved.user.id},email.eq.${normalizedEmail}`)
      .maybeSingle();

    const role = adminProfile?.role || resolved.user.user_metadata?.role || "user";
    const user = {
      id: resolved.user.id,
      email: resolved.user.email,
      role,
    };

    const response = NextResponse.json({
      ok: true,
      authenticated: true,
      user,
      isAdmin: isAdminUser(user),
      session: buildSessionPayload(resolved.session),
    });

    if (resolved.refreshed) {
      attachSessionCookies(response, resolved.session);
    }

    return response;
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
