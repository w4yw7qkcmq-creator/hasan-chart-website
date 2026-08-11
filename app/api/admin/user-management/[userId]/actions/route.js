import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response";
import {
  handleAdminUserManagementAction,
  isSelfTargetAction,
  validateDangerousActionConfirmation,
} from "../../../../../../lib/admin-user-management-action-handler";
import { permissionForLifecycleAction } from "../../../../../../lib/iam/action-permissions";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";

export const dynamic = "force-dynamic";

export async function POST(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_MANAGE, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const body = await request.json().catch(() => ({}));

    if (!userId) {
      return Response.json({ success: false, error: "معرّف المستخدم مطلوب" }, { status: 400 });
    }

    const action = String(body?.action || "").trim();
    const actionPerm = permissionForLifecycleAction(action);
    const actionAuth = await requireAdminPermission(actionPerm, { request });
    if (!actionAuth.ok) {
      return Response.json(
        { success: false, error: actionAuth.error },
        { status: actionAuth.status }
      );
    }

    const effectiveAdminProfile = {
      id: adminCheck.user.id,
      email: adminCheck.user.email,
      role: adminCheck.iam?.primaryRoleId || "admin",
      admin_role: adminCheck.iam?.primaryRoleId || "admin",
    };

    const { data: targetProfile } = await adminCheck.supabase
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (isSelfTargetAction(adminCheck.user.id, userId, action)) {
      return Response.json(
        { success: false, error: "لا يمكنك تنفيذ هذا الإجراء على حسابك الشخصي" },
        { status: 403 }
      );
    }

    if (
      !validateDangerousActionConfirmation(action, targetProfile?.email, body?.confirmEmail)
    ) {
      return Response.json(
        { success: false, error: "تأكيد البريد الإلكتروني غير مطابق" },
        { status: 400 }
      );
    }

    const result = await handleAdminUserManagementAction(
      adminCheck.supabase,
      adminCheck.user,
      effectiveAdminProfile,
      userId,
      body
    );

    return Response.json(result, {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
      },
    });
  } catch (error) {
    console.error("Admin user-management action error:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر تنفيذ الإجراء",
      },
      { status: error?.status || 500 }
    );
  }
}
