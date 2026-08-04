import { NextResponse } from "next/server";
import { requireMachineAuth } from "../../../lib/iam/machine-auth.js";
import { IAM_PERMISSIONS } from "../../../lib/iam/constants.js";
import {
  logPriceAlertEmailBlockedFromSupabaseOrWebsite,
  PRICE_ALERT_CANONICAL_PATH,
  PRICE_ALERT_EMAIL_BLOCKED_EVENT,
} from "../../../lib/price-alert-email-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildDisabledPriceAlertsResponse(method) {
  logPriceAlertEmailBlockedFromSupabaseOrWebsite({
    service: "hasan-chart-website",
    path: `app/api/check-price-alerts/route.js::${method}`,
    label: "route-disabled-410",
  });

  return NextResponse.json(
    {
      success: false,
      error: "Price alerts are handled by the Railway worker only.",
      canonicalPath: PRICE_ALERT_CANONICAL_PATH,
      websiteEmailPolicy: PRICE_ALERT_EMAIL_BLOCKED_EVENT,
    },
    { status: 410 }
  );
}

async function authorizePriceAlertsRoute(request) {
  const authCheck = await requireMachineAuth(request, IAM_PERMISSIONS.SYSTEM_CRON_READ);
  if (!authCheck.ok) {
    return NextResponse.json(
      {
        success: false,
        error: authCheck.error,
      },
      { status: authCheck.status }
    );
  }
  return null;
}

export async function GET(request) {
  const denied = await authorizePriceAlertsRoute(request);
  if (denied) return denied;
  return buildDisabledPriceAlertsResponse("GET");
}

export async function POST(request) {
  const denied = await authorizePriceAlertsRoute(request);
  if (denied) return denied;
  return buildDisabledPriceAlertsResponse("POST");
}

export async function PUT(request) {
  const denied = await authorizePriceAlertsRoute(request);
  if (denied) return denied;
  return buildDisabledPriceAlertsResponse("PUT");
}

export async function PATCH(request) {
  const denied = await authorizePriceAlertsRoute(request);
  if (denied) return denied;
  return buildDisabledPriceAlertsResponse("PATCH");
}

export async function DELETE(request) {
  const denied = await authorizePriceAlertsRoute(request);
  if (denied) return denied;
  return buildDisabledPriceAlertsResponse("DELETE");
}
