const THOUSANDS_EVENT_PATTERN =
  /ADP|NFP|NONFARM|PAYROLL|JOBLESS|CLAIMS|JOLTS|EMPLOYMENT_CHANGE|NET_CHANGE_IN_EMPLOYMENT/i;

const PERCENT_OR_RATE_PATTERN = /RATE_DECISION|UNEMPLOYMENT_RATE|CPI|PPI|PCE|INFLATION|GDP|RETAIL|HOURLY_EARNINGS/i;

const INDEX_EVENT_PATTERN = /PMI|ISM|EMPIRE|PHILADELPHIA|CONFIDENCE|SENTIMENT/i;

function hasThousandsSuffix(value) {
  return /k$/i.test(String(value || "").trim());
}

function inferEventNumericScale(eventType, values = []) {
  const key = String(eventType || "");
  if (THOUSANDS_EVENT_PATTERN.test(key)) {
    return "thousands";
  }
  if (PERCENT_OR_RATE_PATTERN.test(key)) {
    return "percent_or_index";
  }
  if (INDEX_EVENT_PATTERN.test(key)) {
    return "index";
  }
  if (values.some((value) => hasThousandsSuffix(value))) {
    return "thousands";
  }
  return null;
}

function shouldInferThousandsMultiplier(raw, scale, peerValues = []) {
  if (scale !== "thousands") {
    return false;
  }
  if (hasThousandsSuffix(raw) || /m$/i.test(raw) || /b$/i.test(raw)) {
    return false;
  }
  if (/%/.test(raw)) {
    return false;
  }
  const peerHasK = peerValues.some((value) => hasThousandsSuffix(value));
  if (!peerHasK) {
    return false;
  }
  const cleaned = String(raw).replace(/[%,$,KkMmBb\s]/g, "");
  const number = Number(cleaned);
  if (Number.isNaN(number)) {
    return false;
  }
  return number > 0 && number < 10_000;
}

module.exports = {
  THOUSANDS_EVENT_PATTERN,
  inferEventNumericScale,
  hasThousandsSuffix,
  shouldInferThousandsMultiplier,
};
