import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { listAdminSessions, forceLogoutSession } from "../../../../lib/iam/session-log.js";
import { enrichSessionsForDisplay } from "../../../../lib/iam/display-enrichment.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";
import {
  buildIamListResponse,
  IAM_LIST_LIMITS,
  parseIamListParams,
} from "../../../../lib/iam/list-api-helpers.js";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": CACHE_NO_STORE },
  });
}

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_SESSIONS_READ, { request });
    if (!adminCheck.ok) {
      return json({ success: false, error: adminCheck.error }, adminCheck.status);
    }

    const { searchParams } = new URL(request.url);
    let params;
    try {
      params = parseIamListParams(searchParams, IAM_LIST_LIMITS.sessions);
    } catch (error) {
      if (error?.code === "INVALID_CURSOR") {
        return json({ success: false, error: "Invalid cursor" }, 400);
      }
      throw error;
    }

    const userId = searchParams.get("userId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    if (params.id) {
      const { session, tableMissing } = await listAdminSessions(adminCheck.supabase, {
        id: params.id,
        includeMetadata: params.includeMetadata,
      });

      if (!session) {
        return json({ success: true, item: null, tableMissing });
      }

      const [enriched] = await enrichSessionsForDisplay(adminCheck.supabase, [session]);
      const item = params.includeMetadata
        ? enriched
        : {
            ...enriched,
            session_id_hash: undefined,
          };

      return json({ success: true, item });
    }

    const result = await listAdminSessions(adminCheck.supabase, {
      userId: userId || undefined,
      activeOnly,
      limit: params.limit,
      cursor: params.cursor,
      includeTotal: params.includeTotal,
    });

    const enriched = await enrichSessionsForDisplay(adminCheck.supabase, result.items || result.sessions || []);

    return json(
      buildIamListResponse({
        items: enriched,
        pagination: result.pagination,
        legacyKey: "sessions",
        legacyItems: enriched,
        tableMissing: result.tableMissing,
      })
    );
  } catch (error) {
    return json({ success: false, error: error?.message }, 500);
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
