const EVERGREEN_PATTERN =
  /how to|what is|what are|explainer|beginner'?s guide|guide to investing|history of|evergreen|primer on|things to know before|ways to|tips for|should you|why you should/i;

const PRODUCT_LIFESTYLE_PATTERN =
  /cheap macbook|budget laptop|sparked a war in budget|product review|consumer gadget|lifestyle|cheap .* laptop|macbook neo|best laptops|gift guide|holiday gift|my ex-husband|social security|student loan|condo with a mortgage|executor|inheritance|retirement planning tips|tim cook'?s lasting legacy(?!.*earnings)|why every tech giant wants to look like|worth streaming|what'?s worth streaming|streaming in august|netflix.*hulu|movie review|tv show|celebrity gossip/i;

const NEW_DEVELOPMENT_PATTERN =
  /today|just in|just announced|latest|new data|new report|rises|falls|surge|drop|jumps|plunge|announces|reports|beats|misses|raises|cuts|approves|warns|escalates|reacts|jumps \d|falls \d|\+?\d+(?:\.\d+)?%/i;

function classifyNewsCategory(text = "") {
  const value = String(text || "").toLowerCase();

  if (EVERGREEN_PATTERN.test(value)) {
    return "evergreen";
  }

  if (PRODUCT_LIFESTYLE_PATTERN.test(value)) {
    return "product_lifestyle";
  }

  if (/earnings|eps|revenue|guidance|quarterly results|profit warning|after-hours results/i.test(value)) {
    return "earnings";
  }

  if (
    /powell|fomc|fed'?s|fed official|central bank|ecb|boe|lagarde|rate decision|treasury secretary|barkin|warsh|kashkari/i.test(
      value
    ) &&
    /says|said|comments|remarks|speech|signals|warns|proposes/i.test(value)
  ) {
    return "central_bank_commentary";
  }

  if (/breaking|just in|urgent|developing story/i.test(value)) {
    return "breaking";
  }

  if (/analysis|commentary|op-ed|opinion|outlook|what to watch|preview|technical analysis|close-up look|on pace for a record/i.test(value)) {
    if (NEW_DEVELOPMENT_PATTERN.test(value)) {
      return "analysis_with_new_development";
    }
    return "opinion";
  }

  if (
    /goldman|jpmorgan|morgan stanley|bank of america|blackrock|citigroup|berkshire|institutional|supply chain|record revenue|record profit|trading revenue|investment banking/i.test(
      value
    ) &&
    /earnings|revenue|profit|deal|merger|ipo|market share|record|beats|misses|guidance/i.test(value)
  ) {
    return "corporate_institutional";
  }

  if (/gold|oil|bitcoin|crypto|nasdaq|dow|s&p|stocks|market|forex|treasury yields|dollar index/i.test(value)) {
    return "market_move";
  }

  return "market_move";
}

function getScoreThreshold(category, impactLevel = "MEDIUM") {
  switch (category) {
    case "evergreen":
    case "product_lifestyle":
      return Infinity;
    case "opinion":
      return 55;
    case "earnings":
    case "corporate_institutional":
      return 40;
    case "breaking":
    case "market_move":
    case "central_bank_commentary":
    case "analysis_with_new_development":
      return impactLevel === "HIGH" ? 45 : 45;
    default:
      return 45;
  }
}

function getAgeBucketForCategory(category) {
  switch (category) {
    case "breaking":
      return "breaking";
    case "market_move":
      return "market_move";
    case "central_bank_commentary":
      return "central_bank_commentary";
    case "earnings":
    case "corporate_institutional":
      return "earnings";
    case "analysis_with_new_development":
      return "analysis_with_new_development";
    default:
      return "market_move";
  }
}

module.exports = {
  classifyNewsCategory,
  getScoreThreshold,
  getAgeBucketForCategory,
  NEW_DEVELOPMENT_PATTERN,
};
