function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractField(block, pattern) {
  const match = String(block || "").match(pattern);
  return match ? match[1].trim() : "";
}

function parseTeTimeTo24Hour(timeRaw) {
  const match = String(timeRaw || "").trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) {
    hours += 12;
  }
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}:00`;
}

function parseScheduledAt(block) {
  const dateRaw = extractField(block, /class=['"]\s*(\d{4}-\d{2}-\d{2})\s*['"]/i);
  const timeRaw = extractField(block, /calendar-date-\d+">\s*([^<]+)/i);
  const time24 = parseTeTimeTo24Hour(timeRaw);

  if (!dateRaw || !time24) {
    return null;
  }

  const parsed = new Date(`${dateRaw}T${time24}.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseImportance(block) {
  const stars = extractField(block, /calendar-date-(\d)/i);
  if (stars === "3") {
    return "high";
  }
  if (stars === "2") {
    return "medium";
  }
  if (stars === "1") {
    return "low";
  }
  return null;
}

function parseRevisedPrevious(block) {
  const title = extractField(block, /id=['"]revised['"][^>]*title=['"]([^'"]*)['"]/i);
  const match = title.match(/previous revised from\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function inferUnit(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  if (/%/.test(raw)) {
    return "%";
  }
  if (/K$/i.test(raw)) {
    return "K";
  }
  if (/B$/i.test(raw)) {
    return "B";
  }
  if (/M$/i.test(raw)) {
    return "M";
  }
  return null;
}

function parseTradingEconomicsCalendarHtml(html) {
  const content = String(html || "");
  const chunks = content.split('<tr data-url="');

  if (chunks.length <= 1) {
    return { strategy: null, events: [] };
  }

  const headerSample = content;
  const hasSemanticHeaders =
    /<th[^>]*>\s*Actual\s*<\/th>/i.test(headerSample) &&
    /<th[^>]*>\s*Previous\s*<\/th>/i.test(headerSample) &&
    /Consensus|Forecast/i.test(headerSample);

  if (!hasSemanticHeaders) {
    return { strategy: null, events: [] };
  }

  const events = [];

  for (const chunk of chunks.slice(1)) {
    const urlMatch = chunk.match(/^([^"]+)"/);
    const url = urlMatch ? urlMatch[1].trim() : "";
    if (!url) {
      continue;
    }

    const nextRow = chunk.indexOf('<tr data-url="');
    const block = nextRow >= 0 ? chunk.slice(0, nextRow) : chunk;

    const providerEventId = extractField(block, /data-id=["'](\d+)["']/i);
    const countryRaw = extractField(block, /data-country=["']([^"']+)["']/i);
    const category = extractField(block, /data-category=["']([^"']+)["']/i);
    const dataEvent = extractField(block, /data-event=["']([^"']+)["']/i);
    const title =
      extractField(block, /class=['"]calendar-event['"][^>]*>([^<]+)<\/a>/i) ||
      stripHtml(dataEvent) ||
      url;

    const actual = extractField(block, /<span id=['"]actual['"]>([^<]*)<\/span>/i);
    const previous = extractField(block, /<span id=['"]previous['"]>([^<]*)<\/span>/i);
    const consensus = extractField(block, /<a id=['"]consensus['"][^>]*>([^<]*)<\/a>/i);
    const teForecast = extractField(block, /<a id=['"]forecast['"][^>]*>([^<]*)<\/a>/i);
    const forecast = consensus || teForecast;
    const period = extractField(block, /class=['"]calendar-reference['"]>([^<]+)</i);
    const revisedPrevious = parseRevisedPrevious(block);
    const scheduledAt = parseScheduledAt(block);
    const importance = parseImportance(block);
    const unit = inferUnit(actual || forecast || previous);

    const country =
      countryRaw === "united states"
        ? "US"
        : countryRaw
            .split(" ")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");

    events.push({
      providerEventId,
      title,
      country,
      countryRaw,
      category,
      dataEvent,
      scheduledAt,
      period,
      actual: actual || null,
      previous: previous || null,
      revisedPrevious,
      forecast: forecast || null,
      consensus: consensus || null,
      teForecast: teForecast || null,
      unit,
      importance,
      sourceUrl: url,
    });
  }

  return {
    strategy: events.length ? "trading_economics_semantic_table" : null,
    events,
  };
}

module.exports = {
  stripHtml,
  parseTradingEconomicsCalendarHtml,
  parseScheduledAt,
  parseImportance,
  parseRevisedPrevious,
  inferUnit,
};
