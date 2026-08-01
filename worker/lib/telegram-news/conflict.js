function normalizeComparableNumber(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .toLowerCase();
}

function detectFactConflict(factsA, factsB) {
  const fields = ["previous", "forecast", "actual", "revisedPrevious"];
  const conflicts = [];

  for (const field of fields) {
    const a = factsA?.[field];
    const b = factsB?.[field];
    if (!a || !b) {
      continue;
    }
    if (normalizeComparableNumber(a) !== normalizeComparableNumber(b)) {
      conflicts.push({ field, valueA: a, valueB: b });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    reason: conflicts.length ? "source_conflict" : null,
  };
}

module.exports = {
  detectFactConflict,
  normalizeComparableNumber,
};
