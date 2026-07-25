import { PENDING_ADMIN_DB_STATUSES } from "../admin-status-constants.js";
import { SUBSCRIPTION_STATUSES } from "./financial-types.js";
import {
  FINANCIAL_DEFAULT_PAGE_SIZE,
  FINANCIAL_SUBSCRIPTION_COLUMNS,
  FINANCIAL_MAX_EXPORT_ROWS,
  clampPageSize,
  escapeIlike,
  hasPaymentProof,
  inferFinancialActivationSource,
  normalizeSubscriptionStatus,
  parseSubscriptionPrice,
  resolveFinancialService,
} from "./financial-center-shared.js";

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
    paymentProofAvailable: hasPaymentProof(row),
    createdAt: row?.created_at || null,
  };
}

function matchesServiceFilter(row, serviceFilter) {
  if (!serviceFilter || serviceFilter === "all") return true;
  return resolveFinancialService(row) === serviceFilter;
}

function matchesPaidFilter(parsedPrice, paidFilter) {
  if (!paidFilter || paidFilter === "all") return true;
  if (paidFilter === "complimentary") return parsedPrice.complimentary;
  if (paidFilter === "paid") return parsedPrice.valid && parsedPrice.amount > 0;
  if (paidFilter === "unparseable") return !parsedPrice.valid;
  return true;
}

function matchesNormalizedStatus(row, statusFilter, parsedPrice) {
  if (!statusFilter || statusFilter === "all") return true;
  const normalized = normalizeSubscriptionStatus(row?.status, {
    adminDisabled: row?.admin_disabled,
    expiresAt: row?.expires_at,
  });

  if (statusFilter === "complimentary") {
    return parsedPrice.complimentary;
  }

  return normalized === statusFilter;
}

function matchesSourceFilter(row, parsedPrice, sourceFilter) {
  if (!sourceFilter || sourceFilter === "all") return true;
  return inferFinancialActivationSource(row, parsedPrice) === sourceFilter;
}

function applyClientFilters(rows, filters = {}) {
  const {
    status = "all",
    service = "all",
    source = "all",
    paid = "all",
    startedFrom = "",
    startedTo = "",
    expiresFrom = "",
    expiresTo = "",
  } = filters;

  return rows.filter((row) => {
    const parsedPrice = parseSubscriptionPrice(row?.price);

    if (!matchesNormalizedStatus(row, status, parsedPrice)) return false;
    if (!matchesServiceFilter(row, service)) return false;
    if (!matchesSourceFilter(row, parsedPrice, source)) return false;
    if (!matchesPaidFilter(parsedPrice, paid)) return false;

    const startedAt = row?.started_at ? new Date(row.started_at).getTime() : null;
    if (startedFrom && startedAt && startedAt < new Date(startedFrom).getTime()) return false;
    if (startedTo && startedAt && startedAt > new Date(`${startedTo}T23:59:59`).getTime()) return false;

    const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : null;
    if (expiresFrom && expiresAt && expiresAt < new Date(expiresFrom).getTime()) return false;
    if (expiresTo && expiresAt && expiresAt > new Date(`${expiresTo}T23:59:59`).getTime()) return false;

    return true;
  });
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

export function buildSubscriptionQuery(supabase, { search = "", sort = "created_at", order = "desc" } = {}) {
  let query = supabase
    .from("subscription_requests")
    .select(FINANCIAL_SUBSCRIPTION_COLUMNS, { count: "exact" });

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    const escaped = escapeIlike(normalizedSearch);
    query = query.or(
      `user_email.ilike.%${escaped}%,username.ilike.%${escaped}%,telegram_username.ilike.%${escaped}%,plan_name.ilike.%${escaped}%,category.ilike.%${escaped}%`
    );
  }

  query = query.order(sort === "started_at" ? "started_at" : "created_at", {
    ascending: order === "asc",
    nullsFirst: false,
  });

  return query;
}

export async function listFinancialSubscriptions(
  supabase,
  {
    page = 1,
    pageSize = FINANCIAL_DEFAULT_PAGE_SIZE,
    search = "",
    sort = "created_at",
    order = "desc",
    filters = {},
    exportMode = false,
  } = {}
) {
  const resolvedPageSize = exportMode ? FINANCIAL_MAX_EXPORT_ROWS : clampPageSize(pageSize);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const needsClientFilter =
    (filters.status && filters.status !== "all") ||
    (filters.service && filters.service !== "all") ||
    (filters.source && filters.source !== "all") ||
    (filters.paid && filters.paid !== "all") ||
    Boolean(filters.startedFrom) ||
    Boolean(filters.startedTo) ||
    Boolean(filters.expiresFrom) ||
    Boolean(filters.expiresTo);

  if (!needsClientFilter) {
    const from = (pageNumber - 1) * resolvedPageSize;
    const to = from + resolvedPageSize - 1;
    const query = buildSubscriptionQuery(supabase, { search, sort, order }).range(from, to);
    const { data, error, count } = await query;
    if (error) throw error;

    const userIdByEmail = await attachUserIds(supabase, data || []);
    const items = (data || []).map((row) => normalizeSubscriptionRow(row, userIdByEmail));

    return {
      items,
      pagination: {
        page: pageNumber,
        pageSize: resolvedPageSize,
        total: count || 0,
        totalPages: Math.max(Math.ceil((count || 0) / resolvedPageSize), 1),
      },
    };
  }

  const scanLimit = exportMode ? FINANCIAL_MAX_EXPORT_ROWS : 1000;
  const { data, error } = await buildSubscriptionQuery(supabase, { search, sort, order }).limit(scanLimit);
  if (error) throw error;

  const filtered = applyClientFilters(data || [], filters);
  const from = (pageNumber - 1) * resolvedPageSize;
  const slice = filtered.slice(from, from + resolvedPageSize);
  const userIdByEmail = await attachUserIds(supabase, slice);

  return {
    items: slice.map((row) => normalizeSubscriptionRow(row, userIdByEmail)),
    pagination: {
      page: pageNumber,
      pageSize: resolvedPageSize,
      total: filtered.length,
      totalPages: Math.max(Math.ceil(filtered.length / resolvedPageSize), 1),
    },
    scannedRows: (data || []).length,
    clientFiltered: true,
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
    countByStatus(PENDING_ADMIN_DB_STATUSES),
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
  let query = supabase.from("subscription_requests").select(FINANCIAL_SUBSCRIPTION_COLUMNS);

  if (kind === "active") {
    query = query.in("status", ["مفعل", "نشط", "active"]).order("started_at", { ascending: false, nullsFirst: false });
  } else {
    query = query.in("status", PENDING_ADMIN_DB_STATUSES).order("created_at", { ascending: false });
  }

  const { data, error } = await query.limit(limit);
  if (error) throw error;

  const userIdByEmail = await attachUserIds(supabase, data || []);
  return (data || []).map((row) => normalizeSubscriptionRow(row, userIdByEmail));
}

export { normalizeSubscriptionRow, SUBSCRIPTION_STATUSES };
