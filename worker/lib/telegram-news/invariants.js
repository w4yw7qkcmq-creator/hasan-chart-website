const { extractNumbers } = require("./fingerprint");

function collectProtectedNumbers(facts = {}) {
  const numbers = new Set();
  for (const value of [facts.previous, facts.forecast, facts.actual, facts.revisedPrevious]) {
    if (value != null && String(value).trim() !== "") {
      numbers.add(String(value).trim());
    }
  }
  for (const value of facts.numbers || facts.rawNumbers || []) {
    if (value != null && String(value).trim() !== "") {
      numbers.add(String(value).trim());
    }
  }
  extractNumbers(facts.factualSummary || "").forEach((n) => numbers.add(n));
  return [...numbers];
}

function messageContainsProtectedNumber(message, number) {
  const normalized = String(number).trim();
  if (!normalized) {
    return true;
  }
  return String(message || "").includes(normalized);
}

function validateFinalMessageAgainstFacts(message, facts = {}) {
  if (!facts.isStructuredTriple) {
    return { ok: true, reason: null };
  }

  const protectedNumbers = collectProtectedNumbers(facts);
  const missingNumbers = protectedNumbers.filter((num) => !messageContainsProtectedNumber(message, num));

  const fieldChecks = [
    ["previous", facts.previous],
    ["forecast", facts.forecast],
    ["actual", facts.actual],
  ];

  for (const [fieldName, expected] of fieldChecks) {
    if (!expected) {
      continue;
    }
    const label =
      fieldName === "previous" ? "السابق" : fieldName === "forecast" ? "المتوقع" : "الحالي";
    if (!String(message || "").includes(String(expected).trim())) {
      return {
        ok: false,
        reason: "FINAL_MESSAGE_FACT_MISMATCH",
        field: fieldName,
        detail: `${label} missing or changed`,
      };
    }
  }

  if (missingNumbers.length) {
    return {
      ok: false,
      reason: "FINAL_MESSAGE_FACT_MISMATCH",
      field: "numbers",
      detail: `Missing numbers: ${missingNumbers.join(", ")}`,
    };
  }

  if (facts.title && !String(message || "").includes(String(facts.title).slice(0, 12))) {
    // title may be reformulated — only block if all numbers present but title completely unrelated
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
};
