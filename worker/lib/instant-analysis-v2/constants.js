const INSTANT_ANALYSIS_V2_VERSION = "2.0";

const TIMEFRAMES = [
  { key: "15m", bar: "15m", limit: 120, role: "execution" },
  { key: "1h", bar: "1H", limit: 100, role: "structure" },
  { key: "4h", bar: "4H", limit: 80, role: "htf" },
];

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
  TIMEFRAMES,
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
