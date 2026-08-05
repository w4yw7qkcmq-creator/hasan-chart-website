import { isPaymentProofLegacyReadEnabled } from "../payment-proof-storage.js";
import { buildCurrencyTotals } from "./financial-center-shared.js";
import { getSubscriptionFinancialSummary } from "./subscription-service.js";

function normalizeCurrencyTotals(raw = {}) {
  return {
    USD: Number(raw.USD || 0),
    USDT: Number(raw.USDT || 0),
  };
}

function mapRevenueSummaryPayload(payload = {}) {
  return {
    recognizedRevenueToday: normalizeCurrencyTotals(payload.recognizedRevenueToday),
    recognizedRevenueWeek: normalizeCurrencyTotals(payload.recognizedRevenueWeek),
    recognizedRevenueMonth: normalizeCurrencyTotals(payload.recognizedRevenueMonth),
    recognizedRevenueYear: normalizeCurrencyTotals(payload.recognizedRevenueYear),
    recognizedRevenueTotal: normalizeCurrencyTotals(payload.recognizedRevenueTotal),
    activeSubscriptions: Number(payload.activeSubscriptions || 0),
    paidSubscriptionsCount: Number(payload.paidSubscriptionsCount || 0),
    complimentarySubscriptions: Number(payload.complimentarySubscriptions || 0),
    unparseablePriceCount: Number(payload.unparseablePriceCount || 0),
    revenueByService: Object.fromEntries(
      Object.entries(payload.revenueByService || {}).map(([service, totals]) => [
        service,
        normalizeCurrencyTotals(totals),
      ])
    ),
    daily: Array.isArray(payload.daily)
      ? payload.daily.map((row) => ({
          date: row.date,
          activatedCount: Number(row.activatedCount || 0),
          revenue: normalizeCurrencyTotals(row.revenue),
        }))
      : [],
    scanComplete: true,
    scannedRows: 0,
  };
}

async function loadRecognizedRevenueSummary(supabase, { period = "30d" } = {}) {
  const { data, error } = await supabase.rpc("get_financial_revenue_summary", {
    p_period: period,
    p_legacy_read_enabled: isPaymentProofLegacyReadEnabled(),
  });
  if (error) throw error;
  return mapRevenueSummaryPayload(data || {});
}

export async function getFinancialOverview(supabase) {
  const [summary, revenue] = await Promise.all([
    getSubscriptionFinancialSummary(supabase),
    loadRecognizedRevenueSummary(supabase, { period: "year" }),
  ]);

  return {
    ...revenue,
    pendingReviews: summary.pendingReviews,
    expiredSubscriptions: summary.expiredCount,
    revenueScanComplete: true,
    revenueScannedRows: 0,
    disclaimer:
      "هذه الأرقام مبنية على الاشتراكات المفعلة يدويًا وليست سجل معاملات دفع مصرفي.",
  };
}

export async function getFinancialRevenueReport(supabase, { period = "30d" } = {}) {
  const revenue = await loadRecognizedRevenueSummary(supabase, { period });

  return {
    period,
    recognizedRevenueToday: revenue.recognizedRevenueToday,
    recognizedRevenueWeek: revenue.recognizedRevenueWeek,
    recognizedRevenueMonth: revenue.recognizedRevenueMonth,
    recognizedRevenueYear: revenue.recognizedRevenueYear,
    recognizedRevenueTotal: revenue.recognizedRevenueTotal,
    revenueByService: revenue.revenueByService,
    paidSubscriptionsCount: revenue.paidSubscriptionsCount,
    complimentarySubscriptions: revenue.complimentarySubscriptions,
    unparseablePriceCount: revenue.unparseablePriceCount,
    daily: revenue.daily,
    revenueScanComplete: true,
    revenueScannedRows: 0,
    disclaimer:
      "هذه الأرقام مبنية على الاشتراكات المفعلة يدويًا وليست سجل معاملات دفع مصرفي.",
  };
}

export { loadRecognizedRevenueSummary, mapRevenueSummaryPayload };
