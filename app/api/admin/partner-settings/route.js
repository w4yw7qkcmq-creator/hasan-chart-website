import { verifyAdminSession } from "../../../../lib/admin-auth";
import { loadPartnerProgramSettings, savePartnerProgramSettings } from "../../../../lib/partner-settings";

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

    const settings = await loadPartnerProgramSettings(adminCheck.supabase);

    return Response.json({ success: true, settings });
  } catch (error) {
    console.error("ADMIN_PARTNER_SETTINGS_GET_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل إعدادات الشركاء" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const settings = await savePartnerProgramSettings(adminCheck.supabase, body);

    return Response.json({
      success: true,
      settings,
      message: "تم حفظ إعدادات الأتمتة",
    });
  } catch (error) {
    console.error("ADMIN_PARTNER_SETTINGS_POST_ERROR");
    return Response.json(
      { success: false, error: "تعذر حفظ إعدادات الشركاء" },
      { status: 500 }
    );
  }
}
