const INSTANT_ANALYSIS_V2_VERSION = "2.0";
const INSTANT_ANALYSIS_UI_VERSION = "3.0";

const EXECUTION_TIMEFRAME_OPTIONS = [
  { key: "1m", bar: "1m", limit: 120, role: "execution" },
  { key: "3m", bar: "3m", limit: 120, role: "execution" },
  { key: "5m", bar: "5m", limit: 120, role: "execution" },
  { key: "15m", bar: "15m", limit: 120, role: "execution" },
  { key: "30m", bar: "30m", limit: 120, role: "execution" },
  { key: "1h", bar: "1H", limit: 100, role: "execution" },
  { key: "4h", bar: "4H", limit: 80, role: "execution" },
  { key: "1d", bar: "1D", limit: 80, role: "execution" },
  { key: "1w", bar: "1W", limit: 52, role: "execution" },
];

const DEFAULT_EXECUTION_TIMEFRAME = "15m";

const STRUCTURE_TIMEFRAME = { key: "1h", bar: "1H", limit: 100, role: "structure" };
const HTF_TIMEFRAME = { key: "4h", bar: "4H", limit: 80, role: "htf" };

const TREND_COMPARISON_TIMEFRAMES = [
  { key: "1m", bar: "1m", limit: 80, role: "trend" },
  { key: "5m", bar: "5m", limit: 80, role: "trend" },
  { key: "15m", bar: "15m", limit: 80, role: "trend" },
  { key: "1h", bar: "1H", limit: 80, role: "trend" },
  { key: "4h", bar: "4H", limit: 60, role: "trend" },
  { key: "1d", bar: "1D", limit: 60, role: "trend" },
];

const TIMEFRAMES = [
  { key: "15m", bar: "15m", limit: 120, role: "execution" },
  { key: "1h", bar: "1H", limit: 100, role: "structure" },
  { key: "4h", bar: "4H", limit: 80, role: "htf" },
];

const EXECUTION_TIMEFRAME_KEY_SET = new Set(EXECUTION_TIMEFRAME_OPTIONS.map((tf) => tf.key));

function normalizeExecutionTimeframeKey(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return EXECUTION_TIMEFRAME_KEY_SET.has(value) ? value : "";
}

function resolveExecutionTimeframeInput(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: true, key: DEFAULT_EXECUTION_TIMEFRAME, defaulted: true };
  }

  const normalized = normalizeExecutionTimeframeKey(raw);
  if (!normalized) {
    return {
      ok: false,
      code: "INVALID_TIMEFRAME",
      message: "الإطار الزمني غير مدعوم. يرجى اختيار أحد الفريمات المتاحة.",
    };
  }

  return { ok: true, key: normalized, defaulted: false };
}

function getExecutionTimeframeConfig(key) {
  const normalized = normalizeExecutionTimeframeKey(key) || DEFAULT_EXECUTION_TIMEFRAME;
  return (
    EXECUTION_TIMEFRAME_OPTIONS.find((tf) => tf.key === normalized)
    || EXECUTION_TIMEFRAME_OPTIONS.find((tf) => tf.key === DEFAULT_EXECUTION_TIMEFRAME)
  );
}

function buildPipelineTimeframes(executionKey) {
  const execution = getExecutionTimeframeConfig(executionKey);
  const unique = new Map();

  for (const tf of [execution, STRUCTURE_TIMEFRAME, HTF_TIMEFRAME, ...TREND_COMPARISON_TIMEFRAMES]) {
    unique.set(tf.key, tf);
  }

  return Array.from(unique.values());
}

const SWING_PIVOT_LEFT = 3;
const SWING_PIVOT_RIGHT = 3;

const BOS_ATR_TOLERANCE = 0.12;
const EQUAL_LEVEL_ATR_TOLERANCE = 0.08;
const FVG_MIN_ATR_RATIO = 0.15;
const MIN_RR_TP1 = 1.2;
const MAX_CONFIDENCE = 88;
const MIN_CANDLES_PER_TF = 40;

const GRADE_THRESHOLDS = [
  { grade: "A+", min: 82 },
  { grade: "A", min: 74 },
  { grade: "B+", min: 66 },
  { grade: "B", min: 58 },
  { grade: "C", min: 45 },
  { grade: "D", min: 0 },
];

const OPENAI_MODEL = process.env.INSTANT_ANALYSIS_OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.INSTANT_ANALYSIS_OPENAI_TIMEOUT_MS || 25000);

module.exports = {
  INSTANT_ANALYSIS_V2_VERSION,
  INSTANT_ANALYSIS_UI_VERSION,
  EXECUTION_TIMEFRAME_OPTIONS,
  DEFAULT_EXECUTION_TIMEFRAME,
  STRUCTURE_TIMEFRAME,
  HTF_TIMEFRAME,
  TREND_COMPARISON_TIMEFRAMES,
  TIMEFRAMES,
  normalizeExecutionTimeframeKey,
  resolveExecutionTimeframeInput,
  getExecutionTimeframeConfig,
  buildPipelineTimeframes,
  SWING_PIVOT_LEFT,
  SWING_PIVOT_RIGHT,
  BOS_ATR_TOLERANCE,
  EQUAL_LEVEL_ATR_TOLERANCE,
  FVG_MIN_ATR_RATIO,
  MIN_RR_TP1,
  MAX_CONFIDENCE,
  MIN_CANDLES_PER_TF,
  GRADE_THRESHOLDS,
  OPENAI_MODEL,
  OPENAI_TIMEOUT_MS,
};
