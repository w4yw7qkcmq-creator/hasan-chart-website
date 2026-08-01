const crypto = require("crypto");

function fingerprintCalendarHtml(html) {
  const sample = String(html || "")
    .replace(/\s+/g, " ")
    .slice(0, 12000);

  const markers = [
    /js-event-item/i.test(sample),
    /eventRowId_/i.test(sample),
    /<th[^>]*>\s*actual\s*<\/th>/i.test(sample),
    /<th[^>]*>\s*forecast\s*<\/th>/i.test(sample),
    /economic-calendar/i.test(sample),
  ];

  return crypto.createHash("sha256").update(`${markers.join("|")}|${sample.length}`).digest("hex").slice(0, 16);
}

function detectSchemaChange(previousFingerprint, nextFingerprint) {
  if (!previousFingerprint || !nextFingerprint) {
    return false;
  }
  return previousFingerprint !== nextFingerprint;
}

module.exports = {
  fingerprintCalendarHtml,
  detectSchemaChange,
};
