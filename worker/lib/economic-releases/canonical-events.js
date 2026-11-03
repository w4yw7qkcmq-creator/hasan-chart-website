const { CANONICAL_EVENT_DEFINITIONS, GENERIC_CPI_FALLBACKS } = require("./canonical-event-catalog");
const { normalizeTextForMatching } = require("./text-normalization");
const { resolveCountryCode, eventKeyMatchesCountry } = require("./country-resolver");

function normalizeMatchText(value) {
  return normalizeTextForMatching(value);
}

function matchesAnyPattern(text, patterns) {
  return patternMatchLength(text, patterns) >= 0;
}

function patternMatchLength(text, patterns) {
  let best = -1;
  for (const pattern of patterns || []) {
    if (!(pattern instanceof RegExp)) continue;
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let match;
    while ((match = re.exec(text))) {
      if (match[0].length > best) best = match[0].length;
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }
  return best;
}

function selectBestMatchedEvent(matches) {
  const ranked = matches.slice().sort((left, right) => {
    const priorityLeft = left.priority ?? 100;
    const priorityRight = right.priority ?? 100;
    if (priorityLeft !== priorityRight) return priorityLeft - priorityRight;
    const pmiLeft = /ISM|PMI|SP_GLOBAL/.test(left.eventKey);
    const pmiRight = /ISM|PMI|SP_GLOBAL/.test(right.eventKey);
    if (pmiLeft && pmiRight) {
      if ((right.matchLength || 0) !== (left.matchLength || 0)) {
        return (right.matchLength || 0) - (left.matchLength || 0);
      }
      if (left.eventKey !== right.eventKey) return left.eventKey < right.eventKey ? -1 : 1;
    }
    return (left.index ?? 0) - (right.index ?? 0);
  });
  return ranked[0] || null;
}

function orderedDefinitionsForCountry(countryCode) {
  const entries = Object.entries(CANONICAL_EVENT_DEFINITIONS).filter(([eventKey, definition]) => {
    const country = definition.country || eventKey.split("_")[0];
    if (!countryCode) {
      return true;
    }
    return country === countryCode || eventKeyMatchesCountry(eventKey, countryCode);
  });

  return entries.sort((a, b) => (a[1].priority ?? 100) - (b[1].priority ?? 100));
}

function resolveCanonicalEventKey(title, options = {}) {
  const text = normalizeMatchText(title);
  const countryCode = options.countryCode || resolveCountryCode(text) || null;
  const candidates = orderedDefinitionsForCountry(countryCode);
  const matched = [];
  candidates.forEach(([eventKey, definition], index) => {
    const matchLength = patternMatchLength(text, definition.patterns);
    if (matchLength >= 0) {
      matched.push({
        eventKey,
        definition,
        priority: definition.priority ?? 100,
        matchLength,
        index,
      });
    }
  });
  const best = selectBestMatchedEvent(matched);
  if (best) {
    return {
      eventKey: best.eventKey,
      country: best.definition.country || countryCode || best.eventKey.split("_")[0],
      ...best.definition,
    };
  }

  if (countryCode && GENERIC_CPI_FALLBACKS[countryCode]) {
    const fallback = GENERIC_CPI_FALLBACKS[countryCode];
    if (matchesAnyPattern(text, fallback.patterns)) {
      return {
        eventKey: `${countryCode}_CPI_GENERIC`,
        country: countryCode,
        ...fallback,
        requiresTripleTemplate: true,
        eventType: "structured_release",
      };
    }
  }

  if (!countryCode) {
    for (const [country, fallback] of Object.entries(GENERIC_CPI_FALLBACKS)) {
      if (matchesAnyPattern(text, fallback.patterns)) {
        return {
          eventKey: `${country}_CPI_GENERIC`,
          country,
          ...fallback,
          requiresTripleTemplate: true,
          eventType: "structured_release",
        };
      }
    }
  }

  return {
    eventKey: null,
    country: countryCode,
    requiresTripleTemplate: false,
    eventType: "unknown",
    arabicName: null,
  };
}

function calendarTitleMatchesCanonical(calendarTitle, canonical) {
  if (!canonical?.eventKey) {
    return false;
  }

  const text = normalizeMatchText(calendarTitle);
  const country = canonical.country || (canonical.eventKey ? canonical.eventKey.split("_")[0] : null);

  if (String(canonical.eventKey).endsWith("_CPI_GENERIC")) {
    const fallback = GENERIC_CPI_FALLBACKS[country];
    return fallback ? matchesAnyPattern(text, fallback.calendarPatterns || fallback.patterns) : false;
  }

  const definition = CANONICAL_EVENT_DEFINITIONS[canonical.eventKey];
  if (!definition) {
    return false;
  }

  return matchesAnyPattern(text, definition.calendarPatterns || definition.patterns);
}

function buildIdempotencyKey({ country = "US", eventKey, scheduledAt }) {
  const scheduled = scheduledAt ? new Date(scheduledAt).toISOString() : "unknown";
  return `${country}|${eventKey}|${scheduled}`;
}

function isPlainNewsEventType(eventType) {
  return eventType === "plain_news";
}

function isStructuredTripleReleaseTitle(title) {
  const canonical = resolveCanonicalEventKey(title);
  if (canonical.eventKey) {
    return canonical.requiresTripleTemplate === true;
  }

  const value = normalizeMatchText(title);
  if (/powell|press conference|fed chair|statement|remarks|speech|minutes|محضر|مؤتمر صحفي|بيان الفيدرالي|بيان/i.test(value)) {
    return false;
  }

  return /jobless claims|initial claims|continuing claims|unemployment rate|\bcpi\b|core cpi|\bppi\b|\bpce\b|\bnfp\b|nonfarm payrolls|consumer confidence|michigan sentiment|retail sales|\bism\b|\bpmi\b|philadelphia fed|philly fed|empire state|\bgdp\b|fomc|rate decision|interest rate decision|average hourly earnings|\bjolts\b|\badp\b|durable goods|factory orders|industrial production|capacity utilization|housing starts|building permits|home sales|trade balance|current account|crude oil inventories|gasoline inventories|distillate inventories|cushing|eia|مخزون|مديري المشتريات/i.test(
    value
  );
}

function listCanonicalEventKeys() {
  return Object.keys(CANONICAL_EVENT_DEFINITIONS);
}

function getCanonicalDefinition(eventKey) {
  return CANONICAL_EVENT_DEFINITIONS[eventKey] || null;
}

module.exports = {
  CANONICAL_EVENT_DEFINITIONS,
  GENERIC_CPI_FALLBACKS,
  normalizeMatchText,
  patternMatchLength,
  selectBestMatchedEvent,
  resolveCanonicalEventKey,
  calendarTitleMatchesCanonical,
  buildIdempotencyKey,
  isPlainNewsEventType,
  isStructuredTripleReleaseTitle,
  listCanonicalEventKeys,
  getCanonicalDefinition,
};
