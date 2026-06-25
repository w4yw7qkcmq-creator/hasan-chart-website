import { NextResponse } from "next/server";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { PRICE_ALERTS_RUNNER_VERSION } from "../../../lib/price-alerts-runner";

export const dynamic = "force-dynamic";

const CANONICAL_PATH = "worker/index.js::checkPriceAlerts";

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

  return NextResponse.json({
    success: true,
    skipped: true,
    disabled: true,
    moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
    canonicalPath: CANONICAL_PATH,
    message:
      "This endpoint is permanently disabled. Price alerts are processed only by worker/index.js to prevent duplicate emails.",
  });
}
