import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { loadAdminUserList } from "../../../../lib/admin-user-management";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 0);
    const search = String(searchParams.get("search") || "");
    const sort = String(searchParams.get("sort") || "created_at").trim().toLowerCase();
    const order = String(searchParams.get("order") || "desc").trim().toLowerCase();

    const accountStatus = String(searchParams.get("accountStatus") || "").trim().toLowerCase();
    const activeService = String(searchParams.get("activeService") || "").trim().toLowerCase();

    const listAll =
      searchParams.get("listAll") === "1" || String(searchParams.get("pageSize") || "") === "0";

    const payload = await loadAdminUserList(adminCheck.supabase, {
      page,
      pageSize: pageSize > 0 ? pageSize : undefined,
      listAll,
      search,
      sort: sort === "last_sign_in" ? "last_sign_in" : "created_at",
      order: order === "asc" ? "asc" : "desc",
      accountStatus,
      activeService,
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
