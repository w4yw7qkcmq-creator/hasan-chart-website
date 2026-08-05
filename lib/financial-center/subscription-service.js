import { SUBSCRIPTION_STATUSES } from "./financial-types.js";
import {
  FINANCIAL_DEFAULT_PAGE_SIZE,
  FINANCIAL_MAX_EXPORT_ROWS,
  clampPageSize,
  inferFinancialActivationSource,
  normalizeSubscriptionStatus,
  parseSubscriptionPrice,
  resolveFinancialService,
} from "./financial-center-shared.js";
import {
  countPendingPaymentReviewsDb,
  fetchFinancialPaymentReviewsPage,
  fetchFinancialSubscriptionsPage,
  parseFinancialListParams,
} from "./build-financial-list-query.js";
import { normalizePaymentReviewRow } from "./payment-service.js";

function normalizeSubscriptionRow(row, userIdByEmail = new Map()) {
  const parsedPrice = parseSubscriptionPrice(row?.price);
  const adminDisabled = Boolean(row?.admin_disabled);
  const normalizedStatus = normalizeSubscriptionStatus(row?.status, {
    adminDisabled,
    expiresAt: row?.expires_at,
  });
  const email = String(row?.user_email || "").trim().toLowerCase();

  return {
    id: row.id,
    requestId: row.id,
    userId: userIdByEmail.get(email) || "",
    userEmail: email,
    username: row?.username || "",
    telegramUsername: row?.telegram_username || "",
    service: resolveFinancialService(row),
    plan: row?.plan_name || "",
    category: row?.category || "",
    status: normalizedStatus,
    rawStatus: String(row?.status || "").trim(),
    source: inferFinancialActivationSource(row, parsedPrice),
    startedAt: row?.started_at || null,
    expiresAt: row?.expires_at || null,
    adminDisabled,
    priceAmount: parsedPrice.valid ? parsedPrice.amount : null,
    priceRaw: parsedPrice.raw,
    currency: parsedPrice.currency,
    isComplimentary: parsedPrice.complimentary,
    paymentProofAvailable: Boolean(row?.payment_proof_available),
    createdAt: row?.created_at || null,
  };
}

async function attachUserIds(supabase, rows) {
  const emails = [...new Set(rows.map((row) => String(row.user_email || "").trim().toLowerCase()).filter(Boolean))];
  const map = new Map();

  if (emails.length === 0) return map;

  const chunkSize = 100;
  for (let index = 0; index < emails.length; index += chunkSize) {
    const chunk = emails.slice(index, index + chunkSize);
    const { data, error } = await supabase.from("profiles").select("id,email").in("email", chunk);
    if (error) throw error;
    for (const profile of data || []) {
      map.set(String(profile.email || "").trim().toLowerCase(), profile.id);
    }
  }

  return map;
}

export async function listFinancialSubscriptions(
  supabase,
  {
    page = 1,
    pageSize = FINANCIAL_DEFAULT_PAGE_SIZE,
    cursor = null,
    search = "",
    sort = "created_at",
    order = "desc",
    filters = {},
    exportMode = false,
    includeTotal = false,
  } = {}
) {
  const resolvedPageSize = exportMode ? FINANCIAL_MAX_EXPORT_ROWS : clampPageSize(pageSize);
  const params = parseFinancialListParams({
    search,
    cursor,
    page: exportMode ? 1 : page,
    pageSize: resolvedPageSize,
    includeTotal,
    filters,
    sort,
    order,
  });

  const { items: rows, pagination } = await fetchFinancialSubscriptionsPage(supabase, params);
  const userIdByEmail = await attachUserIds(supabase, rows);

  return {
    items: rows.map((row) => normalizeSubscriptionRow(row, userIdByEmail)),
    pagination,
  };
}

export async function getSubscriptionFinancialSummary(supabase) {
  const countByStatus = async (statusValues) => {
    const { count, error } = await supabase
      .from("subscription_requests")
      .select("id", { count: "exact", head: true })
      .in("status", statusValues);
    if (error) throw error;
    return count || 0;
  };

  const [pendingReviews, rawActive, expired, rejected] = await Promise.all([
    countPendingPaymentReviewsDb(supabase),
    countByStatus(["مفعل", "نشط", "active"]),
    countByStatus(["منتهي", "expired"]),
    countByStatus(["مرفوض", "rejected"]),
  ]);

  return {
    pendingReviews,
    rawActiveCount: rawActive,
    expiredCount: expired,
    rejectedCount: rejected,
  };
}

export async function getRecentFinancialSubscriptions(supabase, { kind = "active", limit = 5 } = {}) {
  if (kind === "pending") {
    const params = parseFinancialListParams({
      reviewStatus: "pending_review",
      limit,
      sort: "created_at",
      order: "desc",
    });
    const { items: rows } = await fetchFinancialPaymentReviewsPage(supabase, params);
    return rows.map((row) => {
      const item = normalizePaymentReviewRow(row);
      return {
        ...item,
        paymentProofAvailable: item.proofAvailable,
      };
    });
  }

  const params = parseFinancialListParams({
    filters: { status: "active" },
    limit,
    sort: "started_at",
    order: "desc",
  });
  const { items: rows } = await fetchFinancialSubscriptionsPage(supabase, params);
  const userIdByEmail = await attachUserIds(supabase, rows);
  return rows.map((row) => normalizeSubscriptionRow(row, userIdByEmail));
}

export { normalizeSubscriptionRow, SUBSCRIPTION_STATUSES };
