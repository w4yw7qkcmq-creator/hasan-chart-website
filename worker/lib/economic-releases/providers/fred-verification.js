const axios = require("axios");
const { createBaseProviderMetrics, toLegacyProviderShape } = require("./provider-interface");

const FRED_API_BASE = "https://api.stlouisfed.org/fred";

const FRED_SERIES_BY_EVENT = {
  US_CPI_MOM: "CPIAUCSL",
  US_CPI_YOY: "CPIAUCSL",
  US_CORE_CPI_MOM: "CPILFESL",
  US_CORE_CPI_YOY: "CPILFESL",
  US_UNEMPLOYMENT_RATE: "UNRATE",
  US_INITIAL_JOBLESS_CLAIMS: "ICSA",
  US_CONTINUING_JOBLESS_CLAIMS: "CCSA",
  US_NFP: "PAYEMS",
  US_GDP_QOQ: "GDP",
  US_PCE: "PCEPI",
  US_CORE_PCE_MOM: "PCEPILFE",
  US_CORE_PCE_YOY: "PCEPILFE",
  US_RETAIL_SALES: "RSAFS",
};

function formatFredObservationValue(value) {
  if (value == null || value === ".") {
    return null;
  }
  return String(value);
}

function createFredVerificationProvider(options = {}) {
  const name = "fred_verification";
  const metrics = createBaseProviderMetrics(name);
  const apiKey = options.apiKey || process.env.FRED_API_KEY || null;

  metrics.providerEnabled = Boolean(apiKey);
  if (!apiKey) {
    metrics.providerStatus = "disabled_no_api_key";
    metrics.lastErrorSafe = "fred_api_key_missing";
  }

  async function fetchLatestObservation(seriesId) {
    if (!apiKey) {
      return null;
    }

    metrics.lastFetchAt = new Date().toISOString();
    metrics.requestsToday += 1;

    try {
      const response = await axios.get(`${FRED_API_BASE}/series/observations`, {
        timeout: 12000,
        params: {
          api_key: apiKey,
          file_type: "json",
          series_id: seriesId,
          sort_order: "desc",
          limit: 1,
        },
      });

      const observation = response.data?.observations?.[0];
      metrics.http200 += 1;
      metrics.lastSuccessAt = new Date().toISOString();
      return observation || null;
    } catch (error) {
      metrics.lastErrorSafe = error.response?.status ? `http_${error.response.status}` : "fred_fetch_failed";
      return null;
    }
  }

  async function findMatchingRelease(canonical, _options = {}) {
    if (!apiKey || !canonical?.eventKey) {
      return [];
    }

    const seriesId = FRED_SERIES_BY_EVENT[canonical.eventKey];
    if (!seriesId) {
      return [];
    }

    const observation = await fetchLatestObservation(seriesId);
    if (!observation) {
      return [];
    }

    metrics.eventsMatched += 1;

    return [
      toLegacyProviderShape({
        provider: name,
        sourceName: "official",
        canonicalEventKey: canonical.eventKey,
        title: canonical.arabicName || canonical.eventKey,
        country: "US",
        scheduledAt: observation.date ? `${observation.date}T12:30:00.000Z` : new Date().toISOString(),
        actual: formatFredObservationValue(observation.value),
        forecast: null,
        previous: null,
        revisedPrevious: null,
        sourceTimestamp: new Date().toISOString(),
      }),
    ];
  }

  async function healthCheck() {
    return {
      provider: name,
      enabled: metrics.providerEnabled,
      status: metrics.providerStatus,
      hasApiKey: Boolean(apiKey),
    };
  }

  return {
    name,
    priority: 3,
    role: "verification",
    providerEnabled: metrics.providerEnabled,
    fetchSchedule: async () => [],
    fetchRelease: findMatchingRelease,
    fetchEvents: async () => [],
    findMatchingRelease,
    healthCheck,
    normalizeEvent: (raw) => raw,
    getMetrics: () => ({ ...metrics }),
  };
}

module.exports = {
  createFredVerificationProvider,
  FRED_SERIES_BY_EVENT,
};
