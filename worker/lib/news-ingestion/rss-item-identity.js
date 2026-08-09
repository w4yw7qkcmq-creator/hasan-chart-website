const { normalizeTitle } = require("../general-rss/market-relevance");

function normalizeLink(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    let pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function buildRssItemIdentity(item = {}) {
  const link = normalizeLink(item.link || item.id || "");
  if (link) return `link:${link}`;

  const guid = String(item.guid || item.guid?._ || "").trim();
  if (guid) return `guid:${guid.toLowerCase()}`;

  const feedUrl = String(item.feedUrl || item.sourceFeed || "").trim();
  const titleKey = normalizeTitle(item.title || "").slice(0, 120);
  if (titleKey && feedUrl) return `title:${feedUrl}:${titleKey}`;
  if (titleKey) return `title:${titleKey}`;

  return null;
}

function getRssItemPublishedAtMs(item = {}) {
  const ms = new Date(item.isoDate || item.pubDate || item.articlePublishedAt || 0).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

module.exports = {
  normalizeLink,
  buildRssItemIdentity,
  getRssItemPublishedAtMs,
};
