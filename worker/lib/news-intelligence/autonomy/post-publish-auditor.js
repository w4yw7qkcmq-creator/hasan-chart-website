const { REASON_CODES } = require("./reason-taxonomy");
const { openOrUpdateIncident, INCIDENT_TYPES, SEVERITY } = require("./incident-engine");
const { logAutonomyEvent } = require("./structured-log");

function auditPublishedRecord(input = {}) {
  const issues = [];
  const warnings = [];
  const publication = input.publication || {};
  const record = input.publicationRecord || {};
  const canonicalFacts = input.canonicalFacts || publication.facts || {};
  const metadata = record.metadata || publication.metadata || {};
  const imageUrl = publication.imageUrl || publication.imageResult?.imageUrl || metadata.imageUrl || null;
  const imageRef = publication.image || publication.imageResult?.filePath || metadata.image || null;

  if (!record.eventKey && publication.publicationType === "RELEASE") {
    issues.push("missing_publication_identity");
  }

  if (input.requiredImage && !imageRef && !imageUrl) {
    warnings.push("IMPORTANT_NEWS_PUBLISHED_WITHOUT_IMAGE");
  }

  if (canonicalFacts.actual && metadata.facts?.actual && canonicalFacts.actual !== metadata.facts.actual) {
    issues.push("canonical_fact_mismatch_actual");
  }

  if (record.telegramLegStatus === "success" && record.siteLegStatus === "success") {
    // consistent
  } else if (record.telegramLegStatus === "failed" || record.siteLegStatus === "failed") {
    issues.push("partial_delivery_state");
  }

  const ok = issues.length === 0;
  if (!ok) {
    openOrUpdateIncident({
      type: INCIDENT_TYPES.UNEXPECTED_PUBLICATION_PATH,
      severity: SEVERITY.HIGH,
      affectedSource: publication.sourceId,
      affectedEventType: publication.eventType,
      evidenceSummary: { issues, warnings, eventKey: record.eventKey },
      autoAction: "audit_only",
    });
    logAutonomyEvent("NEWS_POST_PUBLISH_AUDIT_FAILED", {
      eventKey: record.eventKey,
      issues,
      warnings,
      reasonCode: REASON_CODES.POST_PUBLISH_AUDIT_FAILED,
    });
  } else {
    logAutonomyEvent("NEWS_POST_PUBLISH_AUDIT_PASSED", {
      eventKey: record.eventKey,
      warnings,
      imageStatus: metadata.imageStatus || publication.metadata?.imageStatus || null,
    });
  }

  return {
    ok,
    issues,
    warnings,
    reasonCode: ok ? null : REASON_CODES.POST_PUBLISH_AUDIT_FAILED,
  };
}

module.exports = {
  auditPublishedRecord,
};
