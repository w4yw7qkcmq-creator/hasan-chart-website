function alias(...patterns) {
  return patterns;
}

const US_ALIASES = {
  US_CPI_MOM: alias(/\bcpi\b.*\b(m\/m|mom|monthly)\b/i, /consumer price index.*month/i),
  US_CPI_YOY: alias(/\bcpi\b.*\b(y\/y|yoy|annual)\b/i, /consumer price index.*year/i),
  US_CORE_CPI_MOM: alias(/\bcore cpi\b.*\b(m\/m|mom|monthly)\b/i),
  US_CORE_CPI_YOY: alias(/\bcore cpi\b.*\b(y\/y|yoy|annual)\b/i),
  US_PPI_MOM: alias(/\bppi\b.*\b(m\/m|mom|monthly)\b/i),
  US_PPI_YOY: alias(/\bppi\b.*\b(y\/y|yoy|annual)\b/i),
  US_CORE_PPI: alias(/\bcore ppi\b/i),
  US_PPI: alias(/\bppi\b|producer price index/i),
  US_CORE_PCE_MOM: alias(/\bcore pce\b/i),
  US_PCE: alias(/\bpce\b|personal consumption expenditures/i),
  US_NFP: alias(/\bnfp\b|nonfarm payrolls|non-farm payrolls/i),
  US_UNEMPLOYMENT_RATE: alias(/unemployment rate/i),
  US_AVERAGE_HOURLY_EARNINGS: alias(/average hourly earnings|hourly earnings/i),
  US_ADP_EMPLOYMENT: alias(/\badp\b|adp employment|adp nonfarm|adp payroll/i),
  US_JOLTS_JOB_OPENINGS: alias(/\bjolts\b|job openings/i),
  US_INITIAL_JOBLESS_CLAIMS: alias(
    /initial jobless claims/i,
    /initial claims/i,
    /(?<!continuing )jobless claims/i,
    /unemployment claims/i,
    /معدلات الشكاوى من البطالة/i,
    /مطالبات البطالة/i,
    /طلبات إعانة البطالة/i,
    /طلبات البطالة/i,
    /الشكاوى من البطالة/i,
    /إعانات البطالة/i
  ),
  US_CONTINUING_JOBLESS_CLAIMS: alias(
    /continuing jobless claims/i,
    /continued claims/i,
    /continuing claims/i,
    /طلبات إعانة البطالة المستمرة/i,
    /المطالبات المستمرة/i
  ),
  US_GDP_QOQ: alias(/\bgdp\b|gross domestic product/i),
  US_RETAIL_SALES: alias(/retail sales(?!.*core)/i),
  US_CORE_RETAIL_SALES: alias(/core retail sales|retail sales ex autos/i),
  US_CONSUMER_CONFIDENCE: alias(/consumer confidence(?!.*michigan)/i),
  US_MICHIGAN_SENTIMENT: alias(/michigan consumer sentiment|michigan sentiment|umich sentiment/i),
  US_DURABLE_GOODS: alias(/durable goods orders|durable goods(?!.*core)/i),
  US_CORE_DURABLE_GOODS: alias(/core durable goods|durable goods ex transportation/i),
  US_FACTORY_ORDERS: alias(/factory orders/i),
  US_INDUSTRIAL_PRODUCTION: alias(/industrial production/i),
  US_CAPACITY_UTILIZATION: alias(/capacity utilization/i),
  US_HOUSING_STARTS: alias(/housing starts/i),
  US_BUILDING_PERMITS: alias(/building permits/i),
  US_EXISTING_HOME_SALES: alias(/existing home sales|existing-home sales/i),
  US_NEW_HOME_SALES: alias(/new home sales|new-home sales/i),
  US_PENDING_HOME_SALES: alias(/pending home sales/i),
  US_TRADE_BALANCE: alias(/trade balance/i),
  US_CURRENT_ACCOUNT: alias(/current account/i),
  US_SP_GLOBAL_FLASH_MANUFACTURING_PMI: alias(
    /s&p global.*manufacturing|sp global.*manufacturing|flash manufacturing pmi/i,
    /مؤشر مديري المشتريات الصناعي/i,
    /مؤشر مديري المشتريات التصنيعي/i,
    /مديري المشتريات الصناعي/i,
    /مديري المشتريات التصنيعي/i,
    /مؤشر مديري المشتريات للقطاع الصناعي/i,
    /مؤشر مديري المشتريات للقطاع التصنيعي/i
  ),
  US_SP_GLOBAL_FLASH_SERVICES_PMI: alias(
    /s&p global.*services|sp global.*services|flash services pmi/i,
    /مؤشر مديري المشتريات الخدمي/i,
    /مؤشر مديري المشتريات للخدمات/i,
    /مديري المشتريات الخدمي/i,
    /مديري المشتريات الخدماتي/i,
    /مؤشر مديري المشتريات للقطاع الخدمي/i,
    /مؤشر مديري المشتريات لقطاع الخدمات/i
  ),
  US_SP_GLOBAL_FINAL_MANUFACTURING_PMI: alias(/final manufacturing pmi|s&p global.*final.*manufacturing/i),
  US_SP_GLOBAL_FINAL_SERVICES_PMI: alias(/final services pmi|s&p global.*final.*services/i),
  US_SP_GLOBAL_PMI: alias(/s&p global.*composite|sp global.*composite/i),
  US_PHILADELPHIA_FED_MANUFACTURING: alias(/philadelphia fed|philly fed|مؤشر فيلادelfia|فيلادelfia/i),
  US_EMPIRE_STATE_MANUFACTURING: alias(/empire state manufacturing|empire state index/i),
  US_FED_RATE_DECISION: alias(/\bfomc\b|fed rate decision|interest rate decision|rate decision/i),
  US_FOMC_MINUTES: alias(/fomc minutes|fed minutes/i),
  US_POWELL_SPEECH: alias(/powell.*speech|press conference/i),
  US_FED_STATEMENT: alias(/fomc statement|fed statement/i),
};

