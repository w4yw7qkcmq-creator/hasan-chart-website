function releaseDef(country, keySuffix, options = {}) {
  const eventKey = `${country}_${keySuffix}`;
  return [
    eventKey,
    {
      country,
      patterns: options.patterns || [],
      calendarPatterns: options.calendarPatterns || options.patterns || [],
      arabicName: options.arabicName || eventKey,
      requiresTripleTemplate: options.requiresTripleTemplate !== false,
      eventType: options.eventType || "structured_release",
      fieldLabels: options.fieldLabels || null,
      priority: options.priority ?? 100,
    },
  ];
}

function p(...parts) {
  return parts.filter(Boolean);
}

const CB_RATE_LABELS = {
  previous: "القرار السابق",
  forecast: "التوقع",
  actual: "القرار الحالي",
};

function centralBankRate(country, keySuffix, options = {}) {
  return releaseDef(country, keySuffix, {
    priority: options.priority ?? 1,
    patterns: options.patterns,
    eventType: "rate_decision",
    fieldLabels: CB_RATE_LABELS,
    arabicName: options.arabicName,
  });
}

const US_INFLATION = Object.fromEntries([
  releaseDef("US", "CPI_MOM", {
    priority: 10,
    patterns: p(
      /(?<!core )\bcpi\b[\s\S]*\b(m\/m|mom|month[- ]over[- ]month|monthly)\b/i,
      /consumer price index(?![\s\S]*\bcore\b)[\s\S]*\b(m\/m|mom|monthly)\b/i
    ),
    calendarPatterns: [/cpi\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر التضخم الأمريكي (شهري)",
  }),
  releaseDef("US", "CPI_YOY", {
    priority: 10,
    patterns: p(
      /(?<!core )\bcpi\b[\s\S]*\b(y\/y|yoy|year[- ]over[- ]year|annual)\b/i,
      /consumer price index(?![\s\S]*\bcore\b)[\s\S]*\b(y\/y|yoy|annual)\b/i
    ),
    calendarPatterns: [/cpi\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر التضخم الأمريكي (سنوي)",
  }),
  releaseDef("US", "CORE_CPI_MOM", {
    priority: 9,
    patterns: [/\bcore cpi\b[\s\S]*\b(m\/m|mom|monthly)\b/i],
    calendarPatterns: [/core cpi\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر التضخم الأساسي الأمريكي (شهري)",
  }),
  releaseDef("US", "CORE_CPI_YOY", {
    priority: 9,
    patterns: [/\bcore cpi\b[\s\S]*\b(y\/y|yoy|annual)\b/i],
    calendarPatterns: [/core cpi\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر التضخم الأساسي الأمريكي (سنوي)",
  }),
  releaseDef("US", "PPI_MOM", {
    priority: 11,
    patterns: [/\bppi\b(?![\s\S]*\bcore\b)[\s\S]*\b(m\/m|mom|monthly)\b/i],
    calendarPatterns: [/ppi\s*\(\s*m\/m\s*\)/i],
    arabicName: "مؤشر أسعار المنتجين (شهري)",
  }),
  releaseDef("US", "PPI_YOY", {
    priority: 11,
    patterns: [/\bppi\b(?![\s\S]*\bcore\b)[\s\S]*\b(y\/y|yoy|annual)\b/i],
    calendarPatterns: [/ppi\s*\(\s*y\/y\s*\)/i],
    arabicName: "مؤشر أسعار المنتجين (سنوي)",
  }),
  releaseDef("US", "CORE_PPI", {
    priority: 8,
    patterns: [/\bcore ppi\b|producer price index.*core/i, /أسعار المنتجين الأساس/i, /مؤشر أسعار المنتجين الأساس/i],
    arabicName: "مؤشر أسعار المنتجين الأساسي الأمريكي",
  }),
  releaseDef("US", "PPI", {
    priority: 50,
    patterns: [/\bppi\b|producer price index/i],
    arabicName: "مؤشر أسعار المنتجين الأمريكي",
  }),
  releaseDef("US", "CORE_PCE_MOM", {
    priority: 9,
    patterns: [/\bcore pce\b[\s\S]*\b(m\/m|mom|monthly)\b/i],
    arabicName: "مؤشر PCE الأساسي (شهري)",
  }),
  releaseDef("US", "CORE_PCE_YOY", {
    priority: 9,
    patterns: [/\bcore pce\b[\s\S]*\b(y\/y|yoy|annual)\b/i],
    arabicName: "مؤشر PCE الأساسي (سنوي)",
  }),
  releaseDef("US", "PCE", {
    priority: 20,
    patterns: [
      /\bpce\b|personal consumption expenditures/i,
      /مؤشر\s*أسعار\s*نفقات\s*(?:ال)?(?:إ|ا)ستهلاك\s*الشخصي/i,
      /(?:مؤشر\s*)?نفقات\s*(?:ال)?(?:إ|ا)ستهلاك\s*الشخصي/i,
    ],
    arabicName: "مؤشر PCE الأمريكي",
  }),
]);

const US_LABOR = Object.fromEntries([
  releaseDef("US", "NFP", {
    priority: 5,
    patterns: [/\bnfp\b|nonfarm payrolls|non-farm payrolls|payrolls change/i],
    arabicName: "تقرير الوظائف الأمريكية NFP",
  }),
  releaseDef("US", "UNEMPLOYMENT_RATE", {
    priority: 6,
    patterns: [/unemployment rate|معدل البطالة/i],
    arabicName: "معدل البطالة الأمريكي",
  }),
  releaseDef("US", "AVERAGE_HOURLY_EARNINGS", {
    priority: 7,
    patterns: [/average hourly earnings|average earnings|hourly earnings|متوسط الأجور|متوسط الأجر/i],
    arabicName: "متوسط الأجور بالساعة الأمريكي",
  }),
  releaseDef("US", "ADP_EMPLOYMENT", {
    priority: 8,
    patterns: [/\badp\b|adp employment|adp nonfarm|adp payroll|وظائف adp|تقرير adp|وظائف القطاع الخاص/i],
    arabicName: "تقرير ADP للوظائف",
  }),
  releaseDef("US", "JOLTS_JOB_OPENINGS", {
    priority: 8,
    patterns: [/\bjolts\b|job openings|فرص العمل|الوظائف الشاغرة/i],
    arabicName: "فرص العمل JOLTS",
  }),
  releaseDef("US", "CONTINUING_JOBLESS_CLAIMS", {
    priority: 4,
    patterns: [/continuing jobless claims|continued claims|continuing claims|طلبات إعانة البطالة المستمرة|المطالبات المستمرة/i],
    arabicName: "طلبات إعانة البطالة المستمرة",
  }),
  releaseDef("US", "INITIAL_JOBLESS_CLAIMS", {
    priority: 4,
    patterns: [/initial jobless claims|initial claims|(?<!continuing )jobless claims|unemployment claims|مطالبات البطالة|طلبات إعانة البطالة|طلبات البطالة|الشكاوى من البطالة/i],
    arabicName: "طلبات إعانة البطالة الأمريكية",
  }),
]);

const US_GROWTH = Object.fromEntries([
  releaseDef("US", "GDP_QOQ", {
    priority: 10,
    patterns: [
      /\bgdp\b[\s\S]*\b(q\/q|qoq|quarter|advance|prelim|final)\b/i,
      /gross domestic product/i,
      /الناتج\s*(?:الإجمالي\s*)?المحلي(?:\s*الإجمالي)?(?:\s*الأمريكي)?/i,
      /الناتج\s*المحلي\s*الإجمالي(?:\s*الأمريكي)?/i,
    ],
    arabicName: "الناتج المحلي الإجمالي الأمريكي",
  }),
  releaseDef("US", "RETAIL_SALES", {
    priority: 12,
    patterns: [/retail sales|مبيعات التجزئة(?!.*أساس)/i],
    arabicName: "مبيعات التجزئة الأمريكية",
  }),
  releaseDef("US", "CORE_RETAIL_SALES", {
    priority: 11,
    patterns: [/core retail sales|retail sales ex autos|retail sales excluding autos|مبيعات التجزئة الأساس/i],
    arabicName: "مبيعات التجزئة الأساسية الأمريكية",
  }),
  releaseDef("US", "CONSUMER_CONFIDENCE", {
    priority: 15,
    patterns: [/consumer confidence|cb consumer confidence|conference board consumer confidence|ثقة المستهلك(?!.*ميش)/i],
    arabicName: "مؤشر ثقة المستهلك الأمريكي",
  }),
  releaseDef("US", "MICHIGAN_SENTIMENT", {
    priority: 14,
    patterns: [/michigan consumer sentiment|michigan sentiment|umich sentiment|ثقة ميشيغان|معنويات المستهلك في ميشيغان/i],
    arabicName: "مؤشر معنويات ميشيغان",
  }),
  releaseDef("US", "DURABLE_GOODS", {
    priority: 18,
    patterns: [/durable goods orders|durable goods(?!.*core)|السلع المعمرة/i],
    arabicName: "طلبيات السلع المعمرة",
  }),
  releaseDef("US", "CORE_DURABLE_GOODS", {
    priority: 17,
    patterns: [/core durable goods|durable goods ex transportation|السلع المعمرة الأساس/i],
    arabicName: "طلبيات السلع المعمرة الأساسية",
  }),
  releaseDef("US", "FACTORY_ORDERS", {
    priority: 18,
    patterns: [/factory orders|طلبيات المصانع/i],
    arabicName: "طلبيات المصانع الأمريكية",
  }),
  releaseDef("US", "INDUSTRIAL_PRODUCTION", {
    priority: 16,
    patterns: [/industrial production|الإنتاج الصناعي/i],
    arabicName: "الإنتاج الصناعي الأمريكي",
  }),
  releaseDef("US", "CAPACITY_UTILIZATION", {
    priority: 16,
    patterns: [/capacity utilization|استغلال الطاقة|الطاقة الإنتاجية/i],
    arabicName: "استغلال الطاقة الإنتاجية",
  }),
  releaseDef("US", "HOUSING_STARTS", {
    priority: 20,
    patterns: [/housing starts|بدايات الإسكان/i],
    arabicName: "بدايات الإسكان الأمريكية",
  }),
  releaseDef("US", "BUILDING_PERMITS", {
    priority: 20,
    patterns: [/building permits|تراخيص البناء/i],
    arabicName: "تراخيص البناء الأمريكية",
  }),
  releaseDef("US", "EXISTING_HOME_SALES", {
    priority: 20,
    patterns: [/existing home sales|existing-home sales|مبيعات المنازل القائمة/i],
    arabicName: "مبيعات المنازل القائمة",
  }),
  releaseDef("US", "NEW_HOME_SALES", {
    priority: 20,
    patterns: [/new home sales|new-home sales|مبيعات المنازل الجديدة/i],
    arabicName: "مبيعات المنازل الجديدة",
  }),
  releaseDef("US", "PENDING_HOME_SALES", {
    priority: 20,
    patterns: [/pending home sales|مبيعات المنازل المعلقة/i],
    arabicName: "مبيعات المنازل المعلقة",
  }),
  releaseDef("US", "TRADE_BALANCE", {
    priority: 22,
    patterns: [/trade balance|الميزان التجاري/i],
    arabicName: "الميزان التجاري الأمريكي",
  }),
  releaseDef("US", "CURRENT_ACCOUNT", {
    priority: 22,
    patterns: [/current account|الحساب الجاري/i],
    arabicName: "الحساب الجاري الأمريكي",
  }),
]);

const US_EIA_INVENTORIES = Object.fromEntries([
  releaseDef("US", "EIA_CUSHING_CRUDE_INVENTORIES", {
    priority: 6,
    patterns: p(
      /cushing\s+crude\s+oil\s+inventor(?:y|ies)/i,
      /cushing\s+inventor(?:y|ies)/i,
      /eia\s+cushing/i,
      /مخزون\s*كوشينغ(?:\s*النفط\s*الخام)?/i
    ),
    arabicName: "مخزون النفط الخام في كوشينغ",
  }),
  releaseDef("US", "EIA_CRUDE_OIL_INVENTORIES", {
    priority: 7,
    patterns: p(
      /(?:us\s+)?crude\s+oil\s+inventor(?:y|ies)/i,
      /eia\s+crude\s+oil\s+inventor(?:y|ies)/i,
      /crude\s+oil\s+inventor(?:y|ies)\s*(?:\(?(?:m|mb|barrels?)\)?)?/i,
      /مخزون(?:ات)?\s*النفط\s*الخام(?:\s*الأمريكي)?/i,
      /مخزون\s*النفط\s*الخام(?:\s*الأمريكي)?/i
    ),
    arabicName: "مخزون النفط الخام الأمريكي",
  }),
  releaseDef("US", "EIA_GASOLINE_INVENTORIES", {
    priority: 8,
    patterns: p(
      /gasoline\s+inventor(?:y|ies)/i,
      /gasoline\s+stocks/i,
      /eia\s+gasoline/i,
      /مخزون\s*البنزين(?:\s*الأمريكي)?/i
    ),
    arabicName: "مخزون البنزين الأمريكي",
  }),
  releaseDef("US", "EIA_DISTILLATE_INVENTORIES", {
    priority: 8,
    patterns: p(
      /distillate\s+inventor(?:y|ies)/i,
      /distillate\s+stocks/i,
      /eia\s+distillate/i,
      /مخزون\s*نواتج\s*التقطير(?:\s*الأمريكية)?/i
    ),
    arabicName: "مخزون نواتج التقطير الأمريكية",
  }),
]);

const US_PMI = Object.fromEntries([
  releaseDef("US", "ISM_MANUFACTURING", {
    priority: 3,
    patterns: [/\bism\b.*manufacturing|ism manufacturing pmi/i],
    arabicName: "مؤشر ISM للتصنيع",
  }),
  releaseDef("US", "ISM_NON_MANUFACTURING_PMI", {
    priority: 2,
    patterns: p(
      /\bism\b.*non[\s-]?manufacturing|non[\s-]?manufacturing.*\bism\b|ism non[\s-]?manufacturing pmi/i,
      /ism services pmi/i,
      /مديري\s*المشتريات(?:\s*في|\s*ل)?(?:ل)?(?:قطاع)?\s*غير\s*الصناعي/i,
      /(?:غير\s*الصناعي).*مديري\s*المشتريات/i,
      /معهد\s*إدارة\s*التوريدات.*(?:غير\s*الصناعي|مديري\s*المشتريات)/i,
      /مديري\s*المشتريات.*معهد\s*إدارة\s*التوريدات/i
    ),
    arabicName: "مؤشر مديري المشتريات للقطاع غير الصناعي (ISM)",
  }),
  releaseDef("US", "ISM_SERVICES", {
    priority: 3,
    patterns: [/\bism\b.*services|ism services pmi/i],
    arabicName: "مؤشر ISM للخدمات",
  }),
  releaseDef("US", "SP_GLOBAL_FLASH_MANUFACTURING_PMI", {
    priority: 2,
    patterns: [
      /s&p global.*(?:flash.*)?(?:us )?manufacturing|sp global.*(?:flash.*)?(?:us )?manufacturing/i,
      /flash manufacturing pmi|s&p global us manufacturing pmi/i,
    ],
    arabicName: "مؤشر S&P Global Flash للتصنيع",
  }),
  releaseDef("US", "SP_GLOBAL_FLASH_SERVICES_PMI", {
    priority: 2,
    patterns: [
      /s&p global.*(?:flash.*)?(?:us )?services|sp global.*(?:flash.*)?(?:us )?services/i,
      /flash services pmi|s&p global us services pmi/i,
    ],
    arabicName: "مؤشر S&P Global Flash للخدمات",
  }),
  releaseDef("US", "SP_GLOBAL_FINAL_MANUFACTURING_PMI", {
    priority: 2,
    patterns: [/final manufacturing pmi|s&p global.*final.*manufacturing/i],
    arabicName: "مؤشر S&P Global النهائي للتصنيع",
  }),
  releaseDef("US", "SP_GLOBAL_FINAL_SERVICES_PMI", {
    priority: 2,
    patterns: [/final services pmi|s&p global.*final.*services/i],
    arabicName: "مؤشر S&P Global النهائي للخدمات",
  }),
  releaseDef("US", "SP_GLOBAL_PMI", {
    priority: 4,
    patterns: [/s&p global.*composite|sp global.*composite|s&p global.*pmi|sp global.*pmi/i],
    arabicName: "مؤشر S&P Global PMI المركب",
  }),
  releaseDef("US", "PHILADELPHIA_FED_MANUFACTURING", {
    priority: 5,
    patterns: [/philadelphia fed|philly fed|مؤشر فيلادلفيا|فيلادلفيا/i],
    arabicName: "مؤشر فيلادلفيا للصناعات التحويلية",
  }),
  releaseDef("US", "EMPIRE_STATE_MANUFACTURING", {
    priority: 5,
    patterns: [/empire state manufacturing|empire state index|ny empire state|empire state/i],
    arabicName: "مؤشر Empire State للتصنيع",
  }),
  releaseDef("US", "MANUFACTURING_PMI", {
    priority: 40,
    patterns: [/(?<!ism )(?<!s&p global )(?<!sp global )manufacturing pmi(?![\s\S]*services)/i],
    arabicName: "مؤشر مديري المشتريات للتصنيع",
  }),
  releaseDef("US", "SERVICES_PMI", {
    priority: 40,
    patterns: [/(?<!ism )(?<!s&p global )(?<!sp global )services pmi/i],
    arabicName: "مؤشر مديري المشتريات للخدمات",
  }),
  releaseDef("US", "PMI", {
    priority: 99,
    patterns: [/\bpmi\b|purchasing managers/i, /مديري\s*المشتريات/i],
    arabicName: "مؤشر مديري المشتريات الأمريكي",
  }),
]);

const US_FED = Object.fromEntries([
  releaseDef("US", "FED_RATE_DECISION", {
    priority: 1,
    patterns: [/\bfomc\b|fed rate decision|federal reserve rate decision|interest rate decision|قرار الفائدة|قرار فائدة|\brate decision\b|\brate cut\b|\brate hike\b/i],
    eventType: "rate_decision",
    fieldLabels: { previous: "القرار السابق", forecast: "التوقع", actual: "القرار الحالي" },
    arabicName: "قرار الفائدة الأمريكية",
  }),
  releaseDef("US", "FOMC_MINUTES", {
    priority: 6,
    patterns: [/fomc minutes|fed minutes|minutes of the federal open market committee|محضر الفيدرالي|محضر الفومك|محضر اجتماع الاحتياطي/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "محضر اجتماع الفيدرالي",
  }),
  releaseDef("US", "POWELL_SPEECH", {
    priority: 8,
    patterns: [/powell.*speech|powell.*remarks|fed chair.*speech|press conference|مؤتمر صحفي|باول/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "تصريحات جيروم باول / المؤتمر الصحفي للفيدرالي",
  }),
  releaseDef("US", "FED_STATEMENT", {
    priority: 8,
    patterns: [/fomc statement|fed statement|بيان الفيدرالي/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "بيان الفيدرالي",
  }),
]);

function countryInflation(country, labelAr) {
  return Object.fromEntries([
    releaseDef(country, "CPI", { patterns: [/\bcpi\b|consumer price index|inflation|التضخم|أسعار المستهلك|مؤشر أسعار المستهلك/i], arabicName: `${labelAr} - التضخم` }),
    releaseDef(country, "CORE_CPI", { priority: 9, patterns: [/core cpi|core inflation|التضخم الأساس|أسعار المستهلك الأساس/i], arabicName: `${labelAr} - التضخم الأساسي` }),
  ]);
}

function countryPmi(country, labelAr) {
  return Object.fromEntries([
    releaseDef(country, "MANUFACTURING_PMI", {
      priority: 5,
      patterns: [/manufacturing pmi|flash manufacturing|مديري المشتريات الصناع|مديري المشتريات التصنيع/i],
      arabicName: `${labelAr} - PMI التصنيع`,
    }),
    releaseDef(country, "SERVICES_PMI", {
      priority: 5,
      patterns: [/services pmi|flash services|مديري المشتريات الخدم/i],
      arabicName: `${labelAr} - PMI الخدمات`,
    }),
    releaseDef(country, "COMPOSITE_PMI", {
      priority: 6,
      patterns: [/composite pmi|flash composite|pmi composite|مؤشر pmi المركب/i],
      arabicName: `${labelAr} - PMI المركب`,
    }),
  ]);
}

const UK = Object.fromEntries([
  ...Object.entries(countryInflation("UK", "بريطانيا")),
  releaseDef("UK", "GDP", { patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i], arabicName: "الناتج المحلي البريطاني" }),
  releaseDef("UK", "RETAIL_SALES", { patterns: [/retail sales|مبيعات التجزئة(?!.*أساس)/i], arabicName: "مبيعات التجزئة البريطانية" }),
  releaseDef("UK", "CORE_RETAIL_SALES", {
    priority: 9,
    patterns: [/core retail sales|retail sales ex fuel|مبيعات التجزئة الأساس|مؤشر مبيعات التجزئة الأساس/i],
    arabicName: "مبيعات التجزئة الأساسية البريطانية",
  }),
  releaseDef("UK", "UNEMPLOYMENT", { patterns: [/unemployment rate|unemployment change|معدل البطالة/i], arabicName: "معدل البطالة البريطاني" }),
  releaseDef("UK", "EMPLOYMENT_CHANGE", { patterns: [/employment change|claimant count|claimant change|التغير في الوظائف|التوظيف/i], arabicName: "تغير التوظيف البريطاني" }),
  releaseDef("UK", "AVERAGE_EARNINGS", { patterns: [/average earnings|average wage|متوسط الأجور/i], arabicName: "متوسط الأجور البريطاني" }),
  releaseDef("UK", "BOE_RATE_DECISION", {
    patterns: [/boe rate|bank of england rate|interest rate decision|قرار الفائدة|boe/i],
    eventType: "rate_decision",
    arabicName: "قرار فائدة بنك إngland",
  }),
  ...Object.entries(countryPmi("UK", "بريطانيا")),
]);

const EZ = Object.fromEntries([
  ...Object.entries(countryInflation("EZ", "منطقة اليورو")),
  releaseDef("EZ", "GDP", { patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i], arabicName: "الناتج المحلي لمنطقة اليورو" }),
  releaseDef("EZ", "UNEMPLOYMENT", {
    patterns: [/unemployment rate|unemployment change|معدل البطالة/i],
    arabicName: "معدل البطالة في منطقة اليورو",
  }),
  centralBankRate("EZ", "ECB_RATE_DECISION", {
    patterns: p(
      /ecb rate decision|ecb interest rate|european central bank rate|interest rate decision|european central bank|البنك المركزي الأوروبي|المركزي الأوروبي|قرار الفائدة الأوروبي/i,
      /قرار الفائدة|قرار فائدة|\brate decision\b|\brate cut\b|\brate hike\b/i
    ),
    arabicName: "قرار فائدة ECB",
  }),
  centralBankRate("EZ", "ECB_DEPOSIT_RATE", {
    priority: 2,
    patterns: [/deposit rate|deposit facility|سعر الإيداع|mfi interest rate.*deposit/i],
    arabicName: "سعر إيداع ECB",
  }),
  centralBankRate("EZ", "ECB_MAIN_REFINANCING_RATE", {
    priority: 2,
    patterns: [/main refinancing rate|refi rate|mro rate|سعر إعادة التمويل/i],
    arabicName: "سعر إعادة التمويل ECB",
  }),
  releaseDef("EZ", "ECB_MONETARY_POLICY_STATEMENT", {
    priority: 5,
    patterns: [/monetary policy statement|ecb statement|بيان السياسة النقدية|بيان ecb/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "بيان السياسة النقدية ECB",
  }),
  releaseDef("EZ", "LAGARDE_SPEECH", {
    priority: 6,
    patterns: [/lagarde|لاجارد|ecb press conference|مؤتمر صحفي ecb|christine lagarde/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "تصريحات لاجارد / مؤتمر ECB",
  }),
  ...Object.entries(countryPmi("EZ", "منطقة اليورو")),
]);

const CH = Object.fromEntries([
  ...Object.entries(countryInflation("CH", "سويسرا")),
  releaseDef("CH", "GDP", {
    patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i],
    arabicName: "الناتج المحلي السويسري",
  }),
  releaseDef("CH", "UNEMPLOYMENT", {
    patterns: [/unemployment rate|unemployment change|معدل البطالة/i],
    arabicName: "معدل البطالة السويسري",
  }),
  centralBankRate("CH", "SNB_RATE_DECISION", {
    patterns: p(
      /snb rate|swiss national bank rate|swiss central bank|interest rate decision|key rate decision/i,
      /قرار الفائدة السويسري|البنك الوطني السويسري|المركزي السويسري|swiss national bank|snb decision/i
    ),
    arabicName: "قرار فائدة SNB",
  }),
  releaseDef("CH", "SNB_MONETARY_POLICY_ASSESSMENT", {
    priority: 4,
    patterns: [/monetary policy assessment|snb assessment|تقييم السياسة النقدية|بيان snb/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "تقييم السياسة النقدية SNB",
  }),
  ...Object.entries(countryPmi("CH", "سويسرا")),
]);

const RU = Object.fromEntries([
  releaseDef("RU", "CPI", {
    patterns: [/\bcpi\b|consumer price index|inflation|التضخم|أسعار المستهلك|مؤشر أسعار المستهلك/i],
    arabicName: "مؤشر التضخم الروسي",
  }),
  releaseDef("RU", "GDP", {
    patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i],
    arabicName: "الناتج المحلي الروسي",
  }),
  releaseDef("RU", "UNEMPLOYMENT", {
    patterns: [/unemployment rate|unemployment change|معدل البطالة/i],
    arabicName: "معدل البطالة الروسي",
  }),
  centralBankRate("RU", "CBR_RATE_DECISION", {
    patterns: p(
      /cbr rate|bank of russia rate|key rate decision|interest rate decision|central bank of russia/i,
      /قرار الفائدة الروسي|البنك المركزي الروسي|بنك روسيا|المركزي الروسي|bank of russia/i
    ),
    arabicName: "قرار فائدة CBR",
  }),
  releaseDef("RU", "CBR_MONETARY_POLICY_STATEMENT", {
    priority: 4,
    patterns: [/monetary policy statement|cbr statement|بيان السياسة النقدية|بيان cbr/i],
    requiresTripleTemplate: false,
    eventType: "plain_news",
    arabicName: "بيان السياسة النقدية CBR",
  }),
  ...Object.entries(countryPmi("RU", "روسيا")),
]);

const CA = Object.fromEntries([
  ...Object.entries(countryInflation("CA", "كندا")),
  releaseDef("CA", "GDP", { patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i], arabicName: "الناتج المحلي الكندي" }),
  releaseDef("CA", "EMPLOYMENT_CHANGE", { patterns: [/employment change|net change in employment|التغير في الوظائف/i], arabicName: "تغير التوظيف الكندي" }),
  releaseDef("CA", "UNEMPLOYMENT", { patterns: [/unemployment rate|معدل البطالة/i], arabicName: "معدل البطالة الكندي" }),
  releaseDef("CA", "BOC_RATE_DECISION", {
    patterns: [/boc rate|bank of canada rate|interest rate decision|قرار الفائدة/i],
    eventType: "rate_decision",
    arabicName: "قرار فائدة بنك كندا",
  }),
  releaseDef("CA", "RETAIL_SALES", { patterns: [/retail sales|مبيعات التجزئة/i], arabicName: "مبيعات التجزئة الكندية" }),
]);

const AU = Object.fromEntries([
  releaseDef("AU", "CPI", { patterns: [/\bcpi\b|consumer price index|inflation|التضخم/i], arabicName: "مؤشر التضخم الأسترالي" }),
  releaseDef("AU", "GDP", { patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i], arabicName: "الناتج المحلي الأسترالي" }),
  releaseDef("AU", "EMPLOYMENT_CHANGE", { patterns: [/employment change|net change in employment|التغير في الوظائف/i], arabicName: "تغير التوظيف الأسترالي" }),
  releaseDef("AU", "UNEMPLOYMENT", { patterns: [/unemployment rate|معدل البطالة/i], arabicName: "معدل البطالة الأسترالي" }),
  releaseDef("AU", "RBA_RATE_DECISION", {
    patterns: [/rba rate|reserve bank of australia rate|interest rate decision|قرار الفائدة/i],
    eventType: "rate_decision",
    arabicName: "قرار فائدة RBA",
  }),
  releaseDef("AU", "RETAIL_SALES", { patterns: [/retail sales|مبيعات التجزئة/i], arabicName: "مبيعات التجزئة الأسترالية" }),
  ...Object.entries(countryPmi("AU", "أستراليا")),
]);

const JP = Object.fromEntries([
  ...Object.entries(countryInflation("JP", "اليابان")),
  releaseDef("JP", "GDP", { patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i], arabicName: "الناتج المحلي الياباني" }),
  releaseDef("JP", "BOJ_RATE_DECISION", {
    patterns: [/boj rate|bank of japan rate|interest rate decision|قرار الفائدة/i],
    eventType: "rate_decision",
    arabicName: "قرار فائدة BOJ",
  }),
  ...Object.entries(countryPmi("JP", "اليابان")),
]);

const CN = Object.fromEntries([
  releaseDef("CN", "CPI", { patterns: [/\bcpi\b|consumer price index|inflation|التضخم/i], arabicName: "مؤشر التضخم الصيني" }),
  releaseDef("CN", "PPI", { patterns: [/\bppi\b|producer price index|أسعار المنتجين/i], arabicName: "مؤشر أسعار المنتجين الصيني" }),
  releaseDef("CN", "GDP", { patterns: [/\bgdp\b|gross domestic product|الناتج المحلي/i], arabicName: "الناتج المحلي الصيني" }),
  releaseDef("CN", "INDUSTRIAL_PRODUCTION", { patterns: [/industrial production|الإنتاج الصناعي/i], arabicName: "الإنتاج الصناعي الصيني" }),
  releaseDef("CN", "RETAIL_SALES", { patterns: [/retail sales|مبيعات التجزئة/i], arabicName: "مبيعات التجزئة الصينية" }),
  ...Object.entries(countryPmi("CN", "الصين")),
]);

const GENERIC_CPI_FALLBACKS = {
  US: {
    patterns: [/\bcpi\b|consumer price index|مؤشر أسعار المستهلك|التضخم/i],
    calendarPatterns: [/\bcpi\b|consumer price index/i],
    arabicName: "مؤشر التضخم الأمريكي",
  },
  UK: {
    patterns: [/\bcpi\b|consumer price index|مؤشر أسعار المستهلك|التضخم/i],
    calendarPatterns: [/\bcpi\b|consumer price index/i],
    arabicName: "مؤشر التضخم البريطاني",
  },
  EZ: {
    patterns: [/\bcpi\b|consumer price index|مؤشر أسعار المستهلك|التضخم/i],
    calendarPatterns: [/\bcpi\b|consumer price index/i],
    arabicName: "مؤشر التضخم لمنطقة اليورo",
  },
  CH: {
    patterns: [/cpi|consumer price index|مؤشر أسعار المستهلك|التضخم/i],
    calendarPatterns: [/\bcpi\b|consumer price index/i],
    arabicName: "مؤشر التضخم السويسري",
  },
  RU: {
    patterns: [/cpi|consumer price index|مؤشر أسعار المستهلك|التضخm/i],
    calendarPatterns: [/\bcpi\b|consumer price index/i],
    arabicName: "مؤشر التضخm الروسي",
  },
};

const CANONICAL_EVENT_DEFINITIONS = {
  ...US_INFLATION,
  ...US_LABOR,
  ...US_GROWTH,
  ...US_EIA_INVENTORIES,
  ...US_PMI,
  ...US_FED,
  ...UK,
  ...EZ,
  ...CA,
  ...AU,
  ...JP,
  ...CN,
  ...CH,
  ...RU,
};

module.exports = {
  CANONICAL_EVENT_DEFINITIONS,
  GENERIC_CPI_FALLBACKS,
};
