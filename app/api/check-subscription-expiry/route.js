import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "../../../lib/admin-auth";
import {
  buildMaintenanceResponse,
  isSubscriptionMaintenanceWorkerEnabled,
  runSubscriptionMaintenance,
} from "../../../lib/subscription-expiry-shared.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

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

    if (isSubscriptionMaintenanceWorkerEnabled()) {
      return NextResponse.json({
        success: true,
        skipped: true,
        delegated: true,
        reason: "SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED",
        checked: 0,
        expiringSoon: 0,
        expired: 0,
        profilesUpdated: 0,
        requestsUpdated: 0,
        emailsSent: 0,
        siteNotificationsCreated: 0,
        skippedAlreadyProcessed: 0,
        failed: 0,
        durationMs: 0,
        remindersSent: 0,
        expiredProcessed: 0,
        now: new Date().toISOString(),
      });
    }

    const summary = await runSubscriptionMaintenance(supabase);

    return NextResponse.json({
      ...buildMaintenanceResponse(summary),
      now: new Date().toISOString(),
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
