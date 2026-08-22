function normalizeArabicIndicDigits(value) {
  return String(value || "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function normalizeTextForMatching(value) {
  return normalizeArabicIndicDigits(value)
    .toLowerCase()
    .normalize("NFKC")
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

module.exports = {
  normalizeArabicIndicDigits,
  normalizeTextForMatching,
  normalizeFingerprintText,
  normalizeEconomicFieldValue,
};
