import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { createApiTimer } from "../../../../lib/admin-api-timing.js";
import { fetchEmailAnalyticsData } from "../../../../lib/email-analytics-store";
import { withShortLivedCache } from "../../../../lib/short-lived-cache.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const timer = createApiTimer("email-analytics");
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_ANALYTICS_READ, { request });
    timer.mark("auth");

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 100);
    const syncResend = searchParams.get("sync") === "resend";
    const filters = {
      email: searchParams.get("email") || "",
      status: searchParams.get("status") || "",
      messageType: searchParams.get("messageType") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    };

    const cacheKey = syncResend
      ? null
      : `email-analytics:v2:${limit}:${JSON.stringify(filters)}`;

    const data = cacheKey
      ? await withShortLivedCache(cacheKey, 20_000, () =>
          fetchEmailAnalyticsData(adminCheck.supabase, { limit, syncResend: false, filters })
        )
      : await fetchEmailAnalyticsData(adminCheck.supabase, { limit, syncResend, filters });

    timer.mark("data");

    const totalMs = timer.finish({ syncResend, limit });
    return Response.json({
      success: true,
      ...data,
      _perfMs: totalMs,
    });
  } catch (error) {
    timer.finish({ error: true });
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
