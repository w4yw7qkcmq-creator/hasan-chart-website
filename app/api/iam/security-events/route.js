import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_SECURITY_READ, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const severity = searchParams.get("severity");
    const eventType = searchParams.get("eventType");

    let query = adminCheck.supabase
      .from("iam_security_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (severity) query = query.eq("severity", severity);
    if (eventType) query = query.eq("event_type", eventType);

    const { data, error } = await query;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return NextResponse.json({ success: true, events: [], tableMissing: true });
      }
      throw error;
    }

    return NextResponse.json(
      { success: true, events: data || [] },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
