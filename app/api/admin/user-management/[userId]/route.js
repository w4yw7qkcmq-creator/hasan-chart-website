import {
  ADMIN_USER_SECTIONS,
  loadAdminUserSection,
} from "../../../../../lib/admin-user-management";
import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../../lib/api-response";
import {
  buildUnavailableSectionPayload,
  isMissingDatabaseResourceError,
  sanitizeAdminUserFacingError,
} from "../../../../../lib/admin-user-management-shared";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const { searchParams } = new URL(request.url);
    const section = String(searchParams.get("section") || "overview").trim().toLowerCase();
    const page = Number(searchParams.get("page") || 1);
    const activityFilter = String(searchParams.get("activityFilter") || "all").trim();

    if (!ADMIN_USER_SECTIONS.has(section)) {
      return Response.json({ success: false, error: "قسم غير مدعوم" }, { status: 400 });
    }

    const payload = await loadAdminUserSection(adminCheck.supabase, userId, section, {
      page,
      activityFilter,
    });

    return Response.json(payload, {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    console.error("Admin user-management detail error:", error);

    if (isMissingDatabaseResourceError(error)) {
      const { searchParams } = new URL(request.url);
      const section = String(searchParams.get("section") || "overview").trim().toLowerCase();
      const page = Number(searchParams.get("page") || 1);

      return Response.json(buildUnavailableSectionPayload(section, page), {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
          Vary: "Accept-Encoding",
        },
      });
    }

    const sanitized = sanitizeAdminUserFacingError(error);

    return Response.json(
      {
        success: false,
        error: sanitized.message,
        errorKind: sanitized.kind,
      },
      { status: error?.status || 500 }
    );
  }
}
