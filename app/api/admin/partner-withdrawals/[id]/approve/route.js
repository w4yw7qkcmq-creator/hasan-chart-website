import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { approvePartnerWithdrawal } from "../../../../../../lib/partner-admin-server";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES = {
  NOT_FOUND: "طلب السحب غير موجود",
  INVALID_STATUS: "لا يمكن اعتماد هذا الطلب في حالته الحالية",
};

export async function POST(request, { params }) {
  const resolvedParams = await params;
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_WITHDRAWALS_MANAGE, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const withdrawalId = String(resolvedParams?.id || "").trim();
    const body = await request.json().catch(() => ({}));

    const withdrawal = await approvePartnerWithdrawal(adminCheck.supabase, withdrawalId, {
      adminNote: body?.adminNote,
    });

    return Response.json({
      success: true,
      withdrawal,
      message: "تم اعتماد طلب السحب",
    });
  } catch (error) {
    const code = error?.message;

    if (code && ERROR_MESSAGES[code]) {
      return Response.json({ success: false, error: ERROR_MESSAGES[code] }, { status: 400 });
    }

    console.error("ADMIN_PARTNER_WITHDRAWAL_APPROVE_ERROR");
    return Response.json({ success: false, error: "تعذر اعتماد طلب السحب" }, { status: 500 });
  }
}
