const { splitEditorialSections, buildRssPublicationPresentation } = require("../publication-format");
const { extractRssSourceEvidence } = require("./source-evidence");
const { extractStructuredSourceFacts } = require("./structured-facts");
const { validateExternalNewsDraftIntegrity, stripFooter } = require("./layer1-integrity");
const { validateExternalNewsFinalGuard } = require("./layer3-guard");
const { reviewExternalNewsWithAi } = require("./layer2-ai-editor");
const { applyDeterministicRepairs } = require("./deterministic-repair");
const { buildDeterministicSafeFallback, rebuildPresentationFromBody } = require("./safe-fallback");
const { EDITOR_REASON_CODES, ISSUE_CODES } = require("./reason-codes");
const { recordEditorReviewOutcome, getEditorTelemetrySnapshot } = require("./telemetry");

const MAX_REPAIR_ATTEMPTS = 1;

function mapIssueToReason(issue = {}) {
  const map = {
    [ISSUE_CODES.NUMERIC_MISMATCH]: EDITOR_REASON_CODES.EDITOR_NUMERIC_MISMATCH,
    [ISSUE_CODES.ENTITY_MISMATCH]: EDITOR_REASON_CODES.EDITOR_ENTITY_MISMATCH,
    [ISSUE_CODES.ROLE_MISMATCH]: EDITOR_REASON_CODES.EDITOR_ROLE_MISMATCH,
    [ISSUE_CODES.ATTRIBUTION_MISMATCH]: EDITOR_REASON_CODES.EDITOR_ATTRIBUTION_MISMATCH,
    [ISSUE_CODES.QUOTE_MISMATCH]: EDITOR_REASON_CODES.EDITOR_QUOTE_MISMATCH,
    [ISSUE_CODES.UNCERTAINTY_UPGRADED]: EDITOR_REASON_CODES.EDITOR_UNCERTAINTY_UPGRADED,
    [ISSUE_CODES.HEADLINE_BODY_MISMATCH]: EDITOR_REASON_CODES.EDITOR_HEADLINE_BODY_MISMATCH,
    [ISSUE_CODES.LANGUAGE_INVALID]: EDITOR_REASON_CODES.EDITOR_LANGUAGE_INVALID,
    [ISSUE_CODES.UNSUPPORTED_CLAIM]: EDITOR_REASON_CODES.EDITOR_UNSUPPORTED_CLAIM,
    [ISSUE_CODES.SOURCE_EVIDENCE_INSUFFICIENT]: EDITOR_REASON_CODES.EDITOR_SOURCE_EVIDENCE_INSUFFICIENT,
  };
  return map[issue.code] || EDITOR_REASON_CODES.EDITOR_BLOCKED;
}

function buildDraftFromPresentation({ item = {}, editorialMessage = "", rssPresentation = null, imageTitle = "" } = {}) {
  const message = rssPresentation?.telegramMessage || editorialMessage;
  const sections = splitEditorialSections(message);
  return {
    headline: rssPresentation?.canonicalHeadline || imageTitle || sections.headlineLine.replace(/^🚨\s*/u, "").trim(),
    body: message,
    imageTitle: rssPresentation?.imageTitle || imageTitle,
    sourceTitle: item.title,
  };
}

function buildBlockedResult(reasonCode, metadata = {}) {
  return {
    ok: false,
    approved: false,
    blocked: true,
    reasonCode,
    metadata,
  };
}

function buildApprovedResult({ draft, rssPresentation, source, metadata = {} }) {
  const presentation =
    rssPresentation ||
    buildRssPublicationPresentation({
      sourceTitle: draft.sourceTitle,
      editorialMessage: draft.body,
      imageTitle: draft.imageTitle || draft.headline,
    });

  return {
    ok: true,
    approved: true,
    blocked: false,
    reasonCode: metadata.repaired ? EDITOR_REASON_CODES.EDITOR_REPAIRED : EDITOR_REASON_CODES.EDITOR_APPROVED,
    publicationMessage: presentation.telegramMessage,
    rssPresentation: presentation,
    draft,
    metadata,
  };
}

