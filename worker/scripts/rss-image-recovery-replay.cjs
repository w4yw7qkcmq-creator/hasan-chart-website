#!/usr/bin/env node

const path = require("path");
const axios = require("axios");
const { GENERAL_RSS_FEEDS } = require(path.join(__dirname, "../lib/general-rss/constants"));
const {
  createRssParser,
  normalizeParsedRssItem,
  resolveRssSourceImage,
  resetRssSourceImageStateForTests,
} = require(path.join(__dirname, "../lib/general-rss"));

async function fetchFeedItems(feed) {
  const response = await axios.get(feed.url, {
    timeout: 15000,
    headers: {
      "User-Agent": "HasanChartWorld-RssImageReplay/1.0",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  const parser = createRssParser();
  const parsed = await parser.parseString(String(response.data || ""));
  return (parsed.items || []).slice(0, 25).map((item) => normalizeParsedRssItem(item));
}

async function run() {
  resetRssSourceImageStateForTests();
  const summary = {};
  let total = 0;
  let resolved = 0;

  for (const feed of GENERAL_RSS_FEEDS) {
    const items = await fetchFeedItems(feed);
    let sourceResolved = 0;
    for (const item of items) {
      total += 1;
      const result = await resolveRssSourceImage({
        source: feed.name,
        item,
        articleUrl: item.link,
        skipValidation: true,
      });
      if (result?.url) {
        resolved += 1;
        sourceResolved += 1;
      }
    }
    summary[feed.name] = {
      sampled: items.length,
      resolved: sourceResolved,
      rate: items.length ? `${((sourceResolved / items.length) * 100).toFixed(1)}%` : "0%",
    };
  }

  const overallRate = total ? ((resolved / total) * 100).toFixed(1) : "0.0";
  console.log(
    JSON.stringify(
      {
        replay: "rss-image-recovery",
        total,
        resolved,
        overallRate: `${overallRate}%`,
        bySource: summary,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("RSS_IMAGE_REPLAY_FAILED", error.message);
  process.exit(1);
});
