const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");
const axios = require("axios");
const FormData = require("form-data");
const { createCanvas, loadImage, registerFont } = require("canvas");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

try {
  const arabicFontPath = path.join(__dirname, "fonts", "NotoNaskhArabic-Regular.ttf");

  if (fs.existsSync(arabicFontPath)) {
    registerFont(arabicFontPath, { family: "Arabic" });
    console.log("✅ Arabic font registered");
  } else {
    console.log("⚠️ Arabic font file not found, using system fallback");
  }
} catch (error) {
  console.error("⚠️ Arabic font registration failed:", error.message);
}

const parser = new Parser();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const LAST_NEWS_FILE = path.join(__dirname, "last-news.json");
const NEWS_CARD_FILE = path.join(__dirname, "news-card.png");
const CHANNEL_LOGO_FILE = path.join(__dirname, "assets", "logo.png");

// Temporary test mode: true = publish any latest news to test the image design.
// After testing, change this to false to activate the important-news filter again.
const TEMP_ALLOW_ALL_NEWS = false;

const MAX_NEWS_AGE_HOURS = 24;
const MAX_POSTS_PER_HOUR = 5;
const MAX_HIGH_IMPACT_POSTS_PER_HOUR = 10;

const ULTRA_PRIORITY_KEYWORDS = [
  "fed",
  "fomc",
  "interest rate decision",
  "cpi",
  "nfp",
  "consumer confidence",
  "powell",
  "war",
  "iran",
  "israel",
  "missile",
  "attack",
  "oil spikes",
  "market crash",
  "stocks plunge",
  "liquidations",
  "crypto liquidations",
  "bitcoin plunges",
  "breaking",
  "الفيدرالي",
  "قرار الفائدة",
  "التضخم",
  "البطالة",
  "ثقة المستهلك",
  "تصفيات",
  "انهيار السوق",
  "خسائر الأسواق",
  "ضرب إيران",
  "تصعيد",
  "هجوم",
  "صاروخ",
  "النفط",
];
const MIN_MINUTES_BETWEEN_POSTS = 0;
// Prefer real images from the news source. Keep local images only as an optional emergency fallback.
const USE_LOCAL_IMAGE_FALLBACK = false;
const MIN_IMAGE_WIDTH = 1280;
const MIN_IMAGE_HEIGHT = 720;

let isFetchingNews = false;

const IMPORTANT_KEYWORDS = [
  "fed",
  "fomc",
  "powell",
  "federal reserve",
  "interest rate",
  "rate decision",
  "rate outlook",
  "rate expectations",
  "dot plot",
  "hawkish",
  "dovish",
  "consumer confidence",
  "consumer sentiment",
  "retail sales",
  "ppi",
  "core cpi",
  "core pce",
  "jobless claims",
  "initial claims",
  "continuing claims",
  "ism manufacturing",
  "ism services",
  "pmi",
  "manufacturing pmi",
  "services pmi",
  "housing starts",
  "existing home sales",
  "new home sales",
  "durable goods",
  "factory orders",
  "earnings",
  "quarterly results",
  "guidance",
  "revenue",
  "eps",
  "rate cut",
  "rate hike",
  "cpi",
  "inflation",
  "pce",
  "nfp",
  "non-farm",
  "payrolls",
  "unemployment",
  "jobs report",
  "gdp",
  "recession",
  "bank crisis",
  "banking crisis",
  "treasury yields",
  "bond yields",
  "usd",
  "dollar",
  "gold",
  "oil",
  "crude",
  "brent",
  "wti",
  "bitcoin",
  "btc",
  "crypto",
  "ethereum",
  "etf",
  "nasdaq",
  "dow jones",
  "s&p 500",
  "stock market",
  "market losses",
  "selloff",
  "sell-off",
  "stocks fall",
  "stocks plunge",
  "stocks sink",
  "nasdaq falls",
  "dow falls",
  "s&p falls",
  "futures fall",
  "futures plunge",
  "liquidations",
  "crypto liquidations",
  "futures liquidations",
  "margin call",
  "risk-off",
  "market rout",
  "market crash",
  "wall street",
  "forex",
  "eurusd",
  "gbpusd",
  "usdjpy",
  "audusd",
  "usdcad",
  "usdchf",
  "currency market",
  "currencies",
  "tariff",
  "sanctions",
  "war",
  "attack",
  "missile",
  "military",
  "airstrike",
  "escalation",
  "port attack",
  "ports attack",
  "ship attack",
  "ships attacked",
  "vessel attack",
  "tanker attack",
  "red sea",
  "persian gulf",
  "strait of hormuz",
  "naval attack",
  "drone attack",
  "retaliation",
  "iran",
  "israel",
  "russia",
  "ukraine",
  "china",
  "taiwan",
  "middle east",
  "opec",
  "breaking",
  "breaking news",
  "breaking forex news",
  "central bank",
  "boj",
  "ecb",
  "bank of england",
  "boe",
  "ecb president",
  "yield",
  "treasury",
  "risk sentiment",
  "safe haven",
  "الفيدرالي",
  "الفائدة",
  "رفع الفائدة",
  "خفض الفائدة",
  "تثبيت الفائدة",
  "توقعات الفائدة",
  "ثقة المستهلك",
  "مؤشر ثقة المستهلك",
  "التضخم",
  "البطالة",
  "الوظائف",
  "مبيعات التجزئة",
  "مؤشر مديري المشتريات",
  "أرباح الشركات",
  "خسائر الأسواق",
  "هبوط الأسواق",
  "انهيار السوق",
  "تراجع الأسهم",
  "خسائر الأسهم الأمريكية",
  "تصفيات",
  "تصفيات الفيوتشر",
  "تصفيات العقود الآجلة",
  "تصفية مراكز",
  "ضرب إيران",
  "ضرب ايران",
  "تصعيد",
  "استهداف السفن",
  "ضرب السفن",
  "استهداف الموانئ",
  "ضرب الموانئ",
  "البحر الأحمر",
  "الخليج العربي",
  "مضيق هرمز",
  "هجوم بطائرات مسيرة",
  "رد انتقامي",
  "نتائج الأعمال",
  "الإيرادات",
  "الاقتصاد الأمريكي",
  "باول",
];

const ECONOMIC_CALENDAR_EVENTS = [
  "interest rate",
  "rate decision",
  "fomc",
  "powell",
  "cpi",
  "ppi",
  "pce",
  "nfp",
  "nonfarm payrolls",
  "unemployment",
  "consumer confidence",
  "consumer sentiment",
  "retail sales",
  "pmi",
  "ism",
  "gdp",
  "jobless claims",
  "initial claims",
  "continuing claims",
  "الفائدة",
  "التضخم",
  "البطالة",
  "ثقة المستهلك",
  "مؤشر ثقة المستهلك",
  "مبيعات التجزئة",
  "الناتج المحلي",
  "الوظائف",
  "طلبات إعانة البطالة",
];

