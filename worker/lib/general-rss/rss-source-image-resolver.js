const axios = require("axios");
const { isSafeExternalFetchUrl } = require("../news-fetch-security");
const { isGenericRssImageUrl } = require("./rss-image-generic-blocklist");
const {
  recordRssImageTelemetryEvent,
} = require("./rss-image-telemetry");

const SOURCE_STRATEGY = {
  CNBC: { allowArticleFetch: true, skipArticleWhenRssValid: false, articleTimeoutMs: 8000 },
  MarketWatch: { allowArticleFetch: false, skipArticleWhenRssValid: true, articleTimeoutMs: 0 },
  CoinDesk: { allowArticleFetch: true, skipArticleWhenRssValid: true, articleTimeoutMs: 8000, articleRateLimitMs: 30000 },
  ForexLive: { allowArticleFetch: true, skipArticleWhenRssValid: false, articleTimeoutMs: 8000 },
};

const ARTICLE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const lastArticleFetchBySource = new Map();

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function normalizeExternalImageUrl(value, baseUrl = "https://www.investing.com") {
  if (!value) return null;

  const decoded = decodeHtmlEntities(String(value).trim());
  if (!decoded) return null;

  const firstSrcsetItem = decoded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
    ?.split(" ")?.[0];

  const candidate = firstSrcsetItem || decoded;

  try {
    const normalizedUrl = candidate.startsWith("//")
      ? `https:${candidate}`
      : new URL(candidate, baseUrl).href;

    if (!/^https?:\/\//i.test(normalizedUrl)) return null;
    if (!isSafeExternalFetchUrl(normalizedUrl)) return null;
    if (/t\.me|telegram\.me|telegram\.org/i.test(normalizedUrl)) return null;
    if (/logo|icon|avatar|author|profile|sprite|favicon|placeholder|default|blank|pixel|1x1/i.test(normalizedUrl)) {
      return null;
    }
    if (/\.svg(\?|$)/i.test(normalizedUrl)) return null;

    return normalizedUrl;
  } catch (_) {
    return null;
  }
}

function extractImageUrlsFromHtml(html, baseUrl, sourceFilter = null) {
  const content = String(html || "");
  const images = [];

  const patterns = [
    { regex: /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi, source: "og_image" },
    { regex: /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi, source: "og_image" },
    { regex: /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi, source: "twitter_image" },
    { regex: /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi, source: "twitter_image" },
    { regex: /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi, source: "rss_html" },
    { regex: /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/gi, source: "rss_html" },
    { regex: /<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-srcset|srcset)=["']([^"']+)["'][^>]*>/gi, source: "rss_html" },
    { regex: /"(?:url|image|thumbnailUrl|thumbnail|imageUrl)"\s*:\s*"([^"\\]+(?:jpg|jpeg|png|webp)[^"\\]*)"/gi, source: "json_ld" },
  ];

  for (const pattern of patterns) {
    if (sourceFilter && !sourceFilter.has(pattern.source)) continue;
    for (const match of content.matchAll(pattern.regex)) {
      const imageUrl = normalizeExternalImageUrl(match?.[1], baseUrl);
      if (imageUrl) images.push({ url: imageUrl, source: pattern.source });
    }
  }

  return images;
}

function pushMediaEntry(entry, source, articleUrl, out) {
  if (!entry) return;
  const list = Array.isArray(entry) ? entry : [entry];
  for (const media of list) {
    const url = media?.$?.url || media?.url || media?.href;
    const normalized = normalizeExternalImageUrl(url, articleUrl);
    if (normalized) out.push({ url: normalized, source });
  }
}

