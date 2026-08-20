export const LEGACY_EDGE_DISABLED_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export function respondLegacyEdgeDisabled(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 410,
    headers: LEGACY_EDGE_DISABLED_HEADERS,
  });
}
