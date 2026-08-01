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

function extractCellByClass(rowHtml, className) {
  const pattern = new RegExp(`<td[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i");
  const match = String(rowHtml || "").match(pattern);
  return stripHtml(match?.[1] || "");
}

function parseCalendarDate(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(/\//g, "-").replace(" ", "T");
  const parsed = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInvestingRowStrategy(html) {
  const content = String(html || "");
  const rows =
    content.match(/<tr[^>]*id=["']eventRowId_[^"']+["'][\s\S]*?<\/tr>/gi) ||
    content.match(/<tr[^>]*class=["'][^"']*\bjs-event-item[^"']*["'][\s\S]*?<\/tr>/gi) ||
    [];

  return rows
    .map((row) => {
      const idMatch = row.match(/id=["']eventRowId_(\d+)["']/i);
      const dateMatch = row.match(/data-event-datetime=["']([^"']+)["']/i);
      const eventDate = parseCalendarDate(dateMatch?.[1]);
      const titleMatch =
        row.match(/<td[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i) ||
        row.match(/<td[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
      const title = stripHtml(titleMatch?.[1] || "");
      const actual = extractCellByClass(row, "act");
      const forecast = extractCellByClass(row, "fore");
      const previous = extractCellByClass(row, "prev");
      const importanceStars = (row.match(/grayFullBullishIcon|orangeFullBullishIcon|redFullBullishIcon/g) || []).length;

      if (!title || !eventDate) return null;

      return {
        providerEventId: idMatch?.[1] || null,
        title,
        scheduledAt: eventDate.toISOString(),
        actual,
        forecast,
        previous,
        revisedPrevious: null,
        country: "US",
        importance: importanceStars >= 3 ? "high" : importanceStars === 2 ? "medium" : "low",
      };
    })
    .filter(Boolean);
}

function parseSemanticTableStrategy(html) {
  const content = String(html || "");
  const tables = content.match(/<table[\s\S]*?<\/table>/gi) || [];
  const events = [];

  for (const table of tables) {
    const headerCells = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => stripHtml(match[1]).toLowerCase());
    if (!headerCells.length) continue;

    const actualIdx = headerCells.findIndex((cell) => /actual|act/i.test(cell));
    const forecastIdx = headerCells.findIndex((cell) => /forecast|consensus|estimate|fore/i.test(cell));
    const previousIdx = headerCells.findIndex((cell) => /previous|prev|prior/i.test(cell));
    const eventIdx = headerCells.findIndex((cell) => /event|indicator|release/i.test(cell));
    const timeIdx = headerCells.findIndex((cell) => /time|date/i.test(cell));

    if (actualIdx === -1 && forecastIdx === -1 && previousIdx === -1) {
      continue;
    }

    const bodyRows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of bodyRows) {
      if (/<th/i.test(row)) continue;
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtml(match[1]));
      if (!cells.length) continue;

      const title = eventIdx >= 0 ? cells[eventIdx] : cells.find((cell) => cell.length > 3) || null;
      const scheduledAtRaw = timeIdx >= 0 ? cells[timeIdx] : null;
      const scheduledAt = parseCalendarDate(scheduledAtRaw);
      if (!title) continue;

      events.push({
        providerEventId: null,
        title,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        actual: actualIdx >= 0 ? cells[actualIdx] : null,
        forecast: forecastIdx >= 0 ? cells[forecastIdx] : null,
        previous: previousIdx >= 0 ? cells[previousIdx] : null,
        revisedPrevious: null,
        country: "US",
        importance: null,
      });
    }
  }

  return events.filter((event) => event.scheduledAt);
}

const PARSER_STRATEGIES = [
  { name: "investing_row", parse: parseInvestingRowStrategy },
  { name: "semantic_table", parse: parseSemanticTableStrategy },
];

function parseCalendarHtml(html) {
  for (const strategy of PARSER_STRATEGIES) {
    const events = strategy.parse(html);
    if (events.length) {
      return {
        strategy: strategy.name,
        events,
      };
    }
  }

  return {
    strategy: null,
    events: [],
  };
}

module.exports = {
  stripHtml,
  parseCalendarHtml,
  parseInvestingRowStrategy,
  parseSemanticTableStrategy,
  PARSER_STRATEGIES,
};
