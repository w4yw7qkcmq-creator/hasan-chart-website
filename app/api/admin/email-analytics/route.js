import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { fetchEmailAnalyticsData } from "../../../../lib/email-analytics-store";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_ANALYTICS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 500);
    const syncResend = searchParams.get("sync") === "resend";

    const data = await fetchEmailAnalyticsData(adminCheck.supabase, {
      limit,
      syncResend,
      filters: {
        email: searchParams.get("email") || "",
        status: searchParams.get("status") || "",
        messageType: searchParams.get("messageType") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
      },
    });

    return Response.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("EMAIL_ANALYTICS_API_ERROR:", error?.message || error);
    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر تحميل تحليلات البريد",
      },
      { status: 500 }
    );
  }
}
