import { PAYMENT_REVIEW_STATUSES, RAW_ACTIVE_STATUSES, RAW_REJECTED_STATUSES } from "./financial-types.js";
import {
  FINANCIAL_DEFAULT_PAGE_SIZE,
  FINANCIAL_MAX_EXPORT_ROWS,
  clampPageSize,
  inferFinancialActivationSource,
  parseSubscriptionPrice,
  resolveFinancialService,
} from "./financial-center-shared.js";
import {
  countPendingPaymentReviewsDb,
  fetchFinancialPaymentReviewsPage,
  parseFinancialListParams,
} from "./build-financial-list-query.js";
import {
  createPaymentProofSignedReadUrl,
  isPaymentProofLegacyReadEnabled,
} from "../payment-proof-storage.js";
import { PENDING_ADMIN_DB_STATUSES } from "../admin-status-constants.js";

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
  const proofAvailable = Boolean(row?.proof_available);
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
    cursor = null,
    search = "",
    status = "all",
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
    reviewStatus: status,
  });

  const { items: rows, pagination, pendingTotal } = await fetchFinancialPaymentReviewsPage(
    supabase,
    params
  );

  return {
    items: rows.map((row) => normalizePaymentReviewRow(row)),
    pagination,
    pendingTotal,
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

  const inline = proof.startsWith("data:image");
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

export async function countPendingPaymentReviews(supabase) {
  return countPendingPaymentReviewsDb(supabase);
}

export { normalizePaymentReviewRow, resolvePaymentReviewStatus };
