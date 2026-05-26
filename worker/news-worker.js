const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");
const axios = require("axios");
const FormData = require("form-data");
const { createCanvas, loadImage, registerFont } = require("canvas");
require("dotenv").config();

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

const LAST_NEWS_FILE = path.join(__dirname, "last-news.json");
const NEWS_CARD_FILE = path.join(__dirname, "news-card.png");
const CHANNEL_LOGO_FILE = path.join(__dirname, "assets", "logo.png");

// Temporary test mode: true = publish any latest news to test the image design.
// After testing, change this to false to activate the important-news filter again.
const TEMP_ALLOW_ALL_NEWS = false;

const MAX_NEWS_AGE_HOURS = 24;
// Prefer real images from the news source. Keep local images only as an optional emergency fallback.
const USE_LOCAL_IMAGE_FALLBACK = false;
const MIN_IMAGE_WIDTH = 900;
const MIN_IMAGE_HEIGHT = 500;

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
"نتائج الأعمال",
"الإيرادات",
"الاقتصاد الأمريكي",
"باول",
];

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
  const enclosureUrl = item.enclosure?.url;
  if (enclosureUrl && /^https?:\/\//i.test(enclosureUrl)) {
    return enclosureUrl;
  }

  const mediaContent = item["media:content"]?.$.url || item["media:content"]?.url;
  if (mediaContent && /^https?:\/\//i.test(mediaContent)) {
    return mediaContent;
  }

  const mediaThumbnail = item["media:thumbnail"]?.$.url || item["media:thumbnail"]?.url;
  if (mediaThumbnail && /^https?:\/\//i.test(mediaThumbnail)) {
    return mediaThumbnail;
  }

  const html = item.content || item["content:encoded"] || item.summary || item.description || "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);

  if (match?.[1] && /^https?:\/\//i.test(match[1])) {
    return match[1];
  }

  return null;
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
        "us",
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

  for (const cluster of topicClusters) {
    const matches = cluster.terms.filter((term) => normalizedTitle.includes(term));

    if (matches.length >= 1 && ["hormuz_iran_us", "iran_israel_middle_east", "russia_ukraine"].includes(cluster.key)) {
      return cluster.key;
    }

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

async function createNewsCard(title, imageUrl) {
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
  } catch (error) {
    console.error("⚠️ Image load failed:", error.message);
    return null;
  }


  try {
    ctx.save();

    const watermarkWidth = 380;
    const watermarkHeight = 74;
    const watermarkX = width - watermarkWidth - 24;
    const watermarkY = height - watermarkHeight - 22;

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "rgba(2, 6, 23, 0.68)";
    ctx.roundRect(watermarkX, watermarkY, watermarkWidth, watermarkHeight, 18);
    ctx.fill();

    if (fs.existsSync(CHANNEL_LOGO_FILE)) {
      const logo = await loadImage(CHANNEL_LOGO_FILE);
      const logoSize = 50;
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, watermarkX + watermarkWidth - logoSize - 14, watermarkY + 12, logoSize, logoSize);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arabic";
    ctx.textAlign = "right";
    ctx.direction = "rtl";
    ctx.fillText("الأخبار الاقتصادية", watermarkX + watermarkWidth - 78, watermarkY + 32);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 20px Arabic";
    ctx.fillText("t.me/EconomicNewsi", watermarkX + watermarkWidth - 78, watermarkY + 58);

    ctx.restore();
  } catch (error) {
    console.error("⚠️ Watermark failed:", error.message);
  }

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(NEWS_CARD_FILE, buffer);

  return NEWS_CARD_FILE;
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

  if (!OPENAI_API_KEY) {
    return isImportantNews(title);
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
            "أنت رئيس تحرير لقناة أخبار مالية احترافية بأسلوب Bloomberg و ForexBreakingNews و ForexNewspaper. وافق فقط على الأخبار ذات التأثير المتوسط أو القوي على الأسواق العالمية. يجب أن يكون للخبر تأثير واضح أو محتمل على الفوركس أو الدولار أو الذهب أو النفط أو الأسهم الأمريكية أو الكريبتو. وافق على أخبار الفيدرالي والبنوك المركزية، التضخم، البطالة، الوظائف، PMI وISM، ثقة المستهلك، مبيعات التجزئة، تحركات النفط والذهب والبيتكوين، الحروب والتوترات الجيوسياسية، وأرباح الشركات الأمريكية الكبرى. ارفض الأخبار الضعيفة أو المتكررة أو المحلية أو العامة أو التي لا تحمل تأثيرًا اقتصاديًا أو ماليًا واضحًا. إذا كان الخبر متوسط أو قوي التأثير أجب YES فقط. إذا كان ضعيف أو مكرر أو غير مهم للأسواق أجب NO فقط."
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nقيّم التأثير على الأسواق. إذا كان له تأثير متوسط أو قوي على الفوركس أو الأسهم أو الذهب أو النفط أو الكريبتو، أجب YES. إذا كان ضعيف جدًا أو غير مرتبط، أجب NO.`,
          },
        ],
        temperature: 0,
        max_tokens: 5,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const decision = response.data.choices?.[0]?.message?.content?.trim().toUpperCase();
    return decision === "YES";
  } catch (error) {
    console.error("⚠️ AI Importance Filter Error:", error.response?.data || error.message);
    return isImportantNews(title);
  }
}

async function analyzeNewsWithAI(title, link) {
  if (!OPENAI_API_KEY) {
    return {
      message: `🚨 خبر اقتصادي عاجل\n\n📌 ${title}\n\nالتأثير: متباين على الدولار / الذهب / الكريبتو حسب ردّة فعل السوق\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi\n\n#Forex #Gold #Crypto #USD`,
      imageTitle: title,
    };
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "أنت محرر أخبار مالية عاجلة لقناة تيليجرام احترافية مختصة بالفوركس والأسواق العالمية. اكتب فقط بأسلوب أخبار عالية التأثير مثل Bloomberg و ForexBreakingNews. اجعل المنشور قصيرًا جدًا ومباشرًا للمتداولين. التنسيق الإجباري: السطر الأول عنوان عاجل مع إيموجي مناسب. بعده ملخص الخبر بجملة أو جملتين فقط. بعده سطر واحد فقط بعنوان: التأثير: ويجب أن يذكر التأثير الحقيقي والقوي فقط على الأصول المهمة حسب الخبر مثل الفوركس والعملات الرئيسية والدولار واليورو والين والجنيه والذهب والنفط والأسهم الأمريكية والكريبتو والسندات. مثال: التأثير: إيجابي للدولار / سلبي لليورو / إيجابي للذهب / سلبي للأسهم. إذا كان التأثير غير واضح أو غير مؤكد، لا تكتب كلمة التأثير ولا تضف سطر التأثير نهائيًا. لا تبالغ في التأثير ولا تجعل كل خبر مهمًا. لا تقدم توصية شراء أو بيع. لا تذكر المصدر ولا تضع روابط. لا تكتب أي جملة ختامية.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nمهم جدًا: لا تكتب رابط المصدر ولا تذكر اسم المصدر داخل المنشور. لا تبالغ في التأثير. اكتب فقط سطر التأثير إذا كان التأثير واضحًا ومتوقعًا على أصول محددة. إذا كان التأثير ضعيفًا أو غير واضح أو غير مؤكد، لا تكتب كلمة التأثير ولا تضف سطر التأثير نهائيًا.`,
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
      message: `🚨 خبر اقتصادي عاجل\n\n📌 ${title}\n\nالتأثير: متباين على الدولار / الذهب / الكريبتو حسب ردّة فعل السوق\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi\n\n#Forex #Gold #Crypto #USD`,
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

    const publishedItems = readPublishedNewsRecords();
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

      const isImportant = await isMarketMovingNews(item.title || "");

      if (isImportant) {
        latestNews = item;
        break;
      }
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
      const alreadyPublishedSameCluster = readPublishedNewsRecords().some((publishedItem) => {
        const publishedCluster = publishedItem.topicCluster || getNewsTopicCluster(`${publishedItem.title || ""} ${publishedItem.normalizedTitle || ""}`);
        return (
          publishedCluster === combinedTopicCluster &&
          isRecentForTopicCluster(publishedItem, combinedTopicCluster)
        );
      });

      if (alreadyPublishedSameCluster) {
        console.log("⏭️ Skipped duplicate after AI analysis:", combinedTopicCluster, latestNews.title);
        savePublishedNewsLink(latestLink, combinedNewsIdentity);
        return;
      }
    }

    const imageTitle = aiResult.imageTitle || latestNews.title;

    const veryImportantNews = [
      "fed",
      "fomc",
      "powell",
      "interest rate",
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

    if (veryImportantNews) {
      const rssImage = getImageFromNewsItem(latestNews);
      const articleImage = rssImage ? null : await getImageFromArticleUrl(latestNews.link);
      const localFallbackImage = USE_LOCAL_IMAGE_FALLBACK ? selectNewsImage(latestNews.title) : null;
      const finalImage = rssImage || articleImage || localFallbackImage;

      if (finalImage) {
        const photoPath = await createNewsCard(imageTitle, finalImage);

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

    savePublishedNewsLink(latestLink, combinedNewsIdentity);
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