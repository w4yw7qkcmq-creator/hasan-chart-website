/**
 * Narrow guard: Donald Trump must not be labeled "former US president" in current-context Arabic news.
 * Fail-safe: no rewrite when historical context is detected.
 */

const TRUMP = "\u062A\u0631\u0627\u0645\u0628";
const DONALD_TRUMP = `\u062F\u0648\u0646\u0627\u0644\u062F ${TRUMP}`;

const TRUMP_MENTION_PATTERN = new RegExp(
  `(?:${DONALD_TRUMP.replace(/ /g, "\\s*")}|Donald\\s*Trump|Donald\\s*${TRUMP}|${TRUMP}|Trump)`,
  "iu"
);

const HISTORICAL_CONTEXT_PATTERNS = [
  new RegExp(`\u0641\u064A\\s+\u0639\u0647\u062F\\s+${TRUMP}`, "u"),
  /\u062E\u0644\u0627\u0644\s+\u0631\u0626\u0627\u0633\u062A\u0647\s+\u0627\u0644\u0633\u0627\u0628\u0642\u0629/u,
  /\u062E\u0644\u0627\u0644\s+\u0648\u0644\u0627\u064A\u062A\u0647\s+\u0627\u0644\u0623\u0648\u0644\u0649/u,
  /\u062E\u0644\u0627\u0644\s+\u0648\u0644\u0627\u064A\u062A\u0647\s+\u0627\u0644\u0627\u0648\u0644\u0649/u,
  new RegExp(`\u0639\u0646\u062F\u0645\u0627\\s+\u0643\u0627\u0646\\s+${TRUMP}?\\s+\u0631\u0626\u064A\u0633`, "u"),
  new RegExp(`\u062D\u064A\u0646\\s+\u0643\u0627\u0646\\s+${TRUMP}?\\s+\u0631\u0626\u064A\u0633`, "u"),
  /\u0641\u064A\s+\u0639\u0627\u0645\s+20(?:1[6-9]|20|21|22|23)/u,
  /during\s+his\s+first\s+term/i,
  /during\s+his\s+presidency/i,
  /when\s+he\s+was\s+president/i,
  /then-president/i,
  /then\s+president/i,
  /his\s+previous\s+term/i,
  /first\s+term\s+as\s+president/i,
  /presidency\s+in\s+20(?:1[6-9]|20|21)/i,
];

const FORMER_US_PRES_NAMED = new RegExp(
  `\u0627\u0644\u0631\u0626\u064A\u0633\\s+\u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A\\s+\u0627\u0644\u0633\u0627\u0628\u0642\\s+${DONALD_TRUMP.replace(/ /g, "\\s*")}`,
  "giu"
);
const FORMER_PRES_NAMED = new RegExp(
  `\u0627\u0644\u0631\u0626\u064A\u0633\\s+\u0627\u0644\u0633\u0627\u0628\u0642\\s+${DONALD_TRUMP.replace(/ /g, "\\s*")}`,
  "giu"
);
const FORMER_US_PRES_TRUMP = new RegExp(
  `\u0627\u0644\u0631\u0626\u064A\u0633\\s+\u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A\\s+\u0627\u0644\u0633\u0627\u0628\u0642\\s+${TRUMP}`,
  "giu"
);
const FORMER_PRES_TRUMP = new RegExp(`\u0627\u0644\u0631\u0626\u064A\u0633\\s+\u0627\u0644\u0633\u0627\u0628\u0642\\s+${TRUMP}`, "giu");

const CURRENT_US_PRES_NAMED = `\u0627\u0644\u0631\u0626\u064A\u0633 \u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A ${DONALD_TRUMP}`;
const CURRENT_US_PRES_TRUMP = `\u0627\u0644\u0631\u0626\u064A\u0633 \u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A ${TRUMP}`;

