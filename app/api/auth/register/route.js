import { NextResponse } from "next/server";
import {
  getClientIp,
  registerIpLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";

export async function POST(request) {
  const clientIp = getClientIp(request);
  const rateLimitResult = await registerIpLimiter(clientIp);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: RATE_LIMIT_ERROR },
      { status: 429 }
    );
  }

  return NextResponse.json({
    success: false,
    error: "Register API not configured yet",
  });
}
