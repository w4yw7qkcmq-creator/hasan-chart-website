const { RSS_IMAGE_SOURCES } = require("../rss-image-telemetry");

function createEmptyEditorBucket() {
  return {
    attempted: 0,
    approved: 0,
    repairRequested: 0,
    repairSuccess: 0,
    repairFailed: 0,
    blocked: 0,
    timeout: 0,
    numericMismatch: 0,
    entityMismatch: 0,
    roleMismatch: 0,
    attributionMismatch: 0,
    quoteMismatch: 0,
    uncertaintyMismatch: 0,
    headlineBodyMismatch: 0,
    languageRepair: 0,
  };
}

const globalCounters = createEmptyEditorBucket();
const bySource = Object.fromEntries(RSS_IMAGE_SOURCES.map((source) => [source, createEmptyEditorBucket()]));

const REASON_TO_FIELD = {
  EDITOR_NUMERIC_MISMATCH: "numericMismatch",
  EDITOR_ENTITY_MISMATCH: "entityMismatch",
  EDITOR_ROLE_MISMATCH: "roleMismatch",
  EDITOR_ATTRIBUTION_MISMATCH: "attributionMismatch",
  EDITOR_QUOTE_MISMATCH: "quoteMismatch",
  EDITOR_UNCERTAINTY_UPGRADED: "uncertaintyMismatch",
  EDITOR_HEADLINE_BODY_MISMATCH: "headlineBodyMismatch",
  EDITOR_LANGUAGE_INVALID: "languageRepair",
};

function normalizeSource(source = "") {
  const match = RSS_IMAGE_SOURCES.find((key) => key.toLowerCase() === String(source || "").trim().toLowerCase());
  return match || null;
}

function bump(bucket, field, amount = 1) {
  if (!bucket || !field) return;
  bucket[field] = (bucket[field] || 0) + amount;
}

function recordEditorTelemetryEvent(source, event, amount = 1) {
  bump(globalCounters, event, amount);
  const sourceKey = normalizeSource(source);
  if (sourceKey) bump(bySource[sourceKey], event, amount);
}

function recordEditorReviewOutcome(source, outcome = {}) {
  recordEditorTelemetryEvent(source, "attempted");
  if (outcome.approved) recordEditorTelemetryEvent(source, "approved");
  if (outcome.repaired) {
    recordEditorTelemetryEvent(source, "repairRequested");
    recordEditorTelemetryEvent(source, outcome.repairSuccess ? "repairSuccess" : "repairFailed");
  }
  if (outcome.blocked) recordEditorTelemetryEvent(source, "blocked");
  if (outcome.timeout) recordEditorTelemetryEvent(source, "timeout");
  for (const reason of outcome.reasonCodes || []) {
    const field = REASON_TO_FIELD[reason];
    if (field) recordEditorTelemetryEvent(source, field);
  }
}

function getEditorTelemetrySnapshot() {
  return {
    global: { ...globalCounters },
    bySource: Object.fromEntries(RSS_IMAGE_SOURCES.map((source) => [source, { ...bySource[source] }])),
  };
}

function resetEditorTelemetryForTests() {
  Object.assign(globalCounters, createEmptyEditorBucket());
  for (const source of RSS_IMAGE_SOURCES) {
    Object.assign(bySource[source], createEmptyEditorBucket());
  }
}

module.exports = {
  recordEditorTelemetryEvent,
  recordEditorReviewOutcome,
  getEditorTelemetrySnapshot,
  resetEditorTelemetryForTests,
};
