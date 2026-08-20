/**
 * Validates post-login redirect targets — local relative paths only.
 * Rejects protocol-relative, absolute, backslash, and encoded bypass attempts.
 */
export function getSafeNextPath(next) {
  if (typeof next !== "string") return null;

  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  if (trimmed.includes("\\") || trimmed.includes("@")) {
    return null;
  }

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return null;
  }

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.includes("@")
  ) {
    return null;
  }

  return trimmed;
}