function isEconomicCalendarNews(title) {
  const lowerTitle = String(title || "").toLowerCase();

  return ECONOMIC_CALENDAR_EVENTS.some((keyword) =>
    lowerTitle.includes(keyword.toLowerCase())
  );
}

const NEWS_FEEDS = [
  "https://www.forexlive.com/feed/",
  "https://www.investing.com/rss/news_25.rss",
  "https://www.investing.com/rss/news_1.rss",
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://www.fxstreet.com/rss/news",
  "https://feeds.marketwatch.com/marketwatch/topstories/",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.investing.com/rss/news_285.rss",
  "https://www.investing.com/rss/news_301.rss",
];


function isImportantNews(title) {
  const lowerTitle = title.toLowerCase();
  return IMPORTANT_KEYWORDS.some((keyword) =>
    lowerTitle.includes(keyword)
  );
}

function getMarketImpactLevel(text) {
  const value = String(text || "").toLowerCase();

  const criticalPattern = /fed rate decision|fomc decision|interest rate decision|rate cut|rate hike|powell speaks|powell says|cpi|core cpi|pce inflation|core pce|nfp|nonfarm payrolls|unemployment rate|consumer confidence|ism manufacturing|ism services|gdp|market losses|market rout|market crash|selloff|sell-off|stocks plunge|stocks sink|stocks tumble|nasdaq falls|nasdaq plunges|dow falls|s&p falls|futures fall|futures plunge|liquidations|crypto liquidations|futures liquidations|margin call|risk-off|oil prices surge|oil prices jump|oil spikes|gold jumps|bitcoin plunges|bitcoin surges|war breaks out|missile attack|drone attack|airstrike|escalation|retaliation|port attack|ports attack|ship attack|ships attacked|vessel attack|tanker attack|red sea|persian gulf|strait of hormuz|naval attack|hormuz|sanctions announced|tariff announced|الفيدرالي|قرار الفائدة|خفض الفائدة|رفع الفائدة|التضخم|مؤشر ثقة المستهلك|البطالة|الوظائف|خسائر الأسواق|هبوط الأسواق|انهيار السوق|تراجع الأسهم|خسائر الأسهم الأمريكية|تصفيات|تصفيات الفيوتشر|تصفيات العقود الآجلة|تصفية مراكز|النفط|الذهب|هرمز|عقوبات|هجوم|ضرب إيران|ضرب ايران|تصعيد|استهداف السفن|ضرب السفن|استهداف الموانئ|ضرب الموانئ|البحر الأحمر|الخليج العربي|مضيق هرمز|هجوم بطائرات مسيرة|رد انتقامي/i;

  const mediumPattern = /federal reserve|fomc|powell|interest rate|inflation|ppi|pce|payrolls|jobless claims|retail sales|pmi|ism|treasury yields|dollar index|brent|wti|gold|bitcoin|btc|ethereum|nasdaq|dow jones|s&p 500|futures|liquidation|selloff|risk off|market volatility|nvidia|apple|tesla|microsoft|earnings|revenue|guidance|iran|israel|russia|ukraine|opec|tariff|sanctions|missile|attack|ship|port|red sea|persian gulf|الفائدة|باول|مبيعات التجزئة|طلبات إعانة البطالة|الدولار|البيتكوين|إيران|ايران|إسرائيل|اسرائيل|روسيا|أوكرانيا|اوكرانيا|أرباح|خسائر|هبوط|تصفيات|الفيوتشر|العقود الآجلة|السفن|الموانئ|تصعيد/i;

  const weakPattern = /analyst estimates|price target|stock on pace|shares rise modestly|personal care|retailer|upgrade|downgrade|opinion|preview|recap|what to watch|could|may|might|minor|small move|mixed close|little changed/i;

  if (criticalPattern.test(value)) {
    return "HIGH";
  }

  if (mediumPattern.test(value) && !weakPattern.test(value)) {
    return "MEDIUM";
  }

  return "LOW";
}

function pickRandomAsset(fileNames) {
  const availableFiles = fileNames
    .map((fileName) => path.join(__dirname, "assets", fileName))
    .filter((filePath) => fs.existsSync(filePath));

  if (!availableFiles.length) {
    return path.join(__dirname, "assets", "default.png");
  }

  const randomIndex = Math.floor(Math.random() * availableFiles.length);
  return availableFiles[randomIndex];
}

function selectNewsImage(title) {
  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.includes("bitcoin") ||
    lowerTitle.includes("btc") ||
    lowerTitle.includes("crypto") ||
    lowerTitle.includes("ethereum") ||
    lowerTitle.includes("solana")
  ) {
    return pickRandomAsset([
      "bitcoin-1.png",
      "bitcoin-2.png",
      "bitcoin-3.png",
      "crypto-1.png",
      "crypto-2.png",
      "bitcoin.png",
      "crypto.png",
    ]);
  }

  if (lowerTitle.includes("gold") || lowerTitle.includes("xau")) {
    return pickRandomAsset([
      "gold-1.png",
      "gold-2.png",
      "gold-3.png",
      "gold.png",
    ]);
  }

  if (
    lowerTitle.includes("oil") ||
    lowerTitle.includes("crude") ||
    lowerTitle.includes("brent") ||
    lowerTitle.includes("wti")
  ) {
    return pickRandomAsset([
      "oil-1.png",
      "oil-2.png",
      "oil-3.png",
      "oil.png",
    ]);
  }

  if (
    lowerTitle.includes("fed") ||
    lowerTitle.includes("powell") ||
    lowerTitle.includes("fomc") ||
    lowerTitle.includes("interest rate") ||
    lowerTitle.includes("federal reserve")
  ) {
    return pickRandomAsset([
      "fed-1.png",
      "fed-2.png",
      "fed-3.png",
      "powell-1.png",
      "powell-2.png",
      "fed.png",
      "powell.png",
    ]);
  }

  if (lowerTitle.includes("trump")) {
    return pickRandomAsset([
      "trump-1.png",
      "trump-2.png",
      "trump-3.png",
      "trump.png",
    ]);
  }

  if (lowerTitle.includes("iran") || lowerTitle.includes("tehran")) {
    return pickRandomAsset([
      "iran-1.png",
      "iran-2.png",
      "iran-3.png",
      "iran.png",
    ]);
  }

  if (
    lowerTitle.includes("war") ||
    lowerTitle.includes("missile") ||
    lowerTitle.includes("attack") ||
    lowerTitle.includes("military") ||
    lowerTitle.includes("gaza") ||
    lowerTitle.includes("ukraine") ||
    lowerTitle.includes("russia") ||
    lowerTitle.includes("israel")
  ) {
    return pickRandomAsset([
      "war-1.png",
      "war-2.png",
      "war-3.png",
      "war.png",
    ]);
  }

  if (
    lowerTitle.includes("usd") ||
    lowerTitle.includes("eur") ||
    lowerTitle.includes("forex") ||
    lowerTitle.includes("dollar")
  ) {
    return pickRandomAsset([
      "forex-1.png",
      "forex-2.png",
      "forex-3.png",
      "forex.png",
    ]);
  }

  if (
    lowerTitle.includes("stock") ||
    lowerTitle.includes("nasdaq") ||
    lowerTitle.includes("dow") ||
    lowerTitle.includes("s&p")
  ) {
    return pickRandomAsset([
      "stocks-1.png",
      "stocks-2.png",
      "stocks-3.png",
      "stocks.png",
    ]);
  }

  return pickRandomAsset([
    "default-1.png",
    "default-2.png",
    "default-3.png",
    "default.png",
  ]);
}

