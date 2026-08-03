import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import {
  grantPermissionOverride,
  listUserOverrides,
  revokePermissionOverride,
} from "../../../../lib/iam/overrides.js";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { recordIamAudit } from "../../../../lib/iam/audit.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_READ, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") || "").trim();
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId مطلوب" }, { status: 400 });
    }

    const result = await listUserOverrides(adminCheck.supabase, userId);
    return NextResponse.json(
      { success: true, overrides: result.overrides || [] },
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
      const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_MANAGE, { request });
      if (!adminCheck.ok) {
        return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
      }

      const result = await revokePermissionOverride(adminCheck.supabase, {
        actorId: adminCheck.user.id,
        overrideId: body.overrideId,
        userId: body.userId,
        permissionId: body.permissionId,
        reason: body.reason,
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }

      await recordIamAudit(adminCheck.supabase, {
        action: "iam.revoke_override",
        actorId: adminCheck.user.id,
        actorEmail: adminCheck.user.email,
        targetType: "permission_override",
        targetId: result.revoked.id,
        targetUserId: result.revoked.user_id,
        metadata: {
          permissionId: result.revoked.permission_id,
          effect: result.revoked.effect,
          reason: body.reason,
        },
        request,
      });

      return NextResponse.json({ success: true, revoked: result.revoked });
    }

    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_MANAGE, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const result = await grantPermissionOverride(adminCheck.supabase, {
      actorId: adminCheck.user.id,
      actorIam: adminCheck.iam,
      targetUserId: body.userId,
      targetEmail: body.email,
      permissionId: body.permissionId,
      effect: body.effect,
      reason: body.reason,
      request,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await recordIamAudit(adminCheck.supabase, {
      action: "iam.grant_override",
      actorId: adminCheck.user.id,
      actorEmail: adminCheck.user.email,
      targetType: "permission_override",
      targetId: result.override.id,
      targetUserId: result.override.user_id,
      metadata: {
        permissionId: result.override.permission_id,
        effect: result.override.effect,
        reason: body.reason,
      },
      request,
    });

    const targetIam = await resolveIamContext(adminCheck.supabase, {
      id: result.override.user_id,
    });

    return NextResponse.json({
      success: true,
      override: result.override,
      effectivePermissions: [...(targetIam.permissions || [])],
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
