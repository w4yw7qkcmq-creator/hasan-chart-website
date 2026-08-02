const HIGH_IMPACT_KEYWORDS = [
  "CPI",
  "PPI",
  "PCE",
  "NFP",
  "UNEMPLOYMENT",
  "JOBLESS",
  "GDP",
  "PMI",
  "ISM",
  "FOMC",
  "FED RATE",
  "POWELL",
];

function normalizeEventTitle(title) {
  return String(title || "").toUpperCase();
}

function matchesHighImpact(title) {
  const normalized = normalizeEventTitle(title);
  return HIGH_IMPACT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * News risk adapter.
 * Production calendar integration can plug in here (Supabase/API).
 * Without a confirmed source we never invent events.
 */
async function assessNewsRisk({ symbol, fetchUpcomingEvents = null }) {
  if (typeof fetchUpcomingEvents === "function") {
    try {
      const events = await fetchUpcomingEvents({ symbol });
      const sorted = Array.isArray(events)
        ? events
            .filter((e) => e?.scheduledAt && matchesHighImpact(e.title))
            .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
        : [];

      if (sorted.length) {
        const now = Date.now();
        const next = sorted[0];
        const minutesUntilEvent = Math.floor((new Date(next.scheduledAt).getTime() - now) / 60000);

        if (minutesUntilEvent <= 15 && minutesUntilEvent >= -5) {
          return {
            status: "high",
            nextHighImpactEvent: next.title,
            minutesUntilEvent,
            impact: next.impact || "high",
            affectedAssets: next.affectedAssets || [symbol],
            message: `حدث ${next.title} خلال ${minutesUntilEvent} دقيقة — تجنب الدخول حتى استقرار السوق`,
          };
        }

        if (minutesUntilEvent <= 60 && minutesUntilEvent > 15) {
          return {
            status: "caution",
            nextHighImpactEvent: next.title,
            minutesUntilEvent,
            impact: next.impact || "high",
            affectedAssets: next.affectedAssets || [symbol],
            message: `حدث ${next.title} خلال ${minutesUntilEvent} دقيقة — توخَّ الحذر`,
          };
        }

        return {
          status: "clear",
          nextHighImpactEvent: next.title,
          minutesUntilEvent,
          impact: next.impact || "high",
          affectedAssets: next.affectedAssets || [symbol],
          message: null,
        };
      }
    } catch (_error) {
      // fall through to unavailable
    }
  }

  return {
    status: "unavailable",
    nextHighImpactEvent: null,
    minutesUntilEvent: null,
    impact: null,
    affectedAssets: [],
    message: "مصدر الأحداث الاقتصادية غير متصل — التحليل يعتمد على السعر فقط",
  };
}

module.exports = {
  assessNewsRisk,
  matchesHighImpact,
};