const UK_ALIASES = {
  UK_CPI: alias(/\bcpi\b|consumer price index|inflation/i),
  UK_CORE_CPI: alias(/core cpi|core inflation/i),
  UK_GDP: alias(/\bgdp\b|gross domestic product/i),
  UK_RETAIL_SALES: alias(/retail sales(?!.*core)/i),
  UK_CORE_RETAIL_SALES: alias(/core retail sales|retail sales ex fuel|مؤشر مبيعات التجزئة الأساس/i, /مبيعات التجزئة الأساس/i),
  UK_UNEMPLOYMENT: alias(/unemployment rate|unemployment change/i),
  UK_EMPLOYMENT_CHANGE: alias(/employment change|claimant count/i),
  UK_AVERAGE_EARNINGS: alias(/average earnings|average wage/i),
  UK_BOE_RATE_DECISION: alias(/boe rate|bank of england rate/i),
  UK_MANUFACTURING_PMI: alias(/manufacturing pmi/i),
  UK_SERVICES_PMI: alias(/services pmi/i),
  UK_COMPOSITE_PMI: alias(/composite pmi/i),
};

const EZ_ALIASES = {
  EZ_CPI: alias(/\bcpi\b|inflation|hicp|التضخم/i),
  EZ_CORE_CPI: alias(/core cpi|core inflation|hicp ex|underlying inflation/i),
  EZ_GDP: alias(/\bgdp\b|gross domestic product|الناتج المحلي/i),
  EZ_UNEMPLOYMENT: alias(/unemployment rate|unemployment change|معدل البطالة/i),
  EZ_ECB_RATE_DECISION: alias(
    /ecb rate|european central bank rate|interest rate decision|قرار الفائدة|قرار ecb|البنك المركزي الأوروبي|المركزي الأوروبي/i
  ),
  EZ_ECB_DEPOSIT_RATE: alias(/deposit rate|deposit facility|سعر الإيداع/i),
  EZ_ECB_MAIN_REFINANCING_RATE: alias(/main refinancing rate|refi rate|mro/i),
  EZ_ECB_MONETARY_POLICY_STATEMENT: alias(/monetary policy statement|ecb statement|بيان السياسة/i),
  EZ_LAGARDE_SPEECH: alias(/lagarde|لاجارد|ecb press conference|مؤتمر صحفي/i),
  EZ_MANUFACTURING_PMI: alias(/manufacturing pmi|flash manufacturing/i),
  EZ_SERVICES_PMI: alias(/services pmi|flash services/i),
  EZ_COMPOSITE_PMI: alias(/composite pmi/i),
};

