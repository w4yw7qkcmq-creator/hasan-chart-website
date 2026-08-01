const { createTradingEconomicsPublicProvider } = require("./trading-economics-public-provider");
const { createPublicPagesCalendarProvider } = require("./public-pages-provider");
const { createTradingEconomicsProvider } = require("./trading-economics");
const { createFredVerificationProvider } = require("./fred-verification");
const { createLegacyInvestingInternalProvider } = require("./legacy-investing-internal");

function createEconomicReleaseProviderRegistry(options = {}) {
  const tradingEconomicsPublic = createTradingEconomicsPublicProvider(options.tradingEconomicsPublic || {});
  const publicPages = createPublicPagesCalendarProvider(options.publicPages || {});
  const tradingEconomics = createTradingEconomicsProvider(options.tradingEconomicsClient);
  const fredVerification = createFredVerificationProvider(options.fred || {});
  const legacyInternal = createLegacyInvestingInternalProvider();

  const providers = [tradingEconomicsPublic, publicPages, tradingEconomics, fredVerification, legacyInternal].sort(
    (a, b) => a.priority - b.priority
  );

  function getCalendarProviders() {
    return providers.filter((provider) => provider.role !== "verification" && provider.providerEnabled !== false);
  }

  function getVerificationProviders() {
    return providers.filter((provider) => provider.role === "verification" && provider.providerEnabled !== false);
  }

  async function collectMatchingReleases(canonical, fetchOptions = {}) {
    const calendarProviders = getCalendarProviders();
    const verificationProviders = getVerificationProviders();

    const calendarBatches = await Promise.all(
      calendarProviders.map(async (provider) => {
        try {
          return await provider.findMatchingRelease(canonical, fetchOptions);
        } catch (_error) {
          return [];
        }
      })
    );

    const calendarEvents = calendarBatches.flat();
    if (!calendarEvents.length && !verificationProviders.length) {
      return [];
    }

    const verificationBatches = await Promise.all(
      verificationProviders.map(async (provider) => {
        try {
          const matches = await provider.findMatchingRelease(canonical, fetchOptions);
          return matches.map((event) => ({
            ...event,
            sourceName: event.sourceName || "official",
          }));
        } catch (_error) {
          return [];
        }
      })
    );

    return [...calendarEvents, ...verificationBatches.flat()];
  }

  async function fetchSchedule(options = {}) {
    const calendarProviders = getCalendarProviders();
    for (const provider of calendarProviders) {
      if (typeof provider.fetchSchedule !== "function") {
        continue;
      }
      try {
        const events = await provider.fetchSchedule(options);
        if (events.length) {
          return events;
        }
      } catch (_error) {
        // failover to next provider
      }
    }
    return [];
  }

  function getAllMetrics() {
    return providers.map((provider) => provider.getMetrics());
  }

  function getPrimaryCalendarProvider() {
    return getCalendarProviders()[0] || null;
  }

  return {
    providers,
    collectMatchingReleases,
    fetchSchedule,
    getAllMetrics,
    getPrimaryCalendarProvider,
    getCalendarProviders,
    getVerificationProviders,
  };
}

module.exports = {
  createEconomicReleaseProviderRegistry,
};
