export const PAYMENT_PROOF_FETCH_TIMEOUT_MS = 15000;

function combineAbortSignals(primarySignal, secondarySignal) {
  if (!primarySignal) return secondarySignal;
  if (!secondarySignal) return primarySignal;

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any([primarySignal, secondarySignal]);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (primarySignal.aborted || secondarySignal.aborted) {
    controller.abort();
    return controller.signal;
  }

  primarySignal.addEventListener("abort", abort, { once: true });
  secondarySignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function createPaymentProofTimeoutSignal(timeoutMs, externalSignal) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = combineAbortSignals(externalSignal, timeoutController.signal);

  const cleanup = () => clearTimeout(timeoutId);
  signal.addEventListener("abort", cleanup, { once: true });

  return {
    signal,
    cleanup,
    didTimeout() {
      return timeoutController.signal.aborted && !externalSignal?.aborted;
    },
  };
}

function normalizePaymentProofResult({ requestId, imageUrl, proofType, userEmail = "", planName = "" }) {
  const revoke = () => {
    if (proofType === "binary" && imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }
  };

  return {
    requestId,
    imageUrl,
    proof: imageUrl,
    proofType,
    isInline: proofType === "binary",
    userEmail,
    planName,
    revoke,
  };
}

export async function fetchFinancialCenterSection(adminFetch, section, { signal, query = {} } = {}) {
  const params = new URLSearchParams({ section, ...query });
  const response = await adminFetch(`/api/admin/financial-center?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/csv")) {
    const blob = await response.blob();
    if (!response.ok) {
      throw new Error("تعذر تصدير CSV");
    }
    return { csvBlob: blob };
  }

  const result = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    throw new Error(result?.error || "تعذر التحقق من صلاحية المركز المالي");
  }
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "فشل تحميل المركز المالي");
  }
  return result;
}

export async function fetchPaymentProof(adminFetch, requestId, { signal } = {}) {
  const normalizedRequestId = String(requestId || "").trim();
  const { signal: requestSignal, cleanup, didTimeout } = createPaymentProofTimeoutSignal(
    PAYMENT_PROOF_FETCH_TIMEOUT_MS,
    signal
  );

  try {
    const response = await adminFetch(
      `/api/admin/financial-center/payment-proof/${encodeURIComponent(normalizedRequestId)}`,
      {
        method: "GET",
        cache: "no-store",
        signal: requestSignal,
      }
    );

    const contentType = response.headers?.get?.("content-type") || "";

    if (contentType.startsWith("image/")) {
      if (!response.ok) {
        throw new Error("تعذر تحميل إثبات الدفع");
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      return normalizePaymentProofResult({
        requestId: response.headers?.get?.("X-Payment-Proof-Request-Id") || normalizedRequestId,
        imageUrl,
        proofType: "binary",
      });
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "تعذر تحميل إثبات الدفع");
    }

    if (result.proofType === "url" && result.url) {
      return normalizePaymentProofResult({
        requestId: result.requestId || normalizedRequestId,
        imageUrl: String(result.url).trim(),
        proofType: "url",
        userEmail: result.userEmail || "",
        planName: result.planName || "",
      });
    }

    const legacyProof = String(result?.proof?.proof || result?.proof || "").trim();
    if (legacyProof) {
      return normalizePaymentProofResult({
        requestId: result?.proof?.requestId || normalizedRequestId,
        imageUrl: legacyProof,
        proofType: legacyProof.startsWith("data:image") ? "binary" : "url",
        userEmail: result?.proof?.userEmail || "",
        planName: result?.proof?.planName || "",
      });
    }

    throw new Error("إثبات الدفع غير متوفر لهذا الطلب");
  } catch (error) {
    if (error?.name === "AbortError") {
      if (didTimeout()) {
        throw new Error("تعذر تحميل إثبات الدفع خلال الوقت المحدد");
      }
      throw error;
    }

    throw error;
  } finally {
    cleanup();
  }
}

export function downloadCsvBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatCurrencyTotals(totals) {
  if (!totals) return "—";
  const parts = [];
  if (totals.USD > 0) parts.push(`${totals.USD.toLocaleString("ar")} USD`);
  if (totals.USDT > 0) parts.push(`${totals.USDT.toLocaleString("ar")} USDT`);
  return parts.length ? parts.join(" · ") : "0";
}
