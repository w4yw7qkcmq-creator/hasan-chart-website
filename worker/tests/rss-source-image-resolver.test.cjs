#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const {
  createRssParser,
  normalizeParsedRssItem,
  resolveRssSourceImage,
  decodeHtmlEntities,
  normalizeRssExternalImageUrl,
  resetRssSourceImageStateForTests,
  resetRssImageTelemetryForTests,
  isGenericRssImageUrl,
} = require(path.join(root, "lib/general-rss"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function parseFixture(name) {
  const xml = fs.readFileSync(path.join(root, "fixtures/general-rss", name), "utf8");
  const parser = createRssParser();
  const parsed = await parser.parseString(xml);
  return (parsed.items || []).map((item) => normalizeParsedRssItem(item));
}

function createMockHttp({ articleHtmlByUrl = {}, imageValidUrls = new Set() } = {}) {
  return {
    head: async (url) => {
      if (!imageValidUrls.has(url)) throw new Error("head_failed");
      return { headers: { "content-type": "image/jpeg", "content-length": "50000" } };
    },
    get: async (url) => {
      if (articleHtmlByUrl[url]) {
        return { status: 200, data: articleHtmlByUrl[url], headers: { "content-type": "text/html" } };
      }
      if (imageValidUrls.has(url)) {
        return { status: 200, headers: { "content-type": "image/jpeg", "content-length": "50000" }, data: { destroy() {} } };
      }
      throw new Error("get_failed");
    },
  };
}

async function run() {
  resetRssSourceImageStateForTests();
  resetRssImageTelemetryForTests();

  const mwItems = await parseFixture("marketwatch-media-content.xml");
  assert(Array.isArray(mwItems[0].mediaContent), "MarketWatch parser should preserve mediaContent array");
  assert(
    mwItems[0].mediaContent[0]?.$?.url?.includes("images.mktw.net"),
    "MarketWatch media:content url should survive parser"
  );

  let articleFetchCalls = 0;
  const mwHttp = createMockHttp({
    imageValidUrls: new Set(["https://images.mktw.net/im-12345678.jpg?width=1280"]),
  });
  const mwOriginalGet = mwHttp.get;
  mwHttp.get = async (...args) => {
    articleFetchCalls += 1;
    return mwOriginalGet(...args);
  };

  const mwResult = await resolveRssSourceImage({
    source: "MarketWatch",
    item: mwItems[0],
    articleUrl: mwItems[0].link,
    httpClient: mwHttp,
    skipValidation: false,
  });
  assert(mwResult?.source === "media_content", "MarketWatch should resolve media_content");
  assert(mwResult?.url.includes("images.mktw.net"), "MarketWatch image url");
  assert(articleFetchCalls === 0, "MarketWatch should not fetch article HTML");

  const cdItems = await parseFixture("coindesk-media-content.xml");
  const cdHttp = createMockHttp({
    imageValidUrls: new Set(["https://cdn.sanity.io/images/coindesk/example-btc-hero.jpg?w=1200"]),
  });
  let cdArticleCalls = 0;
  const cdOriginalGet = cdHttp.get;
  cdHttp.get = async (...args) => {
    if (String(args[0]).includes("coindesk.com/markets")) cdArticleCalls += 1;
    return cdOriginalGet(...args);
  };

  const cdResult = await resolveRssSourceImage({
    source: "CoinDesk",
    item: cdItems[0],
    articleUrl: cdItems[0].link,
    httpClient: cdHttp,
  });
  assert(cdResult?.source === "media_content", "CoinDesk should resolve media_content");
  assert(cdArticleCalls === 0, "CoinDesk with RSS media should skip article fetch");

  const cdFallbackCalls = { article: 0 };
  const cdFallbackHttp = createMockHttp({
    articleHtmlByUrl: {
      "https://www.coindesk.com/tech/protocol-upgrade-vote":
        '<html><head><meta property="og:image" content="https://cdn.sanity.io/images/coindesk/fallback.jpg?w=1200" /></head></html>',
    },
    imageValidUrls: new Set(["https://cdn.sanity.io/images/coindesk/fallback.jpg?w=1200"]),
  });
  const cdFallbackOriginalGet = cdFallbackHttp.get;
  cdFallbackHttp.get = async (...args) => {
    if (String(args[0]).includes("protocol-upgrade-vote")) cdFallbackCalls.article += 1;
    return cdFallbackOriginalGet(...args);
  };

  const cdFallbackResult = await resolveRssSourceImage({
    source: "CoinDesk",
    item: cdItems[1],
    articleUrl: cdItems[1].link,
    httpClient: cdFallbackHttp,
  });
  assert(cdFallbackResult?.source === "og_image", "CoinDesk without RSS media should use og fallback");
  assert(cdFallbackCalls.article === 1, "CoinDesk fallback should attempt one article fetch");

  const cnbcItems = await parseFixture("cnbc-no-media.xml");
  const cnbcArticleUrl = cnbcItems[0].link;
  const cnbcOg =
    "https://image.cnbcfm.com/api/v1/image/1234567890.jpg?v=123&amp;w=1200&amp;h=675";
  const cnbcHttp = createMockHttp({
    articleHtmlByUrl: {
      [cnbcArticleUrl]: `<html><head><meta property="og:image" content="${cnbcOg}" /></head></html>`,
    },
    imageValidUrls: new Set([normalizeRssExternalImageUrl(cnbcOg, cnbcArticleUrl)]),
  });

  const cnbcResult = await resolveRssSourceImage({
    source: "CNBC",
    item: cnbcItems[0],
    articleUrl: cnbcArticleUrl,
    httpClient: cnbcHttp,
  });
  assert(cnbcResult?.source === "og_image", "CNBC should resolve og_image");
  assert(cnbcResult?.url.includes("&w=1200"), "CNBC og URL should decode HTML entities");

  const fxItems = await parseFixture("forexlive-no-media.xml");
  const validFxOg = "https://images.forexlive.com/uploads/2026/08/eurusd-chart.jpg";
  const genericFxOg = "https://images.forexlive.com/images/il-og-thumbnail.png";
  const fxValidHttp = createMockHttp({
    articleHtmlByUrl: {
      [fxItems[0].link]: `<html><head><meta property="og:image" content="${validFxOg}" /></head></html>`,
    },
    imageValidUrls: new Set([validFxOg]),
  });
  const fxValidResult = await resolveRssSourceImage({
    source: "ForexLive",
    item: fxItems[0],
    articleUrl: fxItems[0].link,
    httpClient: fxValidHttp,
  });
  assert(fxValidResult?.url === validFxOg, "ForexLive valid og image should be accepted");

  const fxGenericHttp = createMockHttp({
    articleHtmlByUrl: {
      [fxItems[1].link]: `<html><head><meta property="og:image" content="${genericFxOg}" /></head></html>`,
    },
    imageValidUrls: new Set([genericFxOg]),
  });
  const fxGenericResult = await resolveRssSourceImage({
    source: "ForexLive",
    item: fxItems[1],
    articleUrl: fxItems[1].link,
    httpClient: fxGenericHttp,
  });
  assert(fxGenericResult === null, "ForexLive generic il-og-thumbnail should be rejected");

  assert(isGenericRssImageUrl(genericFxOg), "generic blocklist should match il-og-thumbnail");
  assert(
    decodeHtmlEntities("https://example.com/a?x=1&amp;y=2") === "https://example.com/a?x=1&y=2",
    "HTML entity decode should preserve query strings"
  );

  const { resolveNewsImagePolicy, assertRssNeverUsesAi } = require(path.join(root, "lib/news-images/image-policy"));
  const { SOURCE_TYPES, PUBLICATION_TYPES } = require(path.join(root, "lib/news-intelligence/publication-types"));
  const mediumPolicy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "MEDIUM",
  });
  assert(mediumPolicy.allowAi === false, "RSS MEDIUM policy must keep allowAi=false");
  assertRssNeverUsesAi(mediumPolicy, "rss_medium_test");

  console.log("rss-source-image-resolver.test.cjs PASS");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