function normalizeForGuard(text = "") {
  return String(text || "")
    .replace(/\u0640/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsTrump(text = "") {
  return TRUMP_MENTION_PATTERN.test(text);
}

function hasFormerPresidentArabicDescriptor(text = "") {
  const normalized = normalizeForGuard(text);
  if (!mentionsTrump(normalized)) {
    return false;
  }
  return (
    /\u0627\u0644\u0631\u0626\u064A\u0633\s+\u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A\s+\u0627\u0644\u0633\u0627\u0628\u0642/u.test(normalized) ||
    (/\u0627\u0644\u0631\u0626\u064A\u0633\s+\u0627\u0644\u0633\u0627\u0628\u0642/u.test(normalized) && mentionsTrump(normalized))
  );
}

function isHistoricalTrumpContext(combinedText = "") {
  const text = normalizeForGuard(combinedText);
  if (!text) {
    return false;
  }
  return HISTORICAL_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function isInsideDirectQuoteSegment(text = "", matchIndex = 0) {
  const before = String(text || "").slice(0, matchIndex);
  const openQuotes = (before.match(/[""«]/gu) || []).length;
  const closeQuotes = (before.match(/[""»]/gu) || []).length;
  return openQuotes > closeQuotes;
}

function applyTrumpFormerPresidentRepairs(arabicText = "") {
  let text = String(arabicText || "");
  let corrected = false;
  const repairs = [];

  const replacements = [
    { pattern: FORMER_US_PRES_NAMED, replacement: CURRENT_US_PRES_NAMED, code: "former_us_president_named" },
    { pattern: FORMER_PRES_NAMED, replacement: CURRENT_US_PRES_NAMED, code: "former_president_named" },
    { pattern: FORMER_US_PRES_TRUMP, replacement: CURRENT_US_PRES_TRUMP, code: "former_us_president_trump" },
    { pattern: FORMER_PRES_TRUMP, replacement: CURRENT_US_PRES_TRUMP, code: "former_president_trump" },
  ];

  for (const { pattern, replacement, code } of replacements) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      if (isInsideDirectQuoteSegment(text, match.index)) {
        match = pattern.exec(text);
        continue;
      }
      text = `${text.slice(0, match.index)}${replacement}${text.slice(match.index + match[0].length)}`;
      corrected = true;
      repairs.push(code);
      pattern.lastIndex = 0;
      match = pattern.exec(text);
    }
  }

  return { text, corrected, repairs };
}

/**
 * @param {{ arabicText?: string, sourceText?: string }} input
 */
function guardTrumpCurrentRole(input = {}) {
  const arabicText = String(input.arabicText || "");
  const sourceText = String(input.sourceText || "");
  const combined = normalizeForGuard(`${arabicText}\n${sourceText}`);

  if (!arabicText.trim()) {
    return { text: arabicText, changed: false, skipped: true, reason: "empty_arabic", repairs: [], issue: null };
  }

  if (!mentionsTrump(combined)) {
    return { text: arabicText, changed: false, skipped: true, reason: "no_trump_mention", repairs: [], issue: null };
  }

  if (!hasFormerPresidentArabicDescriptor(arabicText)) {
    return {
      text: arabicText,
      changed: false,
      skipped: true,
      reason: "no_former_president_descriptor",
      repairs: [],
      issue: null,
    };
  }

  if (isHistoricalTrumpContext(combined)) {
    return {
      text: arabicText,
      changed: false,
      skipped: true,
      reason: "historical_context",
      repairs: [],
      issue: null,
    };
  }

  const repaired = applyTrumpFormerPresidentRepairs(arabicText);
  if (!repaired.corrected) {
    return {
      text: arabicText,
      changed: false,
      skipped: true,
      reason: "fail_safe_no_confident_repair",
      repairs: [],
      issue: "OFFICEHOLDER_ROLE_MISMATCH",
    };
  }

  return {
    text: repaired.text,
    changed: true,
    skipped: false,
    reason: "current_context_repaired",
    repairs: repaired.repairs,
    issue: "OFFICEHOLDER_ROLE_MISMATCH",
  };
}

function applyTrumpOfficeholderGuardToEditorial(editorial = {}, sourceText = "") {
  const headlineResult = guardTrumpCurrentRole({
    arabicText: editorial.headline || "",
    sourceText,
  });
  const bodyResult = guardTrumpCurrentRole({
    arabicText: editorial.body || "",
    sourceText,
  });

  return {
    headline: headlineResult.text,
    body: bodyResult.text,
    changed: headlineResult.changed || bodyResult.changed,
    headlineGuard: headlineResult,
    bodyGuard: bodyResult,
  };
}

function applyTrumpOfficeholderGuardToMessage(message = "", sourceText = "") {
  return guardTrumpCurrentRole({ arabicText: message, sourceText });
}

module.exports = {
  TRUMP_MENTION_PATTERN,
  HISTORICAL_CONTEXT_PATTERNS,
  mentionsTrump,
  hasFormerPresidentArabicDescriptor,
  isHistoricalTrumpContext,
  guardTrumpCurrentRole,
  applyTrumpOfficeholderGuardToEditorial,
  applyTrumpOfficeholderGuardToMessage,
  DONALD_TRUMP,
  TRUMP,
};
