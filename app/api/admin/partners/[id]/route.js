import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { getAdminPartnerDetails } from "../../../../../lib/partner-admin-server";
import { requireValidUuid } from "../../../../../lib/partner-security";
import { handlePartnerApiError } from "../../../../../lib/partner-api-helpers";

export const dynamic = "force-dynamic";

function resolveSiteOrigin(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;

  if (configured) {
    return String(configured).replace(/\/$/, "");
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";

  if (host) {
    return `${proto}://${host}`;
  }

  return "https://www.hasanchartworld.com";
}

export async function GET(request, { params }) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const partnerId = requireValidUuid(params?.id, "partner_id");

    const data = await getAdminPartnerDetails(adminCheck.supabase, partnerId, {
      siteOrigin: resolveSiteOrigin(request),
    });

    if (!data) {
      return Response.json({ success: false, error: "الشريك غير موجود" }, { status: 404 });
    }

    return Response.json({
      success: true,
      ...data,
    });
  } catch (error) {
    return handlePartnerApiError(error, {
      event: "admin.partner.details",
      fallbackMessage: "تعذر تحميل تفاصيل الشريك",
    });
  }
}
