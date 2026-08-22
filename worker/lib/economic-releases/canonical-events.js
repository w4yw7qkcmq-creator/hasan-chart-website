const CANONICAL_EVENT_DEFINITIONS = {
  US_CPI_MOM: {
    patterns: [
      /(?<!core )\bcpi\b[\s\S]*\b(m\/m|mom|month[- ]over[- ]month|monthly)\b/i,
      /consumer price index(?![\s\S]*\bcore\b)[\s\S]*\b(m\/m|mom|monthly)\b/i,
    ],
    calendarPatterns: [/cpi\s*\(\s*m\/m\s*\)/i, /consumer price index\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر التضخم الأمريكي (شهري)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CPI_YOY: {
    patterns: [
      /(?<!core )\bcpi\b[\s\S]*\b(y\/y|yoy|year[- ]over[- ]year|annual)\b/i,
      /consumer price index(?![\s\S]*\bcore\b)[\s\S]*\b(y\/y|yoy|annual)\b/i,
    ],
    calendarPatterns: [/cpi\s*\(\s*y\/y\s*\)/i, /consumer price index\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر التضخم الأمريكي (سنوي)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CORE_CPI_MOM: {
    patterns: [/\bcore cpi\b[\s\S]*\b(m\/m|mom|monthly)\b/i],
    calendarPatterns: [/core cpi\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر التضخم الأساسي الأمريكي (شهري)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CORE_CPI_YOY: {
    patterns: [/\bcore cpi\b[\s\S]*\b(y\/y|yoy|annual)\b/i],
    calendarPatterns: [/core cpi\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر التضخم الأساسي الأمريكي (سنوي)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_PPI_MOM: {
    patterns: [/\bppi\b(?![\s\S]*\bcore\b)[\s\S]*\b(m\/m|mom|monthly)\b/i],
    calendarPatterns: [/ppi\s*\(\s*m\/m\s*\)/i, /producer price index\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر أسعار المنتجين (شهري)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_PPI_YOY: {
    patterns: [/\bppi\b(?![\s\S]*\bcore\b)[\s\S]*\b(y\/y|yoy|annual)\b/i],
    calendarPatterns: [/ppi\s*\(\s*y\/y\s*\)/i, /producer price index\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر أسعار المنتجين (سنوي)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_PPI: {
    patterns: [/\bppi\b|producer price index/i],
    calendarPatterns: [/ppi\b|producer price index/i],
    arabicName: "مؤشر أسعار المنتجين الأمريكي",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_NFP: {
    patterns: [/\bnfp\b|nonfarm payrolls|non-farm payrolls|payrolls change/i],
    calendarPatterns: [/\bnfp\b|nonfarm payrolls|non-farm payrolls/i],
    arabicName: "تقرير الوظائف الأمريكية NFP",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_UNEMPLOYMENT_RATE: {
    patterns: [/unemployment rate/i],
    calendarPatterns: [/unemployment rate/i],
    arabicName: "معدل البطالة الأمريكي",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CONTINUING_JOBLESS_CLAIMS: {
    patterns: [/continuing jobless claims|continued claims/i],
    calendarPatterns: [/continuing jobless claims|continued claims/i],
    arabicName: "طلبات إعانة البطالة المستمرة",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_INITIAL_JOBLESS_CLAIMS: {
    patterns: [/initial jobless claims|(?<!continuing )jobless claims|unemployment claims/i],
    calendarPatterns: [/initial jobless claims/i, /(?<!continuing )jobless claims/i],
    arabicName: "طلبات إعانة البطالة الأمريكية",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_GDP_QOQ: {
    patterns: [/\bgdp\b[\s\S]*\b(q\/q|qoq|quarter|advance|prelim|final)\b/i, /gross domestic product/i],
    calendarPatterns: [/gdp\b|gross domestic product/i],
    arabicName: "الناتج المحلي الإجمالي الأمريكي",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CORE_PCE_MOM: {
    patterns: [/\bcore pce\b[\s\S]*\b(m\/m|mom|monthly)\b/i],
    calendarPatterns: [/core pce\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر PCE الأساسي (شهري)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CORE_PCE_YOY: {
    patterns: [/\bcore pce\b[\s\S]*\b(y\/y|yoy|annual)\b/i],
    calendarPatterns: [/core pce\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر PCE الأساسي (سنوي)",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_PCE: {
    patterns: [/\bpce\b|personal consumption expenditures/i],
    calendarPatterns: [/\bpce price index\b|personal consumption expenditures/i],
    arabicName: "مؤشر PCE الأمريكي",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_RETAIL_SALES: {
    patterns: [/retail sales/i],
    calendarPatterns: [/retail sales/i],
    arabicName: "مبيعات التجزئة الأمريكية",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CORE_RETAIL_SALES: {
    patterns: [/core retail sales|retail sales ex autos|retail sales excluding autos/i],
    calendarPatterns: [/core retail sales|retail sales ex autos/i],
    arabicName: "مبيعات التجزئة الأساسية الأمريكية",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_CONSUMER_CONFIDENCE: {
    patterns: [/consumer confidence|consumer sentiment|cb consumer confidence|michigan consumer sentiment/i],
    calendarPatterns: [/consumer confidence|consumer sentiment/i],
    arabicName: "مؤشر ثقة المستهلك الأمريكي",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_ISM_MANUFACTURING: {
    patterns: [
      /\bism\b.*manufacturing|ism manufacturing pmi/i,
      /(?<!s&p global )(?<!sp global )manufacturing pmi(?![\s\S]*s&p global)/i,
    ],
    calendarPatterns: [/ism manufacturing|(?<!s&p )ism manufacturing pmi/i],
    arabicName: "مؤشر ISM للتصنيع",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_PHILADELPHIA_FED_MANUFACTURING: {
    patterns: [
      /philadelphia fed(?:eral)?(?:\s+bank)?(?:\s+manufacturing|\s+business outlook|\s+index)?/i,
      /philly fed(?:eral)?(?:\s+manufacturing|\s+business outlook|\s+index)?/i,
      /philadelphia fed manufacturing index/i,
      /philly fed manufacturing index/i,
      /philadelphia fed business outlook/i,
    ],
    calendarPatterns: [
      /philadelphia fed manufacturing/i,
      /philly fed manufacturing/i,
      /philadelphia fed business outlook/i,
    ],
    arabicName: "مؤشر فيلادلفيا للصناعات التحويلية",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_SP_GLOBAL_PMI: {
    patterns: [/s&p global.*pmi|sp global.*pmi|s&p global composite|sp global composite/i],
    calendarPatterns: [/s&p global.*pmi|sp global.*pmi/i],
    arabicName: "مؤشر S&P Global PMI المركب",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_SP_GLOBAL_FLASH_MANUFACTURING_PMI: {
    patterns: [
      /s&p global.*(?:flash.*)?(?:us )?manufacturing|sp global.*(?:flash.*)?(?:us )?manufacturing/i,
      /flash manufacturing pmi|s&p global us manufacturing pmi|sp global us manufacturing pmi/i,
      /(?<!ism )(?<!ism\s)(?<!s&p global )(?<!sp global )manufacturing pmi(?![\s\S]*services)/i,
    ],
    calendarPatterns: [/s&p global.*manufacturing|flash manufacturing pmi/i],
    arabicName: "مؤشر S&P Global Flash للتصنيع",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_SP_GLOBAL_FLASH_SERVICES_PMI: {
    patterns: [
      /s&p global.*(?:flash.*)?(?:us )?services|sp global.*(?:flash.*)?(?:us )?services/i,
      /flash services pmi|s&p global us services pmi|sp global us services pmi/i,
      /(?<!ism )(?<!ism\s)(?<!s&p global )(?<!sp global )services pmi/i,
    ],
    calendarPatterns: [/s&p global.*services|flash services pmi/i],
    arabicName: "مؤشر S&P Global Flash للخدمات",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_ISM_SERVICES: {
    patterns: [
      /\bism\b.*services|ism services pmi|(?<!s&p global )(?<!sp global )(?<!flash )services pmi/i,
    ],
    calendarPatterns: [/ism services|(?<!s&p )ism services pmi/i],
    arabicName: "مؤشر ISM للخدمات",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_PMI: {
    patterns: [/\bpmi\b|purchasing managers/i],
    calendarPatterns: [/\bpmi\b|purchasing managers/i],
    arabicName: "مؤشر مديري المشتريات الأمريكي",
    requiresTripleTemplate: true,
    eventType: "structured_release",
  },
  US_FED_RATE_DECISION: {
    patterns: [
      /\bfomc\b|fed rate decision|federal reserve rate decision|interest rate decision|قرار الفائدة|قرار فائدة/i,
      /\brate decision\b|\brate cut\b|\brate hike\b/i,
    ],
    calendarPatterns: [/fomc|fed interest rate decision|interest rate decision/i],
    arabicName: "قرار الفائدة الأمريكية",
    requiresTripleTemplate: true,
    eventType: "rate_decision",
    fieldLabels: {
      previous: "القرار السابق",
      forecast: "التوقع",
      actual: "القرار الحالي",
    },
  },
  US_POWELL_SPEECH: {
    patterns: [/powell.*speech|powell.*remarks|fed chair.*speech|press conference|مؤتمر صحفي|باول/i],
    calendarPatterns: [/powell|press conference|fed chair/i],
    arabicName: "تصريحات جيروم باول / المؤتمر الصحفي للفيدرالي",
    requiresTripleTemplate: false,
    eventType: "plain_news",
  },
  US_FED_STATEMENT: {
    patterns: [/fomc statement|fed statement|بيان الفيدرالي/i],
    calendarPatterns: [/fomc statement/i],
    arabicName: "بيان الفيدرالي",
    requiresTripleTemplate: false,
    eventType: "plain_news",
  },
};

const GENERIC_CPI_FALLBACK = {
  patterns: [/\bcpi\b|consumer price index|مؤشر أسعار المستهلك/i],
  calendarPatterns: [/\bcpi\b|consumer price index/i],
  arabicName: "مؤشر التضخم الأمريكي",
  requiresTripleTemplate: true,
  eventType: "structured_release",
};

function normalizeMatchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function resolveCanonicalEventKey(title) {
  const text = normalizeMatchText(title);

  for (const [eventKey, definition] of Object.entries(CANONICAL_EVENT_DEFINITIONS)) {
    if (matchesAnyPattern(text, definition.patterns)) {
      return {
        eventKey,
        ...definition,
      };
    }
  }

  if (matchesAnyPattern(text, GENERIC_CPI_FALLBACK.patterns)) {
    return {
      eventKey: "US_CPI_GENERIC",
      ...GENERIC_CPI_FALLBACK,
    };
  }

  return {
    eventKey: null,
    requiresTripleTemplate: false,
    eventType: "unknown",
    arabicName: null,
  };
}

function calendarTitleMatchesCanonical(calendarTitle, canonical) {
  if (!canonical?.eventKey) {
    return false;
  }

  const text = normalizeMatchText(calendarTitle);

  if (canonical.eventKey === "US_CPI_GENERIC") {
    return matchesAnyPattern(text, GENERIC_CPI_FALLBACK.calendarPatterns);
  }

  const definition = CANONICAL_EVENT_DEFINITIONS[canonical.eventKey];
  if (!definition) {
    return false;
  }

  return matchesAnyPattern(text, definition.calendarPatterns || definition.patterns);
}

function buildIdempotencyKey({ country = "US", eventKey, scheduledAt }) {
  const scheduled = scheduledAt ? new Date(scheduledAt).toISOString() : "unknown";
  return `${country}|${eventKey}|${scheduled}`;
}

function isPlainNewsEventType(eventType) {
  return eventType === "plain_news";
}

function isStructuredTripleReleaseTitle(title) {
  const canonical = resolveCanonicalEventKey(title);
  if (canonical.eventKey) {
    return canonical.requiresTripleTemplate === true;
  }

  const value = normalizeMatchText(title);
  if (/powell|press conference|fed chair|statement|remarks|speech|مؤتمر صحفي|بيان الفيدرالي|بيان/i.test(value)) {
    return false;
  }

  return /jobless claims|initial claims|continuing claims|unemployment claims|unemployment rate|\bcpi\b|core cpi|\bppi\b|\bpce\b|\bnfp\b|nonfarm payrolls|consumer confidence|consumer sentiment|retail sales|\bism\b|\bpmi\b|philadelphia fed|philly fed|\bgdp\b|fomc|rate decision|interest rate decision|التضخم|البطالة|الوظائف|طلبات إعانة|ثقة المستهلك|مبيعات التجزئة|الناتج المحلي|قرار الفائدة|فيلادلفيا|مؤشر فيلادلفيا/i.test(
    value
  );
}

module.exports = {
  CANONICAL_EVENT_DEFINITIONS,
  resolveCanonicalEventKey,
  calendarTitleMatchesCanonical,
  buildIdempotencyKey,
  isPlainNewsEventType,
  isStructuredTripleReleaseTitle,
};
