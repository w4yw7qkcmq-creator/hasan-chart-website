const { CANONICAL_EVENT_DEFINITIONS, GENERIC_CPI_FALLBACKS } = require("./canonical-event-catalog");
const { normalizeTextForMatching } = require("./text-normalization");
const { countryCodeFromOptions, eventKeyMatchesCountry } = require("./country-resolver");

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

const SHARED_COUNTRY_INDICATORS = new Set(["GDP", "CPI", "UNEMPLOYMENT", "RETAIL_SALES"]);

function eventCountryCode(match) {
  return match.definition?.country || String(match.eventKey || "").split("_")[0];
}

function sharedIndicatorFamily(eventKey) {
  const suffix = String(eventKey || "").split("_").slice(1).join("_");
  if (suffix.startsWith("GDP")) return "GDP";
  if (suffix.includes("CPI")) return "CPI";
  if (suffix.startsWith("UNEMPLOYMENT")) return "UNEMPLOYMENT";
  if (suffix.includes("RETAIL_SALES")) return "RETAIL_SALES";
  return null;
}

function resolveBestEventMatch(matched, options = {}) {
  if (!matched || !matched.length) {
    return { match: null, ambiguous: false };
  }
  const countryCode = options.countryCode || null;
  if (!countryCode) {
    const bestLength = matched.reduce((best, item) => Math.max(best, item.matchLength || 0), 0);
    const specific = matched.filter((item) => (item.matchLength || 0) === bestLength);
    const countries = new Set(specific.map(eventCountryCode));
    const families = new Set(specific.map((item) => sharedIndicatorFamily(item.eventKey)).filter(Boolean));
    if (countries.size > 1 && families.size === 1 && SHARED_COUNTRY_INDICATORS.has([...families][0])) {
      return { match: null, ambiguous: true };
    }
  }
  return { match: selectBestMatchedEvent(matched), ambiguous: false };
}

function resolveCanonicalEventKey(title, options = {}) {
  const text = normalizeMatchText(title);
  const countryCode = countryCodeFromOptions(options, text);
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
  const outcome = resolveBestEventMatch(matched, { countryCode });
  if (outcome.ambiguous) {
    return {
      eventKey: null,
      country: null,
      ambiguous: true,
      requiresTripleTemplate: false,
      eventType: "unknown",
      arabicName: null,
    };
  }
  const best = outcome.match;
  if (best) {
    return {
      eventKey: best.eventKey,
      country: best.definition.country || countryCode || best.eventKey.split("_")[0],
      ...best.definition,
      ambiguous: false,
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
    ambiguous: false,
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
  resolveBestEventMatch,
  resolveCanonicalEventKey,
  calendarTitleMatchesCanonical,
  buildIdempotencyKey,
  isPlainNewsEventType,
  isStructuredTripleReleaseTitle,
  listCanonicalEventKeys,
  getCanonicalDefinition,
};
