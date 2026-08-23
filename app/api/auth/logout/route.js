import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { recordAdminLogoutEvent } from "../../../../lib/iam/auth-events.js";
import { revokeCurrentSession } from "../../../../lib/iam/session-revocation-service.js";
import { REVOCATION_REASONS } from "../../../../lib/iam/revocation-reasons.js";

export async function POST(request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;
  const refreshToken = cookieStore.get("hc_refresh_token")?.value;
  const supabase = getSupabaseAdmin();

  let user = null;
  let isAdmin = false;

  if (token) {
    const { data } = await supabase.auth.getUser(token);
    user = data?.user || null;
    if (user) {
      const iam = await resolveIamContext(supabase, user);
      isAdmin = Boolean(iam.isAdmin);

      await revokeCurrentSession(supabase, {
        token,
        refreshToken,
        userId: user.id,
        reason: REVOCATION_REASONS.USER_LOGOUT,
        endSessionLog: isAdmin,
        request,
      });

      await recordAdminLogoutEvent(supabase, {
        userId: user.id,
        email: user.email,
        isAdmin,
        reason: REVOCATION_REASONS.USER_LOGOUT,
        request,
      });
    } else {
      await revokeCurrentSession(supabase, {
        token,
        refreshToken,
        reason: REVOCATION_REASONS.USER_LOGOUT,
        endSessionLog: false,
        request,
      });
    }
  }

  const response = NextResponse.json({ success: true });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };

  response.cookies.set("hc_access_token", "", cookieOptions);
  response.cookies.set("hc_refresh_token", "", cookieOptions);

  return response;
}

export async function GET(request) {
  return POST(request);
}
