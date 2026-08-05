import {
  ACTIVATION_SOURCES,
  FINANCIAL_SERVICES,
  PAYMENT_REVIEW_STATUSES,
  RAW_ACTIVE_STATUSES,
  RAW_ARCHIVED_STATUSES,
  RAW_CANCELLED_STATUSES,
  RAW_EXPIRED_STATUSES,
  RAW_PENDING_STATUSES,
  RAW_REJECTED_STATUSES,
  RAW_SUSPENDED_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "./financial-types.js";

export const FINANCIAL_SUBSCRIPTION_COLUMNS =
  "id,user_email,username,telegram_username,plan_name,category,price,status,started_at,expires_at,created_at,admin_disabled,activation_source";

/** List projection — no inline payment_proof blob. */
export const FINANCIAL_SUBSCRIPTION_PROOF_LIST_COLUMNS =
  "id,user_email,username,plan_name,category,price,status,started_at,created_at,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes,activation_source";

export const FINANCIAL_SUBSCRIPTION_PROOF_COLUMNS =
  "id,user_email,username,plan_name,category,price,status,started_at,created_at,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes,payment_proof,activation_source";

export const FINANCIAL_DEFAULT_PAGE_SIZE = 25;
export const FINANCIAL_MAX_PAGE_SIZE = 100;
export const FINANCIAL_MAX_EXPORT_ROWS = 500;
export const FINANCIAL_OVERVIEW_CACHE_MS = 25_000;

const COMPLIMENTARY_PATTERNS = /^(مجاني|free|complimentary|0|٠)$/i;

export function formatPaymentReviewStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === PAYMENT_REVIEW_STATUSES.PENDING_REVIEW) return "بانتظار المراجعة";
  if (normalized === PAYMENT_REVIEW_STATUSES.CONFIRMED) return "مفعل";
  if (normalized === PAYMENT_REVIEW_STATUSES.REJECTED) return "مرفوض";
  if (normalized === PAYMENT_REVIEW_STATUSES.CANCELLED) return "ملغى";
  if (normalized === PAYMENT_REVIEW_STATUSES.UNKNOWN) return "حالة غير معروفة";

  return String(status || "—");
}

export function isPaymentReviewActionable(status) {
  return String(status || "").trim().toLowerCase() === PAYMENT_REVIEW_STATUSES.PENDING_REVIEW;
}

export function clampPageSize(value) {
  const parsed = Number(value) || FINANCIAL_DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(parsed, 1), FINANCIAL_MAX_PAGE_SIZE);
}

export function escapeIlike(value) {
  return String(value || "").replace(/[%_,]/g, "");
}

export function parseSubscriptionPrice(rawPrice) {
  const raw = String(rawPrice ?? "").trim();

  if (!raw) {
    return { amount: null, currency: null, valid: false, complimentary: false, raw };
  }

  if (COMPLIMENTARY_PATTERNS.test(raw)) {
    return { amount: 0, currency: "USD", valid: true, complimentary: true, raw };
  }

  const usdtMatch =
    raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*usdt\b/i) ||
    raw.match(/\busdt\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (usdtMatch) {
    const amount = Number(String(usdtMatch[1]).replace(",", "."));
    if (Number.isFinite(amount) && amount >= 0) {
      return {
        amount,
        currency: "USDT",
        valid: true,
        complimentary: amount === 0,
        raw,
      };
    }
  }

  const usdMatch =
    raw.match(/\$\s*([0-9]+(?:[.,][0-9]+)?)/) ||
    raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*usd\b/i);
  if (usdMatch) {
    const amount = Number(String(usdMatch[1]).replace(",", "."));
    if (Number.isFinite(amount) && amount >= 0) {
      return {
        amount,
        currency: "USD",
        valid: true,
        complimentary: amount === 0,
        raw,
      };
    }
  }

  const plainNumber = raw.match(/^([0-9]+(?:[.,][0-9]+)?)$/);
  if (plainNumber) {
    const amount = Number(String(plainNumber[1]).replace(",", "."));
    if (Number.isFinite(amount) && amount >= 0) {
      return {
        amount,
        currency: "USD",
        valid: true,
        complimentary: amount === 0,
        raw,
      };
    }
  }

  return { amount: null, currency: null, valid: false, complimentary: false, raw };
}

