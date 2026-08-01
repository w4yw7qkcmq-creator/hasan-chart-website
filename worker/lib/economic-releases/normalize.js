const FORBIDDEN_PLACEHOLDER_PATTERN =
  /(?:^|\s)(?:غير\s*متوفر(?:\s*الآن)?|n\/a|not\s+available|undefined|null)(?:\s|$)/i;

function isMissingEconomicValue(value) {
  if (value === null || value === undefined) {
    return true;
  }

  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "—" || raw === "--") {
    return true;
  }

  if (/^(?:n\/a|na|none|null|undefined)$/i.test(raw)) {
    return true;
  }

  if (/^غير\s*متوفر(?:\s*الآن)?$/i.test(raw)) {
    return true;
  }

  return false;
}

function parseEconomicNumber(value) {
  if (isMissingEconomicValue(value)) {
    return null;
  }

  const raw = String(value).trim();
  const multiplier = /k$/i.test(raw)
    ? 1_000
    : /m$/i.test(raw)
      ? 1_000_000
      : /b$/i.test(raw)
        ? 1_000_000_000
        : 1;

  const cleaned = raw.replace(/[%,$,KkMmBb\s]/g, "");
  const number = Number(cleaned);

  if (Number.isNaN(number)) {
    return null;
  }

  return number * multiplier;
}

function normalizeEconomicFieldValue(value) {
  if (isMissingEconomicValue(value)) {
    return {
      display: null,
      numeric: null,
      isMissing: true,
      raw: value == null ? null : String(value),
    };
  }

  const raw = String(value).trim();
  const numeric = parseEconomicNumber(raw);

  return {
    display: raw,
    numeric,
    isMissing: false,
    raw,
  };
}

function formatDisplayValue(field) {
  if (!field || field.isMissing || field.display == null) {
    return null;
  }

  const display = String(field.display).trim();
  if (FORBIDDEN_PLACEHOLDER_PATTERN.test(display)) {
    return null;
  }

  return display;
}

function mergeProviderEvents(events) {
  if (!events.length) {
    return null;
  }

  const sorted = [...events].sort((a, b) => {
    const priority = {
      official: 0,
      fred_verification: 0,
      trading_economics_public: 1,
      public_pages_calendar: 2,
      investing_calendar: 3,
      trading_economics: 3,
      rss_hint: 4,
    };
    return (priority[a.sourceName] ?? 99) - (priority[b.sourceName] ?? 99);
  });

  const merged = {
    eventKey: sorted[0].eventKey,
    title: sorted[0].title,
    country: sorted[0].country || "US",
    scheduledAt: sorted[0].scheduledAt,
    unit: sorted[0].unit || null,
    importance: sorted[0].importance || null,
    actual: normalizeEconomicFieldValue(null),
    forecast: normalizeEconomicFieldValue(null),
    previous: normalizeEconomicFieldValue(null),
    revisedPrevious: normalizeEconomicFieldValue(null),
    actualSource: null,
    forecastSource: null,
    previousSource: null,
    sourceName: sorted[0].sourceName,
    sourceTimestamp: sorted[0].sourceTimestamp || new Date().toISOString(),
    sourceAgreement: true,
    isRevised: false,
    verifiedAt: new Date().toISOString(),
    providers: sorted.map((event) => event.sourceName),
  };

  const actualCandidates = [];
  const forecastCandidates = [];
  const previousCandidates = [];

  for (const event of sorted) {
    const actual = normalizeEconomicFieldValue(event.actual);
    const forecast = normalizeEconomicFieldValue(event.forecast);
    const previous = normalizeEconomicFieldValue(event.previous);
    const revisedPrevious = normalizeEconomicFieldValue(event.revisedPrevious);

    if (!actual.isMissing) {
      actualCandidates.push({ value: actual, source: event.sourceName });
    }
    if (!forecast.isMissing) {
      forecastCandidates.push({ value: forecast, source: event.sourceName });
    }
    if (!revisedPrevious.isMissing) {
      merged.revisedPrevious = revisedPrevious;
      merged.isRevised = true;
      previousCandidates.push({ value: revisedPrevious, source: event.sourceName, revised: true });
    } else if (!previous.isMissing) {
      previousCandidates.push({ value: previous, source: event.sourceName, revised: false });
    }
  }

  if (actualCandidates.length) {
    merged.actual = actualCandidates[0].value;
    merged.actualSource = actualCandidates[0].source;
  }

  if (forecastCandidates.length) {
    merged.forecast = forecastCandidates[0].value;
    merged.forecastSource = forecastCandidates[0].source;
  }

  if (previousCandidates.length) {
    merged.previous = previousCandidates[0].value;
    merged.previousSource = previousCandidates[0].source;
  }

  const actualValues = [...new Set(actualCandidates.map((item) => item.value.display))];
  if (actualValues.length > 1) {
    merged.sourceAgreement = false;
  }

  return merged;
}

function containsForbiddenPlaceholder(text) {
  return FORBIDDEN_PLACEHOLDER_PATTERN.test(String(text || ""));
}

module.exports = {
  isMissingEconomicValue,
  parseEconomicNumber,
  normalizeEconomicFieldValue,
  formatDisplayValue,
  mergeProviderEvents,
  containsForbiddenPlaceholder,
  FORBIDDEN_PLACEHOLDER_PATTERN,
};
