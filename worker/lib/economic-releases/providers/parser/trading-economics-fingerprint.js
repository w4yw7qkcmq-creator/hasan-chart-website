const crypto = require("crypto");

function fingerprintTradingEconomicsCalendarHtml(html) {
  const sample = String(html || "")
    .replace(/\s+/g, " ")
    .slice(0, 16000);

  const markers = [
    /calendar-table/i.test(sample),
    /<tr data-url="/i.test(sample),
    /<th[^>]*>\s*Actual\s*<\/th>/i.test(sample),
    /<th[^>]*>\s*Previous\s*<\/th>/i.test(sample),
    /Consensus/i.test(sample),
    /id=['"]consensus['"]/i.test(sample),
  ];

  return crypto.createHash("sha256").update(`${markers.join("|")}|${sample.length}`).digest("hex").slice(0, 16);
}

function detectTradingEconomicsSchemaChange(previousFingerprint, nextFingerprint) {
  if (!previousFingerprint || !nextFingerprint) {
    return false;
  }
  return previousFingerprint !== nextFingerprint;
}

module.exports = {
  fingerprintTradingEconomicsCalendarHtml,
  detectTradingEconomicsSchemaChange,
};
