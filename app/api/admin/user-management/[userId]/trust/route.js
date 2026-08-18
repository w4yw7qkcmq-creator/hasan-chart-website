import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { loadAdminUserTrustSnapshot } from "../../../../../../lib/partner-center/partner-reward-eligibility.js";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_READ, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    if (!userId) {
      return NextResponse.json({ success: false, error: "missing_user_id" }, { status: 400 });
    }

    const trust = await loadAdminUserTrustSnapshot(adminCheck.supabase, userId);
    return NextResponse.json({ success: true, trust });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "trust_load_failed" },
      { status: 500 }
    );
  }
}
