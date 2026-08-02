function normalizeDirective(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\bas primary subject\b/g, "")
    .replace(/\bsubtle\b/g, "")
    .replace(/\bwithout readable[^,]*/g, "")
    .replace(/\bbond market\b/g, "market")
    .replace(/\bcurrency market\b/g, "market")
    .replace(/\s+/g, " ")
    .trim();
}

function directivesOverlap(a, b) {
  const left = normalizeDirective(a);
  const right = normalizeDirective(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return left.includes(right) || right.includes(left);
}

function dedupePromptDirectives(items = []) {
  const result = [];
  for (const item of items.filter(Boolean)) {
    if (result.some((existing) => directivesOverlap(existing, item))) {
      continue;
    }
    result.push(String(item).trim());
  }
  return result;
}

function filterNonOverlappingDirectives(items = [], blocked = []) {
  return dedupePromptDirectives(items).filter(
    (item) => !blocked.some((blocker) => directivesOverlap(item, blocker))
  );
}

function dedupeNegativeDirectives(items = []) {
  const splitItems = [];
  for (const item of items.filter(Boolean)) {
    if (String(item).includes(",")) {
      splitItems.push(...String(item).split(",").map((part) => part.trim()).filter(Boolean));
    } else {
      splitItems.push(String(item).trim());
    }
  }
  return dedupePromptDirectives(splitItems);
}

function dedupePromptSections({ primary = [], secondary = [], marketHints = [], negative = [] } = {}) {
  const dedupedPrimary = dedupePromptDirectives(primary);
  const dedupedMarketHints = dedupePromptDirectives(marketHints);
  const dedupedSecondary = filterNonOverlappingDirectives(secondary, [...dedupedPrimary, ...dedupedMarketHints]);
  const dedupedNegative = dedupeNegativeDirectives(negative);

  return {
    primary: dedupedPrimary,
    secondary: dedupedSecondary,
    marketHints: dedupedMarketHints,
    negative: dedupedNegative,
  };
}

module.exports = {
  normalizeDirective,
  dedupePromptDirectives,
  filterNonOverlappingDirectives,
  dedupeNegativeDirectives,
  dedupePromptSections,
};
