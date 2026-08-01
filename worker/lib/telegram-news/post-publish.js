const { normalizeComparableNumber } = require("./conflict");

function snapshotFacts(facts = {}, mergeKey = null) {
  return {
    mergeKey,
    canonicalEventKey: facts.canonicalEventKey || null,
    previous: facts.previous || facts.revisedPrevious || null,
    forecast: facts.forecast || null,
    actual: facts.actual || null,
    revisedPrevious: facts.revisedPrevious || null,
    country: facts.country || null,
    period: facts.period || null,
  };
}

function detectPostPublishAction(publishedSnapshot, newFacts, meta = {}) {
  if (!publishedSnapshot) {
    return { action: "publish", isDuplicate: false, isUpdate: false };
  }

  const oldPrevious = normalizeComparableNumber(publishedSnapshot.previous);
  const oldForecast = normalizeComparableNumber(publishedSnapshot.forecast);
  const oldActual = normalizeComparableNumber(publishedSnapshot.actual);
  const newPrevious = normalizeComparableNumber(newFacts.previous || newFacts.revisedPrevious);
  const newForecast = normalizeComparableNumber(newFacts.forecast);
  const newActual = normalizeComparableNumber(newFacts.actual);

  const sameTriple =
    oldPrevious &&
    oldForecast &&
    oldActual &&
    oldPrevious === newPrevious &&
    oldForecast === newForecast &&
    oldActual === newActual;

  if (sameTriple) {
    return { action: "duplicate_skip", isDuplicate: true, isUpdate: false };
  }

  const changedFields = [];
  const oldValues = {};
  const newValues = {};

  for (const field of ["revisedPrevious", "previous", "forecast", "actual"]) {
    const oldValue = publishedSnapshot[field];
    const newValue = newFacts[field];
    if (!oldValue || !newValue) {
      continue;
    }
    if (normalizeComparableNumber(oldValue) !== normalizeComparableNumber(newValue)) {
      changedFields.push(field);
      oldValues[field] = oldValue;
      newValues[field] = newValue;
    }
  }

  if (changedFields.length > 0) {
    return {
      action: "TELEGRAM_NEWS_UPDATE_PENDING",
      isDuplicate: false,
      isUpdate: true,
      parentNewsFingerprint: publishedSnapshot.mergeKey || meta.mergeKey || null,
      changedFields,
      oldValues,
      newValues,
      sourceMessageId: meta.sourceMessageId || null,
    };
  }

  return { action: "duplicate_skip", isDuplicate: true, isUpdate: false };
}

module.exports = {
  snapshotFacts,
  detectPostPublishAction,
};
