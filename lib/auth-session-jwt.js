export function readJwtRole(key) {
  try {
    const parts = String(key || "").split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );

    return payload?.role || null;
  } catch {
    return null;
  }
}
