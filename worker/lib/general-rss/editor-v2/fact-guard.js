const { extractNumericTokens, validateOutputNumbersSubset } = require("../external-news-editor/numeric-utils");
const {
  matchOfficialInText,
  isFedChairTitlePhrase,
  normalizeLookup,
} = require("../external-news-editor/entity-registry");
const {
  CERTAINTY_UPGRADE_PATTERNS,
  UNCERTAINTY_PATTERNS,
} = require("../external-news-editor/source-evidence");
const {
  validateSemanticPublication,
  hasDuplicateGenericPrimaryLabels,
  hasContradictoryMovement,
} = require("../../news-intelligence/semantic-publication-validation");
const { normalizeHeadlineComparable } = require("../publication-format");
const { V2_ISSUE_CODES, ISSUE_TO_V2_REASON } = require("./reason-codes");
const { extractActionFromEvidence, actionConflictsWithOutput } = require("./action-resolution");
const { resolvePrimarySubject, primarySubjectMismatch } = require("./primary-subject");
const { hasNumericUnitMismatch, extractSemanticNumericTokens, filterMaterialSourceNumbers } = require("./numeric-semantics");
const { extractAttributionHint } = require("./deterministic-arabic-fallback");

function issue(code, evidence = {}) {
  return { code, evidence };
}

function combinedEditorialText(editorial = {}) {
  return `${editorial.headline || ""}\n${editorial.body || ""}`.trim();
}

