/**
 * Deterministic action extraction from source evidence.
 * Higher-priority (more specific) rules must appear first.
 */

const ACTION_CLASSES = Object.freeze({
  RATE_HIKE: "RATE_HIKE",
  RATE_CUT: "RATE_CUT",
  RATE_HOLD: "RATE_HOLD",
  RISE: "RISE",
  FALL: "FALL",
  SURGE: "SURGE",
  DROP: "DROP",
  SANCTIONS: "SANCTIONS",
  DEAL: "DEAL",
  NEGOTIATION: "NEGOTIATION",
  INVESTIGATION: "INVESTIGATION",
  APPROVAL: "APPROVAL",
  REJECTION: "REJECTION",
  LAUNCH: "LAUNCH",
  ACQUISITION: "ACQUISITION",
  SALE: "SALE",
  PURCHASE: "PURCHASE",
  TARIFF: "TARIFF",
  COUNTER_TARIFF: "COUNTER_TARIFF",
  LICENSE_APPLICATION: "LICENSE_APPLICATION",
  EARNINGS: "EARNINGS",
  GUIDANCE: "GUIDANCE",
  OTHER: "OTHER",
});

const ACTION_RULES = Object.freeze([
  {
    class: ACTION_CLASSES.RATE_HIKE,
    patterns: [
      /\bhiking?\s+(?:to|rates?|interest)/i,
      /\brate\s+hikes?\b/i,
      /\braise\s+rates?\b/i,
      /\bhikes?\s+to\s+\d/i,
      /\bseen\s+hiking\b/i,
      /\bready\s+to\s+raise\s+rates?\b/i,
      /\braise\s+rates?\s+in\b/i,
    ],
  },
  {
    class: ACTION_CLASSES.RATE_CUT,
    patterns: [/\bcut\s+rates?\b/i, /\brate\s+cut/i, /\blowering\s+rates?\b/i, /\bslash(?:es|ing)?\s+rates?\b/i],
  },
  {
    class: ACTION_CLASSES.RATE_HOLD,
    patterns: [
      /\b(?:keep|hold|leave|maintain)\s+rates?\s+(?:unchanged|steady|on hold)/i,
      /\brates?\s+unchanged\b/i,
      /\bunchanged\s+rates?\b/i,
    ],
  },
  {
    class: ACTION_CLASSES.FALL,
    patterns: [
      /\b(?:oil|crude|gold|bitcoin|futures?|stocks?)\b[^.\n]{0,80}\b(?:slides?|falls?|fell|drops?|sell(?:s)?\s+at)\b/i,
      /\b(?:slides?|falls?|fell|drops?|sell(?:s)?\s+at)\b[^.\n]{0,40}\$\d/i,
    ],
    excludeIf: /\bhiking?\b|\brate\s+hike\b|\braise\s+rates?\b/i,
  },
  {
    class: ACTION_CLASSES.COUNTER_TARIFF,
    patterns: [/\bcounter[\s-]?tariffs?\b/i, /\btariffs?\s+on\s+imports\b/i],
  },
  {
    class: ACTION_CLASSES.TARIFF,
    patterns: [/\btariffs?\b/i, /\bduties\b/i],
    excludeIf: /\bcounter[\s-]?tariffs?\b/i,
  },
  {
    class: ACTION_CLASSES.LICENSE_APPLICATION,
    patterns: [
      /\btrust\s+bank\s+charter\b/i,
      /\bbank\s+charter\b/i,
      /\bocc\s+charter\b/i,
      /\bcharter\s+effort\b/i,
      /\blicen[cs]e\s+application\b/i,
      /\bapply(?:ing)?\s+for\s+(?:a\s+)?(?:bank\s+)?(?:charter|licen[cs]e)\b/i,
    ],
  },
  {
    class: ACTION_CLASSES.DEAL,
    patterns: [
      /\b(?:iran|us|u\.s\.).*?\bdeal\b/i,
      /\bdeal\b.*?(?:iran|ceasefire|agreement)/i,
      /\bceasefire\b/i,
      /\brumou?rs?\s+of\b/i,
      /\bunconfirmed\s+report\b/i,
    ],
    excludeIf: /\bsanctions?\b/i,
  },
  {
    class: ACTION_CLASSES.SANCTIONS,
    patterns: [/\bsanctions?\b/i, /\beconomic\s+pressure\b/i],
    excludeIf: /\bdeal\b|\bceasefire\b|\brumou?rs?\b/i,
  },
  {
    class: ACTION_CLASSES.LAUNCH,
    patterns: [/\bunveils?\b/i, /\blaunch(?:es|ing)?\b/i, /\bdebut(?:s|ed)?\b/i, /\bintroduc(?:es|ing)?\b/i],
  },
  {
    class: ACTION_CLASSES.SURGE,
    patterns: [/\bsurges?\b/i, /\bjumps?\b/i, /\bsoars?\b/i],
    excludeIf: /\bunveils?\b|\blaunch(?:es|ing)?\b/i,
  },
  {
    class: ACTION_CLASSES.DROP,
    patterns: [/\bdrops?\b/i, /\bplunges?\b/i, /\btumbles?\b/i],
  },
  {
    class: ACTION_CLASSES.FALL,
    patterns: [/\bfalls?\b/i, /\bfell\b/i, /\bslides?\b/i, /\bslips?\b/i, /\bdeclines?\b/i, /\bretreats?\b/i],
    excludeIf: /\bhiking?\b|\brate\s+hike\b|\braise\s+rates?\b/i,
  },
  {
    class: ACTION_CLASSES.OTHER,
    patterns: [
      /\bsoftware stocks?\b[^.\n]{0,60}\b(?:tests?|rallies|rally)\b/i,
      /\bface major tests\b[^.\n]{0,40}\brallies\b/i,
      /\bgrowth stocks?\b[^.\n]{0,80}\b(?:cheap|valuation)\b/i,
    ],
  },
  {
    class: ACTION_CLASSES.RISE,
    patterns: [/\brises?\b/i, /\brallies?\b/i, /\bgains?\b/i, /\bclimbs?\b/i],
    excludeIf: /\bbeat\s+rivals?\b|\bcan\s+beat\b|\bsoftware stocks?\b|\bface major tests\b/i,
  },
  {
    class: ACTION_CLASSES.EARNINGS,
    patterns: [/\bearnings\b/i, /\bbeats?\s+expectations\b/i, /\bmisses?\s+expectations\b/i],
    excludeIf: /\bcan\s+beat\s+rivals?\b/i,
  },
  {
    class: ACTION_CLASSES.GUIDANCE,
    patterns: [/\bguidance\b/i, /\bforecast\b/i],
  },
  {
    class: ACTION_CLASSES.INVESTIGATION,
    patterns: [/\binvestigat(?:e|ion|ing)\b/i, /\bprobe\b/i, /\bsubpoena\b/i],
  },
  {
    class: ACTION_CLASSES.ACQUISITION,
    patterns: [/\bacquisition\b/i, /\bmerger\b/i, /\bbuying\b/i, /\bm&a\b/i],
  },
]);

