import { NextResponse } from "next/server";

const ADMIN_API_PREFIX = "/api/admin";
const ADMIN_REPLY_API = "/api/admin-reply";
const PUBLIC_API_ROUTES = new Set(["/api/market-pulse", "/api/market-stream"]);

function hasAccessToken(request) {
  return Boolean(request.cookies.get("hc_access_token")?.value);
}

function isProtectedAdminApi(pathname) {
  return pathname.startsWith(ADMIN_API_PREFIX) || pathname === ADMIN_REPLY_API;
}

function attachSecurityHeaders(response) {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Vary", "Accept-Encoding");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return response;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const isAdminApi = isProtectedAdminApi(pathname);

  if (isAdminApi && !hasAccessToken(request)) {
    return attachSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً",
        },
        { status: 401 }
      )
    );
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
    return attachSecurityHeaders(response);
  }

  return attachSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
