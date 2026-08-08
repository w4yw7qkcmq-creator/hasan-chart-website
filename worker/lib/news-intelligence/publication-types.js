const PUBLICATION_TYPES = {
  RELEASE: "RELEASE",
  PRE_EVENT_ALERT: "PRE_EVENT_ALERT",
  SCHEDULED_ALERT: "SCHEDULED_ALERT",
  GENERAL_NEWS: "GENERAL_NEWS",
};

const DESTINATIONS = {
  TELEGRAM: "telegram",
  SITE: "site",
  BOTH: "both",
};

const SOURCE_TYPES = {
  TELEGRAM_ECONOMIC: "telegram_economic",
  TELEGRAM_GENERAL: "telegram_general",
  RSS_GENERAL: "rss_general",
  ECONOMIC_PROVIDER: "economic_provider",
  MANUAL_API: "manual_api",
  SCHEDULED: "scheduled",
};

module.exports = {
  PUBLICATION_TYPES,
  DESTINATIONS,
  SOURCE_TYPES,
};
