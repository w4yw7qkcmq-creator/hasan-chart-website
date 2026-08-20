import { NextResponse } from "next/server";
import {
  applyVerifiedSessionCookies,
  parseSyncSessionTokens,
  verifySessionTokensForCookieSync,
} from "../../../../lib/auth-sync-session-server";
import {
  crossOriginRequestResponse,
  isCrossOriginRequest,
} from "../../../../lib/security/same-origin-request";

export async function POST(request) {
  try {
    if (isCrossOriginRequest(request)) {
      return crossOriginRequestResponse();
    }

    const body = await request.json().catch(() => null);
    const { accessToken, refreshToken } = parseSyncSessionTokens(body);

    const verified = await verifySessionTokensForCookieSync(accessToken, refreshToken);

    if (!verified.ok) {
      return NextResponse.json(
        { success: false, error: verified.error },
        { status: verified.status }
      );
    }

    const response = NextResponse.json({ success: true });
    applyVerifiedSessionCookies(response, verified.session);
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to sync session cookies" },
      { status: 500 }
    );
  }
}
