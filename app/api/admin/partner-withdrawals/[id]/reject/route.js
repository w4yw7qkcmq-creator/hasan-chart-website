import { verifyAdminSession } from "../../../../../../lib/admin-auth";
import { rejectPartnerWithdrawal } from "../../../../../../lib/partner-admin-server";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES = {
  NOT_FOUND: "طلب السحب غير موجود",
  INVALID_STATUS: "لا يمكن رفض هذا الطلب في حالته الحالية",
  NOTE_REQUIRED: "يرجى إدخال سبب الرفض",
};

export async function POST(request, { params }) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const withdrawalId = String(params?.id || "").trim();
    const body = await request.json().catch(() => ({}));

    const withdrawal = await rejectPartnerWithdrawal(adminCheck.supabase, withdrawalId, {
      adminNote: body?.adminNote,
    });

    return Response.json({
      success: true,
      withdrawal,
      message: "تم رفض طلب السحب",
    });
  } catch (error) {
    const code = error?.message;

    if (code && ERROR_MESSAGES[code]) {
      return Response.json({ success: false, error: ERROR_MESSAGES[code] }, { status: 400 });
    }

    console.error("ADMIN_PARTNER_WITHDRAWAL_REJECT_ERROR");
    return Response.json({ success: false, error: "تعذر رفض طلب السحب" }, { status: 500 });
  }
}
