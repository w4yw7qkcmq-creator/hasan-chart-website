const PRODUCTION_SUPABASE_PROJECT_REF = "lzgsxdsumnteuwtjfqlm";

export const PRODUCTION_TEST_RECIPIENT_BLOCKED_EVENT =
  "PRODUCTION_TEST_RECIPIENT_EMAIL_BLOCKED";

const BLOCKED_PRODUCTION_RECIPIENT_DOMAINS = [
  "test.local",
  "staging-hcw.test",
  "e2e.hasanchartworld.test",
  "vip-staging-test.invalid",
  "example.com",
  "example.org",
  "example.net",
  "example.invalid",
  "localhost",
  "invalid",
];

function extractSupabaseProjectRef(url = "") {
  const match = String(url || "")
    .trim()
    .match(/https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || "";
}

export function isProductionEmailEnvironment(env: Record<string, string | undefined> = Deno.env.toObject()) {
  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "");
  if (urlRef === PRODUCTION_SUPABASE_PROJECT_REF) return true;

  if (String(env.NODE_ENV || "").trim().toLowerCase() === "production") {
    return true;
  }

  const runtime = String(env.HC_ENVIRONMENT || env.RAILWAY_ENVIRONMENT || "")
    .trim()
    .toLowerCase();
  if (runtime === "production") return true;

  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || "")
    .trim()
    .toLowerCase();
  if (siteUrl.includes("hasanchartworld.com") && !siteUrl.includes("staging")) {
    return true;
  }

  return false;
}

function extractRecipientDomain(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return "";
  return normalized.slice(atIndex + 1);
}

export function isBlockedProductionRecipientDomain(domain: string) {
  const normalized = String(domain || "").trim().toLowerCase();
  if (!normalized) return true;
  if (BLOCKED_PRODUCTION_RECIPIENT_DOMAINS.includes(normalized)) return true;
  if (
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  if (normalized === "example.com" || normalized.endsWith(".example.com")) return true;
  return false;
}

function normalizeRecipientList(to: unknown) {
  if (Array.isArray(to)) {
    return to.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }
  const single = String(to || "").trim().toLowerCase();
  return single ? [single] : [];
}

export function blockProductionTestRecipientSend({
  path,
  to = null,
  env = Deno.env.toObject(),
}: {
  path?: string;
  to?: unknown;
  env?: Record<string, string | undefined>;
} = {}) {
  if (!isProductionEmailEnvironment(env)) {
    return null;
  }

  const recipients = normalizeRecipientList(to);
  const blockedRecipients = recipients.filter((email) =>
    isBlockedProductionRecipientDomain(extractRecipientDomain(email))
  );

  if (blockedRecipients.length === 0) {
    return null;
  }

  const domains = [...new Set(blockedRecipients.map(extractRecipientDomain))];
  console.log(
    PRODUCTION_TEST_RECIPIENT_BLOCKED_EVENT,
    JSON.stringify({
      path: path || "unknown",
      recipientCount: blockedRecipients.length,
      recipientDomains: domains,
    })
  );

  return {
    success: false,
    skipped: true,
    sent: false,
    reason: PRODUCTION_TEST_RECIPIENT_BLOCKED_EVENT,
    blockedRecipients,
    blockedDomains: domains,
  };
}
