import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { getAdminPartnerTimeline } from "../../../../lib/partner-analytics";
import { clampLimit, requireValidUuid } from "../../../../lib/partner-security";
import { handlePartnerApiError } from "../../../../lib/partner-api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerId = requireValidUuid(searchParams.get("partnerId"), "partner_id");
    const limit = clampLimit(searchParams.get("limit"), { min: 1, max: 100, fallback: 50 });

    const timeline = await getAdminPartnerTimeline(adminCheck.supabase, partnerId, { limit });

    return Response.json({ success: true, timeline });
  } catch (error) {
    return handlePartnerApiError(error, {
      event: "admin.partner.timeline",
      fallbackMessage: "تعذر تحميل Timeline",
    });
  }
}