const CH_ALIASES = {
  CH_CPI: alias(/\bcpi\b|inflation|التضخم|أسعار المستهلك/i),
  CH_CORE_CPI: alias(/core cpi|core inflation|التضخم الأساس/i),
  CH_GDP: alias(/\bgdp\b|gross domestic product|الناتج المحلي/i),
  CH_UNEMPLOYMENT: alias(/unemployment rate|unemployment change|معدل البطالة/i),
  CH_SNB_RATE_DECISION: alias(
    /snb rate|swiss national bank rate|interest rate decision|قرار الفائدة|البنك الوطني السويسري|المركزي السويسري|swiss national bank/i
  ),
  CH_SNB_MONETARY_POLICY_ASSESSMENT: alias(/monetary policy assessment|snb assessment|تقييم السياسة/i),
  CH_MANUFACTURING_PMI: alias(/manufacturing pmi|flash manufacturing/i),
  CH_SERVICES_PMI: alias(/services pmi|flash services/i),
  CH_COMPOSITE_PMI: alias(/composite pmi/i),
};

const RU_ALIASES = {
  RU_CPI: alias(/\bcpi\b|inflation|التضخم|أسعار المستهلك/i),
  RU_GDP: alias(/\bgdp\b|gross domestic product|الناتج المحلي/i),
  RU_UNEMPLOYMENT: alias(/unemployment rate|unemployment change|معدل البطالة/i),
  RU_CBR_RATE_DECISION: alias(
    /cbr rate|bank of russia rate|key rate|interest rate decision|قرار الفائدة|البنك المركزي الروسي|بنك روسيا|bank of russia/i
  ),
  RU_CBR_MONETARY_POLICY_STATEMENT: alias(/monetary policy statement|cbr statement|بيان السياسة/i),
  RU_MANUFACTURING_PMI: alias(/manufacturing pmi|flash manufacturing/i),
  RU_SERVICES_PMI: alias(/services pmi|flash services/i),
  RU_COMPOSITE_PMI: alias(/composite pmi/i),
};

const CA_ALIASES = {
  CA_CPI: alias(/\bcpi\b|inflation/i),
  CA_CORE_CPI: alias(/core cpi|core inflation/i),
  CA_GDP: alias(/\bgdp\b|gross domestic product/i),
  CA_EMPLOYMENT_CHANGE: alias(/employment change|net change in employment/i),
  CA_UNEMPLOYMENT: alias(/unemployment rate/i),
  CA_BOC_RATE_DECISION: alias(/boc rate|bank of canada rate/i),
  CA_RETAIL_SALES: alias(/retail sales/i),
};

const AU_ALIASES = {
  AU_CPI: alias(/\bcpi\b|inflation/i),
  AU_GDP: alias(/\bgdp\b|gross domestic product/i),
  AU_EMPLOYMENT_CHANGE: alias(/employment change|net change in employment/i),
  AU_UNEMPLOYMENT: alias(/unemployment rate/i),
  AU_RBA_RATE_DECISION: alias(/rba rate|reserve bank of australia rate/i),
  AU_RETAIL_SALES: alias(/retail sales/i),
  AU_MANUFACTURING_PMI: alias(/manufacturing pmi/i),
  AU_SERVICES_PMI: alias(/services pmi/i),
};

const JP_ALIASES = {
  JP_CPI: alias(/\bcpi\b|inflation/i),
  JP_CORE_CPI: alias(/core cpi|core inflation/i),
  JP_GDP: alias(/\bgdp\b|gross domestic product/i),
  JP_BOJ_RATE_DECISION: alias(/boj rate|bank of japan rate/i),
  JP_MANUFACTURING_PMI: alias(/manufacturing pmi/i),
  JP_SERVICES_PMI: alias(/services pmi/i),
};

const CN_ALIASES = {
  CN_CPI: alias(/\bcpi\b|inflation/i),
  CN_PPI: alias(/\bppi\b|producer price index/i),
  CN_GDP: alias(/\bgdp\b|gross domestic product/i),
  CN_INDUSTRIAL_PRODUCTION: alias(/industrial production/i),
  CN_RETAIL_SALES: alias(/retail sales/i),
  CN_MANUFACTURING_PMI: alias(/manufacturing pmi|caixin manufacturing/i),
  CN_SERVICES_PMI: alias(/services pmi/i),
  CN_COMPOSITE_PMI: alias(/composite pmi/i),
};

const ARABIC_ALIASES = {
  ...US_ALIASES,
  ...UK_ALIASES,
  ...EZ_ALIASES,
  ...CH_ALIASES,
  ...RU_ALIASES,
  ...CA_ALIASES,
  ...AU_ALIASES,
  ...JP_ALIASES,
  ...CN_ALIASES,
};

module.exports = {
  ARABIC_ALIASES,
  US_ALIASES,
  UK_ALIASES,
  EZ_ALIASES,
  CH_ALIASES,
  RU_ALIASES,
  CA_ALIASES,
  AU_ALIASES,
  JP_ALIASES,
  CN_ALIASES,
};
