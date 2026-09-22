const {
  matchOfficialInText,
  getFedChairOfficial,
  normalizeLookup,
  FED_CHAIR_ID,
  JEROME_POWELL_ID,
} = require("./entity-registry");
const { extractNumericTokens } = require("./numeric-utils");
const {
  extractQuoteSegments,
  extractAttributionSegments,
  UNCERTAINTY_PATTERNS,
} = require("./source-evidence");

function personMentionedInText(text = "", official = null) {
  if (!official) return false;
  const normalized = normalizeLookup(text);
  const needles = [...official.names, ...official.arabicNames, official.canonicalName]
    .map((entry) => normalizeLookup(entry))
    .filter((entry) => entry.length >= 3);
  return needles.some((needle) => normalized.includes(needle));
}

function sourceSaysFedChairPhrase(text = "") {
  const normalized = normalizeLookup(text);
  return (
    /fed chair|federal reserve chair|fomc chair|chair of the federal reserve/.test(normalized) ||
    /رئيس الاحتياطي الفيدرالي/u.test(text)
  );
}

function sourceSaysFormerFedChair(text = "") {
  const normalized = normalizeLookup(text);
  return /former\s+(?:fed\s+)?(?:chair|federal reserve chair)|former\s+federal\s+reserve\s+chair/.test(
    normalized
  );
}

function sourceSaysFormerFedGovernor(text = "") {
  return /former\s+fed\s+governor/i.test(normalizeLookup(text));
}

function sourceSaysRegionalFedPresident(text = "", official = null) {
  const normalized = normalizeLookup(text);
  if (
    /minneapolis fed president|president of the minneapolis fed|minneapolis fed president/.test(
      normalized
    ) &&
    official?.id === "NEEL_KASHKARI"
  ) {
    return true;
  }
  if (!official?.regionalBank) return false;
  const bank = normalizeLookup(official.regionalBank);
  return (
    new RegExp(`${bank.replace(/\s+/g, "\\s+")}\\s+president`).test(normalized) ||
    new RegExp(`president of the ${bank.replace(/\s+/g, "\\s+")}`).test(normalized)
  );
}

function sourceSaysFedGovernor(text = "") {
  return /\bfederal reserve governor\b|\bfed governor\b/i.test(normalizeLookup(text));
}

function sourceSaysFedViceChair(text = "") {
  return /\bfederal reserve vice chair\b|\bvice chair for supervision\b|\bfed vice chair\b/i.test(
    normalizeLookup(text)
  );
}

function isHistoricalFedLeadershipContext(text = "", official = null) {
  const normalized = normalizeLookup(text);
  if (/\bin\s+20(?:1[0-9]|2[0-5])\b/i.test(text) || /\u0641\u064A\s+\u0639\u0627\u0645\s+20(?:1[0-9]|2[0-5])/u.test(text)) {
    return true;
  }
  if (/when\s+(?:powell|warsh|jerome\s+powell|kevin\s+warsh)\s+was\s+(?:the\s+)?(?:fed\s+)?chair/i.test(normalized)) {
    return true;
  }
  if (/during\s+(?:powell|warsh|jerome\s+powell|kevin\s+warsh)['’]?s?\s+tenure\s+as\s+(?:fed\s+)?chair/i.test(normalized)) {
    return true;
  }
  if (
    official?.id === JEROME_POWELL_ID &&
    /\bin\s+2024\b/i.test(text) &&
    sourceSaysFedChairPhrase(text) &&
    personMentionedInText(text, official)
  ) {
    return true;
  }
  if (
    official?.id === FED_CHAIR_ID &&
    sourceSaysFormerFedGovernor(text) &&
    personMentionedInText(text, official) &&
    /\bin\s+20(?:1[0-9]|2[0-2])\b/i.test(text)
  ) {
    return true;
  }
  if (/during\s+warsh['’]?s?\s+time\s+as\s+a\s+fed\s+governor/i.test(normalized)) {
    return true;
  }
  if (/خلال\s+فترة\s+.*(?:وارش|وورش).*(?:حاكم|عضو)/u.test(text)) {
    return true;
  }
  return false;
}

function extractRoleFromSourceText(text = "", official = null) {
  if (!official || !personMentionedInText(text, official)) {
    return null;
  }

  const historical = isHistoricalFedLeadershipContext(text, official);

  if (sourceSaysFormerFedGovernor(text) && official.id === FED_CHAIR_ID) {
    return "Former Federal Reserve Governor";
  }

  if (sourceSaysFormerFedChair(text) && official.id === JEROME_POWELL_ID) {
    return official.role;
  }

  if (sourceSaysRegionalFedPresident(text, official)) {
    return official.role;
  }

  if (sourceSaysFedViceChair(text) && /vice chair/i.test(normalizeLookup(official.role))) {
    return official.role;
  }

  if (sourceSaysFedGovernor(text) && /governor/i.test(normalizeLookup(official.role))) {
    return official.role;
  }

  if (historical && sourceSaysFedChairPhrase(text) && official.id === JEROME_POWELL_ID) {
    return "Federal Reserve Chair";
  }

  if (sourceSaysFedChairPhrase(text)) {
    if (sourceSaysFormerFedChair(text)) {
      if (official.formerChairStatus) {
        return official.role;
      }
      return null;
    }
    if (official.chairStatus) {
      return official.role;
    }
    return null;
  }

  if (official.formerChairStatus) {
    return official.role;
  }

  if (official.chairStatus) {
    return null;
  }

  return official.role;
}

function extractStructuredSourceFacts(evidence = {}) {
  const text = [evidence.sourceTitle, evidence.sourceSnippet, evidence.contentEncodedText]
    .filter(Boolean)
    .join("\n");
  const people = matchOfficialInText(text).map((official) => ({
    id: official.id,
    name: official.canonicalName,
    institution: official.institution,
    role: (() => {
      const extracted = extractRoleFromSourceText(text, official);
      if (extracted) return extracted;
      if (official.chairStatus) return official.canonicalName;
      return official.role;
    })(),
    arabicRole: official.arabicRole,
    chairStatus: official.chairStatus,
    formerChairStatus: official.formerChairStatus === true,
  }));

  const attributions = extractAttributionSegments(text).map((segment) => {
    const matched = matchOfficialInText(segment.person || segment.raw);
    return {
      person: matched[0]?.canonicalName || segment.person,
      role: matched[0] ? extractRoleFromSourceText(text, matched[0]) : null,
      statementHint: segment.raw,
    };
  });

  return {
    people,
    organizations: evidence.organizationCandidates || [],
    numbers: extractNumericTokens(text),
    quotes: extractQuoteSegments(text),
    attributions,
    uncertaintyPresent: UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(text)),
    fedChair: getFedChairOfficial(),
    sourceTextLength: text.length,
  };
}

module.exports = {
  extractStructuredSourceFacts,
  extractRoleFromSourceText,
  personMentionedInText,
  isHistoricalFedLeadershipContext,
  sourceSaysFedChairPhrase,
  sourceSaysFormerFedChair,
};