function collectRssMediaCandidates(item = {}, articleUrl = "") {
  const candidates = [];
  const baseUrl = articleUrl || item.link || item.guid || "https://www.investing.com";

  pushMediaEntry(item.enclosure?.url ? { url: item.enclosure.url } : null, "enclosure", baseUrl, candidates);
  pushMediaEntry(item.mediaContent, "media_content", baseUrl, candidates);
  pushMediaEntry(item.mediaThumbnail, "media_thumbnail", baseUrl, candidates);
  pushMediaEntry(item["media:content"], "media_content", baseUrl, candidates);
  pushMediaEntry(item["media:thumbnail"], "media_thumbnail", baseUrl, candidates);

  pushMediaEntry(item.thumbnail, "rss_html", baseUrl, candidates);
  pushMediaEntry(item.image, "rss_html", baseUrl, candidates);
  pushMediaEntry(item.imageUrl, "rss_html", baseUrl, candidates);
  pushMediaEntry(item.media?.content, "media_content", baseUrl, candidates);

  const htmlFields = [
    item.contentEncoded,
    item["content:encoded"],
    item.content,
    item.contentSnippet,
    item.description,
  ];

  for (const html of htmlFields) {
    extractImageUrlsFromHtml(html, baseUrl, new Set(["rss_html"])).forEach((candidate) => candidates.push(candidate));
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.source}:${candidate.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreImageUrl(url) {
  let total = 0;
  const value = String(url || "").toLowerCase();

  if (/1200|1280|1440|1600|1920|2048|2560/.test(value)) total += 8;
  if (/og|social|article|lead|hero|main|large|photo|image|cdn|prod|original|primary/.test(value)) total += 5;
  if (/i-invdn\.com|cnbcfm\.com|cnbc\.com|marketwatch\.com|mktw\.net|coindesk\.com|sanity\.io|images\.investinglive\.com/.test(value)) {
    total += 4;
  }
  if (/thumb|thumbnail|small|80x|120x|150x|300x|sprite|avatar|logo|icon|favicon|placeholder|default/.test(value)) {
    total -= 8;
  }
  if (/\.webp(\?|$)|\.jpg(\?|$)|\.jpeg(\?|$)|\.png(\?|$)/.test(value)) total += 3;

  return total;
}

function looksLikeEditorialImage(url = "") {
  return (
    /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url) ||
    /image|photo|media|cdn|static|prod|mktw|sanity|cnbcfm/i.test(url)
  );
}

async function validateImageUrl(url, options = {}) {
  const httpClient = options.httpClient || axios;
  const timeoutMs = options.validationTimeoutMs || 5000;

  try {
    let response = await httpClient.head(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: { "User-Agent": ARTICLE_USER_AGENT },
    });

    let contentType = String(response.headers?.["content-type"] || "");
    let contentLength = Number(response.headers?.["content-length"] || 0);

    if (!contentType.startsWith("image/")) {
      response = await httpClient.get(url, {
        timeout: timeoutMs,
        maxRedirects: 5,
        responseType: "stream",
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          "User-Agent": ARTICLE_USER_AGENT,
          Range: "bytes=0-2047",
        },
      });
      contentType = String(response.headers?.["content-type"] || "");
      contentLength = Number(response.headers?.["content-length"] || 0);
      if (response.data?.destroy) response.data.destroy();
    }

    if (!contentType.startsWith("image/")) return false;
    if (contentLength > 0 && contentLength < 500) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function extractJsonLdImages(html, articleUrl) {
  const images = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of String(html || "").matchAll(pattern)) {
    try {
      const jsonText = String(match?.[1] || "").trim();
      if (!jsonText) continue;
      const parsed = JSON.parse(jsonText);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];

      const collectImages = (node) => {
        if (!node || typeof node !== "object") return;
        const image = node.image || node.thumbnailUrl;
        if (typeof image === "string") {
          const imageUrl = normalizeExternalImageUrl(image, articleUrl);
          if (imageUrl) images.push({ url: imageUrl, source: "json_ld" });
        } else if (Array.isArray(image)) {
          image.forEach((entry) => {
            if (typeof entry === "string") {
              const imageUrl = normalizeExternalImageUrl(entry, articleUrl);
              if (imageUrl) images.push({ url: imageUrl, source: "json_ld" });
            } else if (entry?.url) {
              const imageUrl = normalizeExternalImageUrl(entry.url, articleUrl);
              if (imageUrl) images.push({ url: imageUrl, source: "json_ld" });
            }
          });
        } else if (image?.url) {
          const imageUrl = normalizeExternalImageUrl(image.url, articleUrl);
          if (imageUrl) images.push({ url: imageUrl, source: "json_ld" });
        }

        Object.values(node).forEach((value) => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) value.forEach(collectImages);
          else collectImages(value);
        });
      };

      nodes.forEach(collectImages);
    } catch (_) {
      // Ignore broken JSON-LD blocks.
    }
  }

  return images;
}

