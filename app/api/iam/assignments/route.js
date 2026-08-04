import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { grantRole, revokeRole, listAssignments } from "../../../../lib/iam/grant-revoke.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_READ, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const { assignments, tableMissing } = await listAssignments(adminCheck.supabase, {
      userId: userId || undefined,
      activeOnly,
    });

    return NextResponse.json(
      { success: true, assignments, tableMissing },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "grant").trim();

    if (action === "revoke") {
      const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_ASSIGNMENTS_REVOKE, { request });
      if (!adminCheck.ok) {
        return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
      }

      const result = await revokeRole(adminCheck.supabase, {
        actorId: adminCheck.user.id,
        actorEmail: adminCheck.user.email,
        actorIam: adminCheck.iam,
        targetUserId: body.userId,
        roleId: body.roleId,
        assignmentId: body.assignmentId,
        reason: body.reason,
        request,
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true, assignment: result.assignment });
    }

    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const result = await grantRole(adminCheck.supabase, {
      actorId: adminCheck.user.id,
      actorEmail: adminCheck.user.email,
      actorIam: adminCheck.iam,
      targetUserId: body.userId,
      targetEmail: body.email,
      roleId: body.roleId,
      reason: body.reason,
      request,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, assignment: result.assignment });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
