function normalizeArabicIndicDigits(value) {
  return String(value || "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function normalizeTextForMatching(value) {
  return normalizeArabicIndicDigits(value)
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[^\p{L}\p{N}%./+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFingerprintText(value) {
  return normalizeTextForMatching(value);
}

function normalizeEconomicFieldValue(value) {
  return normalizeArabicIndicDigits(String(value || ""))
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .toLowerCase();
}

function extractLeadingEconomicNumericToken(value) {
  const raw = normalizeArabicIndicDigits(String(value || "")).trim();
  const match = raw.match(/^(-?\d+(?:[.,]\d+)?(?:[KMBkmb%]|%)?)/);
  if (match) {
    return normalizeEconomicFieldValue(match[1]);
  }
  return normalizeEconomicFieldValue(raw);
}

module.exports = {
  normalizeArabicIndicDigits,
  normalizeTextForMatching,
  normalizeFingerprintText,
  normalizeEconomicFieldValue,
  extractLeadingEconomicNumericToken,
};
