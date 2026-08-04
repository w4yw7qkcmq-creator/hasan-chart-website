import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { listAdminSessions, forceLogoutSession } from "../../../../lib/iam/session-log.js";
import { enrichSessionsForDisplay } from "../../../../lib/iam/display-enrichment.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_SESSIONS_READ, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const { sessions, tableMissing } = await listAdminSessions(adminCheck.supabase, {
      userId: userId || undefined,
      activeOnly,
      limit: Number(searchParams.get("limit")) || 50,
    });
    const enriched = await enrichSessionsForDisplay(adminCheck.supabase, sessions);

    return NextResponse.json(
      { success: true, sessions: enriched, tableMissing },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "force_logout").trim();

    const perm =
      action === "force_logout"
        ? IAM_PERMISSIONS.IAM_SESSIONS_FORCE_LOGOUT
        : IAM_PERMISSIONS.IAM_SESSIONS_FORCE_LOGOUT;

    const adminCheck = await requireAdminPermission(perm, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    if (action !== "force_logout") {
      return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
    }

    const result = await forceLogoutSession(adminCheck.supabase, {
      userId: body.userId,
      sessionLogId: body.sessionLogId,
      actorId: adminCheck.user.id,
      reason: body.reason || "admin_force_logout",
      token: body.token,
      request,
    });

    return NextResponse.json(
      { success: result.ok, error: result.error },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
