import { NextResponse } from "next/server";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { checkPriceAlerts, PRICE_ALERTS_RUNNER_VERSION } from "../../../lib/price-alerts-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CANONICAL_PATH = "lib/price-alerts-runner.js::checkPriceAlerts";

export async function GET(request) {
  try {
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

    console.log(
      "PRICE_ALERT_EMAIL_PATH_B",
      JSON.stringify({
        path: "app/api/check-price-alerts/route.js",
        phase: "cron-invoke",
        moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
      })
    );

    const summary = await checkPriceAlerts();

    return NextResponse.json({
      success: true,
      moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
      path: CANONICAL_PATH,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
