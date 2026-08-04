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

    const { data: roles, error: rolesError } = await adminCheck.supabase
      .from("iam_roles")
      .select("id, label, description, is_system, sort_order")
      .order("sort_order");

    if (rolesError) throw rolesError;

    const { data: rolePermissions } = await adminCheck.supabase
      .from("iam_role_permissions")
      .select("role_id, permission_id, effect");

    const matrix = {};
    for (const role of roles || []) {
      matrix[role.id] = {
        role,
        permissions: (rolePermissions || [])
          .filter((rp) => rp.role_id === role.id)
          .map((rp) => ({ permissionId: rp.permission_id, effect: rp.effect })),
      };
    }

    return NextResponse.json(
      { success: true, roles: roles || [], matrix },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
