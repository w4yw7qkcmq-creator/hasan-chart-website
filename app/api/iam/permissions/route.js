import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_READ);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { data, error } = await adminCheck.supabase
      .from("iam_permissions")
      .select("id, label, category, description")
      .order("category")
      .order("id");

    if (error) throw error;

    const grouped = {};
    for (const perm of data || []) {
      const cat = perm.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(perm);
    }

    return NextResponse.json(
      { success: true, permissions: data || [], grouped },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
