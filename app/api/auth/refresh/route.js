import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getClientIp,
  refreshIpLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";
import { getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { touchAdminSessionActivity } from "../../../../lib/iam/session-log.js";
import { recordSessionRefreshEvent } from "../../../../lib/iam/auth-events.js";
import { isSessionRevoked, extractTokenIssuedAt } from "../../../../lib/iam/session-revocation.js";

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase refresh configuration");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimitResult = await refreshIpLimiter(clientIp);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: RATE_LIMIT_ERROR },
        { status: 429 }
      );
    }

    const supabase = getSupabaseServerClient();
    const adminSupabase = getSupabaseAdmin();
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("hc_refresh_token")?.value;
    const existingAccess = cookieStore.get("hc_access_token")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: "Refresh token غير موجود" },
        { status: 401 }
      );
    }

    if (existingAccess) {
      const revoked = await isSessionRevoked(adminSupabase, {
        token: existingAccess,
        tokenIssuedAt: extractTokenIssuedAt(existingAccess),
      });
      if (revoked.revoked) {
        return NextResponse.json(
          { success: false, error: "تم إنهاء الجلسة" },
          { status: 401 }
        );
      }
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return NextResponse.json(
        { success: false, error: "فشل تجديد الجلسة" },
        { status: 401 }
      );
    }

    const { data: userData } = await adminSupabase.auth.getUser(data.session.access_token);
    const user = userData?.user;
    let isAdmin = false;

    if (user) {
      const iam = await resolveIamContext(adminSupabase, user);
      isAdmin = Boolean(iam.isAdmin);
      if (isAdmin) {
        await touchAdminSessionActivity(adminSupabase, {
          userId: user.id,
          token: data.session.access_token,
        });
      }
      await recordSessionRefreshEvent(adminSupabase, {
        userId: user.id,
        isAdmin,
        request,
      });
    }

    const response = NextResponse.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type || "bearer",
      },
    });

    const isProduction = process.env.NODE_ENV === "production";

    response.cookies.set("hc_access_token", data.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: Number(data.session.expires_in || 3600),
    });

    response.cookies.set("hc_refresh_token", data.session.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "حدث خطأ أثناء تجديد الجلسة",
      },
      { status: 500 }
    );
  }
}
