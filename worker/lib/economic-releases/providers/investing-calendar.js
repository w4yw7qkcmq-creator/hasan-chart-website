const axios = require("axios");
const { calendarTitleMatchesCanonical } = require("../canonical-events");

const INVESTING_CALENDAR_URL = "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData";
const INVESTING_US_COUNTRY_ID = "5";

function createProviderMetrics(sourceName) {
  return {
    sourceName,
    fetchedEvents: 0,
    matchedEvents: 0,
    completeEvents: 0,
    incompleteEvents: 0,
    missingPrevious: 0,
    missingForecast: 0,
    missingActual: 0,
    conflicts: 0,
    averageDelayMs: 0,
    lastSuccessAt: null,
    lastErrorSafe: null,
    _delayTotalMs: 0,
    _delayCount: 0,
  };
}

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

function extractInvestingCell(rowHtml, className) {
  const pattern = new RegExp(`<td[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i");
  const match = String(rowHtml || "").match(pattern);
  return stripHtml(match?.[1] || "");
}

function parseInvestingCalendarDate(value) {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .replace(/\//g, "-")
    .replace(" ", "T");

  const parsed = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateForInvestingCalendar(date) {
  return date.toISOString().slice(0, 10);
}

function parseInvestingCalendarRows(html) {
  const content = String(html || "");
  const rows =
    content.match(/<tr[^>]*id=["']eventRowId_[^"']+["'][\s\S]*?<\/tr>/gi) ||
    content.match(/<tr[^>]*class=["'][^"']*\bjs-event-item[^"']*["'][\s\S]*?<\/tr>/gi) ||
    [];

  return rows
    .map((row) => {
      const dateMatch = row.match(/data-event-datetime=["']([^"']+)["']/i);
      const eventDate = parseInvestingCalendarDate(dateMatch?.[1]);

      const titleMatch =
        row.match(/<td[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i) ||
        row.match(/<td[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);

      const title = stripHtml(titleMatch?.[1] || "");
      const actual = extractInvestingCell(row, "act");
      const forecast = extractInvestingCell(row, "fore");
      const previous = extractInvestingCell(row, "prev");
      const importanceStars = (row.match(/grayFullBullishIcon|orangeFullBullishIcon|redFullBullishIcon/g) || []).length;

      if (!title || !eventDate) return null;

      return {
        title,
        scheduledAt: eventDate.toISOString(),
        actual,
        forecast,
        previous,
        revisedPrevious: null,
        country: "US",
        importance: importanceStars >= 3 ? "high" : importanceStars === 2 ? "medium" : "low",
        sourceName: "investing_calendar",
        sourceTimestamp: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

async function fetchInvestingCalendarEvents(fromDate, toDate) {
  const form = new URLSearchParams();
  form.append("country[]", INVESTING_US_COUNTRY_ID);
  form.append("importance[]", "2");
  form.append("importance[]", "3");
  form.append("dateFrom", formatDateForInvestingCalendar(fromDate));
  form.append("dateTo", formatDateForInvestingCalendar(toDate));
  form.append("timeZone", "0");
  form.append("timeFilter", "timeRemain");
  form.append("currentTab", "custom");
  form.append("submitFilters", "1");
  form.append("limit_from", "0");

  const response = await axios.post(INVESTING_CALENDAR_URL, form.toString(), {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.investing.com/economic-calendar/",
      Origin: "https://www.investing.com",
    },
  });

  const html = response.data?.data || response.data?.html || response.data;
  return parseInvestingCalendarRows(html);
}

function matchEventsByCanonical(events, canonical, { windowHours = 6 } = {}) {
  const now = Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;

  return events.filter((event) => {
    if (!calendarTitleMatchesCanonical(event.title, canonical)) {
      return false;
    }

    const scheduledAt = new Date(event.scheduledAt).getTime();
    return Math.abs(now - scheduledAt) <= windowMs;
  });
}

function createInvestingCalendarProvider() {
  const metrics = createProviderMetrics("investing_calendar");
  let cache = { fetchedAt: 0, events: [] };

  async function fetchEvents({ forceRefresh = false } = {}) {
    const startedAt = Date.now();

    try {
      const cacheTtlMs = 60 * 1000;
      if (!forceRefresh && cache.events.length && Date.now() - cache.fetchedAt < cacheTtlMs) {
        return cache.events;
      }

      const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const toDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const events = await fetchInvestingCalendarEvents(fromDate, toDate);
      cache = { fetchedAt: Date.now(), events };
      metrics.fetchedEvents += events.length;
      metrics.lastSuccessAt = new Date().toISOString();
      metrics.averageDelayMs = Math.round((metrics._delayTotalMs += Date.now() - startedAt) / ++metrics._delayCount);
      return events;
    } catch (error) {
      metrics.lastErrorSafe = error.message;
      throw error;
    }
  }

  async function findMatchingRelease(canonical, options = {}) {
    const events = await fetchEvents(options);
    const matched = matchEventsByCanonical(events, canonical, options);
    metrics.matchedEvents += matched.length;
    return matched.map((event) => ({
      ...event,
      eventKey: canonical.eventKey,
    }));
  }

  return {
    name: "investing_calendar",
    priority: 2,
    fetchEvents,
    findMatchingRelease,
    getMetrics: () => ({ ...metrics }),
  };
}

module.exports = {
  createInvestingCalendarProvider,
  parseInvestingCalendarRows,
  fetchInvestingCalendarEvents,
  matchEventsByCanonical,
  createProviderMetrics,
};
