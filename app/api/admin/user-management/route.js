import { verifyAdminSession } from "../../../../lib/admin-auth";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { loadAdminUserList } from "../../../../lib/admin-user-management";
import { adminReadLimiter } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 0);
    const search = String(searchParams.get("search") || "");
    const sort = String(searchParams.get("sort") || "created_at").trim().toLowerCase();
    const order = String(searchParams.get("order") || "desc").trim().toLowerCase();

    const accountStatus = String(searchParams.get("accountStatus") || "").trim().toLowerCase();

    const payload = await loadAdminUserList(adminCheck.supabase, {
      page,
      pageSize: pageSize > 0 ? pageSize : undefined,
      search,
      sort: sort === "last_sign_in" ? "last_sign_in" : "created_at",
      order: order === "asc" ? "asc" : "desc",
      accountStatus,
    });

    return Response.json(payload, {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    console.error("Admin user-management list error:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "حدث خطأ أثناء تحميل المستخدمين",
      },
      { status: error?.status || 500 }
    );
  }
}
