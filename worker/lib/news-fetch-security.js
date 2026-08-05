function isPrivateOrLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    return true;
  }
  return false;
}

function isSafeExternalFetchUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return !isPrivateOrLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

module.exports = {
  isSafeExternalFetchUrl,
  isPrivateOrLocalHost,
};
