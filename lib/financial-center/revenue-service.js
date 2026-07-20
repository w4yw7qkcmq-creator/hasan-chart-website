import { SUBSCRIPTION_STATUSES } from "./financial-types.js";
import {
  FINANCIAL_REVENUE_SCAN_MAX_ROWS,
  FINANCIAL_SUBSCRIPTION_COLUMNS,
  addToCurrencyTotals,
  buildCurrencyTotals,
  isRecognizedRevenueCandidate,
  normalizeSubscriptionStatus,
  parseSubscriptionPrice,
  resolveFinancialService,
} from "./financial-center-shared.js";
import { getSubscriptionFinancialSummary } from "./subscription-service.js";

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function periodStart(period) {
  const now = new Date();
  if (period === "7d") {
    return startOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  }
  if (period === "90d") {
    return startOfDay(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
  }
  if (period === "year") {
    return new Date(now.getFullYear(), 0, 1);
  }
  return startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
}

function aggregateRecognizedRows(rows) {
  const totals = {
    recognizedRevenueToday: buildCurrencyTotals(),
    recognizedRevenueWeek: buildCurrencyTotals(),
    recognizedRevenueMonth: buildCurrencyTotals(),
    recognizedRevenueYear: buildCurrencyTotals(),
    recognizedRevenueTotal: buildCurrencyTotals(),
    activeSubscriptions: 0,
    pendingReviews: 0,
    expiredSubscriptions: 0,
    complimentarySubscriptions: 0,
    unparseablePriceCount: 0,
    revenueByService: {},
    subscriptionsByStatus: {},
    subscriptionsBySource: {},
    paidSubscriptionsCount: 0,
    dailyRows: new Map(),
    scanComplete: true,
    scannedRows: 0,
  };

  const now = Date.now();
  const dayStart = startOfDay(new Date()).getTime();
  const weekStart = startOfDay(new Date(now - 7 * 24 * 60 * 60 * 1000)).getTime();
  const monthStart = startOfDay(new Date(now - 30 * 24 * 60 * 60 * 1000)).getTime();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  for (const row of rows) {
    totals.scannedRows += 1;
    const parsedPrice = parseSubscriptionPrice(row?.price);
    const normalizedStatus = normalizeSubscriptionStatus(row?.status, {
      adminDisabled: row?.admin_disabled,
      expiresAt: row?.expires_at,
    });

    totals.subscriptionsByStatus[normalizedStatus] = (totals.subscriptionsByStatus[normalizedStatus] || 0) + 1;

    if (normalizedStatus === SUBSCRIPTION_STATUSES.PENDING) totals.pendingReviews += 1;
    if (normalizedStatus === SUBSCRIPTION_STATUSES.EXPIRED) totals.expiredSubscriptions += 1;
    if (parsedPrice.complimentary) totals.complimentarySubscriptions += 1;
    if (!parsedPrice.valid) totals.unparseablePriceCount += 1;

    if (isRecognizedRevenueCandidate(row, parsedPrice, normalizedStatus)) {
      totals.activeSubscriptions += 1;
      totals.paidSubscriptionsCount += 1;

      const service = resolveFinancialService(row);
      if (!totals.revenueByService[service]) {
        totals.revenueByService[service] = buildCurrencyTotals();
      }
      addToCurrencyTotals(totals.revenueByService[service], parsedPrice.currency, parsedPrice.amount);
      addToCurrencyTotals(totals.recognizedRevenueTotal, parsedPrice.currency, parsedPrice.amount);

      const startedAtMs = new Date(row.started_at).getTime();
      if (startedAtMs >= dayStart) addToCurrencyTotals(totals.recognizedRevenueToday, parsedPrice.currency, parsedPrice.amount);
      if (startedAtMs >= weekStart) addToCurrencyTotals(totals.recognizedRevenueWeek, parsedPrice.currency, parsedPrice.amount);
      if (startedAtMs >= monthStart) addToCurrencyTotals(totals.recognizedRevenueMonth, parsedPrice.currency, parsedPrice.amount);
      if (startedAtMs >= yearStart) addToCurrencyTotals(totals.recognizedRevenueYear, parsedPrice.currency, parsedPrice.amount);

      const dayKey = startOfDay(new Date(row.started_at)).toISOString().slice(0, 10);
      if (!totals.dailyRows.has(dayKey)) {
        totals.dailyRows.set(dayKey, {
          date: dayKey,
          activatedCount: 0,
          revenue: buildCurrencyTotals(),
        });
      }
      const daily = totals.dailyRows.get(dayKey);
      daily.activatedCount += 1;
      addToCurrencyTotals(daily.revenue, parsedPrice.currency, parsedPrice.amount);
    }
  }

  return totals;
}

export async function loadRecognizedRevenueRows(supabase, { period = "30d", maxRows = FINANCIAL_REVENUE_SCAN_MAX_ROWS } = {}) {
  const startedAtCutoff = periodStart(period).toISOString();

  const { data, error } = await supabase
    .from("subscription_requests")
    .select(FINANCIAL_SUBSCRIPTION_COLUMNS)
    .in("status", ["مفعل", "نشط", "active"])
    .eq("admin_disabled", false)
    .not("started_at", "is", null)
    .gte("started_at", startedAtCutoff)
    .order("started_at", { ascending: false })
    .limit(maxRows);

  if (error) throw error;

  return {
    rows: data || [],
    scanComplete: (data || []).length < maxRows,
    scannedRows: (data || []).length,
  };
}

export async function getFinancialOverview(supabase) {
  const summary = await getSubscriptionFinancialSummary(supabase);
  const revenueScan = await loadRecognizedRevenueRows(supabase, { period: "year" });
  const aggregated = aggregateRecognizedRows(revenueScan.rows);

  return {
    ...aggregated,
    pendingReviews: summary.pendingReviews,
    expiredSubscriptions: summary.expiredCount,
    revenueScanComplete: revenueScan.scanComplete,
    revenueScannedRows: revenueScan.scannedRows,
    disclaimer:
      "هذه الأرقام مبنية على الاشتراكات المفعلة يدويًا وليست سجل معاملات دفع مصرفي.",
  };
}

export async function getFinancialRevenueReport(supabase, { period = "30d" } = {}) {
  const revenueScan = await loadRecognizedRevenueRows(supabase, { period });
  const aggregated = aggregateRecognizedRows(revenueScan.rows);

  const daily = [...aggregated.dailyRows.values()]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 90);

  return {
    period,
    recognizedRevenueToday: aggregated.recognizedRevenueToday,
    recognizedRevenueWeek: aggregated.recognizedRevenueWeek,
    recognizedRevenueMonth: aggregated.recognizedRevenueMonth,
    recognizedRevenueYear: aggregated.recognizedRevenueYear,
    recognizedRevenueTotal: aggregated.recognizedRevenueTotal,
    revenueByService: aggregated.revenueByService,
    paidSubscriptionsCount: aggregated.paidSubscriptionsCount,
    complimentarySubscriptions: aggregated.complimentarySubscriptions,
    unparseablePriceCount: aggregated.unparseablePriceCount,
    daily,
    revenueScanComplete: revenueScan.scanComplete,
    revenueScannedRows: revenueScan.scannedRows,
    disclaimer:
      "هذه الأرقام مبنية على الاشتراكات المفعلة يدويًا وليست سجل معاملات دفع مصرفي.",
  };
}

export { aggregateRecognizedRows, periodStart };
