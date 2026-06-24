import { NextResponse } from "next/server";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { checkPriceAlerts, PRICE_ALERTS_RUNNER_VERSION } from "../../../lib/price-alerts-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    const summary = await checkPriceAlerts();

    return NextResponse.json({
      success: true,
      moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
      path: "nextjs-price-alerts-runner",
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
