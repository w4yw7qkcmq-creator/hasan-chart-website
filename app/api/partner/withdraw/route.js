import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth-session";
import {
  createPartnerWithdrawal,
  ensurePartner,
} from "../../../../lib/partner-server";
import {
  handlePartnerApiError,
  PARTNER_API_ERROR_MESSAGES,
} from "../../../../lib/partner-api-helpers";
import { checkPartnerRateLimit } from "../../../../lib/partner-security";
import { capturePartnerAnalyticsEvent } from "../../../../lib/partner-monitoring";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES = PARTNER_API_ERROR_MESSAGES;

export async function POST(request) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: ERROR_MESSAGES.UNAUTHORIZED },
        { status: 401 }
      );
    }

    const rate = checkPartnerRateLimit(`withdraw:${session.id}`, { max: 10 });

    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: ERROR_MESSAGES.RATE_LIMITED },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const amount = body?.amount;
    const network = body?.network;
    const walletAddress = body?.walletAddress;
    const partnerNote = body?.partnerNote;
    const confirmed = Boolean(body?.confirmed);

    if (!confirmed) {
      return NextResponse.json(
        {
          success: false,
          error: "يرجى تأكيد صحة عنوان المحفظة والشبكة",
        },
        { status: 400 }
      );
    }

    if (
      amount == null ||
      amount === "" ||
      !String(network || "").trim() ||
      !String(walletAddress || "").trim()
    ) {
      return NextResponse.json(
        { success: false, error: "يرجى إكمال بيانات السحب" },
        { status: 400 }
      );
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const withdrawal = await createPartnerWithdrawal(session.supabase, {
      partnerId: partner.id,
      amount,
      network,
      walletAddress,
      partnerNote,
    });

    await capturePartnerAnalyticsEvent("partner.withdraw.requested", {
      partnerId: partner.id,
      amount: withdrawal.amount,
    });

    return NextResponse.json({
      success: true,
      withdrawal,
      message: "تم إرسال طلب السحب بنجاح. سيتم مراجعته من الإدارة.",
    });
  } catch (error) {
    const code = error?.message;

    if (code && ERROR_MESSAGES[code]) {
      return NextResponse.json({ success: false, error: ERROR_MESSAGES[code] }, { status: 400 });
    }

    return handlePartnerApiError(error, {
      event: "partner.withdraw.api",
      fallbackMessage: "تعذر إرسال طلب السحب",
    });
  }
}