export function normalizeSubscriptionStatus(rawStatus, { adminDisabled = false, expiresAt = null } = {}) {
  const status = String(rawStatus || "").trim();
  const lower = status.toLowerCase();

  if (adminDisabled || RAW_SUSPENDED_STATUSES.has(status) || lower === "suspended") {
    return SUBSCRIPTION_STATUSES.SUSPENDED;
  }

  const isRawActive = RAW_ACTIVE_STATUSES.has(status) || lower === "active";
  const expiredByDate =
    expiresAt && Number.isFinite(new Date(expiresAt).getTime()) && new Date(expiresAt).getTime() <= Date.now();

  if (RAW_EXPIRED_STATUSES.has(status) || lower === "expired" || (isRawActive && expiredByDate)) {
    return SUBSCRIPTION_STATUSES.EXPIRED;
  }

  if (isRawActive && !expiredByDate) {
    return SUBSCRIPTION_STATUSES.ACTIVE;
  }

  if (RAW_PENDING_STATUSES.has(status) || RAW_PENDING_STATUSES.has(lower)) {
    return SUBSCRIPTION_STATUSES.PENDING;
  }

  if (RAW_REJECTED_STATUSES.has(status) || RAW_REJECTED_STATUSES.has(lower)) {
    return SUBSCRIPTION_STATUSES.REJECTED;
  }

  if (RAW_CANCELLED_STATUSES.has(status) || RAW_CANCELLED_STATUSES.has(lower)) {
    return SUBSCRIPTION_STATUSES.CANCELLED;
  }

  if (RAW_ARCHIVED_STATUSES.has(status) || lower === "archived") {
    return SUBSCRIPTION_STATUSES.ARCHIVED;
  }

  if (status) return SUBSCRIPTION_STATUSES.UNKNOWN;
  return SUBSCRIPTION_STATUSES.UNKNOWN;
}

export function resolveFinancialService(row) {
  const text = `${row?.category || ""} ${row?.plan_name || ""}`.toLowerCase();

  if (/account|إدارة|management/.test(text)) {
    return FINANCIAL_SERVICES.ACCOUNT_MANAGEMENT;
  }

  if (/academy|أكاديم/.test(text)) {
    return FINANCIAL_SERVICES.ACADEMY;
  }

  if (/spot|سبوت/.test(text)) {
    return FINANCIAL_SERVICES.VIP_SPOT;
  }

  if (/future|futures|فيوتشر/.test(text)) {
    return FINANCIAL_SERVICES.VIP_FUTURES;
  }

  if (/vip|signal|توص/.test(text)) {
    return FINANCIAL_SERVICES.VIP_SIGNALS;
  }

  return FINANCIAL_SERVICES.UNKNOWN;
}

export function inferFinancialActivationSource(row, parsedPrice) {
  const explicit = String(row?.activation_source || "").trim().toLowerCase();

  if (parsedPrice?.complimentary || explicit === "complimentary") {
    return ACTIVATION_SOURCES.COMPLIMENTARY;
  }

  if (explicit === "payment") return ACTIVATION_SOURCES.PAYMENT;
  if (explicit === "admin") return ACTIVATION_SOURCES.ADMIN;
  if (explicit === "referral") return ACTIVATION_SOURCES.REFERRAL;

  if (parsedPrice?.valid && parsedPrice.amount > 0 && row?.payment_proof) {
    return ACTIVATION_SOURCES.PAYMENT;
  }

  if (RAW_ACTIVE_STATUSES.has(String(row?.status || "").trim()) && row?.started_at) {
    return ACTIVATION_SOURCES.ADMIN;
  }

  return ACTIVATION_SOURCES.UNKNOWN;
}

export function isRecognizedRevenueCandidate(row, parsedPrice, normalizedStatus) {
  if (normalizedStatus !== SUBSCRIPTION_STATUSES.ACTIVE) return false;
  if (!row?.started_at) return false;
  if (row?.admin_disabled) return false;
  if (!parsedPrice?.valid || !(parsedPrice.amount > 0)) return false;
  if (parsedPrice.complimentary) return false;

  const source = inferFinancialActivationSource(row, parsedPrice);
  if (source === ACTIVATION_SOURCES.COMPLIMENTARY) return false;

  const service = resolveFinancialService(row);
  if (service === FINANCIAL_SERVICES.ACCOUNT_MANAGEMENT) return false;

  return true;
}

export function hasPaymentProof(row) {
  if (String(row?.payment_proof_path || "").trim()) return true;
  return Boolean(String(row?.payment_proof || "").trim());
}

export function isInlinePaymentProof(proof) {
  return String(proof || "").startsWith("data:image");
}

export function sanitizeFinancialError(error) {
  const message = String(error?.message || "").trim();
  if (!message) return "تعذر تحميل بيانات المركز المالي";
  if (/permission denied|jwt|auth|invalid api key/i.test(message)) {
    return "تعذر التحقق من صلاحية الوصول";
  }
  if (/does not exist|relation .* does not exist/i.test(message)) {
    return "مصدر البيانات غير متاح حالياً";
  }
  return "تعذر تحميل بيانات المركز المالي";
}

export function buildCurrencyTotals() {
  return {
    USD: 0,
    USDT: 0,
  };
}

export function addToCurrencyTotals(totals, currency, amount) {
  const key = currency === "USDT" ? "USDT" : currency === "USD" ? "USD" : null;
  if (!key || !Number.isFinite(amount)) return totals;
  totals[key] = Number((totals[key] + amount).toFixed(2));
  return totals;
}

export function exportRowsToCsv(headers, rows) {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
  return `\uFEFF${headers.join(",")}\n${body}`;
}
