import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { adminListAuditLog } from "../../../../../lib/partner-center/admin-marketing-service.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_MISSIONS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);

    const audit = await adminListAuditLog(adminCheck.supabase, { limit, offset });
    return Response.json({ success: true, ...audit });
  } catch (error) {
    console.error("ADMIN_AUDIT_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل سجل التدقيق" }, { status: 500 });
  }
}
