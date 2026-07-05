import { verifyAdminSession } from "../../../../lib/admin-auth";
import { getAdminPartnersOverview } from "../../../../lib/partner-admin-server";

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

export async function GET(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const data = await getAdminPartnersOverview(adminCheck.supabase, {
      siteOrigin: resolveSiteOrigin(request),
    });

    return Response.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("ADMIN_PARTNERS_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل بيانات الشركاء" },
      { status: 500 }
    );
  }
}
