import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../../lib/auth-session";
import { ensurePartner } from "../../../../../../lib/partner-server";
import { archiveSmartLink } from "../../../../../../lib/partner-center/smart-link-service.js";
import { mapSmartLinkErrorToMessage } from "../../../../../../lib/partner-center/smart-link-errors.js";

export const dynamic = "force-dynamic";

export async function DELETE(_request, { params }) {
  const resolvedParams = await params;
  try {
    const session = await requireSessionUser();
    if (session.error) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const smartLinkId = String(resolvedParams?.id || "").trim();
    if (!smartLinkId) {
      return NextResponse.json(
        { success: false, error: "معرّف الرابط غير صالح", errorKey: "invalid_link_id" },
        { status: 400 }
      );
    }

    const result = await archiveSmartLink(session.supabase, {
      partnerId: partner.id,
      smartLinkId,
    });

    if (!result.ok) {
      const status = result.code === "IDOR" ? 403 : result.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        {
          success: false,
          error: mapSmartLinkErrorToMessage(result.error, result.code),
          errorKey: result.error,
          code: result.code,
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      smartLinkId: result.smartLinkId || result.smartLink?.id,
      alreadyArchived: Boolean(result.alreadyArchived),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Partner smart links DELETE error", {
      errorKey: "internal_error",
      message: message.slice(0, 200),
    });
    return NextResponse.json(
      { success: false, error: "تعذر حذف الرابط", errorKey: "internal_error" },
      { status: 500 }
    );
  }
}
