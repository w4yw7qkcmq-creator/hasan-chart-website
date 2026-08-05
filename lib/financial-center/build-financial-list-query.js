import { isPaymentProofLegacyReadEnabled } from "../payment-proof-storage.js";
import {
  FINANCIAL_DEFAULT_PAGE_SIZE,
  FINANCIAL_MAX_PAGE_SIZE,
  clampPageSize,
} from "./financial-center-shared.js";
import {
  buildPaginationResult,
  decodeCursor,
  encodeCursor,
  parseLimit,
} from "../pagination.js";

export const FINANCIAL_LIST_RPC = {
  subscriptions: "list_financial_subscriptions",
  subscriptionsCount: "count_financial_subscriptions",
  paymentReviews: "list_financial_payment_reviews",
  paymentReviewsCount: "count_financial_payment_reviews",
  pendingPaymentReviewsCount: "count_pending_payment_reviews_db",
};

const MIN_SEARCH_LENGTH = 2;

function normalizeSearch(search) {
  const trimmed = String(search || "").trim();
  if (!trimmed || trimmed.length < MIN_SEARCH_LENGTH) return null;
  return trimmed;
}

function parseDateBound(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = endOfDay ? new Date(`${raw}T23:59:59.999Z`) : new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseFinancialListParams({
  search = "",
  cursor = null,
  page = null,
  pageSize = null,
  limit = null,
  includeTotal = false,
  filters = {},
  sort = "created_at",
  order = "desc",
  reviewStatus = "all",
} = {}) {
  const resolvedLimit = parseLimit(limit ?? pageSize, {
    defaultLimit: FINANCIAL_DEFAULT_PAGE_SIZE,
    maxLimit: FINANCIAL_MAX_PAGE_SIZE,
  });

  let decodedCursor = null;
  if (cursor) {
    decodedCursor = decodeCursor(cursor);
  }

  return {
    search: normalizeSearch(search),
    cursor: decodedCursor,
    page: page ? Math.max(Number(page) || 1, 1) : null,
    limit: resolvedLimit,
    includeTotal: Boolean(includeTotal),
    filters: {
      status: String(filters.status || "all"),
      service: String(filters.service || "all"),
      source: String(filters.source || "all"),
      paid: String(filters.paid || "all"),
      startedFrom: parseDateBound(filters.startedFrom),
      startedTo: parseDateBound(filters.startedTo, true),
      expiresFrom: parseDateBound(filters.expiresFrom),
      expiresTo: parseDateBound(filters.expiresTo, true),
    },
    sort: sort === "started_at" ? "started_at" : "created_at",
    order: order === "asc" ? "asc" : "desc",
    reviewStatus: String(reviewStatus || "all"),
    legacyReadEnabled: isPaymentProofLegacyReadEnabled(),
  };
}

function buildSubscriptionRpcParams(params) {
  return {
    p_search: params.search,
    p_status: params.filters.status,
    p_service: params.filters.service,
    p_source: params.filters.source,
    p_paid: params.filters.paid,
    p_started_from: params.filters.startedFrom,
    p_started_to: params.filters.startedTo,
    p_expires_from: params.filters.expiresFrom,
    p_expires_to: params.filters.expiresTo,
    p_sort: params.sort,
    p_order: params.order,
    p_cursor_created_at: params.cursor?.createdAt || null,
    p_cursor_id: params.cursor?.id ? Number(params.cursor.id) : null,
    p_limit: params.limit,
    p_legacy_read_enabled: params.legacyReadEnabled,
  };
}

function buildPaymentReviewRpcParams(params) {
  return {
    p_search: params.search,
    p_review_status: params.reviewStatus,
    p_cursor_created_at: params.cursor?.createdAt || null,
    p_cursor_id: params.cursor?.id ? Number(params.cursor.id) : null,
    p_limit: params.limit,
    p_legacy_read_enabled: params.legacyReadEnabled,
  };
}

export async function fetchFinancialSubscriptionsPage(supabase, params) {
  const rpcParams = buildSubscriptionRpcParams(params);
  const { data, error } = await supabase.rpc(FINANCIAL_LIST_RPC.subscriptions, rpcParams);
  if (error) throw error;

  const rows = data || [];
  const { items, pagination } = buildPaginationResult(rows, params.limit);

  let total;
  if (params.includeTotal) {
    const { data: count, error: countError } = await supabase.rpc(
      FINANCIAL_LIST_RPC.subscriptionsCount,
      {
        p_search: rpcParams.p_search,
        p_status: rpcParams.p_status,
        p_service: rpcParams.p_service,
        p_source: rpcParams.p_source,
        p_paid: rpcParams.p_paid,
        p_started_from: rpcParams.p_started_from,
        p_started_to: rpcParams.p_started_to,
        p_expires_from: rpcParams.p_expires_from,
        p_expires_to: rpcParams.p_expires_to,
        p_legacy_read_enabled: rpcParams.p_legacy_read_enabled,
      }
    );
    if (countError) throw countError;
    total = Number(count || 0);
    pagination.total = total;
    pagination.totalPages = Math.max(Math.ceil(total / params.limit), 1);
  }

  if (params.page) {
    pagination.page = params.page;
    pagination.pageSize = params.limit;
  }

  return { items, pagination, rowsFetched: rows.length };
}

export async function fetchFinancialPaymentReviewsPage(supabase, params) {
  const rpcParams = buildPaymentReviewRpcParams(params);
  const { data, error } = await supabase.rpc(FINANCIAL_LIST_RPC.paymentReviews, rpcParams);
  if (error) throw error;

  const rows = data || [];
  const { items, pagination } = buildPaginationResult(rows, params.limit);

  let total;
  if (params.includeTotal) {
    const { data: count, error: countError } = await supabase.rpc(
      FINANCIAL_LIST_RPC.paymentReviewsCount,
      {
        p_search: rpcParams.p_search,
        p_review_status: rpcParams.p_review_status,
        p_legacy_read_enabled: rpcParams.p_legacy_read_enabled,
      }
    );
    if (countError) throw countError;
    total = Number(count || 0);
    pagination.total = total;
    pagination.totalPages = Math.max(Math.ceil(total / params.limit), 1);
  }

  const { data: pendingTotal, error: pendingError } = await supabase.rpc(
    FINANCIAL_LIST_RPC.pendingPaymentReviewsCount,
    { p_legacy_read_enabled: rpcParams.p_legacy_read_enabled }
  );
  if (pendingError) throw pendingError;

  if (params.page) {
    pagination.page = params.page;
    pagination.pageSize = params.limit;
  }

  return {
    items,
    pagination,
    pendingTotal: Number(pendingTotal || 0),
    rowsFetched: rows.length,
  };
}

export async function countPendingPaymentReviewsDb(supabase) {
  const { data, error } = await supabase.rpc(FINANCIAL_LIST_RPC.pendingPaymentReviewsCount, {
    p_legacy_read_enabled: isPaymentProofLegacyReadEnabled(),
  });
  if (error) throw error;
  return Number(data || 0);
}

export function buildLegacyPagePagination({ page, limit, hasMore, nextCursor }) {
  return {
    page,
    pageSize: limit,
    hasMore,
    nextCursor,
  };
}

export { clampPageSize, encodeCursor, decodeCursor, MIN_SEARCH_LENGTH };