function validateEditorV2FactGuard({ evidence = {}, facts = {}, editorial = {} } = {}) {
  const issues = [];
  const text = combinedEditorialText(editorial);

  if (editorial.insufficientEvidence || !text || text.length < 20) {
    issues.push(issue(V2_ISSUE_CODES.INSUFFICIENT_EVIDENCE, { reason: "empty_or_insufficient" }));
  }

  if ((facts.roleConflicts || []).length) {
    for (const conflict of facts.roleConflicts) {
      issues.push(issue(V2_ISSUE_CODES.ENTITY_ROLE_CONFLICT, conflict));
    }
  }

  const sourceCombined = [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n");
  const sourceNumbers = filterMaterialSourceNumbers(
    facts.numbers || extractNumericTokens(sourceCombined),
    sourceCombined
  );
  const outputNumbers = extractSemanticNumericTokens(text, sourceNumbers);
  if (outputNumbers.length) {
    const numericCheck = validateOutputNumbersSubset(sourceNumbers, outputNumbers);
    if (!numericCheck.ok) {
      issues.push(
        issue(V2_ISSUE_CODES.NUMERIC_MISMATCH, {
          extra: numericCheck.extra,
          unsupported: numericCheck.unsupported,
        })
      );
    }
    if (hasNumericUnitMismatch(sourceNumbers, text)) {
      issues.push(issue(V2_ISSUE_CODES.NUMERIC_UNIT_MISMATCH, { reason: "missing_currency_or_unit" }));
    }
  } else if (sourceNumbers.length === 0 && /\d/.test(text)) {
    const indexReferenceOnly =
      /s&p\s*500|sp500/i.test(sourceCombined) &&
      /s&p\s*500|sp500/i.test(text) &&
      !/\d/.test(text.replace(/s&p\s*500/ig, "").replace(/sp500/ig, ""));
    if (!indexReferenceOnly) {
      issues.push(issue(V2_ISSUE_CODES.UNSUPPORTED_CLAIM, { reason: "unsupported_numeric_density" }));
    }
  }

  const outputOfficials = matchOfficialInText(text);
  for (const official of outputOfficials) {
    const sourceHasOfficial = (facts.people || []).some((person) => person.id === official.id);
    const sourceMentions = matchOfficialInText(sourceCombined);
    if (!sourceHasOfficial && !sourceMentions.some((entry) => entry.id === official.id)) {
      issues.push(issue(V2_ISSUE_CODES.ENTITY_MISMATCH, { person: official.canonicalName }));
    }

    if (official.id === "NEEL_KASHKARI" && isFedChairTitlePhrase(text)) {
      issues.push(
        issue(V2_ISSUE_CODES.ROLE_MISMATCH, {
          person: official.canonicalName,
          expectedRole: official.arabicRole,
          foundRole: "رئيس الاحتياطي الفيدرالي",
        })
      );
    }

    if (official.chairStatus === false && isFedChairTitlePhrase(text)) {
      const sourceNamesChair = sourceMentions.some((entry) => entry.id === official.id && !entry.chairStatus);
      if (sourceNamesChair) {
        issues.push(
          issue(V2_ISSUE_CODES.ROLE_MISMATCH, {
            person: official.canonicalName,
            expectedRole: official.arabicRole,
          })
        );
      }
    }
  }

  if (facts.uncertaintyPresent) {
    const sourceUncertain = UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(sourceCombined));
    if (sourceUncertain && CERTAINTY_UPGRADE_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push(issue(V2_ISSUE_CODES.UNCERTAINTY_UPGRADED, {}));
    }
  }

  const sourceQuotes = facts.quotes || [];
  const outputQuotes = (text.match(/"([^"]{8,200})"|“([^”]{8,200})”/g) || []).length;
  if (sourceQuotes.length === 0 && outputQuotes > 0) {
    issues.push(issue(V2_ISSUE_CODES.QUOTE_MISMATCH, { reason: "unsupported_direct_quote" }));
  }

  if (/بالتأكيد/u.test(text) && /may|might|could|reportedly|قد/u.test(sourceCombined)) {
    issues.push(issue(V2_ISSUE_CODES.ATTRIBUTION_MISMATCH, { reason: "certainty_upgrade" }));
  }

  const sourceAttribution = extractAttributionHint(evidence);
  if (sourceAttribution?.type === "ecb_sources") {
    if (/^المصدر/u.test(text) || (/وفق(?:اً)?\s*للمصدر/u.test(text) && !/مصادر|البنك المركزي الأوروبي/u.test(text))) {
      issues.push(issue(V2_ISSUE_CODES.ATTRIBUTION_SPECIFICITY_LOST, { expected: sourceAttribution.type }));
    }
  }

  const action = extractActionFromEvidence(evidence);
  const primarySubject = resolvePrimarySubject(evidence, facts, action);
  const actionConflict = actionConflictsWithOutput(action.actionClass, text);
  if (actionConflict === "V2_DIRECTION_MISMATCH") {
    issues.push(issue(V2_ISSUE_CODES.DIRECTION_MISMATCH, { actionClass: action.actionClass }));
  } else if (actionConflict === "V2_EVENT_TYPE_MISMATCH") {
    issues.push(issue(V2_ISSUE_CODES.EVENT_TYPE_MISMATCH, { actionClass: action.actionClass }));
  }
  const subjectConflict = primarySubjectMismatch(primarySubject, text);
  if (subjectConflict) {
    issues.push(issue(V2_ISSUE_CODES.PRIMARY_SUBJECT_MISMATCH, { expected: primarySubject.label }));
  }

  if (editorial.semanticMeta?.actionClass && editorial.semanticMeta.actionClass !== action.actionClass) {
    issues.push(
      issue(V2_ISSUE_CODES.ACTION_MISMATCH, {
        expected: action.actionClass,
        found: editorial.semanticMeta.actionClass,
      })
    );
  }

  if (hasDuplicateGenericPrimaryLabels(text) || hasContradictoryMovement(text)) {
    issues.push(issue(V2_ISSUE_CODES.UNSUPPORTED_CLAIM, { reason: "malformed_language" }));
  }

  const headlineNorm = normalizeHeadlineComparable(editorial.headline || "");
  const bodyNorm = normalizeHeadlineComparable(editorial.body || "");
  if (headlineNorm && bodyNorm && headlineNorm === bodyNorm) {
    issues.push(issue(V2_ISSUE_CODES.HEADLINE_BODY_MISMATCH, { reason: "headline_equals_body" }));
  } else {
    const semantic = validateSemanticPublication(
      {
        title: editorial.headline,
        body: editorial.body,
        publicationType: "GENERAL_NEWS",
        metadata: { candidate: { facts: { detailLines: [evidence.description].filter(Boolean) } } },
      },
      { body: editorial.body, title: editorial.headline }
    );
    if (!semantic.ok && (semantic.issues || []).includes("headline_body_semantic_mismatch")) {
      issues.push(issue(V2_ISSUE_CODES.HEADLINE_BODY_MISMATCH, {}));
    }
  }

  const blocking = issues;

  const primaryReason =
    blocking.length > 0 ? ISSUE_TO_V2_REASON[blocking[0].code] || blocking[0].code : null;

  return {
    ok: blocking.length === 0,
    issues,
    reasonCode: primaryReason,
  };
}

module.exports = {
  validateEditorV2FactGuard,
  combinedEditorialText,
};
