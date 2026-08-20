/**
 * Reject cross-origin state-changing requests when Origin is present.
 * Missing Origin is allowed (same-origin navigations, trusted server-side callers).
 */
export function isCrossOriginRequest(request) {
  if (!request) return false;

  const origin = request.headers.get("origin")?.trim();
  const host = request.headers.get("host")?.trim();

  if (!origin) return false;
  if (!host) return false;

  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function crossOriginRequestResponse() {
  return Response.json(
    { success: false, error: "Cross-origin request rejected" },
    { status: 403 }
  );
}