function getImageFromNewsItem(item) {
  // Do not use RSS thumbnails or inline HTML images because they are often low-resolution previews.
}

// Try to extract an image from the article's HTML if not found in the RSS item.
async function getImageFromArticleUrl(articleUrl) {
  if (!articleUrl || !/^https?:\/\//i.test(articleUrl)) {
    return null;
  }

  try {
    const response = await axios.get(articleUrl, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });

    const html = response.data || "";

    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        const imageUrl = new URL(match[1], articleUrl).href;

        if (/^https?:\/\//i.test(imageUrl)) {
          return imageUrl;
        }
      }
    }
  } catch (error) {
    console.error("⚠️ Article image fetch failed:", error.message);
  }

  return null;
}

function normalizeNewsTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .replace(/\b(breaking|update|latest|market|news|says|said|live|forexlive|investing|reuters|bloomberg|fxstreet|coindesk|cnbc|marketwatch|forexnewspaper)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStrongDuplicateKey(text) {
  const value = normalizeNewsTitle(text || "");

  const assets = [
    "xrp",
    "ripple",
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "gold",
    "oil",
    "nasdaq",
    "dow",
    "s p 500",
    "fed",
    "fomc",
    "powell",
    "cpi",
    "ppi",
    "pce",
    "nfp",
    "consumer confidence",
    "unemployment",
    "iran",
    "israel",
    "russia",
    "ukraine",
    "hormuz",
    "opec",
    "البيتكوين",
    "الذهب",
    "النفط",
    "الفيدرالي",
    "التضخم",
    "البطالة",
    "ثقة المستهلك",
    "إيران",
    "ايران",
    "إسرائيل",
    "اسرائيل",
    "هرمز",
  ];

  const actions = [
    "raise",
    "raises",
    "raising",
    "reserve",
    "reserves",
    "treasury",
    "funding",
    "donation",
    "donations",
    "surge",
    "jumps",
    "falls",
    "plunge",
    "crash",
    "selloff",
    "liquidations",
    "attack",
    "missile",
    "strike",
    "war",
    "sanctions",
    "rate",
    "decision",
    "cuts",
    "hikes",
    "يرفع",
    "رفع",
    "زيادة",
    "احتياطي",
    "احتياطيات",
    "تبرعات",
    "تمويل",
    "جولة",
    "هبوط",
    "ارتفاع",
    "انهيار",
    "تصفيات",
    "هجوم",
    "ضرب",
    "عقوبات",
    "الفائدة",
  ];

  const matchedAsset = assets.find((asset) => value.includes(asset));
  const matchedAction = actions.find((action) => value.includes(action));

  if (matchedAsset && matchedAction) {
    return `${matchedAsset}_${matchedAction}`;
  }

  if (matchedAsset && value.split(" ").length <= 14) {
    return matchedAsset;
  }

  return null;
}

function areSimilarNewsTitles(titleA, titleB) {
  const normalizedA = normalizeNewsTitle(titleA);
  const normalizedB = normalizeNewsTitle(titleB);

  if (!normalizedA || !normalizedB) {
    return false;
  }

  if (
    normalizedA.includes(normalizedB.slice(0, 30)) ||
    normalizedB.includes(normalizedA.slice(0, 30))
  ) {
    return true;
  }

  const wordsA = new Set(normalizedA.split(" ").filter((word) => word.length > 3));
  const wordsB = new Set(normalizedB.split(" ").filter((word) => word.length > 3));

  if (!wordsA.size || !wordsB.size) {
    return false;
  }

  const commonWords = [...wordsA].filter((word) => wordsB.has(word)).length;
  const smallerSetSize = Math.min(wordsA.size, wordsB.size);

  return commonWords / smallerSetSize >= 0.42;
}

function getNewsTopicCluster(title) {
  const normalizedTitle = normalizeNewsTitle(title);

  const topicClusters = [
    {
      key: "hormuz_iran_us",
      terms: [
        "hormuz",
        "strait",
        "strait of hormuz",
        "iran",
        "tehran",
        "united states",
        "usa",
        // "us", // removed as requested
        "talks",
        "negotiations",
        "deal",
        "gulf",
        "مضيق",
        "هرمز",
        "مضيق هرمز",
        "إيران",
        "ايران",
        "طهران",
        "الولايات المتحدة",
        "امريكا",
        "أمريكا",
        "مفاوضات",
        "اتفاق",
        "الخليج",
        "فتح",
        "إعادة فتح",
        "اعادة فتح",
        "إغلاق",
        "اغلاق",
        "العلاقات الأمريكية الإيرانية",
        "العلاقات الامريكية الايرانية",
        "واشنطن",
        "إيراني",
        "ايراني",
        "الأمريكية الإيرانية",
        "الامريكية الايرانية",
      ],
    },
    {
      key: "iran_israel_middle_east",
      terms: [
        "iran",
        "israel",
        "tehran",
        "gaza",
        "middle east",
        "missile",
        "attack",
        "airstrike",
        "war",
        "escalation",
        "retaliation",
        "drone attack",
        "port attack",
        "ship attack",
        "red sea",
        "persian gulf",
        "naval attack",
        "إيران",
        "ايران",
        "إسرائيل",
        "اسرائيل",
        "غزة",
        "الشرق الأوسط",
        "صاروخ",
        "هجوم",
        "ضربة",
        "حرب",
        "تصعيد",
        "رد انتقامي",
        "استهداف السفن",
        "ضرب السفن",
        "استهداف الموانئ",
        "ضرب الموانئ",
        "البحر الأحمر",
        "الخليج العربي",
        "هجوم بطائرات مسيرة",
      ],
    },
    {
      key: "russia_ukraine",
      terms: ["russia", "ukraine", "moscow", "kyiv", "missile", "attack", "war", "ceasefire", "روسيا", "أوكرانيا", "اوكرانيا", "موسكو", "كييف", "حرب", "هجوم", "وقف إطلاق النار"],
    },
    {
      key: "oil_geopolitics",
      terms: ["oil", "crude", "brent", "wti", "opec", "hormuz", "gulf", "iran", "sanctions", "strait", "talks", "deal", "نفط", "النفط", "خام", "برنت", "أوبك", "اوبك", "هرمز", "مضيق", "الخليج", "إيران", "ايران", "عقوبات", "اتفاق", "مفاوضات"],
    },
    {
      key: "fed_rates",
      terms: ["fed", "fomc", "powell", "federal reserve", "interest rate", "rate cut", "rate hike", "الفيدرالي", "باول", "الفائدة", "خفض الفائدة", "رفع الفائدة"],
    },
    {
      key: "us_inflation_jobs",
      terms: ["cpi", "inflation", "pce", "nfp", "payrolls", "jobs", "unemployment", "التضخم", "الوظائف", "البطالة", "الرواتب"],
    },
    {
      key: "bitcoin_crypto",
      terms: ["bitcoin", "btc", "crypto", "ethereum", "etf", "بيتكوين", "البيتكوين", "كريبتو", "العملات الرقمية", "إيثريوم", "ايثريوم"],
    },
  ];

  const hasTerm = (term) => normalizedTitle.includes(term);

  if (hasTerm("hormuz") || hasTerm("هرمز") || hasTerm("مضيق هرمز")) {
    return "hormuz_iran_us";
  }

  if (
    (hasTerm("iran") || hasTerm("tehran") || hasTerm("إيران") || hasTerm("ايران") || hasTerm("طهران")) &&
    (hasTerm("united states") || hasTerm("usa") || hasTerm("washington") || hasTerm("واشنطن") || hasTerm("الولايات المتحدة") || hasTerm("امريكا") || hasTerm("أمريكا") || hasTerm("talks") || hasTerm("negotiations") || hasTerm("deal") || hasTerm("مفاوضات") || hasTerm("اتفاق"))
  ) {
    return "hormuz_iran_us";
  }

  if (
    (hasTerm("iran") || hasTerm("tehran") || hasTerm("إيران") || hasTerm("ايران") || hasTerm("طهران")) &&
    (hasTerm("israel") || hasTerm("gaza") || hasTerm("missile") || hasTerm("attack") || hasTerm("airstrike") || hasTerm("war") || hasTerm("إسرائيل") || hasTerm("اسرائيل") || hasTerm("غزة") || hasTerm("صاروخ") || hasTerm("هجوم") || hasTerm("ضربة") || hasTerm("حرب"))
  ) {
    return "iran_israel_middle_east";
  }

  if (
    (hasTerm("russia") || hasTerm("moscow") || hasTerm("روسيا") || hasTerm("موسكو")) &&
    (hasTerm("ukraine") || hasTerm("kyiv") || hasTerm("كييف") || hasTerm("أوكرانيا") || hasTerm("اوكرانيا"))
  ) {
    return "russia_ukraine";
  }

  for (const cluster of topicClusters) {
    const matches = cluster.terms.filter((term) => normalizedTitle.includes(term));
    if (matches.length >= 2) {
      return cluster.key;
    }
  }

  return null;
}


function isRecentPublishedItem(item) {
  if (!item.publishedAt) {
    return true;
  }

  const publishedAt = new Date(item.publishedAt).getTime();

  if (Number.isNaN(publishedAt)) {
    return true;
  }

  const maxDuplicateWindowHours = 2;
  return Date.now() - publishedAt <= maxDuplicateWindowHours * 60 * 60 * 1000;
}

function isRecentForTopicCluster(item, topicCluster) {
  if (!item.publishedAt) {
    return true;
  }

  const publishedAt = new Date(item.publishedAt).getTime();

  if (Number.isNaN(publishedAt)) {
    return true;
  }

  const longCooldownClusters = [
    "hormuz_iran_us",
    "iran_israel_middle_east",
    "russia_ukraine",
    "oil_geopolitics",
  ];

  const cooldownHours = longCooldownClusters.includes(topicCluster) ? 18 : 3;

  return Date.now() - publishedAt <= cooldownHours * 60 * 60 * 1000;
}

function getRecentPublishStats(publishedItems) {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const minGapMs = Math.max(0, MIN_MINUTES_BETWEEN_POSTS) * 60 * 1000;

  const timestamps = publishedItems
    .map((item) => new Date(item.publishedAt || item.published_at || item.created_at || 0).getTime())
    .filter((time) => !Number.isNaN(time) && time > 0)
    .sort((a, b) => b - a);

  const postsLastHour = timestamps.filter((time) => now - time <= oneHourMs).length;
  const lastPostAt = timestamps[0] || 0;
  const hasEnoughGap = !lastPostAt || now - lastPostAt >= minGapMs;

  return {
    postsLastHour,
    hasEnoughGap,
    lastPostAt,
  };
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

async function createNewsCard(title, imageUrl, impactLevel = "HIGH") {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07111f");
  gradient.addColorStop(0.55, "#0b1f35");
  gradient.addColorStop(1, "#020617");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  try {
    const image = await loadImage(imageUrl);
    if (image.width < MIN_IMAGE_WIDTH || image.height < MIN_IMAGE_HEIGHT) {
      console.log(`⏭️ Skipped low-quality image: ${image.width}x${image.height}`);
      return null;
    }
    const imageAspectRatio = image.width / image.height;
    if (imageAspectRatio < 1.35 || imageAspectRatio > 2.2) {
      console.log(`⏭️ Skipped poorly shaped image: ${image.width}x${image.height}`);
      return null;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const scale = Math.max(width / image.width, height / image.height);
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;
    const x = (width - scaledWidth) / 2;
    const y = (height - scaledHeight) / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
    ctx.restore();

    const imageOverlay = ctx.createLinearGradient(0, 0, 0, height);
    imageOverlay.addColorStop(0, "rgba(2, 6, 23, 0.08)");
    imageOverlay.addColorStop(1, "rgba(2, 6, 23, 0.18)");
    ctx.fillStyle = imageOverlay;
    ctx.fillRect(0, 0, width, height);

    // --- New design overlay block ---
    const bottomFade = ctx.createLinearGradient(0, height * 0.42, 0, height);
    bottomFade.addColorStop(0, "rgba(2, 6, 23, 0.05)");
    bottomFade.addColorStop(0.55, "rgba(2, 6, 23, 0.60)");
    bottomFade.addColorStop(1, "rgba(2, 6, 23, 0.94)");
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(56, 189, 248, 0.92)";
    ctx.fillRect(0, height - 8, width, 8);
    // --- End new design overlay block ---
  } catch (error) {
    console.error("⚠️ Image load failed:", error.message);
    return null;
  }


  // --- Title drawing block ---
  ctx.save();
  const cleanTitle = String(title || "")
    .replace(/\s+/g, " ")
    .trim();

  const titleBoxX = 56;
  const titleBoxY = height - 210;
  const titleBoxWidth = width - 112;
  const titleBoxHeight = 132;

  ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
  ctx.roundRect(titleBoxX, titleBoxY, titleBoxWidth, titleBoxHeight, 24);
  ctx.fill();

  ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
  ctx.roundRect(titleBoxX, titleBoxY, 8, titleBoxHeight, 8);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px Arabic";
  ctx.textAlign = /[\u0600-\u06FF]/.test(cleanTitle) ? "right" : "left";
  ctx.direction = /[\u0600-\u06FF]/.test(cleanTitle) ? "rtl" : "ltr";

  const titleLines = wrapText(ctx, cleanTitle, titleBoxWidth - 80).slice(0, 2);
  const textX = ctx.direction === "rtl" ? titleBoxX + titleBoxWidth - 40 : titleBoxX + 40;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textX, titleBoxY + 54 + index * 46);
  });
  ctx.restore();

  ctx.save();
  const impactBadgeText = impactLevel === "HIGH" ? "عاجل" : "مهم";
  ctx.fillStyle = impactLevel === "HIGH" ? "rgba(220, 38, 38, 0.92)" : "rgba(234, 179, 8, 0.94)";
  ctx.roundRect(56, 42, 160, 52, 18);
  ctx.fill();
  ctx.fillStyle = impactLevel === "HIGH" ? "#ffffff" : "#111827";
  ctx.font = "bold 26px Arabic";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillText(impactBadgeText, 136, 77);
  ctx.restore();
  // --- End title drawing block ---

  // --- Top brand block ---
  ctx.save();
  if (fs.existsSync(CHANNEL_LOGO_FILE)) {
    const logo = await loadImage(CHANNEL_LOGO_FILE);
    const brandLogoSize = 64;
    const brandX = width - 250;
    const brandY = 38;

    ctx.fillStyle = "rgba(2, 6, 23, 0.62)";
    ctx.roundRect(brandX - 18, brandY - 10, 214, 84, 24);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(brandX + brandLogoSize / 2, brandY + brandLogoSize / 2, brandLogoSize / 2 + 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(logo, brandX, brandY, brandLogoSize, brandLogoSize);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arabic";
    ctx.textAlign = "right";
    ctx.direction = "rtl";
    ctx.fillText("الأخبار الاقتصادية", brandX - 26 + 196, brandY + 29);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 18px Arabic";
    ctx.fillText("Economic News", brandX - 26 + 196, brandY + 56);
  }
  ctx.restore();


  try {
    ctx.save();

    const watermarkWidth = 430;
    const watermarkHeight = 78;
    const watermarkX = width - watermarkWidth - 24;
    const watermarkY = height - watermarkHeight - 22;

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "rgba(2, 6, 23, 0.76)";
    ctx.roundRect(watermarkX, watermarkY, watermarkWidth, watermarkHeight, 18);
    ctx.fill();

    if (fs.existsSync(CHANNEL_LOGO_FILE)) {
      const logo = await loadImage(CHANNEL_LOGO_FILE);
      const logoSize = 58;
      const logoX = watermarkX + watermarkWidth - logoSize - 14;
      const logoY = watermarkY + 10;

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arabic";
    ctx.textAlign = "right";
    ctx.direction = "rtl";
    ctx.fillText("Economic News | الأخبار الاقتصادية", watermarkX + watermarkWidth - 78, watermarkY + 33);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 20px Arabic";
    ctx.fillText("t.me/EconomicNewsi", watermarkX + watermarkWidth - 78, watermarkY + 61);

    ctx.restore();
  } catch (error) {
    console.error("⚠️ Watermark failed:", error.message);
  }

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(NEWS_CARD_FILE, buffer);

  return NEWS_CARD_FILE;
}

async function loadPublishedNewsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("published_news")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("❌ Supabase Load Error:", error.message);
      return [];
    }

    return (data || []).map((item) => ({
      link: item.link,
      title: item.title || "",
      normalizedTitle: item.normalized_title || "",
      topicCluster: item.topic_cluster || null,
      publishedAt: item.published_at || item.created_at || null,
    }));
  } catch (error) {
    console.error("❌ Supabase Load Exception:", error.message);
    return [];
  }
}

