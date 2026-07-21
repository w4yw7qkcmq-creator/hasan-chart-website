import { verifyAdminSession } from "../../../../../lib/admin-auth";
import { CACHE_NO_STORE } from "../../../../../lib/api-response";
import { loadAdminUserDashboardStats } from "../../../../../lib/admin-user-dashboard-stats";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { adminReadLimiter } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const stats = await loadAdminUserDashboardStats(adminCheck.supabase);

    return Response.json(
      {
        success: true,
        stats,
      },
      {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
          Vary: "Accept-Encoding",
        },
      }
    );
  } catch (error) {
    console.error("Admin user-management stats error:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "حدث خطأ أثناء تحميل إحصائيات المستخدمين",
      },
      { status: error?.status || 500 }
    );
  }
}
