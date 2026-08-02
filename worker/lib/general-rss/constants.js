const GENERAL_RSS_FEEDS = [
  {
    name: "CNBC",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  },
  {
    name: "MarketWatch",
    url: "https://www.marketwatch.com/rss/topstories",
  },
  {
    name: "ForexLive",
    url: "https://www.forexlive.com/feed/",
  },
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
];

const RSS_FEED_DELAY_GRACE_MINUTES = 30;

module.exports = {
  GENERAL_RSS_FEEDS,
  RSS_FEED_DELAY_GRACE_MINUTES,
};
