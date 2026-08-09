import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/auth-session";
import { ensurePartner } from "../../../../../lib/partner-server";
import { getPartnerTierProgress } from "../../../../../lib/partner-tiers";
import { createSmartLink } from "../../../../../lib/partner-center/smart-link-service.js";
import { getPartnerSmartLinksView } from "../../../../../lib/partner-center/partner-ui-service.js";
import { mapSmartLinkErrorToMessage } from "../../../../../lib/partner-center/smart-link-errors.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSessionUser();
    if (session.error) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const smartLinks = await getPartnerSmartLinksView(
      session.supabase,
      partner.id,
      partner.referral_code
    );

    return NextResponse.json({ success: true, smartLinks });
  } catch (error) {
    console.error("Partner smart links GET error");
    return NextResponse.json({ success: false, error: "تعذر تحميل الروابط" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await requireSessionUser();
    if (session.error) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const tierProgress = await getPartnerTierProgress(session.supabase, partner.id);
    const tierKey = tierProgress?.tierKey || partner.tier_key || "partner";

    const body = await request.json().catch(() => ({}));
    const result = await createSmartLink(session.supabase, {
      partnerId: partner.id,
      referralCode: partner.referral_code,
      tierKey,
      input: {
        destinationPath: body.destinationPath || body.destination_path || "/register",
        source: body.source,
        medium: body.medium,
        label: body.label,
        campaignCode: body.campaignCode || body.campaign_code,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: mapSmartLinkErrorToMessage(result.error, result.code),
          errorKey: result.error,
          code: result.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, smartLink: result.smartLink, url: result.url });
  } catch (error) {
    console.error("Partner smart links POST error");
    return NextResponse.json({ success: false, error: "تعذر إنشاء الرابط" }, { status: 500 });
  }
}