async function reviewExternalNewsBeforePublish(input = {}, options = {}) {
  const startedAt = Date.now();
  const source = input.item?.sourceName || input.source || "unknown";
  const impactLevel = String(input.item?.impactLevel || input.impactLevel || "MEDIUM").toUpperCase();
  const evidence = input.evidence || extractRssSourceEvidence(input.item, source);
  const facts = input.facts || extractStructuredSourceFacts(evidence);
  let draft = input.draft || buildDraftFromPresentation(input);
  let repairAttempts = 0;
  let repaired = false;
  const reasonCodes = [];

  const runLayer1 = () =>
    validateExternalNewsDraftIntegrity({
      evidence,
      facts,
      draft: { body: draft.body, headline: draft.headline, message: draft.body },
    });

  let l1 = runLayer1();
  if (!l1.ok) {
    reasonCodes.push(...l1.issues.map(mapIssueToReason));
    const repairable = l1.issues.some((issue) => issue.repairable);
    if (repairable && repairAttempts < MAX_REPAIR_ATTEMPTS) {
      const repairedDraft = applyDeterministicRepairs(draft, l1.issues);
      if (repairedDraft.applied.length) {
        repairAttempts += 1;
        repaired = true;
        draft = { ...draft, body: repairedDraft.body, headline: repairedDraft.headline, imageTitle: repairedDraft.headline };
        l1 = runLayer1();
      }
    }
  }

  const l2 = await reviewExternalNewsWithAi(
    { evidence, facts, draft: { headline: draft.headline, body: stripFooter(draft.body) } },
    options
  );

  if (l2.verdict === "TIMEOUT") {
    recordEditorReviewOutcome(source, { timeout: true, blocked: impactLevel === "HIGH", reasonCodes: [EDITOR_REASON_CODES.EDITOR_TIMEOUT] });
    if (impactLevel === "HIGH") {
      return buildBlockedResult(EDITOR_REASON_CODES.EDITOR_TIMEOUT, {
        editorLatencyMs: Date.now() - startedAt,
        confidence: 0,
      });
    }
    const fallback = buildDeterministicSafeFallback({ evidence, facts });
    if (!fallback.ok) {
      return buildBlockedResult(EDITOR_REASON_CODES.EDITOR_TIMEOUT, { editorLatencyMs: Date.now() - startedAt });
    }
    draft = { ...draft, body: fallback.body, headline: fallback.headline, bodySource: fallback.bodySource };
    repaired = true;
  } else if (l2.verdict === "BLOCK") {
    recordEditorReviewOutcome(source, { blocked: true, reasonCodes: reasonCodes.length ? reasonCodes : [EDITOR_REASON_CODES.EDITOR_BLOCKED] });
    return buildBlockedResult(EDITOR_REASON_CODES.EDITOR_BLOCKED, {
      editorLatencyMs: Date.now() - startedAt,
      confidence: l2.confidence || 0,
      issues: l2.issues || l1.issues,
    });
  } else if (l2.verdict === "REPAIR") {
    if (repairAttempts >= MAX_REPAIR_ATTEMPTS && !repaired) {
      recordEditorReviewOutcome(source, { blocked: true, reasonCodes: [EDITOR_REASON_CODES.EDITOR_BLOCKED] });
      return buildBlockedResult(EDITOR_REASON_CODES.EDITOR_BLOCKED, { editorLatencyMs: Date.now() - startedAt });
    }
    if (l2.repairedBody) {
      draft.body = l2.repairedBody;
      if (l2.repairedHeadline) draft.headline = l2.repairedHeadline;
      repaired = true;
      repairAttempts += 1;
    } else if (repairAttempts < MAX_REPAIR_ATTEMPTS) {
      const repairedDraft = applyDeterministicRepairs(draft, l1.issues);
      draft = { ...draft, body: repairedDraft.body, headline: repairedDraft.headline };
      repaired = true;
      repairAttempts += 1;
    }
  }

  if (!l1.ok && impactLevel === "HIGH") {
    recordEditorReviewOutcome(source, { blocked: true, reasonCodes });
    return buildBlockedResult(reasonCodes[0] || EDITOR_REASON_CODES.EDITOR_BLOCKED, {
      editorLatencyMs: Date.now() - startedAt,
      issues: l1.issues,
    });
  }

  if (!l1.ok && impactLevel !== "HIGH") {
    const fallback = buildDeterministicSafeFallback({ evidence, facts });
    if (fallback.ok) {
      draft = { ...draft, body: fallback.body, headline: fallback.headline, bodySource: fallback.bodySource };
      repaired = true;
      l1 = runLayer1();
    }
  }

  const l3 = validateExternalNewsFinalGuard({
    evidence,
    facts,
    draft: { body: draft.body, headline: draft.headline, message: draft.body },
  });

  if (!l3.ok) {
    const blockReasons = l3.issues.map(mapIssueToReason);
    recordEditorReviewOutcome(source, { blocked: true, reasonCodes: blockReasons });
    return buildBlockedResult(blockReasons[0] || EDITOR_REASON_CODES.EDITOR_BLOCKED, {
      editorLatencyMs: Date.now() - startedAt,
      issues: l3.issues,
    });
  }

  recordEditorReviewOutcome(source, {
    approved: !repaired,
    repaired,
    repairSuccess: repaired,
    reasonCodes: repaired ? [EDITOR_REASON_CODES.EDITOR_REPAIRED] : [EDITOR_REASON_CODES.EDITOR_APPROVED],
  });

  return buildApprovedResult({
    draft,
    rssPresentation: input.rssPresentation
      ? buildRssPublicationPresentation({
          sourceTitle: input.item?.title,
          editorialMessage: draft.body,
          imageTitle: draft.imageTitle || draft.headline,
        })
      : null,
    source,
    metadata: {
      repaired,
      editorLatencyMs: Date.now() - startedAt,
      confidence: l2.confidence || 100,
      evidenceSummary: {
        source,
        numbers: (facts.numbers || []).slice(0, 5).map((entry) => entry.normalized),
        people: (facts.people || []).slice(0, 3).map((entry) => entry.name),
      },
    },
  });
}

function resetExternalNewsEditorStateForTests() {
  const { resetEditorTelemetryForTests } = require("./telemetry");
  resetEditorTelemetryForTests();
}

module.exports = {
  MAX_REPAIR_ATTEMPTS,
  extractRssSourceEvidence,
  extractStructuredSourceFacts,
  validateExternalNewsDraftIntegrity,
  validateExternalNewsFinalGuard,
  reviewExternalNewsWithAi,
  reviewExternalNewsBeforePublish,
  resetExternalNewsEditorStateForTests,
  getEditorTelemetrySnapshot,
  EDITOR_REASON_CODES,
};
