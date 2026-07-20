import {
  ADMIN_USER_SECTIONS,
  loadAdminUserSection,
} from "../../../../../lib/admin-user-management";
import { verifyAdminSession } from "../../../../../lib/admin-auth";
import { CACHE_NO_STORE } from "../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { adminReadLimiter } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
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

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const { searchParams } = new URL(request.url);
    const section = String(searchParams.get("section") || "overview").trim().toLowerCase();
    const page = Number(searchParams.get("page") || 1);

    if (!ADMIN_USER_SECTIONS.has(section)) {
      return Response.json({ success: false, error: "قسم غير مدعوم" }, { status: 400 });
    }

    const payload = await loadAdminUserSection(adminCheck.supabase, userId, section, { page });

    return Response.json(payload, {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    console.error("Admin user-management detail error:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "حدث خطأ أثناء تحميل بيانات المستخدم",
      },
      { status: error?.status || 500 }
    );
  }
}
