import { verifyAdminSession } from "../../../../../../lib/admin-auth";
import { markPartnerWithdrawalPaid } from "../../../../../../lib/partner-admin-server";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES = {
  NOT_FOUND: "طلب السحب غير موجود",
  INVALID_STATUS: "يجب اعتماد الطلب قبل تسجيل الدفع",
  ALREADY_PAID: "تم دفع هذا الطلب مسبقًا",
  INSUFFICIENT_BALANCE: "رصيد الشريك غير كافٍ لإتمام الدفع",
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

    const withdrawal = await markPartnerWithdrawalPaid(adminCheck.supabase, withdrawalId, {
      adminNote: body?.adminNote,
      paymentProof: body?.paymentProof,
    });

    return Response.json({
      success: true,
      withdrawal,
      message: "تم تسجيل الدفع بنجاح",
    });
  } catch (error) {
    const code = error?.message;

    if (code && ERROR_MESSAGES[code]) {
      return Response.json({ success: false, error: ERROR_MESSAGES[code] }, { status: 400 });
    }

    console.error("ADMIN_PARTNER_WITHDRAWAL_MARK_PAID_ERROR");
    return Response.json(
      { success: false, error: "تعذر تسجيل الدفع" },
      { status: 500 }
    );
  }
}
