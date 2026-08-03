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

export const TREND_TABLE_TIMEFRAMES = EXECUTION_TIMEFRAMES.map((item) => item.key);

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

const TREND_LABELS = {
  bullish: "صاعد",
  bearish: "هابط",
  neutral: "عرضي",
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
  extreme: "مخاطرة شديدة",
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

const STRENGTH_LABELS = {
  strong: "قوي",
  moderate: "متوسط",
  weak: "ضعيف",
};

const ZONE_STATUS_LABELS = {
  fresh: "جديد",
  mitigated: "مُخفَّف",
  invalidated: "ملغى",
  active: "نشط",
  partially_filled: "مملوء جزئياً",
  filled: "مملوء",
};

const FACTOR_LABELS = {
  bos: "كسر الهيكل",
  choch: "تغير السلوك",
  liquidity: "السيولة",
  htf: "توافق الأطر",
  rr: "العائد للمخاطرة",
  fvg: "فجوة القيمة",
  ob: "كتلة أوامر",
  volatility: "التقلب",
  trend: "الاتجاه",
  news: "الأخبار",
};

const FACTOR_STATUS_LABELS = {
  ok: "قوي",
  partial: "متوسط",
  weak: "ضعيف",
  missing: "غير متوفر",
  conflict: "متعارض",
  high: "مرتفع",
};

export function normalizeExecutionTimeframe(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const allowed = new Set(EXECUTION_TIMEFRAMES.map((item) => item.key));
  return allowed.has(value) ? value : "";
}

export function labelTrend(value) {
  return TREND_LABELS[String(value || "").toLowerCase()] || "عرضي";
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
  return MARKET_STATE_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelAlignment(value) {
  return ALIGNMENT_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelVolatility(value) {
  return VOLATILITY_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelStrength(value) {
  return STRENGTH_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelZoneStatus(value) {
  return ZONE_STATUS_LABELS[String(value || "").toLowerCase()] || "—";
}

export function labelFactor(key) {
  return FACTOR_LABELS[String(key || "").toLowerCase()] || key || "—";
}

export function labelFactorStatus(status) {
  return FACTOR_STATUS_LABELS[String(status || "").toLowerCase()] || "—";
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

export function labelDataQuality(quality) {
  if (quality === "good") return "جيدة";
  if (quality === "degraded") return "منخفضة";
  return "غير كافية";
}

export function formatDurationMs(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value < 1000) return `${value} مللي ثانية`;
  const seconds = (value / 1000).toFixed(1);
  return `${seconds} ثانية`;
}

export function decisionCardMeta(decision, setupQuality) {
  const state = decision?.state;
  const grade = decision?.opportunityGrade || setupQuality?.grade;

  if (state === "avoid") {
    return { emoji: "🔴", title: "تجنب", tone: "avoid" };
  }
  if (state === "wait") {
    if (grade === "C" || grade === "D") {
      return { emoji: "🟠", title: "ضعيفة", tone: "weak" };
    }
    return { emoji: "🟡", title: "انتظار", tone: "wait" };
  }
  if (grade === "A+" || grade === "A") {
    return { emoji: "🟢", title: "فرصة ممتازة", tone: "excellent" };
  }
  if (grade === "B+" || grade === "B") {
    return { emoji: "🟢", title: "فرصة جيدة", tone: "good" };
  }
  return { emoji: "🟢", title: "جاهز للدخول", tone: "actionable" };
}

export function trendArrow(trend) {
  if (trend === "bullish") return "↑";
  if (trend === "bearish") return "↓";
  return "→";
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

export function buildExecutiveSummary(v2) {
  const lines = [];
  const summary = v2.explanation?.executiveSummary;
  if (summary) {
    return summary.split(/\n+/).filter(Boolean).slice(0, 5).join("\n");
  }

  const state = labelState(v2.decision?.state);
  const grade = v2.setupQuality?.grade || v2.decision?.opportunityGrade || "—";
  lines.push(`الحالة الحالية: ${state} بدرجة ${grade}.`);
  lines.push(v2.decision?.primaryReason || "لا توجد فرصة واضحة بعد.");
  if (v2.decision?.waitReason) lines.push(v2.decision.waitReason);
  lines.push(
    v2.decision?.state === "actionable"
      ? "يوصى بمراقبة شروط الدخول بدقة قبل التنفيذ."
      : "لا يُوصى بالدخول الآن حتى يتحسن توافق الأدلة."
  );
  return lines.slice(0, 5).join("\n");
}

export function buildSuggestedAction(v2) {
  const decision = v2?.decision || {};
  const plan = v2?.tradePlan || {};
  const waitLines = v2?.explanation?.whatToWaitFor || [];

  if (decision.state === "actionable" && plan.isActionable) {
    return plan.trigger || "نفّذ الدخول عند تحقق شروط الخطة مع الالتزام بإدارة المخاطرة.";
  }

  if (decision.state === "avoid") {
    return decision.waitReason || decision.primaryReason || "تجنب الدخول حالياً وراقب إعادة تشكيل الهيكل.";
  }

  if (decision.waitReason) {
    return decision.waitReason;
  }

  if (waitLines.length) {
    return waitLines[0];
  }

  return "انتظر تأكيداً إضافياً من السعر والهيكل قبل التفكير بالدخول.";
}

export const REPORT_FOOTER_DISCLAIMER =
  "هذا التحليل أداة مساعدة لاتخاذ القرار وليس توصية استثمارية مباشرة. يجب إدارة المخاطر وعدم المخاطرة بأكثر من النسبة المناسبة من رأس المال.";

export function buildReportText(v2) {
  const plan = v2?.tradePlan || {};
  const targets = plan.targets || [];
  const tp = (index) => formatPrice(targets[index]?.price);
  const entryText = plan.entryZone
    ? `${formatPrice(plan.entryZone.from)} – ${formatPrice(plan.entryZone.to)}`
    : "—";
  const card = decisionCardMeta(v2?.decision || {}, v2?.setupQuality || {});

  const lines = [
    "تقرير التحليل اللحظي",
    "====================",
    `الأصل: ${v2.symbol}`,
    `الفريم: ${labelTimeframeLong(v2.meta?.executionTimeframe || "15m")}`,
    `القرار: ${card.emoji} ${card.title}`,
    `الاتجاه: ${labelDirection(v2.decision?.direction)}`,
    `الثقة: ${v2.decision?.confidence || 0}%`,
    `الدرجة: ${v2.setupQuality?.grade || v2.decision?.opportunityGrade || "—"}`,
    "",
    "الخلاصة:",
    buildExecutiveSummary(v2),
    "",
    "خطة التداول:",
    `الاتجاه: ${labelDirection(v2.decision?.direction)}`,
    `الدخول: ${entryText}`,
    `وقف الخسارة: ${formatPrice(plan.stopLoss)}`,
    `هدف 1: ${tp(0)}`,
    `هدف 2: ${tp(1)}`,
    `هدف 3: ${tp(2)}`,
    `العائد للمخاطرة: ${plan.riskReward?.toTp1 ? `1:${plan.riskReward.toTp1}` : "—"}`,
    "",
    "الإجراء المقترح:",
    buildSuggestedAction(v2),
    "",
    REPORT_FOOTER_DISCLAIMER,
  ];

  return lines.filter((line) => line !== undefined).join("\n");
}
