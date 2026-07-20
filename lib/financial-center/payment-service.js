import { PAYMENT_REVIEW_STATUSES, RAW_ACTIVE_STATUSES, RAW_PENDING_STATUSES, RAW_REJECTED_STATUSES } from "./financial-types.js";
import {
  FINANCIAL_DEFAULT_PAGE_SIZE,
  FINANCIAL_MAX_EXPORT_ROWS,
  FINANCIAL_SUBSCRIPTION_PROOF_COLUMNS,
  clampPageSize,
  escapeIlike,
  hasPaymentProof,
  inferFinancialActivationSource,
  isInlinePaymentProof,
  parseSubscriptionPrice,
  resolveFinancialService,
} from "./financial-center-shared.js";

function resolvePaymentReviewStatus(row) {
  const rawStatus = String(row?.status || "").trim();
  const lower = rawStatus.toLowerCase();

  if (RAW_REJECTED_STATUSES.has(rawStatus) || RAW_REJECTED_STATUSES.has(lower)) {
    return PAYMENT_REVIEW_STATUSES.REJECTED;
  }

  if (RAW_PENDING_STATUSES.has(rawStatus) || RAW_PENDING_STATUSES.has(lower)) {
    return PAYMENT_REVIEW_STATUSES.PENDING_REVIEW;
  }

  if (RAW_ACTIVE_STATUSES.has(rawStatus) && row?.started_at) {
    return PAYMENT_REVIEW_STATUSES.CONFIRMED;
  }

  if (["ملغى", "cancelled", "canceled"].includes(rawStatus) || lower === "cancelled") {
    return PAYMENT_REVIEW_STATUSES.CANCELLED;
  }

  return PAYMENT_REVIEW_STATUSES.UNKNOWN;
}

function normalizePaymentReviewRow(row) {
  const parsedPrice = parseSubscriptionPrice(row?.price);
  const proof = String(row?.payment_proof || "").trim();
  const proofAvailable = Boolean(proof);
  const status = resolvePaymentReviewStatus(row);

  return {
    id: `subreq:${row.id}`,
    requestId: row.id,
    userEmail: String(row?.user_email || "").trim().toLowerCase(),
    username: row?.username || "",
    service: resolveFinancialService(row),
    plan: row?.plan_name || "",
    amount: parsedPrice.valid ? parsedPrice.amount : null,
    currency: parsedPrice.currency,
    status,
    proofAvailable,
    proofUrl: proofAvailable && !isInlinePaymentProof(proof) ? proof : "",
    submittedAt: row?.created_at || null,
    reviewedAt: status === PAYMENT_REVIEW_STATUSES.CONFIRMED ? row?.started_at || null : null,
    confirmedAt: status === PAYMENT_REVIEW_STATUSES.CONFIRMED ? row?.started_at || null : null,
    activationSource: inferFinancialActivationSource(row, parsedPrice),
    priceRaw: parsedPrice.raw,
  };
}

export async function listPaymentReviews(
  supabase,
  {
    page = 1,
    pageSize = FINANCIAL_DEFAULT_PAGE_SIZE,
    search = "",
    status = "all",
    exportMode = false,
  } = {}
) {
  const resolvedPageSize = exportMode ? FINANCIAL_MAX_EXPORT_ROWS : clampPageSize(pageSize);
  const pageNumber = Math.max(Number(page) || 1, 1);

  let query = supabase
    .from("subscription_requests")
    .select(FINANCIAL_SUBSCRIPTION_PROOF_COLUMNS, { count: "exact" })
    .not("payment_proof", "is", null)
    .neq("payment_proof", "")
    .order("created_at", { ascending: false });

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    const escaped = escapeIlike(normalizedSearch);
    query = query.or(
      `user_email.ilike.%${escaped}%,username.ilike.%${escaped}%,plan_name.ilike.%${escaped}%`
    );
  }

  const needsClientStatusFilter = status && status !== "all";

  if (!needsClientStatusFilter) {
    const from = (pageNumber - 1) * resolvedPageSize;
    const to = from + resolvedPageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    const items = (data || []).map((row) => normalizePaymentReviewRow(row));
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

  const { data, error } = await query.limit(exportMode ? FINANCIAL_MAX_EXPORT_ROWS : 1000);
  if (error) throw error;

  const filtered = (data || [])
    .map((row) => normalizePaymentReviewRow(row))
    .filter((item) => item.status === status);

  const from = (pageNumber - 1) * resolvedPageSize;
  const slice = filtered.slice(from, from + resolvedPageSize);

  return {
    items: slice,
    pagination: {
      page: pageNumber,
      pageSize: resolvedPageSize,
      total: filtered.length,
      totalPages: Math.max(Math.ceil(filtered.length / resolvedPageSize), 1),
    },
    clientFiltered: true,
  };
}

export async function getPaymentProofForReview(supabase, requestId) {
  const { data, error } = await supabase
    .from("subscription_requests")
    .select("id,payment_proof,user_email,plan_name")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    const notFound = new Error("طلب الاشتراك غير موجود");
    notFound.status = 404;
    throw notFound;
  }

  const proof = String(data.payment_proof || "").trim();
  if (!proof) {
    const empty = new Error("لا يوجد إثبات دفع لهذا الطلب");
    empty.status = 404;
    throw empty;
  }

  return {
    requestId: data.id,
    userEmail: data.user_email || "",
    planName: data.plan_name || "",
    proof,
    isInline: isInlinePaymentProof(proof),
  };
}

export { normalizePaymentReviewRow, resolvePaymentReviewStatus };