const ACTION_ARABIC = Object.freeze({
  [ACTION_CLASSES.RATE_HIKE]: "رفع أسعار الفائدة",
  [ACTION_CLASSES.RATE_CUT]: "خفض أسعار الفائدة",
  [ACTION_CLASSES.RATE_HOLD]: "تثبيت أسعار الفائدة",
  [ACTION_CLASSES.RISE]: "ارتفاع",
  [ACTION_CLASSES.FALL]: "تراجع",
  [ACTION_CLASSES.SURGE]: "قفزة",
  [ACTION_CLASSES.DROP]: "هبوط",
  [ACTION_CLASSES.SANCTIONS]: "عقوبات",
  [ACTION_CLASSES.DEAL]: "تفاهم أو صفقة",
  [ACTION_CLASSES.NEGOTIATION]: "مفاوضات",
  [ACTION_CLASSES.INVESTIGATION]: "تحقيق",
  [ACTION_CLASSES.APPROVAL]: "موافقة",
  [ACTION_CLASSES.REJECTION]: "رفض",
  [ACTION_CLASSES.LAUNCH]: "إطلاق",
  [ACTION_CLASSES.ACQUISITION]: "استحواذ",
  [ACTION_CLASSES.SALE]: "بيع",
  [ACTION_CLASSES.PURCHASE]: "شراء",
  [ACTION_CLASSES.TARIFF]: "رسوم جمركية",
  [ACTION_CLASSES.COUNTER_TARIFF]: "رسوم جمركية مضادة",
  [ACTION_CLASSES.LICENSE_APPLICATION]: "طلب ترخيص مصرفي",
  [ACTION_CLASSES.EARNINGS]: "نتائج أرباح",
  [ACTION_CLASSES.GUIDANCE]: "توجيهات",
  [ACTION_CLASSES.OTHER]: "تطور",
});

