const { REASON_CODES } = require("./reason-taxonomy");
const { openOrUpdateIncident, INCIDENT_TYPES, SEVERITY } = require("./incident-engine");
const { logAutonomyEvent } = require("./structured-log");

function auditPublishedRecord(input = {}) {
  const issues = [];
  const publication = input.publication || {};
  const record = input.publicationRecord || {};
  const canonicalFacts = input.canonicalFacts || publication.facts || {};
  const metadata = record.metadata || publication.metadata || {};

  if (!record.eventKey && publication.publicationType === "RELEASE") {
    issues.push("missing_publication_identity");
  }

  if (input.requiredImage && !publication.image && !publication.imageUrl) {
    issues.push("missing_required_image_reference");
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
      evidenceSummary: { issues, eventKey: record.eventKey },
      autoAction: "audit_only",
    });
    logAutonomyEvent("NEWS_POST_PUBLISH_AUDIT_FAILED", {
      eventKey: record.eventKey,
      issues,
      reasonCode: REASON_CODES.POST_PUBLISH_AUDIT_FAILED,
    });
  } else {
    logAutonomyEvent("NEWS_POST_PUBLISH_AUDIT_PASSED", { eventKey: record.eventKey });
  }

  return { ok, issues, reasonCode: ok ? null : REASON_CODES.POST_PUBLISH_AUDIT_FAILED };
}

module.exports = {
  auditPublishedRecord,
};
