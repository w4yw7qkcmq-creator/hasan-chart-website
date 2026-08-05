const TELEGRAM_ONLY_PREFIXES = [
  "scheduled-alert:",
  "important-event-alert:",
  "weekly-economic-calendar:",
  "telegram:",
];

const TELEGRAM_ONLY_HOSTS = ["t.me", "telegram.me"];

function isTelegramOnlyPublishedLink(link) {
  const value = String(link || "").trim();
  if (!value) return true;

  if (TELEGRAM_ONLY_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return true;
  }

  try {
    const url = new URL(value);
    if (TELEGRAM_ONLY_HOSTS.includes(url.hostname.replace(/^www\./, ""))) {
      return true;
    }
  } catch {
    // non-URL synthetic ids handled by prefix checks above
  }

  return false;
}

function isSiteEligiblePublishedLink(link) {
  const value = String(link || "").trim();
  if (!value) return false;
  if (isTelegramOnlyPublishedLink(value)) return false;
  return /^https?:\/\//i.test(value);
}

function classifyPublishedNewsLink(link) {
  if (isTelegramOnlyPublishedLink(link)) {
    if (String(link || "").startsWith("scheduled-alert:")) {
      return "scheduled_alert_telegram_only";
    }
    if (String(link || "").startsWith("important-event-alert:")) {
      return "scheduled_event_alert_telegram_only";
    }
    if (String(link || "").startsWith("weekly-economic-calendar:")) {
      return "weekly_calendar_telegram_only";
    }
    return "telegram_only_intentional";
  }
  if (isSiteEligiblePublishedLink(link)) {
    return "site_eligible";
  }
  if (String(link || "").startsWith("economic-release:")) {
    return "economic_release";
  }
  return "other";
}

module.exports = {
  isTelegramOnlyPublishedLink,
  isSiteEligiblePublishedLink,
  classifyPublishedNewsLink,
};
