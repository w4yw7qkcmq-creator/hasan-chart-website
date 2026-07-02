import { NextResponse } from "next/server";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { PRICE_ALERT_SINGLE_PATH } from "../../../lib/price-alerts-runner";
import { logPriceAlertEmailBlockedFromWebsite } from "../../../lib/price-alert-email-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const authCheck = verifyCronSecret(request);

  if (!authCheck.ok) {
    return NextResponse.json(
      {
        success: false,
        error: authCheck.error,
      },
      { status: authCheck.status }
    );
  }

  logPriceAlertEmailBlockedFromWebsite({
    path: "app/api/check-price-alerts/route.js::GET",
  });

  return NextResponse.json(
    {
      success: false,
      error: "Price alerts are handled by the Railway worker only.",
      canonicalPath: PRICE_ALERT_SINGLE_PATH,
    },
    { status: 410 }
  );
}
