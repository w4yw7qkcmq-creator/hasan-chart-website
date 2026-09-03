import { NextResponse } from "next/server";
import { getClientIp } from "../../../../lib/rate-limit";
import { parseTurnstileClientTelemetryPayload } from "../../../../lib/security/turnstile-client-telemetry.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 30;

const ipStore = globalThis.__turnstileClientTelemetryRateLimitStore || new Map();
globalThis.__turnstileClientTelemetryRateLimitStore = ipStore;

function pruneRateLimitStore(now) {
  for (const [ip, data] of ipStore.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
      ipStore.delete(ip);
    }
  }
}

function consumeRateLimit(ip) {
  const now = Date.now();
  pruneRateLimitStore(now);

  const current = ipStore.get(ip);

  if (!current) {
    ipStore.set(ip, { count: 1, firstRequest: now });
    return true;
  }

  if (now - current.firstRequest > RATE_LIMIT_WINDOW_MS) {
    ipStore.set(ip, { count: 1, firstRequest: now });
    return true;
  }

  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_IP) {
    return false;
  }

  return true;
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    if (!consumeRateLimit(clientIp)) {
      return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseTurnstileClientTelemetryPayload(body);

    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.reason }, { status: 400 });
    }

    const requestId = request.headers.get("x-request-id") || null;
    const logPayload = {
      code: parsed.payload.code,
      action: parsed.payload.action,
    };

    if (parsed.payload.browserFamily) {
      logPayload.browserFamily = parsed.payload.browserFamily;
    }

    if (parsed.payload.clientReportId) {
      logPayload.clientReportId = parsed.payload.clientReportId;
    }

    if (requestId) {
      logPayload.requestId = requestId;
    }

    console.warn("[TurnstileClient] challenge error", logPayload);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "unexpected_error" }, { status: 500 });
  }
}
