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
    .replace(/−/g, "-")
    .toLowerCase();
}

/** Strip bidi / LTR marks used in formatted Telegram output. */
function stripBidiMarks(value) {
  return String(value || "").replace(/[\u2066-\u2069\u200E\u200F]/g, "").trim();
}

/**
 * Approved strict economic numeric grammar (full string must match after cleanup).
 * Supports: 2.65%, %2.65, 54.2, 162K, 23K-, -4.450M, 0.095M, 4.1%, -0.2%, 1.2B
 */
const STRICT_ECONOMIC_NUMERIC_PATTERN =
  /^[-−]?(?:\d+(?:[.,]\d+)?(?:[KMBkmb])?(?:%|-)?|%\d+(?:[.,]\d+)?)$/;

function formatStrictEconomicDisplay(token) {
  if (!token) {
    return null;
  }
  let value = stripBidiMarks(normalizeArabicIndicDigits(String(token).trim()));
  value = value.replace(/,/g, ".").replace(/−/g, "-");
  if (/^%/.test(value)) {
    value = `${value.slice(1)}%`;
  }
  return value;
}

function extractStrictEconomicNumericToken(value) {
  const raw = stripBidiMarks(normalizeArabicIndicDigits(String(value || ""))).trim();
  if (!raw) {
    return null;
  }

  const candidates = [
    raw.match(/^([-−]?\d+(?:[.,]\d+)?(?:[KMBkmb])?(?:%|-)?)/i)?.[1],
    raw.match(/^([-−]?\d+(?:[.,]\d+)?%)/)?.[1],
    raw.match(/^(%\d+(?:[.,]\d+)?)/)?.[1],
  ].filter(Boolean);

  for (const candidate of candidates) {
    const formatted = formatStrictEconomicDisplay(candidate);
    if (formatted && STRICT_ECONOMIC_NUMERIC_PATTERN.test(formatted.replace(/−/g, "-"))) {
      return formatted;
    }
  }

  return null;
}

function extractLeadingEconomicNumericToken(value) {
  const strict = extractStrictEconomicNumericToken(value);
  if (strict) {
    return normalizeEconomicFieldValue(strict);
  }
  const raw = normalizeArabicIndicDigits(String(value || "")).trim();
  const match = raw.match(/^(-?\d+(?:[.,]\d+)?(?:[KMBkmb%]|%)?)/);
  if (match) {
    return normalizeEconomicFieldValue(match[1]);
  }
  return normalizeEconomicFieldValue(raw);
}

function assertStrictNumericEconomicField(value, fieldName = "value", options = {}) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { ok: true, field: fieldName, display: null };
  }

  const raw = stripBidiMarks(String(value).trim());
  if (!/\d/.test(raw)) {
    return { ok: true, field: fieldName, display: raw, normalized: normalizeEconomicFieldValue(raw) };
  }
  const extracted = extractStrictEconomicNumericToken(raw);
  const normalizedRaw = normalizeEconomicFieldValue(raw);
  const normalizedExtracted = extracted ? normalizeEconomicFieldValue(extracted) : null;

  if (!extracted || normalizedRaw !== normalizedExtracted) {
    return {
      ok: false,
      reason: options.reason || "CONTAMINATED_ECONOMIC_FIELD",
      field: fieldName,
      preview: raw.slice(0, 80),
      sourceMessageId: options.sourceMessageId || null,
      canonicalEventId: options.canonicalEventId || null,
    };
  }

  return {
    ok: true,
    field: fieldName,
    display: extracted,
    normalized: normalizedExtracted,
  };
}

function validateStructuredNumericFacts(facts = {}, options = {}) {
  if (!facts.isStructuredTriple) {
    return { ok: true, reason: null, failures: [] };
  }

  const failures = [];
  for (const field of ["previous", "forecast", "actual"]) {
    const value = facts[field];
    if (value == null || String(value).trim() === "") {
      continue;
    }
    const check = assertStrictNumericEconomicField(value, field, {
      sourceMessageId: options.sourceMessageId || facts.sourceMessageId || null,
      canonicalEventId: options.canonicalEventId || facts.canonicalEventId || facts.canonicalEventKey || null,
    });
    if (!check.ok) {
      failures.push(check);
    }
  }

  if (failures.length) {
    return {
      ok: false,
      reason: failures[0].reason || "CONTAMINATED_ECONOMIC_FIELD",
      field: failures[0].field,
      failures,
      sourceMessageId: failures[0].sourceMessageId || null,
      canonicalEventId: failures[0].canonicalEventId || null,
    };
  }

  return { ok: true, reason: null, failures: [] };
}

module.exports = {
  normalizeArabicIndicDigits,
  normalizeTextForMatching,
  normalizeFingerprintText,
  normalizeEconomicFieldValue,
  stripBidiMarks,
  extractLeadingEconomicNumericToken,
  extractStrictEconomicNumericToken,
  formatStrictEconomicDisplay,
  assertStrictNumericEconomicField,
  validateStructuredNumericFacts,
  STRICT_ECONOMIC_NUMERIC_PATTERN,
};