async function fetchArticleImageCandidates(articleUrl, options = {}) {
  const httpClient = options.httpClient || axios;
  const timeoutMs = options.articleTimeoutMs || 8000;

  if (!articleUrl || !/^https?:\/\//i.test(articleUrl)) return [];
  if (/t\.me|telegram\.me|telegram\.org/i.test(articleUrl)) return [];

  const response = await httpClient.get(articleUrl, {
    timeout: timeoutMs,
    maxRedirects: 5,
    headers: {
      "User-Agent": ARTICLE_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const html = String(response.data || "");
  const candidates = [];

  extractImageUrlsFromHtml(html, articleUrl, new Set(["og_image"])).forEach((candidate) => candidates.push(candidate));
  extractImageUrlsFromHtml(html, articleUrl, new Set(["twitter_image"])).forEach((candidate) => candidates.push(candidate));
  extractJsonLdImages(html, articleUrl).forEach((candidate) => candidates.push(candidate));

  const seen = new Set();
  return candidates
    .filter((candidate) => {
      const key = `${candidate.source}:${candidate.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return looksLikeEditorialImage(candidate.url);
    })
    .sort((a, b) => scoreImageUrl(b.url) - scoreImageUrl(a.url));
}

function resolveSourceStrategy(source = "") {
  const key = String(source || "").trim();
  const match = Object.keys(SOURCE_STRATEGY).find((name) => name.toLowerCase() === key.toLowerCase());
  return SOURCE_STRATEGY[match] || { allowArticleFetch: true, skipArticleWhenRssValid: false, articleTimeoutMs: 8000 };
}

function canAttemptArticleFetch(source, strategy, options = {}) {
  if (options.forceSkipArticleFetch) return false;
  if (!strategy.allowArticleFetch) return false;
  if (!options.articleUrl) return false;

  const rateLimitMs = strategy.articleRateLimitMs || 0;
  if (rateLimitMs > 0) {
    const lastFetch = Number(lastArticleFetchBySource.get(source) || 0);
    if (Date.now() - lastFetch < rateLimitMs) return false;
  }

  return true;
}

async function pickFirstValidatedCandidate(candidates, options = {}) {
  const sorted = [...candidates].sort((a, b) => scoreImageUrl(b.url) - scoreImageUrl(a.url));

  for (const candidate of sorted) {
    if (!looksLikeEditorialImage(candidate.url)) {
      recordRssImageTelemetryEvent(options.source, "rss_image_validation_failed");
      continue;
    }

    if (isGenericRssImageUrl(candidate.url, options)) {
      recordRssImageTelemetryEvent(options.source, "rss_image_generic_rejected");
      continue;
    }

    const skipValidation = options.skipValidation === true;
    const validated = skipValidation ? true : await validateImageUrl(candidate.url, options);
    if (!validated) {
      recordRssImageTelemetryEvent(options.source, "rss_image_validation_failed");
      continue;
    }

    return {
      url: candidate.url,
      source: candidate.source,
      validated: true,
      genericRejected: false,
    };
  }

  return null;
}

async function resolveRssSourceImage(params = {}) {
  const { source, item, articleUrl, ...options } = params;
  const strategy = resolveSourceStrategy(source);
  const rssCandidates = collectRssMediaCandidates(item, articleUrl);
  const rssResult = await pickFirstValidatedCandidate(rssCandidates, { ...options, source });

  if (rssResult) {
    if (strategy.skipArticleWhenRssValid || rssResult.source !== "rss_html") {
      return rssResult;
    }
  }

  if (!canAttemptArticleFetch(source, strategy, { ...options, articleUrl })) {
    return rssResult || null;
  }

  recordRssImageTelemetryEvent(source, "rss_article_image_fetch_attempted");
  lastArticleFetchBySource.set(source, Date.now());

  try {
    const articleCandidates = await fetchArticleImageCandidates(articleUrl, {
      ...options,
      articleTimeoutMs: strategy.articleTimeoutMs || options.articleTimeoutMs || 8000,
    });
    const articleResult = await pickFirstValidatedCandidate(articleCandidates, { ...options, source });
    if (articleResult) return articleResult;
  } catch (_) {
    recordRssImageTelemetryEvent(source, "rss_article_image_fetch_failed");
  }

  return rssResult || null;
}

function resetRssSourceImageStateForTests() {
  lastArticleFetchBySource.clear();
}

module.exports = {
  SOURCE_STRATEGY,
  decodeHtmlEntities,
  normalizeExternalImageUrl,
  extractImageUrlsFromHtml,
  collectRssMediaCandidates,
  validateImageUrl,
  fetchArticleImageCandidates,
  resolveRssSourceImage,
  resetRssSourceImageStateForTests,
  pickFirstValidatedCandidate,
};
