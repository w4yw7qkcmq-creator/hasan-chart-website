const axios = require("axios");
const { calendarTitleMatchesCanonical } = require("../canonical-events");
const { createProviderMetrics } = require("./investing-calendar");

function createTradingEconomicsProvider(clientKey = "guest:guest") {
  const metrics = createProviderMetrics("trading_economics");

  async function findMatchingRelease(canonical, options = {}) {
    if (!clientKey || clientKey === "guest:guest") {
      metrics.lastErrorSafe = "guest_mode_unavailable_for_release_matching";
      return [];
    }

    try {
      const country = "united states";
      const startedAt = Date.now();
      const response = await axios.get(`https://api.tradingeconomics.com/calendar/country/${encodeURIComponent(country)}`, {
        timeout: 15000,
        params: {
          c: clientKey,
          f: "json",
        },
      });

      const rows = Array.isArray(response.data) ? response.data : [];
      metrics.fetchedEvents += rows.length;
      metrics.lastSuccessAt = new Date().toISOString();
      metrics.averageDelayMs = Math.round((metrics._delayTotalMs += Date.now() - startedAt) / ++metrics._delayCount);

      const windowHours = options.windowHours || 6;
      const windowMs = windowHours * 60 * 60 * 1000;
      const now = Date.now();

      const matched = rows
        .filter((row) => {
          const title = String(row.Event || row.Category || "");
          const eventDate = new Date(row.Date || row.DateUTC || row.DateSpan).getTime();
          if (Number.isNaN(eventDate)) return false;
          if (Math.abs(now - eventDate) > windowMs) return false;
          return calendarTitleMatchesCanonical(title, canonical);
        })
        .map((row) => ({
          eventKey: canonical.eventKey,
          title: row.Event || row.Category,
          country: "US",
          scheduledAt: new Date(row.Date || row.DateUTC || row.DateSpan).toISOString(),
          actual: row.Actual,
          forecast: row.Forecast || row.TEForecast,
          previous: row.Previous,
          revisedPrevious: row.Revised || null,
          unit: row.Unit || null,
          importance: row.Importance || null,
          sourceName: "trading_economics",
          sourceTimestamp: new Date().toISOString(),
        }));

      metrics.matchedEvents += matched.length;
      return matched;
    } catch (error) {
      metrics.lastErrorSafe = error.message;
      return [];
    }
  }

  return {
    name: "trading_economics",
    priority: 2,
    findMatchingRelease,
    getMetrics: () => ({ ...metrics }),
  };
}

module.exports = {
  createTradingEconomicsProvider,
};
