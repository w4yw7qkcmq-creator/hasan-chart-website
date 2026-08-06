/**
 * Central VIP recommendation recipient eligibility rules.
 */

export function isCombinedVipPlan(planText) {
  const text = String(planText || "").toLowerCase();
  return (
    text.includes("vip signals") ||
    text.includes("vip signal") ||
    text.includes("combined") ||
    text.includes("شامل") ||
    text.includes("الاثنين") ||
    text.includes("spot + futures") ||
    text.includes("spot+futures") ||
    text.includes("سبوت + فيوتشر")
  );
}

export function matchesSignalSubscription(planText, signalType) {
  const text = String(planText || "").toLowerCase();

  if (isCombinedVipPlan(text)) {
    return true;
  }

  if (signalType === "futures") {
    return (
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures") ||
      text.includes("عقود")
    );
  }

  return (
    text.includes("spot") ||
    text.includes("سبوت") ||
    text.includes("vip spot")
  );
}

export function isActiveSubscriptionRow(item) {
  if (!item) return false;

  const status = String(item.status || item.subscription_status || "").trim().toLowerCase();
  const isActiveStatus = status === "مفعل" || status === "نشط" || status === "active";

  if (!isActiveStatus) return false;

  if (item.expires_at) {
    const expiresTime = new Date(item.expires_at).getTime();
    if (Number.isFinite(expiresTime) && expiresTime <= Date.now()) {
      return false;
    }
  }

  return true;
}

export function extractEligibleEmailsFromSubscriptionRows(rows, signalType, seenEmails) {
  const emails = [];

  for (const item of rows || []) {
    if (!isActiveSubscriptionRow(item)) continue;
    if (!matchesSignalSubscription(`${item.plan_name || ""} ${item.category || ""}`, signalType)) {
      continue;
    }

    const email = String(item.user_email || "").trim().toLowerCase();
    if (!email || seenEmails.has(email)) continue;

    seenEmails.add(email);
    emails.push(email);
  }

  return emails;
}

export function extractEligibleEmailsFromProfileRows(rows, signalType, seenEmails) {
  const emails = [];

  for (const item of rows || []) {
    if (!isActiveSubscriptionRow(item)) continue;
    if (!matchesSignalSubscription(item.subscription_plan || "", signalType)) continue;

    const email = String(item.email || "").trim().toLowerCase();
    if (!email || seenEmails.has(email)) continue;

    seenEmails.add(email);
    emails.push(email);
  }

  return emails;
}

const SUBSCRIPTION_BATCH_SELECT =
  "id,user_email,plan_name,category,status,expires_at,created_at";
const PROFILE_BATCH_SELECT =
  "id,email,subscription_plan,subscription_status,created_at";
const DEFAULT_BATCH_SIZE = 100;

async function fetchSubscriptionBatch(supabase, offset, batchSize) {
  return supabase
    .from("subscription_requests")
    .select(SUBSCRIPTION_BATCH_SELECT)
    .eq("status", "مفعل")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);
}

async function fetchProfilesBatch(supabase, offset, batchSize) {
  return supabase
    .from("profiles")
    .select(PROFILE_BATCH_SELECT)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);
}

/**
 * Collect all eligible recipient emails for a signal type (central, testable).
 */
export async function collectEligibleVipRecipientEmails(
  supabase,
  signalType,
  batchSize = DEFAULT_BATCH_SIZE
) {
  const seenEmails = new Set();
  const emails = [];

  async function paginate(fetchBatch, extract) {
    let offset = 0;
    while (true) {
      const { data, error } = await fetchBatch(supabase, offset, batchSize);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) break;

      emails.push(...extract(rows, signalType, seenEmails));

      if (rows.length < batchSize) break;
      offset += batchSize;
    }
  }

  await paginate(fetchSubscriptionBatch, extractEligibleEmailsFromSubscriptionRows);
  await paginate(fetchProfilesBatch, extractEligibleEmailsFromProfileRows);

  return emails;
}

export async function countEligibleVipRecipients(supabase, signalType, batchSize = DEFAULT_BATCH_SIZE) {
  const emails = await collectEligibleVipRecipientEmails(supabase, signalType, batchSize);
  return emails.length;
}
