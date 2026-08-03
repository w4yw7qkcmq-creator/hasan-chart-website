import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_AUDIT_READ, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const action = searchParams.get("action");
    const actorId = searchParams.get("actorId");

    let query = adminCheck.supabase
      .from("iam_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (action) query = query.eq("action", action);
    if (actorId) query = query.eq("actor_id", actorId);

    const { data, error } = await query;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return NextResponse.json({ success: true, logs: [], tableMissing: true });
      }
      throw error;
    }

    return NextResponse.json(
      { success: true, logs: data || [] },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
