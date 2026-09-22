/**
 * Narrow guard: Kevin Warsh (current Fed Chair) and Jerome Powell (former Fed Chair) in current RSS news.
 */

const {
  FED_CHAIR_ID,
  JEROME_POWELL_ID,
  getOfficialById,
} = require("./external-news-editor/entity-registry");
const {
  personMentionedInText,
  isHistoricalFedLeadershipContext,
  sourceSaysFedChairPhrase,
  sourceSaysFormerFedChair,
} = require("./external-news-editor/structured-facts");

const WARSH = getOfficialById(FED_CHAIR_ID);
const POWELL = getOfficialById(JEROME_POWELL_ID);

const WARSH_AR = /(?:كيفن\s+)?(?:وارش|وورش)/u;
const POWELL_AR = /(?:جيروم\s+)?باول/u;

const HISTORICAL_MARKERS = [
  /\bin\s+20(?:1[0-9]|2[0-5])\b/i,
  /\u0641\u064A\s+\u0639\u0627\u0645\s+20(?:1[0-9]|2[0-5])/u,
  /when\s+(?:powell|warsh|jerome\s+powell|kevin\s+warsh)\s+was\s+(?:the\s+)?(?:fed\s+)?chair/i,
  /during\s+(?:powell|warsh|jerome\s+powell|kevin\s+warsh)['’]?s?\s+tenure\s+as\s+(?:fed\s+)?chair/i,
  /during\s+warsh['’]?s?\s+time\s+as\s+a\s+fed\s+governor/i,
  /former\s+fed\s+governor\s+kevin\s+warsh/i,
  /\u0639\u0646\u062F\u0645\u0627\s+\u0643\u0627\u0646\s+(?:باول|جيروم\s+باول|وارش|وورش|كيفن\s+(?:وارش|وورش))\s+\u0631\u0626\u064A\u0633/u,
  /خلال\s+(?:فترة|رئاسة|ولاية)/u,
];

function normalizeForGuard(text = "") {
  return String(text || "")
    .replace(/\u0640/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isInsideDirectQuoteSegment(text = "", matchIndex = 0) {
  const before = String(text || "").slice(0, matchIndex);
  const openQuotes = (before.match(/[""«]/gu) || []).length;
  const closeQuotes = (before.match(/[""»]/gu) || []).length;
  return openQuotes > closeQuotes;
}

function isHistoricalGuardContext(combinedText = "", official = null) {
  const text = normalizeForGuard(combinedText);
  if (HISTORICAL_MARKERS.some((pattern) => pattern.test(text))) {
    return true;
  }
  return isHistoricalFedLeadershipContext(text, official);
}

function sourceIndicatesPowellFormer(sourceText = "") {
  const text = String(sourceText || "");
  if (!personMentionedInText(text, POWELL)) {
    return false;
  }
  if (isHistoricalFedLeadershipContext(text, POWELL)) {
    return false;
  }
  if (sourceSaysFormerFedChair(text)) {
    return true;
  }
  if (sourceSaysFedChairPhrase(text) && personMentionedInText(text, POWELL)) {
    return false;
  }
  if (/former\s+.*powell/i.test(normalizeForGuard(text))) {
    return true;
  }
  return false;
}

function sourceIndicatesWarshCurrentChair(sourceText = "") {
  const text = String(sourceText || "");
  if (!personMentionedInText(text, WARSH)) {
    return false;
  }
  if (isHistoricalFedLeadershipContext(text, WARSH)) {
    return false;
  }
  if (/former\s+fed\s+governor/i.test(normalizeForGuard(text)) && personMentionedInText(text, WARSH)) {
    return false;
  }
  if (sourceSaysFormerFedChair(text) && personMentionedInText(text, WARSH)) {
    return false;
  }
  return sourceSaysFedChairPhrase(text) && personMentionedInText(text, WARSH);
}

function applyReplacements(text, replacements) {
  let output = String(text || "");
  let changed = false;
  const repairs = [];

  for (const { pattern, replacement, code } of replacements) {
    pattern.lastIndex = 0;
    let match = pattern.exec(output);
    while (match) {
      if (isInsideDirectQuoteSegment(output, match.index)) {
        match = pattern.exec(output);
        continue;
      }
      output = `${output.slice(0, match.index)}${replacement}${output.slice(match.index + match[0].length)}`;
      changed = true;
      repairs.push(code);
      pattern.lastIndex = 0;
      match = pattern.exec(output);
    }
  }

  return { text: output, changed, repairs };
}

function guardFedOfficeholderRoles(input = {}) {
  const arabicText = String(input.arabicText || "");
  const sourceText = String(input.sourceText || "");
  const combined = normalizeForGuard(`${arabicText}\n${sourceText}`);

  if (!arabicText.trim()) {
    return { text: arabicText, changed: false, skipped: true, reason: "empty_arabic", repairs: [], issue: null };
  }

  const mentionsWarsh = WARSH_AR.test(arabicText) || personMentionedInText(combined, WARSH);
  const mentionsPowell = POWELL_AR.test(arabicText) || personMentionedInText(combined, POWELL);

  if (!mentionsWarsh && !mentionsPowell) {
    return { text: arabicText, changed: false, skipped: true, reason: "no_fed_target", repairs: [], issue: null };
  }

  const replacements = [];

  if (mentionsWarsh && sourceIndicatesWarshCurrentChair(sourceText) && !isHistoricalGuardContext(combined, WARSH)) {
    replacements.push(
      {
        pattern: /رئيس\s+الاحتياطي\s+الفيدرالي\s+السابق\s+كيفن\s+(?:وارش|وورش)/giu,
        replacement: "رئيس الاحتياطي الفيدرالي كيفن وارش",
        code: "warsh_former_chair_removed_named",
      },
      {
        pattern: /رئيس\s+الاحتياطي\s+الفيدرالي\s+السابق\s+(?:وارش|وورش)/giu,
        replacement: "رئيس الاحتياطي الفيدرالي وارش",
        code: "warsh_former_chair_removed",
      },
      {
        pattern: /رئيس\s+السابق\s+للاحتياطي\s+الفيدرالي\s+كيفن\s+(?:وارش|وورش)/giu,
        replacement: "رئيس الاحتياطي الفيدرالي كيفن وارش",
        code: "warsh_alt_former_removed",
      }
    );
  }

  if (
    mentionsPowell &&
    sourceIndicatesPowellFormer(sourceText) &&
    !isHistoricalGuardContext(combined, POWELL)
  ) {
    replacements.push(
      {
        pattern: /(?<![\u0627\u0644])رئيس\s+الاحتياطي\s+الفيدرالي\s+(?:جيروم\s+)?باول/giu,
        replacement: "الرئيس السابق للاحتياطي الفيدرالي جيروم باول",
        code: "powell_current_chair_to_former_named",
      },
      {
        pattern: /(?<![\u0627\u0644])رئيس\s+الاحتياطي\s+الفيدرالي\s+باول/giu,
        replacement: "الرئيس السابق للاحتياطي الفيدرالي باول",
        code: "powell_current_chair_to_former",
      }
    );
  }

  if (!replacements.length) {
    return { text: arabicText, changed: false, skipped: true, reason: "no_applicable_repair", repairs: [], issue: null };
  }

  const repaired = applyReplacements(arabicText, replacements);
  return {
    text: repaired.text,
    changed: repaired.changed,
    skipped: !repaired.changed,
    reason: repaired.changed ? "fed_officeholder_repaired" : "fail_safe_no_confident_repair",
    repairs: repaired.repairs,
    issue: repaired.changed ? "FED_OFFICEHOLDER_ROLE_MISMATCH" : null,
  };
}

function applyFedOfficeholderGuardToEditorial(editorial = {}, sourceText = "") {
  const headlineResult = guardFedOfficeholderRoles({ arabicText: editorial.headline || "", sourceText });
  const bodyResult = guardFedOfficeholderRoles({ arabicText: editorial.body || "", sourceText });
  return {
    headline: headlineResult.text,
    body: bodyResult.text,
    changed: headlineResult.changed || bodyResult.changed,
    headlineGuard: headlineResult,
    bodyGuard: bodyResult,
  };
}

function applyFedOfficeholderGuardToMessage(message = "", sourceText = "") {
  return guardFedOfficeholderRoles({ arabicText: message, sourceText });
}

function applyRssOfficeholderGuardsToMessage(message = "", sourceText = "") {
  const { applyTrumpOfficeholderGuardToMessage } = require("./trump-officeholder-role-guard");
  let text = String(message || "");
  let changed = false;
  const repairs = [];

  const trump = applyTrumpOfficeholderGuardToMessage(text, sourceText);
  if (trump.changed) {
    text = trump.text;
    changed = true;
    repairs.push(...(trump.repairs || []));
  }

  const fed = applyFedOfficeholderGuardToMessage(text, sourceText);
  if (fed.changed) {
    text = fed.text;
    changed = true;
    repairs.push(...(fed.repairs || []));
  }

  return { text, changed, repairs, trump, fed };
}

function applyRssOfficeholderGuardsToEditorial(editorial = {}, sourceText = "") {
  const headlineTrump = require("./trump-officeholder-role-guard").guardTrumpCurrentRole({
    arabicText: editorial.headline || "",
    sourceText,
  });
  const bodyTrump = require("./trump-officeholder-role-guard").guardTrumpCurrentRole({
    arabicText: editorial.body || "",
    sourceText,
  });
  let headline = headlineTrump.text;
  let body = bodyTrump.text;
  let changed = headlineTrump.changed || bodyTrump.changed;

  const fedHeadline = guardFedOfficeholderRoles({ arabicText: headline, sourceText });
  const fedBody = guardFedOfficeholderRoles({ arabicText: body, sourceText });
  headline = fedHeadline.text;
  body = fedBody.text;
  changed = changed || fedHeadline.changed || fedBody.changed;

  return { headline, body, changed };
}

module.exports = {
  guardFedOfficeholderRoles,
  applyFedOfficeholderGuardToEditorial,
  applyFedOfficeholderGuardToMessage,
  applyRssOfficeholderGuardsToMessage,
  applyRssOfficeholderGuardsToEditorial,
};
