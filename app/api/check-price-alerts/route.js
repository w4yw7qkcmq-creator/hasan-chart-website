import { NextResponse } from "next/server";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { PRICE_ALERT_SINGLE_PATH } from "../../../lib/price-alerts-runner";
import { logPriceAlertEmailBlockedFromWebsite } from "../../../lib/price-alert-email-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildDisabledPriceAlertsResponse(method) {
  logPriceAlertEmailBlockedFromWebsite({
    path: `app/api/check-price-alerts/route.js::${method}`,
    label: "route-disabled-410",
  });

  return NextResponse.json(
    {
      success: false,
      error: "Price alerts are handled by the Railway worker only.",
      canonicalPath: PRICE_ALERT_SINGLE_PATH,
      websiteEmailPolicy: "PRICE_ALERT_EMAIL_BLOCKED_FROM_WEBSITE",
    },
    { status: 410 }
  );
}

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

  return buildDisabledPriceAlertsResponse("GET");
}

export async function POST() {
  return buildDisabledPriceAlertsResponse("POST");
}

export async function PUT() {
  return buildDisabledPriceAlertsResponse("PUT");
}

export async function PATCH() {
  return buildDisabledPriceAlertsResponse("PATCH");
}

export async function DELETE() {
  return buildDisabledPriceAlertsResponse("DELETE");
}
