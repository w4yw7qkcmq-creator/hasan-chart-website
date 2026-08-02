import { labelTimeframeLong, normalizeExecutionTimeframe } from "./instant-analysis-labels.js";

export const ALLOWED_EXECUTION_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
];

export function normalizeAnalysisSymbol(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validateAnalysisRequest({ symbol, timeframe }) {
  const normalizedSymbol = normalizeAnalysisSymbol(symbol);
  const normalizedTimeframe = normalizeExecutionTimeframe(timeframe);

  if (!normalizedSymbol) {
    return {
      ok: false,
      code: "SYMBOL_REQUIRED",
      message: "يرجى اختيار العملة أولاً.",
    };
  }

  if (!normalizedTimeframe) {
    return {
      ok: false,
      code: "TIMEFRAME_REQUIRED",
      message: "يرجى اختيار الفريم المطلوب للتحليل.",
    };
  }

  return {
    ok: true,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
}

export function buildAnalysisRequestBody({
  symbol,
  timeframe,
  source = "my-dashboard",
}) {
  const validated = validateAnalysisRequest({ symbol, timeframe });
  if (!validated.ok) {
    throw new Error(validated.message);
  }

  return {
    symbol: validated.symbol,
    executionTimeframe: validated.timeframe,
    source,
    mode: "professional-smc-ict-classic",
    requestChart: true,
    schools: ["SMC", "ICT", "CLASSIC"],
  };
}

export function buildLoadingMessage({ symbol, timeframe }) {
  const validated = validateAnalysisRequest({ symbol, timeframe });
  if (!validated.ok) {
    return "جارٍ التحليل...";
  }

  return `جارٍ تحليل ${validated.symbol} على فريم ${labelTimeframeLong(validated.timeframe)}.`;
}

export function resolveResultExecutionTimeframe(result) {
  const payload = result?.v2 || result;
  return payload?.meta?.executionTimeframe || null;
}

export function shouldStartAnalysisRequest({ loading, availabilityAllowed }) {
  return !loading && availabilityAllowed !== false;
}