async function savePublishedNewsToSupabase(item) {
  try {
    const { error } = await supabase
      .from("published_news")
      .upsert(
        [
          {
            link: item.link,
            title: item.title || "",
            normalized_title: item.normalized_title || "",
            topic_cluster: item.topic_cluster || null,
            published_at: item.published_at || new Date().toISOString(),
          },
        ],
        { onConflict: "link" }
      );

    if (error) {
      console.error("❌ Supabase Save Error:", error.message);
    }
  } catch (error) {
    console.error("❌ Supabase Save Exception:", error.message);
  }
}

async function saveNewsPostToSupabase(post) {
  try {
    const { error } = await supabase
      .from("news_posts")
      .upsert(
        [
          {
            title: post.title,
            content: post.content,
            image_url: post.image_url || null,
            impact_level: post.impact_level || "MEDIUM",
            source_link: post.source_link,
            created_at: new Date().toISOString(),
          },
        ],
        { onConflict: "source_link" }
      );

    if (error) {
      console.error("❌ News Post Save Error:", error.message);
    }
  } catch (error) {
    console.error("❌ News Post Save Exception:", error.message);
  }
}
function readPublishedNewsRecords() {
  try {
    if (!fs.existsSync(LAST_NEWS_FILE)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(LAST_NEWS_FILE, "utf8"));

    if (Array.isArray(data.publishedItems)) {
      return data.publishedItems;
    }

    if (Array.isArray(data.publishedLinks)) {
      return data.publishedLinks.map((link) => ({ link, title: "" }));
    }

    if (data.lastLink) {
      return [{ link: data.lastLink, title: "" }];
    }

    return [];
  } catch (error) {
    console.error("⚠️ Could not read last-news.json:", error.message);
    return [];
  }
}

