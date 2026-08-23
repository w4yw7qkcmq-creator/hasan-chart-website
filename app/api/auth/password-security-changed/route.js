import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { revokeAllUserAccessAfterPasswordSecurityChange } from "../../../../lib/iam/session-revocation-service.js";
import {
  crossOriginRequestResponse,
  isCrossOriginRequest,
} from "../../../../lib/security/same-origin-request.js";

const ALLOWED_TRIGGERS = new Set(["password_recovery", "password_update"]);

function clearSessionCookies(response) {
  const isProduction = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
  response.cookies.set("hc_access_token", "", base);
  response.cookies.set("hc_refresh_token", "", base);
  return response;
}

export async function POST(request) {
  try {
    if (isCrossOriginRequest(request)) {
      return crossOriginRequestResponse();
    }

    const body = await request.json().catch(() => ({}));
    const trigger = String(body.trigger || "").trim();
    if (!ALLOWED_TRIGGERS.has(trigger)) {
      return NextResponse.json(
        { success: false, error: "Invalid password security trigger" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const currentToken = cookieStore.get("hc_access_token")?.value || null;
    const previousAccessToken = String(body.previousAccessToken || "").trim() || null;

    if (!currentToken && !previousAccessToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const verifyToken = currentToken || previousAccessToken;
    const { data, error } = await supabase.auth.getUser(verifyToken);

    if (error || !data?.user?.id) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 });
    }

    const result = await revokeAllUserAccessAfterPasswordSecurityChange(supabase, {
      userId: data.user.id,
      currentAccessToken: currentToken,
      previousAccessToken,
      request,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "Failed to revoke sessions after password change" },
        { status: 503 }
      );
    }

    const response = NextResponse.json({
      success: true,
      requireReLogin: true,
    });
    return clearSessionCookies(response);
  } catch {
    return NextResponse.json(
      { success: false, error: "Password security revocation failed" },
      { status: 500 }
    );
  }
}
