const { ISSUE_CODES } = require("./reason-codes");
const { extractNumericTokens, numericSetsEqual } = require("./numeric-utils");
const {
  matchOfficialInText,
  isFedChairTitlePhrase,
  getFedChairOfficial,
  normalizeLookup,
} = require("./entity-registry");
const {
  CERTAINTY_UPGRADE_PATTERNS,
  UNCERTAINTY_PATTERNS,
} = require("./source-evidence");
const {
  validateSemanticPublication,
  hasDuplicateGenericPrimaryLabels,
  hasContradictoryMovement,
} = require("../../news-intelligence/semantic-publication-validation");
const {
  splitEditorialSections,
  bodyStartsWithEquivalentHeadline,
} = require("../publication-format");
const { evaluateCopySimilarity } = require("../../news-intelligence/copy-similarity-guard");

function issue(code, severity = "error", repairable = false, evidence = {}) {
  return { code, severity, repairable, evidence };
}

function stripFooter(body = "") {
  return String(body || "")
    .replace(/\n\n📢 قناة الأخبار الرسمية:[\s\S]*$/u, "")
    .trim();
}

function validateExternalNewsDraftIntegrity({ evidence = {}, facts = {}, draft = {} } = {}) {
  const issues = [];
  const body = stripFooter(draft.body || draft.message || "");
  const headline = draft.headline || splitEditorialSections(body).headlineLine.replace(/^🚨\s*/u, "").trim();

  if (!body || body.length < 40) {
    issues.push(issue(ISSUE_CODES.MALFORMED_OUTPUT, "error", false, { reason: "body_too_short" }));
  }

  if (!evidence.sourceTitle && evidence.sourceTextLength < 20) {
    issues.push(
      issue(ISSUE_CODES.SOURCE_EVIDENCE_INSUFFICIENT, "error", false, { reason: "missing_source_evidence" })
    );
  }

  const sourceNumbers = facts.numbers || evidence.numericTokens || [];
  const draftNumbers = extractNumericTokens(body);
  if (sourceNumbers.length) {
    const numericCheck = numericSetsEqual(sourceNumbers, draftNumbers);
    if (!numericCheck.ok) {
      issues.push(
        issue(ISSUE_CODES.NUMERIC_MISMATCH, "error", false, {
          missing: numericCheck.missing,
          extra: numericCheck.extra,
        })
      );
    }
  } else if (draftNumbers.length >= 2) {
    issues.push(issue(ISSUE_CODES.UNSUPPORTED_CLAIM, "warning", false, { reason: "unsupported_numeric_density" }));
  }

  const draftOfficials = matchOfficialInText(body);
  for (const official of draftOfficials) {
    const sourceHasOfficial = (facts.people || []).some((person) => person.id === official.id);
    if (!sourceHasOfficial && !(facts.people || []).length && !matchOfficialInText(evidence.rawSourceText || "").some((o) => o.id === official.id)) {
      issues.push(
        issue(ISSUE_CODES.ENTITY_MISMATCH, "error", false, { person: official.canonicalName })
      );
    }

    if (official.id === "NEEL_KASHKARI" && isFedChairTitlePhrase(body)) {
      issues.push(
        issue(ISSUE_CODES.ROLE_MISMATCH, "error", true, {
          person: official.canonicalName,
          expectedRole: official.arabicRole,
          foundRole: "رئيس الاحتياطي الفيدرالي",
        })
      );
      continue;
    }

    if (official.chairStatus === false && isFedChairTitlePhrase(body)) {
      const sourceMentions = matchOfficialInText(evidence.rawSourceText || "");
      if (sourceMentions.some((entry) => entry.id === official.id && !entry.chairStatus)) {
        issues.push(
          issue(ISSUE_CODES.ROLE_MISMATCH, "error", true, {
            person: official.canonicalName,
            expectedRole: official.arabicRole,
          })
        );
      }
    }
  }

  const chair = getFedChairOfficial();
  if (chair && matchOfficialInText(body).some((entry) => entry.id === chair.id)) {
    const sourceText = evidence.rawSourceText || "";
    if (matchOfficialInText(sourceText).some((entry) => entry.id === chair.id) && !isFedChairTitlePhrase(sourceText)) {
      // source explicitly names chair with chair context — ok
    }
  }

  if (facts.uncertaintyPresent || (evidence.uncertaintyMarkers || []).length) {
    const sourceUncertain = UNCERTAINTY_PATTERNS.some((pattern) =>
      pattern.test(evidence.rawSourceText || evidence.sourceTextNormalized || "")
    );
    if (sourceUncertain && CERTAINTY_UPGRADE_PATTERNS.some((pattern) => pattern.test(body))) {
      issues.push(issue(ISSUE_CODES.UNCERTAINTY_UPGRADED, "error", true, {}));
    }
  }

  const sourceQuotes = facts.quotes || [];
  const draftQuotes = (body.match(/"([^"]{8,200})"|“([^”]{8,200})”/g) || []).length;
  if (sourceQuotes.length === 0 && draftQuotes > 0) {
    issues.push(issue(ISSUE_CODES.QUOTE_MISMATCH, "error", true, { reason: "unsupported_direct_quote" }));
  }

  if (hasDuplicateGenericPrimaryLabels(body)) {
    issues.push(issue(ISSUE_CODES.MALFORMED_OUTPUT, "error", true, { reason: "duplicate_generic_primary_label" }));
  }

  if (hasContradictoryMovement(body)) {
    issues.push(issue(ISSUE_CODES.MALFORMED_OUTPUT, "error", true, { reason: "contradictory_movement_language" }));
  }

  if (bodyStartsWithEquivalentHeadline(headline, splitEditorialSections(body).bodyText)) {
    issues.push(issue(ISSUE_CODES.DUPLICATE_HEADLINE, "warning", true, {}));
  }

  const semantic = validateSemanticPublication(
    {
      title: headline,
      body,
      publicationType: "GENERAL_NEWS",
      metadata: { candidate: { facts: { detailLines: [evidence.sourceSnippet].filter(Boolean) } } },
    },
    { body, title: headline }
  );
  if (!semantic.ok) {
    for (const semanticIssue of semantic.issues || []) {
      if (semanticIssue === "headline_body_semantic_mismatch") {
        issues.push(issue(ISSUE_CODES.HEADLINE_BODY_MISMATCH, "error", true, {}));
      } else if (semanticIssue === "missing_clear_primary_fact" && sourceNumbers.length) {
        issues.push(issue(ISSUE_CODES.UNSUPPORTED_CLAIM, "warning", false, {}));
      } else if (semanticIssue !== "missing_clear_primary_fact") {
        issues.push(issue(ISSUE_CODES.MALFORMED_OUTPUT, "error", true, { semanticIssue }));
      }
    }
  }

  if (evidence.rawSourceText) {
    const copyCheck = evaluateCopySimilarity(body, evidence.rawSourceText);
    if (!copyCheck.ok) {
      issues.push(issue(ISSUE_CODES.UNSUPPORTED_CLAIM, "error", false, { reason: "copy_similarity" }));
    }
  }

  if (/[A-Za-z]{5,}/.test(body.replace(/CPI| PPI| NFP| FOMC| GDP| PMI| ETF| USD| EUR| GBP| BTC/gi, ""))) {
    issues.push(issue(ISSUE_CODES.LANGUAGE_INVALID, "warning", true, { reason: "excessive_english" }));
  }

  return {
    ok: issues.every((entry) => entry.severity !== "error"),
    issues,
  };
}

module.exports = {
  validateExternalNewsDraftIntegrity,
  stripFooter,
};