function readPublishedNewsLinks() {
  return readPublishedNewsRecords().map((item) => item.link).filter(Boolean);
}

function savePublishedNewsLink(link, title = "") {
  try {
    const publishedItems = readPublishedNewsRecords();
    const updatedItems = [
      {
        link,
        title,
        normalizedTitle: normalizeNewsTitle(title).slice(0, 500),
        topicCluster: getNewsTopicCluster(title),
        duplicateKey: getStrongDuplicateKey(title),
        publishedAt: new Date().toISOString(),
      },
      ...publishedItems.filter((item) => item.link !== link),
    ].slice(0, 80);

    fs.writeFileSync(
      LAST_NEWS_FILE,
      JSON.stringify(
        {
          lastLink: link,
          publishedItems: updatedItems,
          publishedLinks: updatedItems.map((item) => item.link),
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("⚠️ Could not save last-news.json:", error.message);
  }
}

async function sendTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    await axios.post(url, {
      chat_id: TELEGRAM_CHANNEL_ID,
      text: message,
      disable_web_page_preview: true,
    });

    console.log("✅ Message sent to Telegram");
  } catch (error) {
    console.error("❌ Telegram Error:", error.response?.data || error.message);
  }
}

async function sendTelegramPhoto(message, photoPath) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const form = new FormData();

    form.append("chat_id", TELEGRAM_CHANNEL_ID);
    form.append("caption", message.slice(0, 1000));
    form.append("photo", fs.createReadStream(photoPath));

    await axios.post(url, form, {
      headers: form.getHeaders(),
    });

    console.log("✅ Designed photo news sent to Telegram");
  } catch (error) {
    console.error("❌ Telegram Photo Error:", error.response?.data || error.message);
    await sendTelegramMessage(message);
  }
}

