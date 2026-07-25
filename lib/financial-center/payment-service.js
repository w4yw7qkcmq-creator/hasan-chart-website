import { PENDING_ADMIN_DB_STATUSES } from "../admin-status-constants.js";
import { PAYMENT_REVIEW_STATUSES, RAW_ACTIVE_STATUSES, RAW_REJECTED_STATUSES } from "./financial-types.js";
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
import {
  buildPendingPaymentReviewProofOrFilter,
  countPendingPaymentReviews,
  isPendingPaymentReviewRow,
} from "./pending-payment-review.js";
import {
  createPaymentProofSignedReadUrl,
  hasAnyPaymentProof,
  hasStoredPaymentProof,
  isPaymentProofLegacyReadEnabled,
} from "../payment-proof-storage.js";

const PENDING_REVIEW_STATUS_SET = new Set(PENDING_ADMIN_DB_STATUSES);

function resolvePaymentReviewStatus(row) {
  const rawStatus = String(row?.status || "").trim();
  const lower = rawStatus.toLowerCase();

  if (RAW_REJECTED_STATUSES.has(rawStatus) || RAW_REJECTED_STATUSES.has(lower)) {
    return PAYMENT_REVIEW_STATUSES.REJECTED;
  }

  if (PENDING_REVIEW_STATUS_SET.has(rawStatus) || PENDING_REVIEW_STATUS_SET.has(lower)) {
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
  const proofAvailable = hasAnyPaymentProof(row);
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
    rawStatus: String(row?.status || "").trim(),
    proofAvailable,
    proofUrl: hasStoredPaymentProof(row)
      ? ""
      : proofAvailable && !isInlinePaymentProof(String(row?.payment_proof || ""))
        ? String(row.payment_proof || "").trim()
        : "",
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
    .or(buildPendingPaymentReviewProofOrFilter())
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
    const pendingTotal = await countPendingPaymentReviews(supabase);

    return {
      items,
      pagination: {
        page: pageNumber,
        pageSize: resolvedPageSize,
        total: count || 0,
        totalPages: Math.max(Math.ceil((count || 0) / resolvedPageSize), 1),
      },
      pendingTotal,
    };
  }

  const { data, error } = await query.limit(exportMode ? FINANCIAL_MAX_EXPORT_ROWS : 1000);
  if (error) throw error;

  const filtered = (data || [])
    .filter((row) => {
      if (status === PAYMENT_REVIEW_STATUSES.PENDING_REVIEW) {
        return isPendingPaymentReviewRow(row);
      }
      return true;
    })
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
    pendingTotal:
      status === PAYMENT_REVIEW_STATUSES.PENDING_REVIEW
        ? filtered.length
        : await countPendingPaymentReviews(supabase),
  };
}

const PAYMENT_PROOF_METADATA_SELECT =
  "id,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes,payment_proof_uploaded_at";

export async function getPaymentProofForReview(supabase, requestId) {
  const { data, error } = await supabase
    .from("subscription_requests")
    .select(PAYMENT_PROOF_METADATA_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    const notFound = new Error("طلب الاشتراك غير موجود");
    notFound.status = 404;
    throw notFound;
  }

  const storagePath = String(data.payment_proof_path || "").trim();
  if (storagePath) {
    return {
      requestId: data.id,
      source: "storage",
      storagePath,
      mimeType: data.payment_proof_mime_type || null,
      sizeBytes: Number(data.payment_proof_size_bytes || 0) || null,
      uploadedAt: data.payment_proof_uploaded_at || null,
      proofBytes: Number(data.payment_proof_size_bytes || 0) || 0,
    };
  }

  if (!isPaymentProofLegacyReadEnabled()) {
    const empty = new Error("لا يوجد إثبات دفع لهذا الطلب");
    empty.status = 404;
    throw empty;
  }

  const { data: legacyRow, error: legacyError } = await supabase
    .from("subscription_requests")
    .select("id,payment_proof")
    .eq("id", requestId)
    .maybeSingle();

  if (legacyError) throw legacyError;

  const proof = String(legacyRow?.payment_proof || "").trim();
  if (!proof) {
    const empty = new Error("لا يوجد إثبات دفع لهذا الطلب");
    empty.status = 404;
    throw empty;
  }

  const inline = isInlinePaymentProof(proof);
  let proofBytes = proof.length;
  if (inline) {
    const commaIndex = proof.indexOf(",");
    const encodedLength = commaIndex >= 0 ? proof.length - commaIndex - 1 : 0;
    proofBytes = Math.floor((encodedLength * 3) / 4);
  }

  return {
    requestId: legacyRow.id,
    source: "legacy",
    proof,
    isInline: inline,
    proofBytes,
  };
}

export async function createAdminPaymentProofSignedReadUrl(storagePath) {
  const { getSupabaseAdmin } = await import("../auth-session.js");
  const admin = getSupabaseAdmin();
  return createPaymentProofSignedReadUrl(admin, storagePath);
}

export { normalizePaymentReviewRow, resolvePaymentReviewStatus };
