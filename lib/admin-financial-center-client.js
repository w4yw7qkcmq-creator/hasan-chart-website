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
  const response = await adminFetch(`/api/admin/financial-center/payment-proof/${encodeURIComponent(requestId)}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "تعذر تحميل إثبات الدفع");
  }
  return result.proof;
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