async function isMarketMovingNews(title) {
  if (TEMP_ALLOW_ALL_NEWS) {
    return true;
  }

  return isImportantNews(title);
}

async function analyzeNewsWithAI(title, link) {
  if (!OPENAI_API_KEY) {
    return {
      message: `🚨 خبر اقتصادي عاجل\n\n📌 ${title}\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi\n\n#Forex #Gold #Crypto #USD`,
      imageTitle: title,
    };
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content:
              "أنت محرر أخبار مالية عاجلة لقناة تيليجرام احترافية مختصة بالفوركس والأسواق العالمية. اكتب فقط بأسلوب أخبار عالية التأثير مثل Bloomberg و ForexBreakingNews. اجعل المنشور قصيرًا جدًا ومباشرًا للمتداولين. التنسيق الإجباري: السطر الأول عنوان عاجل مع إيموجي مناسب. بعده ملخص الخبر بجملة أو جملتين فقط. بعده سطر واحد فقط بعنوان: التأثير: ويجب أن يذكر التأثير الحقيقي والقوي فقط على الأصول المهمة حسب الخبر مثل الفوركس والعملات الرئيسية والدولار واليورو والين والجنيه والذهب والنفط والأسهم الأمريكية والكريبتو والسندات. مثال: التأثير: إيجابي للدولار / سلبي لليورو / إيجابي للذهب / سلبي للأسهم. إذا كان التأثير غير واضح أو غير مؤكد، لا تكتب كلمة التأثير ولا تضف سطر التأثير نهائيًا. لا تبالغ في التأثير ولا تجعل كل خبر مهمًا. لا تقدم توصية شراء أو بيع. لا تذكر المصدر ولا تضع روابط. لا تكتب أي جملة ختامية.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nمهم جدًا: لا تكتب رابط المصدر ولا تذكر اسم المصدر داخل المنشور. لا تبالغ في التأثير. اكتب فقط سطر التأثير إذا كان التأثير واضحًا ومتوقعًا على أصول محددة. إذا كان التأثير ضعيفًا أو غير واضح أو غير مؤكد، لا تكتب كلمة التأثير ولا تضف سطر التأثير نهائيًا. اكتب الخبر بأسلوب عاجل ومختصر جدًا بدون حشو.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 350,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiText = response.data.choices?.[0]?.message?.content?.trim();

    if (!aiText) {
      throw new Error("Empty AI response");
    }

    const cleanedAiText = aiText
      .replace(/https?:\/\/\S+/g, "")
      .replace(/رابط المصدر:?/gi, "")
      .replace(/المصدر:?/gi, "")
      .split("\n")
      .filter((line) => !/التأثير\s*:\s*(غير مؤكد|غير واضح|غير معروف|متباين)/i.test(line.trim()))
      .join("\n")
      .trim();

    const firstLine = cleanedAiText
      .split("\n")
      .find((line) => line.trim().length > 10) || title;

    return {
      message: `${cleanedAiText}\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`,
      imageTitle: firstLine
        .replace(/🚨|📌|📈|📉|🔥|⚡|🛢️|💰|🇺🇸|🇮🇷|🔴|🟢|🟡|🎯|📊|📰/g, "")
        .trim(),
    };
  } catch (error) {
    console.error("⚠️ AI Error:", error.response?.data || error.message);

    return {
      message: `🚨 خبر اقتصادي عاجل\n\n📌 ${title}\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi\n\n#Forex #Gold #Crypto #USD`,
      imageTitle: title,
    };
  }
}

