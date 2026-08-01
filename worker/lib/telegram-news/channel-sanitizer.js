const CHANNEL_ARTIFACT_PATTERNS = [
  /نشرة\s*أخبار\s*الفوركس/giu,
  /أخبار\s*الفوركس\s*العاجلة/giu,
  /تابعونا/giu,
  /تابعنا/giu,
  /اشترك(?:وا)?/giu,
  /subscribe/giu,
  /ForexBreakingNews/giu,
  /ForexNewspaper/giu,
  /https?:\/\/t\.me\/(?:Forex|joinchat|\+)[^\s]*/giu,
  /@[A-Za-z0-9_]{3,}/g,
  /📢\s*قناة\s*الأخبار\s*الرسمية[^\n]*/giu,
];

function sanitizeChannelArtifacts(text) {
  let value = String(text || "");
  for (const pattern of CHANNEL_ARTIFACT_PATTERNS) {
    value = value.replace(pattern, "");
  }

  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assertNoChannelArtifacts(message) {
  const text = String(message || "");
  const issues = [];

  if (/نشرة\s*أخبار\s*الفوركس/i.test(text)) {
    issues.push("forex_newsletter_footer");
  }
  if (/ForexBreakingNews|ForexNewspaper/i.test(text)) {
    issues.push("channel_name_leak");
  }
  if (/https?:\/\/t\.me\/(?:Forex|joinchat|\+)/i.test(text)) {
    issues.push("channel_link_leak");
  }
  if (/exness|one\.exness/i.test(text)) {
    issues.push("promo_link_leak");
  }
  if (/اشترak|subscribe|VIP\s*promo/i.test(text)) {
    issues.push("subscription_leak");
  }

  return {
    ok: issues.length === 0,
    issues,
    reason: issues[0] || null,
  };
}

module.exports = {
  sanitizeChannelArtifacts,
  assertNoChannelArtifacts,
  CHANNEL_ARTIFACT_PATTERNS,
};
