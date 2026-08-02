const Parser = require("rss-parser");
const axios = require("axios");
const { GENERAL_RSS_FEEDS } = require("./constants");
const { filterGeneralRssItems, markRssItemsAsGeneralOnly } = require("../telegram-news/rss-filter");

const parser = new Parser();

function resolveFeedName(feedUrl = "") {
  const match = GENERAL_RSS_FEEDS.find((feed) => feed.url === feedUrl);
  return match?.name || feedUrl;
}

async function probeFeedHttp(feedUrl, options = {}) {
  const httpClient = options.httpClient || axios;
  try {
    const response = await httpClient.get(feedUrl, {
      timeout: options.timeoutMs || 15000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        "User-Agent": options.userAgent || "HasanChartWorld-RssProbe/1.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    const contentType = String(response.headers?.["content-type"] || "");
    const looksLikeXml = /xml|rss|atom/i.test(contentType) || /^<\?xml|<rss|<feed/i.test(String(response.data || "").slice(0, 200));

    return {
      feedUrl,
      name: resolveFeedName(feedUrl),
      httpStatus: response.status,
      contentType,
      looksLikeXml,
      finalUrl: response.request?.res?.responseUrl || feedUrl,
      ok: response.status >= 200 && response.status < 400 && looksLikeXml,
      error: null,
    };
  } catch (error) {
    return {
      feedUrl,
      name: resolveFeedName(feedUrl),
      httpStatus: null,
      contentType: null,
      looksLikeXml: false,
      finalUrl: feedUrl,
      ok: false,
      error: error.message,
    };
  }
}

async function fetchGeneralRssFeeds(options = {}) {
  const feeds = options.feeds || GENERAL_RSS_FEEDS;
  const feedReports = [];
  const items = [];

  for (const feed of feeds) {
    const probe = await probeFeedHttp(feed.url, options);
    const report = {
      ...probe,
      fetched: 0,
      normalized: 0,
      newestPublishedAt: null,
      newestAgeMinutes: null,
      accepted: 0,
      rejected: 0,
      rejectionReasons: {},
    };

    if (!probe.ok) {
      feedReports.push(report);
      continue;
    }

    try {
      const parsed = await parser.parseURL(feed.url);
      const generalOnly = filterGeneralRssItems(parsed.items || []);
      const normalized = markRssItemsAsGeneralOnly(
        generalOnly.map((item) => ({
          ...item,
          feedUrl: feed.url,
          sourceFeed: feed.url,
          sourceName: feed.name,
          fetchedAt: Date.now(),
          articlePublishedAt: item.isoDate || item.pubDate || null,
        }))
      );

      report.fetched = (parsed.items || []).length;
      report.normalized = normalized.length;

      if (normalized.length) {
        const newest = normalized.reduce((best, item) => {
          const time = new Date(item.isoDate || item.pubDate || 0).getTime();
          return !best || time > best.time ? { time, item } : best;
        }, null);

        if (newest?.time) {
          report.newestPublishedAt = new Date(newest.time).toISOString();
          report.newestAgeMinutes = Math.round((Date.now() - newest.time) / 60000);
        }
      }

      items.push(...normalized);
      feedReports.push(report);
    } catch (error) {
      report.error = error.message;
      feedReports.push(report);
    }
  }

  items.sort((a, b) => new Date(b.isoDate || b.pubDate || 0) - new Date(a.isoDate || a.pubDate || 0));

  return {
    items,
    feedReports,
    fetched: items.length,
  };
}

module.exports = {
  fetchGeneralRssFeeds,
  probeFeedHttp,
  resolveFeedName,
};