async function fetchForexNews() {
  if (isFetchingNews) {
    console.log("⏭️ Previous news fetch still running. Skipping overlap.");
    return;
  }

  isFetchingNews = true;
  try {
    console.log("🚀 Fetching forex news...");

    const allItems = [];

    for (const feedUrl of NEWS_FEEDS) {
      try {
        const feed = await parser.parseURL(feedUrl);
        allItems.push(...feed.items.map((item) => ({ ...item, feedUrl })));
      } catch (error) {
        console.error(`⚠️ Feed failed: ${feedUrl}`, error.message);
      }
    }

    if (!allItems.length) {
      console.log("⚠️ No news found from all feeds");
      return;
    }

    allItems.sort((a, b) => {
      const dateA = new Date(a.isoDate || a.pubDate || 0).getTime();
      const dateB = new Date(b.isoDate || b.pubDate || 0).getTime();
      return dateB - dateA;
    });

    const localPublishedItems = readPublishedNewsRecords();
    const supabasePublishedItems = await loadPublishedNewsFromSupabase();
    const publishedItems = [
      ...supabasePublishedItems,
      ...localPublishedItems,
    ];

    const publishStats = getRecentPublishStats(publishedItems);

    const normalHourlyLimitReached = publishStats.postsLastHour >= MAX_POSTS_PER_HOUR;
    const hardHourlyLimitReached = publishStats.postsLastHour >= MAX_HIGH_IMPACT_POSTS_PER_HOUR;

    if (hardHourlyLimitReached) {
      console.log(`⏭️ Hard hourly post limit reached: ${publishStats.postsLastHour}/${MAX_HIGH_IMPACT_POSTS_PER_HOUR}`);
      return;
    }

    if (normalHourlyLimitReached) {
      console.log(`⚠️ Normal hourly limit reached: ${publishStats.postsLastHour}/${MAX_POSTS_PER_HOUR}. Only HIGH impact news can pass now.`);
    }

    if (MIN_MINUTES_BETWEEN_POSTS > 0 && !publishStats.hasEnoughGap) {
      console.log(`⏭️ Waiting for minimum ${MIN_MINUTES_BETWEEN_POSTS} minute gap between posts.`);
      return;
    }
    const publishedLinks = publishedItems.map((item) => item.link).filter(Boolean);
    const recentPublishedItems = publishedItems.filter(isRecentPublishedItem);
    const recentTitles = recentPublishedItems
      .map((item) => item.title || item.normalizedTitle || "")
      .filter(Boolean);
    const recentAiMessages = recentPublishedItems
      .map((item) => item.normalizedTitle || item.title || "")
      .filter(Boolean);

    let latestNews = null;

   for (const item of allItems.slice(0, 90)) {
      const newsDate = new Date(item.isoDate || item.pubDate || Date.now()).getTime();
      const maxAge = MAX_NEWS_AGE_HOURS * 60 * 60 * 1000;

      const isFresh = Date.now() - newsDate <= maxAge;
      const isNew = item.link && !publishedLinks.includes(item.link);

      const isDuplicateTopic = recentTitles.some((recentTitle) =>
        areSimilarNewsTitles(item.title || "", recentTitle)
      );
      const normalizedCurrentTitle = normalizeNewsTitle(item.title || "");
      const currentTopicCluster = getNewsTopicCluster(`${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} ${item.description || ""}`);
      const currentDuplicateKey = getStrongDuplicateKey(`${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} ${item.description || ""}`);
      const hasRecentSameDuplicateKey = currentDuplicateKey
        ? publishedItems.some((publishedItem) => {
            const publishedDuplicateKey =
              publishedItem.duplicateKey ||
              getStrongDuplicateKey(`${publishedItem.title || ""} ${publishedItem.normalizedTitle || ""}`);

            if (publishedDuplicateKey !== currentDuplicateKey) {
              return false;
            }

            const publishedAt = new Date(
              publishedItem.publishedAt ||
                publishedItem.published_at ||
                publishedItem.created_at ||
                0
            ).getTime();

            if (Number.isNaN(publishedAt) || !publishedAt) {
              return true;
            }

            return Date.now() - publishedAt <= 6 * 60 * 60 * 1000;
          })
        : false;

      if (hasRecentSameDuplicateKey) {
        console.log("⏭️ Skipped repeated strong duplicate key:", currentDuplicateKey, item.title);
        continue;
      }
      const hasRecentSameTopicCluster = currentTopicCluster
        ? publishedItems.some((publishedItem) => {
            const publishedCluster = publishedItem.topicCluster || getNewsTopicCluster(`${publishedItem.title || ""} ${publishedItem.normalizedTitle || ""}`);
            return (
              publishedCluster === currentTopicCluster &&
              isRecentForTopicCluster(publishedItem, currentTopicCluster)
            );
          })
        : false;

      if (hasRecentSameTopicCluster) {
        console.log("⏭️ Skipped repeated topic cluster:", currentTopicCluster, item.title);
        continue;
      }

      const sameKeywordCluster = recentTitles.some((recentTitle) => {
        const normalizedRecent = normalizeNewsTitle(recentTitle);

        return (
          normalizedCurrentTitle.includes("powell") && normalizedRecent.includes("powell") ||
          normalizedCurrentTitle.includes("fed") && normalizedRecent.includes("fed") ||
          normalizedCurrentTitle.includes("bitcoin") && normalizedRecent.includes("bitcoin") ||
          normalizedCurrentTitle.includes("crypto") && normalizedRecent.includes("crypto") ||
          normalizedCurrentTitle.includes("gold") && normalizedRecent.includes("gold") ||
          normalizedCurrentTitle.includes("oil") && normalizedRecent.includes("oil") ||
          normalizedCurrentTitle.includes("iran") && normalizedRecent.includes("iran") ||
          normalizedCurrentTitle.includes("tehran") && normalizedRecent.includes("tehran") ||
          normalizedCurrentTitle.includes("israel") && normalizedRecent.includes("israel") ||
          normalizedCurrentTitle.includes("gaza") && normalizedRecent.includes("gaza") ||
          normalizedCurrentTitle.includes("middle east") && normalizedRecent.includes("middle east") ||
          normalizedCurrentTitle.includes("russia") && normalizedRecent.includes("russia") ||
          normalizedCurrentTitle.includes("ukraine") && normalizedRecent.includes("ukraine") ||
          normalizedCurrentTitle.includes("war") && normalizedRecent.includes("war") ||
          normalizedCurrentTitle.includes("attack") && normalizedRecent.includes("attack") ||
          normalizedCurrentTitle.includes("missile") && normalizedRecent.includes("missile") ||
          normalizedCurrentTitle.includes("airstrike") && normalizedRecent.includes("airstrike") ||
          normalizedCurrentTitle.includes("military") && normalizedRecent.includes("military") ||
          normalizedCurrentTitle.includes("ceasefire") && normalizedRecent.includes("ceasefire") ||
          normalizedCurrentTitle.includes("sanctions") && normalizedRecent.includes("sanctions") ||
          normalizedCurrentTitle.includes("nfp") && normalizedRecent.includes("nfp") ||
          normalizedCurrentTitle.includes("inflation") && normalizedRecent.includes("inflation") ||
          normalizedCurrentTitle.includes("cpi") && normalizedRecent.includes("cpi")
          || normalizedCurrentTitle.includes("ppi") && normalizedRecent.includes("ppi")
|| normalizedCurrentTitle.includes("pce") && normalizedRecent.includes("pce")
|| normalizedCurrentTitle.includes("consumer confidence") && normalizedRecent.includes("consumer confidence")
|| normalizedCurrentTitle.includes("consumer sentiment") && normalizedRecent.includes("consumer sentiment")
|| normalizedCurrentTitle.includes("retail sales") && normalizedRecent.includes("retail sales")
|| normalizedCurrentTitle.includes("jobless claims") && normalizedRecent.includes("jobless claims")
|| normalizedCurrentTitle.includes("pmi") && normalizedRecent.includes("pmi")
|| normalizedCurrentTitle.includes("ism") && normalizedRecent.includes("ism")
|| normalizedCurrentTitle.includes("earnings") && normalizedRecent.includes("earnings")
|| normalizedCurrentTitle.includes("tesla") && normalizedRecent.includes("tesla")
|| normalizedCurrentTitle.includes("nvidia") && normalizedRecent.includes("nvidia")
|| normalizedCurrentTitle.includes("apple") && normalizedRecent.includes("apple")
|| normalizedCurrentTitle.includes("microsoft") && normalizedRecent.includes("microsoft")
        );
      });


      const aiSimilarityDuplicate = recentAiMessages.some((recentMessage) =>
        areSimilarNewsTitles(
          `${item.title || ""} ${item.contentSnippet || ""}`,
          recentMessage
        )
      );

      if (isDuplicateTopic || sameKeywordCluster || aiSimilarityDuplicate) {
        console.log("⏭️ Skipped duplicate/similar news:", item.title);
        continue;
      }

      if (!isFresh || !isNew) {
        continue;
      }

      const titleForImpact = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} ${item.description || ""}`;
      const isEconomicNews = isEconomicCalendarNews(titleForImpact);
      const isImportant = await isMarketMovingNews(item.title || "");

      const impactLevel = isEconomicNews ? "HIGH" : getMarketImpactLevel(titleForImpact);
      const isUltraPriority = ULTRA_PRIORITY_KEYWORDS.some((keyword) =>
        titleForImpact.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!isImportant && impactLevel === "LOW" && !isEconomicNews) {
        continue;
      }

      if (impactLevel === "LOW") {
        console.log("⏭️ Skipped weak/low-impact market story:", item.title);
        continue;
      }
      if (
        normalHourlyLimitReached &&
        impactLevel !== "HIGH" &&
        !isUltraPriority
      ) {
        console.log("⏭️ Hourly limit reached. Skipped non-HIGH impact story:", item.title);
        continue;
      }

      item.impactLevel = impactLevel;
      latestNews = item;
      break;
    }

    if (!latestNews) {
      console.log("⏭️ No new AI-approved important news found.");
      return;
    }

    const latestLink = latestNews.link;

    const aiResult = await analyzeNewsWithAI(latestNews.title, latestNews.link);

    const message = aiResult.message;
    const combinedNewsIdentity = `${latestNews.title || ""} ${aiResult.imageTitle || ""} ${message || ""}`;
    const combinedTopicCluster = getNewsTopicCluster(combinedNewsIdentity);

    if (combinedTopicCluster) {
      const alreadyPublishedSameCluster = publishedItems.some((publishedItem) => {
        const publishedCluster = publishedItem.topicCluster || getNewsTopicCluster(`${publishedItem.title || ""} ${publishedItem.normalizedTitle || ""}`);
        return (
          publishedCluster === combinedTopicCluster &&
          isRecentForTopicCluster(publishedItem, combinedTopicCluster)
        );
      });

      if (alreadyPublishedSameCluster) {
        console.log("⏭️ Skipped duplicate after AI analysis:", combinedTopicCluster, latestNews.title);
        savePublishedNewsLink(latestLink, combinedNewsIdentity);
        await savePublishedNewsToSupabase({
          link: latestLink,
          title: combinedNewsIdentity,
          normalized_title: normalizeNewsTitle(combinedNewsIdentity).slice(0, 500),
          topic_cluster: combinedTopicCluster,
          published_at: new Date().toISOString(),
        });
        return;
      }
    }

    const imageTitle = aiResult.imageTitle || latestNews.title;

    const veryImportantNews = [
      "fed",
      "fomc",
      "powell",
      "interest rate",
      "rate decision",
      "consumer confidence",
      "consumer sentiment",
      "ppi",
      "pce",
      "retail sales",
      "jobless claims",
      "initial claims",
      "continuing claims",
      "pmi",
      "ism",
      "unemployment",
      "cpi",
      "inflation",
      "nfp",
      "gdp",
      "recession",
      "bank crisis",
      "forex",
      "eurusd",
      "gbpusd",
      "usdjpy",
      "audusd",
      "currency",
      "dollar",
      "usd",
      "bitcoin",
      "btc",
      "crypto",
      "etf",
      "war",
      "iran",
      "israel",
      "russia",
      "ukraine",
      "oil",
      "gold",
      "nasdaq",
      "dow",
      "s&p",
      "attack",
      "missile",
      "breaking",
    ].some((keyword) =>
      latestNews.title.toLowerCase().includes(keyword)
    );

    let finalImage = null;
    if (veryImportantNews) {
      const rssImage = getImageFromNewsItem(latestNews);
      const articleImage = rssImage ? null : await getImageFromArticleUrl(latestNews.link);
      const localFallbackImage = USE_LOCAL_IMAGE_FALLBACK ? selectNewsImage(latestNews.title) : null;
      finalImage = rssImage || articleImage || localFallbackImage;

      if (finalImage) {
        const photoPath = await createNewsCard(imageTitle, finalImage, latestNews.impactLevel || "HIGH");

        if (photoPath) {
          await sendTelegramPhoto(message, photoPath);
        } else {
          console.log("⏭️ Image rejected or unavailable. Sending text only.");
          await sendTelegramMessage(message);
        }
      } else {
        await sendTelegramMessage(message);
      }
    } else {
      await sendTelegramMessage(message);
    }

    await saveNewsPostToSupabase({
      title: latestNews.title || imageTitle,
      content: message,
      image_url: finalImage || null,
      impact_level: latestNews.impactLevel || "MEDIUM",
      source_link: latestLink,
    });
    savePublishedNewsLink(latestLink, combinedNewsIdentity);
    await savePublishedNewsToSupabase({
      link: latestLink,
      title: combinedNewsIdentity,
      normalized_title: normalizeNewsTitle(combinedNewsIdentity).slice(0, 500),
      topic_cluster: combinedTopicCluster,
      published_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ RSS Error:", error.message);
  } finally {
    isFetchingNews = false;
  }
}

console.log("🚀 News Worker Started...");

fetchForexNews();

setInterval(() => {
  fetchForexNews();
}, 60 * 1000);