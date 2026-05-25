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

// Temporary test mode: true = publish any latest news to test the image design.
// After testing, change this to false to activate the important-news filter again.
const TEMP_ALLOW_ALL_NEWS = false;
const MAX_NEWS_AGE_HOURS = 24;

const IMPORTANT_KEYWORDS = [
  "fed",
  "fomc",
  "powell",
  "federal reserve",
  "interest rate",
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
];

const NEWS_FEEDS = [
  "https://www.forexlive.com/feed/",
  "https://www.investing.com/rss/news_25.rss",
  "https://www.investing.com/rss/news_1.rss",
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
];

function isImportantNews(title) {
  const lowerTitle = title.toLowerCase();

  return IMPORTANT_KEYWORDS.some((keyword) =>
    lowerTitle.includes(keyword)
  );
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
    return path.join(__dirname, "assets", "bitcoin.png");
  }

  if (
    lowerTitle.includes("gold") ||
    lowerTitle.includes("xau")
  ) {
    return path.join(__dirname, "assets", "gold.png");
  }

  if (
    lowerTitle.includes("oil") ||
    lowerTitle.includes("crude") ||
    lowerTitle.includes("brent") ||
    lowerTitle.includes("wti")
  ) {
    return path.join(__dirname, "assets", "oil.png");
  }

  if (
    lowerTitle.includes("fed") ||
    lowerTitle.includes("powell") ||
    lowerTitle.includes("fomc") ||
    lowerTitle.includes("interest rate") ||
    lowerTitle.includes("federal reserve")
  ) {
    return path.join(__dirname, "assets", "fed.png");
  }

  if (lowerTitle.includes("trump")) {
    return path.join(__dirname, "assets", "trump.png");
  }

  if (
    lowerTitle.includes("iran") ||
    lowerTitle.includes("tehran")
  ) {
    return path.join(__dirname, "assets", "iran.png");
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
    return path.join(__dirname, "assets", "war.png");
  }

  if (
    lowerTitle.includes("usd") ||
    lowerTitle.includes("eur") ||
    lowerTitle.includes("forex") ||
    lowerTitle.includes("dollar")
  ) {
    return path.join(__dirname, "assets", "forex.png");
  }

  if (
    lowerTitle.includes("stock") ||
    lowerTitle.includes("nasdaq") ||
    lowerTitle.includes("dow") ||
    lowerTitle.includes("s&p")
  ) {
    return path.join(__dirname, "assets", "stocks.png");
  }

  return path.join(__dirname, "assets", "default.png");
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
  const width = 1600;
  const height = 1600;
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
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(image, 0, 0, width, 720);
    ctx.restore();

    const imageOverlay = ctx.createLinearGradient(0, 280, 0, 760);
    imageOverlay.addColorStop(0, "rgba(2, 6, 23, 0.05)");
    imageOverlay.addColorStop(1, "rgba(2, 6, 23, 0.95)");
    ctx.fillStyle = imageOverlay;
    ctx.fillRect(0, 280, width, 500);
  } catch (error) {
    console.error("⚠️ Image load failed:", error.message);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, 720);
  }


  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(NEWS_CARD_FILE, buffer);

  return NEWS_CARD_FILE;
}

function readPublishedNewsLinks() {
  try {
    if (!fs.existsSync(LAST_NEWS_FILE)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(LAST_NEWS_FILE, "utf8"));

    if (Array.isArray(data.publishedLinks)) {
      return data.publishedLinks;
    }

    if (data.lastLink) {
      return [data.lastLink];
    }

    return [];
  } catch (error) {
    console.error("⚠️ Could not read last-news.json:", error.message);
    return [];
  }
}

function savePublishedNewsLink(link) {
  try {
    const publishedLinks = readPublishedNewsLinks();
    const updatedLinks = [link, ...publishedLinks.filter((item) => item !== link)].slice(0, 50);

    fs.writeFileSync(
      LAST_NEWS_FILE,
      JSON.stringify(
        {
          lastLink: link,
          publishedLinks: updatedLinks,
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
              "أنت رئيس تحرير لقناة أخبار مالية احترافية مشابهة لـ Bloomberg و ForexBreakingNews. انشر فقط الأخبار التي قد تحرك السوق فعليًا أو تسبب تقلبات واضحة في الفوركس أو الدولار أو الذهب أو النفط أو الأسهم الأمريكية أو العملات الرقمية أو الحروب الجيوسياسية الكبرى. تجاهل الأخبار العادية والتحليلات الضعيفة والتصريحات غير المهمة والأخبار المحلية. إذا كان الخبر قوي ومؤثر فعلًا أجب YES فقط. إذا كان الخبر ضعيف أو تأثيره محدود أجب NO فقط.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}`,
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
              "أنت محرر أخبار مالية عاجلة لقناة تيليجرام احترافية مختصة بالفوركس والأسواق العالمية. اكتب منشورًا عربيًا احترافيًا وقصيرًا جدًا يشبه أسلوب Bloomberg و ForexBreakingNews. التنسيق الإجباري: السطر الأول عنوان عاجل مع إيموجي مناسب. بعده ملخص الخبر بجملة أو جملتين فقط. بعده سطر واحد فقط بعنوان: التأثير: ويجب أن يذكر التأثير الحقيقي على جميع الأصول المهمة حسب الخبر مثل الفوركس والعملات الرئيسية والدولار واليورو والين والجنيه والذهب والنفط والأسهم والكريبتو والسندات. مثال: التأثير: إيجابي للدولار / سلبي لليورو / إيجابي للذهب / سلبي للأسهم. إذا كان التأثير مختلطًا اذكر جميع الأصول المتأثرة بوضوح. لا تشرح التأثير بتفصيل. لا تقدم توصية شراء أو بيع. لا تذكر المصدر ولا تضع روابط. لا تكتب أي جملة ختامية. اجعل المنشور مباشرًا وسريعًا ومناسبًا للمتداولين المحترفين.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nمهم جدًا: لا تكتب رابط المصدر ولا تذكر اسم المصدر داخل المنشور. اكتب سطر التأثير بصيغة واضحة تشمل جميع الأصول المتأثرة، مثل: التأثير: سلبي للدولار / إيجابي للذهب / إيجابي للنفط / سلبي للأسهم.`,
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

    const publishedLinks = readPublishedNewsLinks();
    const recentTitles = publishedLinks.map((item) =>
      item.toLowerCase().slice(0, 80)
    );

    let latestNews = null;

    for (const item of allItems.slice(0, 50)) {
      const newsDate = new Date(item.isoDate || item.pubDate || Date.now()).getTime();
      const maxAge = MAX_NEWS_AGE_HOURS * 60 * 60 * 1000;

      const isFresh = Date.now() - newsDate <= maxAge;
      const isNew = item.link && !publishedLinks.includes(item.link);

      const isDuplicateTopic = recentTitles.some((t) =>
        (item.title || "").toLowerCase().includes(t.slice(0, 35))
      );

      if (isDuplicateTopic) {
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
      const photoUrl = selectNewsImage(latestNews.title);
      const photoPath = await createNewsCard(imageTitle, photoUrl);

      await sendTelegramPhoto(message, photoPath);
    } else {
      await sendTelegramMessage(message);
    }

    savePublishedNewsLink(latestLink);
  } catch (error) {
    console.error("❌ RSS Error:", error.message);
  }
}

console.log("🚀 News Worker Started...");

fetchForexNews();

setInterval(() => {
  fetchForexNews();
}, 60 * 1000);