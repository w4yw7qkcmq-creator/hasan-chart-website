import { NextResponse } from "next/server";
import { applySecurityHeaders } from "./lib/security-headers";
import {
  adminMutationLimiter,
  adminReadLimiter,
  getClientIp,
  RATE_LIMIT_ERROR,
} from "./lib/rate-limit";
import {
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
  sanitizeReferralCode,
} from "./lib/partner-shared";

const ADMIN_API_PREFIX = "/api/admin";
const ADMIN_REPLY_API = "/api/admin-reply";
const PUBLIC_API_ROUTES = new Set(["/api/market-pulse", "/api/market-stream"]);

function hasAccessToken(request) {
  return Boolean(request.cookies.get("hc_access_token")?.value);
}

function isProtectedAdminApi(pathname) {
  return pathname.startsWith(ADMIN_API_PREFIX) || pathname === ADMIN_REPLY_API;
}

function applyCaptureResultCookies(response, capturePayload) {
  if (!capturePayload?.captured || !capturePayload?.code) {
    return response;
  }

  response.cookies.set(REFERRAL_COOKIE_NAME, capturePayload.code, {
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  if (capturePayload.setVisitorCookie && capturePayload.visitorId) {
    response.cookies.set(VISITOR_COOKIE_NAME, capturePayload.visitorId, {
      maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  }

  return response;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isAdminApi = isProtectedAdminApi(pathname);

  if (isAdminApi && !hasAccessToken(request)) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً",
        },
        { status: 401 }
      )
    );
  }

  if (isAdminApi) {
    const isReadMethod = request.method === "GET" || request.method === "HEAD";
    const limiter = isReadMethod ? adminReadLimiter : adminMutationLimiter;
    const rateLimitResult = await limiter(`admin-ip:${getClientIp(request)}`);

    if (!rateLimitResult.success) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: RATE_LIMIT_ERROR,
          },
          { status: 429 }
        )
      );
    }
  }

  if (pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    const requestId = requestHeaders.get("x-request-id") || crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    requestHeaders.set("x-request-id", requestId);
    requestHeaders.set("x-request-start", String(Date.now()));
    requestHeaders.set("x-hc-api-route", pathname);

    if (PUBLIC_API_ROUTES.has(pathname)) {
      requestHeaders.set("x-hc-public-api", "1");
    }

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set("x-request-id", requestId);
    return applySecurityHeaders(response);
  }

  if (pathname.startsWith("/r/")) {
    return applySecurityHeaders(NextResponse.next());
  }

  const referralCode = sanitizeReferralCode(request.nextUrl.searchParams.get("ref"));
  const existingReferralCookie = request.cookies.get(REFERRAL_COOKIE_NAME)?.value;
  const response = applySecurityHeaders(NextResponse.next());

  if (referralCode && !existingReferralCookie) {
    try {
      const captureUrl = new URL("/api/partner/capture-ref", request.url);
      const captureResponse = await fetch(captureUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ code: referralCode }),
      });

      if (captureResponse.ok) {
        const capturePayload = await captureResponse.json().catch(() => null);
        applyCaptureResultCookies(response, capturePayload);
      }
    } catch {
      // Ignore referral capture failures — page must load normally.
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
