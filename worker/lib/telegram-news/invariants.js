const { extractNumbers } = require("./fingerprint");
const {
  extractLeadingEconomicNumericToken,
  normalizeEconomicFieldValue,
  stripBidiMarks,
  assertStrictNumericEconomicField,
} = require("../economic-releases/text-normalization");

function collectProtectedNumbers(facts = {}) {
  const numbers = new Set();
  for (const value of [facts.previous, facts.forecast, facts.actual, facts.revisedPrevious]) {
    if (value != null && String(value).trim() !== "") {
      const token = extractLeadingEconomicNumericToken(value);
      if (token) {
        numbers.add(token);
      }
    }
  }
  for (const value of facts.numbers || facts.rawNumbers || []) {
    if (value != null && String(value).trim() !== "") {
      const token = extractLeadingEconomicNumericToken(value);
      if (token) {
        numbers.add(token);
      }
    }
  }
  extractNumbers(facts.factualSummary || "").forEach((n) => numbers.add(normalizeEconomicFieldValue(n)));
  return [...numbers];
}

function messageContainsProtectedNumber(message, number) {
  const normalized = normalizeEconomicFieldValue(number);
  if (!normalized) {
    return true;
  }
  const bodyTokens = collectProtectedNumbers({ numbers: extractNumbers(message) });
  return bodyTokens.some((token) => token === normalized || token.includes(normalized) || normalized.includes(token));
}

function extractFieldNumericFromMessage(message, label) {
  const match = String(message || "").match(new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`, "i"));
  if (!match?.[1]) {
    return null;
  }
  return extractLeadingEconomicNumericToken(stripBidiMarks(match[1]));
}

function validateFinalMessageAgainstFacts(message, facts = {}) {
  if (!facts.isStructuredTriple) {
    return { ok: true, reason: null };
  }

  for (const field of ["previous", "forecast", "actual"]) {
    const expected = facts[field];
    if (!expected) {
      continue;
    }
    const strict = assertStrictNumericEconomicField(expected, field);
    if (!strict.ok) {
      return {
        ok: false,
        reason: "CONTAMINATED_ECONOMIC_FIELD",
        field,
        detail: `${field} fact is not numeric-only`,
      };
    }
  }

  const fieldChecks = [
    ["previous", facts.previous, "السابق"],
    ["forecast", facts.forecast, "المتوقع"],
    ["actual", facts.actual, "الحالي"],
  ];

  for (const [fieldName, expected, label] of fieldChecks) {
    if (!expected) {
      continue;
    }
    const expectedNorm = extractLeadingEconomicNumericToken(expected);
    const bodyNorm = extractFieldNumericFromMessage(message, label);
    if (bodyNorm && expectedNorm && bodyNorm !== expectedNorm) {
      return {
        ok: false,
        reason: "FINAL_MESSAGE_FACT_MISMATCH",
        field: fieldName,
        detail: `${label} numeric token mismatch`,
      };
    }
  }

  const protectedNumbers = collectProtectedNumbers(facts);
  const missingNumbers = protectedNumbers.filter((num) => !messageContainsProtectedNumber(message, num));

  if (missingNumbers.length) {
    return {
      ok: false,
      reason: "FINAL_MESSAGE_FACT_MISMATCH",
      field: "numbers",
      detail: `Missing numbers: ${missingNumbers.join(", ")}`,
    };
  }

  return { ok: true, reason: null };
}

function validateAiOutputAgainstFacts(aiOutput, facts = {}) {
  const combined = `${aiOutput?.title || ""}\n${aiOutput?.impactParagraph || ""}`;
  return validateFinalMessageAgainstFacts(combined, facts);
}

module.exports = {
  collectProtectedNumbers,
  validateFinalMessageAgainstFacts,
  validateAiOutputAgainstFacts,
  extractFieldNumericFromMessage,
};
