import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "../../../../lib/iam/require-admin-session.js";
import { executeBootstrap, getBootstrapTokenFromRequest } from "../../../../lib/iam/bootstrap.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";
import { bootstrapIpLimiter, RATE_LIMIT_ERROR, getClientIp, loginIpLimiter } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimitResult = await bootstrapIpLimiter(clientIp);
    if (!rateLimitResult.success) {
      return NextResponse.json({ success: false, error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const auth = await requireAuthenticatedSession();
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const token = getBootstrapTokenFromRequest(request) || String(body.token || "").trim();

    const result = await executeBootstrap(auth.supabase, {
      user: auth.user,
      token,
      confirmEmail: body.confirmEmail || auth.user.email,
      request,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        success: true,
        roleId: result.roleId,
        userId: result.userId,
        message: "Bootstrap completed — super_admin assigned",
      },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Server error" },
      { status: 500 }
    );
  }
}
