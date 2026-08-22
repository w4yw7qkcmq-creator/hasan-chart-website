function resolveVisualCategory(eventKey = "") {
  const key = String(eventKey || "").trim().toUpperCase();
  if (/FED|FOMC|POWELL|ECB|BOE|BOJ|BOC|RBA/.test(key)) {
    return "fed";
  }
  if (/CPI|PPI|PCE|INFLATION/.test(key)) {
    return "inflation";
  }
  if (/NFP|UNEMPLOYMENT|JOBLESS|ADP|JOLTS|EMPLOYMENT|CLAIMS|EARNINGS/.test(key)) {
    return "labor";
  }
  if (/GDP|RETAIL|PCE|TRADE|INDUSTRIAL|CAPACITY|DURABLE|FACTORY|HOUSING|HOME/.test(key)) {
    return "growth";
  }
  if (/PMI|ISM|EMPIRE|PHILADELPHIA/.test(key)) {
    return "pmi";
  }
  return "growth";
}

module.exports = {
  resolveVisualCategory,
};