const ACTION_DIRECTION = Object.freeze({
  [ACTION_CLASSES.RATE_HIKE]: "up",
  [ACTION_CLASSES.RATE_CUT]: "down",
  [ACTION_CLASSES.RISE]: "up",
  [ACTION_CLASSES.FALL]: "down",
  [ACTION_CLASSES.SURGE]: "up",
  [ACTION_CLASSES.DROP]: "down",
});

function combinedEvidenceText(evidence = {}) {
  return [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n");
}

function extractActionFromEvidence(evidence = {}) {
  const title = String(evidence.title || "");
  const combined = combinedEvidenceText(evidence);
  const titleLower = title.toLowerCase();

  for (const rule of ACTION_RULES) {
    if (rule.excludeIf && rule.excludeIf.test(combined)) continue;
    for (const pattern of rule.patterns) {
      if (pattern.test(title) || pattern.test(combined)) {
        return {
          actionClass: rule.class,
          actionArabic: ACTION_ARABIC[rule.class] || ACTION_ARABIC.OTHER,
          direction: ACTION_DIRECTION[rule.class] || null,
          matchedInTitle: pattern.test(title),
          sourceText: titleLower,
        };
      }
    }
  }

  return {
    actionClass: ACTION_CLASSES.OTHER,
    actionArabic: ACTION_ARABIC.OTHER,
    direction: null,
    matchedInTitle: false,
    sourceText: titleLower,
  };
}

function actionConflictsWithOutput(actionClass = "", text = "") {
  const normalized = String(text || "");
  const upWords = /رفع|يرفع|يرتفع|ارتفاع|قفزة|صعود/u;
  const downWords = /تراجع|انخفاض|هبوط|ينخفض|خفض/u;

  if ([ACTION_CLASSES.RATE_HIKE, ACTION_CLASSES.RISE, ACTION_CLASSES.SURGE].includes(actionClass)) {
    if (downWords.test(normalized) && !upWords.test(normalized)) return "V2_DIRECTION_MISMATCH";
  }
  if ([ACTION_CLASSES.RATE_CUT, ACTION_CLASSES.FALL, ACTION_CLASSES.DROP].includes(actionClass)) {
    if (upWords.test(normalized) && !downWords.test(normalized)) return "V2_DIRECTION_MISMATCH";
  }
  if (actionClass === ACTION_CLASSES.DEAL && /عقوبات/u.test(normalized)) return "V2_EVENT_TYPE_MISMATCH";
  if (actionClass === ACTION_CLASSES.SANCTIONS && /تفاهم|صفقة|deal/u.test(normalized)) {
    return "V2_EVENT_TYPE_MISMATCH";
  }
  if (actionClass === ACTION_CLASSES.LICENSE_APPLICATION && /إعلام|اتصالات|comcast|charter communications/u.test(normalized)) {
    return "V2_EVENT_TYPE_MISMATCH";
  }
  if (actionClass === ACTION_CLASSES.COUNTER_TARIFF && !/كندا|canada|counter|مضادة|واردات/u.test(normalized)) {
    if (/^رسوم جمركية$/u.test(normalized.trim())) return "V2_EVENT_TYPE_MISMATCH";
  }
  return null;
}

module.exports = {
  ACTION_CLASSES,
  ACTION_ARABIC,
  ACTION_RULES,
  extractActionFromEvidence,
  actionConflictsWithOutput,
  combinedEvidenceText,
};
