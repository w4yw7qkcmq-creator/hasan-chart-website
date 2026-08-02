export const EXECUTION_TIMEFRAMES = [
  { key: "1m", label: "1د" },
  { key: "3m", label: "3د" },
  { key: "5m", label: "5د" },
  { key: "15m", label: "15د" },
  { key: "30m", label: "30د" },
  { key: "1h", label: "1س" },
  { key: "4h", label: "4س" },
  { key: "1d", label: "1ي" },
  { key: "1w", label: "1أ" },
];

const TIMEFRAME_LONG_LABELS = {
  "1m": "دقيقة",
  "3m": "3 دقائق",
  "5m": "5 دقائق",
  "15m": "15 دقيقة",
  "30m": "30 دقيقة",
  "1h": "الساعة",
  "4h": "4 ساعات",
  "1d": "اليوم",
  "1w": "الأسبوع",
};

export function normalizeExecutionTimeframe(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const allowed = new Set(EXECUTION_TIMEFRAMES.map((item) => item.key));
  return allowed.has(value) ? value : "";
}

export const TREND_TABLE_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

const TREND_LABELS = {
  bullish: "صاعد",
  bearish: "هابط",
  neutral: "محايد",
};

const STATE_LABELS = {
  actionable: "جاهز للدخول",
  wait: "انتظار",
  avoid: "تجنب الدخول",
};

const DIRECTION_LABELS = {
  long: "شراء",
  short: "بيع",
  neutral: "محايد",
};

const RISK_LABELS = {
  extreme: "مخاطرة مرتفعة",
  high: "مخاطرة مرتفعة",
  medium: "مخاطرة متوسطة",
  low: "مخاطرة منخفضة",
};

const EVIDENCE_STATUS_LABELS = {
  confirmed: "مؤكد",
  partial: "جزئي",
  absent: "غير موجود",
  conflicting: "متعارض",
};

const MARKET_STATE_LABELS = {
  trending: "اتجاهي",
  ranging: "نطاقي",
  volatile: "متقلب",
  transition: "انتقالي",
};

const ALIGNMENT_LABELS = {
  aligned: "متوافق",
  mixed: "مختلط",
  conflicting: "متعارض",
};

const VOLATILITY_LABELS = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  extreme: "شديد",
};

export function labelTrend(value) {
  return TREND_LABELS[String(value || "").toLowerCase()] || "محايد";
}

export function labelState(value) {
  return STATE_LABELS[String(value || "").toLowerCase()] || "انتظار";
}

export function labelDirection(value) {
  return DIRECTION_LABELS[String(value || "").toLowerCase()] || "محايد";
}

export function labelRisk(value) {
  return RISK_LABELS[String(value || "").toLowerCase()] || "مخاطرة متوسطة";
}

export function labelEvidenceStatus(value) {
  return EVIDENCE_STATUS_LABELS[String(value || "").toLowerCase()] || "غير موجود";
}

export function labelMarketState(value) {
  return MARKET_STATE_LABELS[String(value || "").toLowerCase()] || value || "—";
}

export function labelAlignment(value) {
  return ALIGNMENT_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelVolatility(value) {
  return VOLATILITY_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelTimeframe(key) {
  const item = EXECUTION_TIMEFRAMES.find((tf) => tf.key === key);
  return item?.label || key;
}

export function labelTimeframeLong(key) {
  return TIMEFRAME_LONG_LABELS[String(key || "").toLowerCase()] || key || "—";
}

export function labelResultTimeframe(result) {
  const tf = result?.v2?.meta?.executionTimeframe || result?.meta?.executionTimeframe;
  return tf ? labelTimeframeLong(tf) : "—";
}

export function decisionCardMeta(decision, setupQuality) {
  const state = decision?.state;
  const grade = decision?.opportunityGrade || setupQuality?.grade;

  if (state === "avoid") {
    return { emoji: "🔴", title: "تجنب الدخول", tone: "avoid" };
  }
  if (state === "wait") {
    if (grade === "C" || grade === "D") {
      return { emoji: "🟠", title: "فرصة ضعيفة", tone: "weak" };
    }
    return { emoji: "🟡", title: "انتظار", tone: "wait" };
  }
  if (grade === "A+" || grade === "A") {
    return { emoji: "🟢", title: "فرصة ممتازة", tone: "excellent" };
  }
  return { emoji: "🟢", title: "جاهز للدخول", tone: "actionable" };
}

export function trendArrow(trend) {
  if (trend === "bullish") return "⬆️";
  if (trend === "bearish") return "⬇️";
  return "➡️";
}

export function evidenceIcon(item) {
  if (item.status === "confirmed") return "✅";
  if (item.status === "partial") return "🟡";
  if (item.status === "conflicting") return "⚠️";
  return "❌";
}

export function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ar", { maximumFractionDigits: 6 });
}

export function buildReportText(v2) {
  const lines = [
    `رمز: ${v2.symbol}`,
    `الفريم: ${labelTimeframe(v2.meta?.executionTimeframe || "15m")}`,
    `القرار: ${labelState(v2.decision?.state)}`,
    `الاتجاه: ${labelDirection(v2.decision?.direction)}`,
    `الثقة: ${v2.decision?.confidence || 0}%`,
    `جودة الإعداد: ${v2.setupQuality?.grade || "—"} (${v2.setupQuality?.score || 0}/100)`,
    "",
    v2.decision?.primaryReason || "",
    v2.decision?.waitReason || "",
    "",
    v2.explanation?.executiveSummary || "",
    v2.explanation?.institutionalView || "",
    v2.explanation?.classicTechnicalView || "",
    v2.explanation?.riskWarning || "",
  ];
  return lines.filter(Boolean).join("\n");
}
