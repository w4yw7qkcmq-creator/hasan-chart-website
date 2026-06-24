import { verifyAdminSession } from "../../../../../lib/admin-auth";
import {
  fetchEmailMessageDetail,
} from "../../../../../lib/email-analytics-store";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const detail = await fetchEmailMessageDetail(adminCheck.supabase, params.id);

    if (!detail) {
      return Response.json(
        { success: false, error: "الرسالة غير موجودة" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      ...detail,
    });
  } catch (error) {
    console.error("EMAIL_ANALYTICS_DETAIL_ERROR:", error?.message || error);
    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر تحميل تفاصيل الرسالة",
      },
      { status: 500 }
    );
  }
}
