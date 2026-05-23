const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");
const axios = require("axios");
const FormData = require("form-data");
const { createCanvas, loadImage } = require("canvas");
require("dotenv").config();

const parser = new Parser();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const LAST_NEWS_FILE = path.join(__dirname, "last-news.json");
const NEWS_CARD_FILE = path.join(__dirname, "news-card.png");

// Temporary test mode: true = publish any latest news to test the image design.
// After testing, change this to false to activate the important-news filter again.
const TEMP_ALLOW_ALL_NEWS = false;
const MAX_NEWS_AGE_HOURS = 12;

const IMPORTANT_KEYWORDS = [
  "fed",
  "fomc",
  "powell",
  "cpi",
  "inflation",
  "interest rate",
  "rates",
  "nfp",
  "non-farm",
  "payrolls",
  "unemployment",
  "jobs",
  "gdp",
  "pce",
  "usd",
  "dollar",
  "gold",
  "bitcoin",
  "crypto",
  "ethereum",
  "tariff",
  "recession",
  "central bank",
  "war",
  "attack",
  "missile",
  "conflict",
  "ceasefire",
  "peace talks",
  "negotiations",
  "talks",
  "nuclear talks",
  "deal",
  "sanctions",
  "iran",
  "usa",
  "us",
  "america",
  "washington",
  "tehran",
  "israel",
  "ukraine",
  "russia",
  "gaza",
  "oil",
  "crude",
  "brent",
  "wti",
  "geopolitical",
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

  if (lowerTitle.includes("powell") || lowerTitle.includes("fed") || lowerTitle.includes("fomc") || lowerTitle.includes("federal reserve")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Jerome_H._Powell,_Federal_Reserve_Chair.jpg";
  }

  if (lowerTitle.includes("trump") || lowerTitle.includes("tariff")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Donald_Trump_official_portrait.jpg";
  }

  if (lowerTitle.includes("biden")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Joe_Biden_presidential_portrait.jpg";
  }

  if (lowerTitle.includes("iran") || lowerTitle.includes("tehran") || lowerTitle.includes("sanctions") || lowerTitle.includes("nuclear talks")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Flag_of_Iran.svg";
  }

  if (lowerTitle.includes("war") || lowerTitle.includes("attack") || lowerTitle.includes("missile") || lowerTitle.includes("conflict") || lowerTitle.includes("ceasefire") || lowerTitle.includes("gaza") || lowerTitle.includes("ukraine") || lowerTitle.includes("russia") || lowerTitle.includes("israel")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/War_icon.svg";
  }

  if (lowerTitle.includes("oil") || lowerTitle.includes("crude") || lowerTitle.includes("brent") || lowerTitle.includes("wti")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Oil_platform_P-51_(Brazil).jpg";
  }

  if (lowerTitle.includes("ecb") || lowerTitle.includes("lagarde") || lowerTitle.includes("european central bank")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Christine_Lagarde_2018.jpg";
  }

  if (lowerTitle.includes("boj") || lowerTitle.includes("japan") || lowerTitle.includes("yen")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Bank_of_Japan_2010.jpg";
  }

  if (lowerTitle.includes("cpi") || lowerTitle.includes("inflation")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/US_CPI_inflation_1914_to_2022.png";
  }

  if (lowerTitle.includes("gold") || lowerTitle.includes("xau")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Gold_bars.jpg";
  }

  if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto") || lowerTitle.includes("ethereum")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Bitcoin_logo.svg";
  }

  if (lowerTitle.includes("gdp")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/GDP_nominal_per_capita_world_map_IMF_2022.svg";
  }

  if (lowerTitle.includes("nfp") || lowerTitle.includes("payrolls") || lowerTitle.includes("jobs") || lowerTitle.includes("unemployment")) {
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/Unemployment_Rates_in_the_United_States_1950-2022.png";
  }

  return "https://commons.wikimedia.org/wiki/Special:Redirect/file/New_York_Stock_Exchange_-_Wall_Street.jpg";
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
  const width = 1080;
  const height = 1080;
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
  }

  ctx.fillStyle = "#dc2626";
  ctx.roundRect(60, 60, 220, 82, 18);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px Arial";
  ctx.textAlign = "center";
  ctx.fillText("عاجل", 170, 116);

  ctx.fillStyle = "rgba(2, 6, 23, 0.86)";
  ctx.roundRect(55, 720, 970, 250, 34);
  ctx.fill();

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px Arial";

  const lines = wrapText(ctx, title, 900);
  let y = 805;

  for (const line of lines) {
    ctx.fillText(line, 990, y);
    y += 72;
  }

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.font = "bold 30px Arial";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText("الأخبار الاقتصادية | Economic News", 990, 1015);

  ctx.textAlign = "left";
  ctx.font = "bold 28px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("t.me/EconomicNewsi", 60, 1015);

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

async function analyzeNewsWithAI(title, link) {
  if (!OPENAI_API_KEY) {
    return `🚨 خبر اقتصادي عاجل\n\n📌 ${title}\n\nالتأثير: متباين على الدولار / الذهب / الكريبتو حسب ردّة فعل السوق\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi\n\n#Forex #Gold #Crypto #USD`;
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
              "أنت محرر أخبار مالية عاجلة لقناة تيليجرام مختصة بنقل أهم أخبار الفوركس العالمية والاقتصادية والجيوسياسية التي تؤثر على العملات والمؤشرات والسلع والكريبتو. اكتب منشورًا عربيًا قصيرًا جدًا واحترافيًا يشبه أسلوب قنوات الأخبار العاجلة. التنسيق الإجباري: السطر الأول عنوان عاجل مع إيموجي مناسب. بعده ملخص الخبر بجملة أو جملتين فقط. بعده سطر واحد بعنوان: التأثير: ويجب أن يذكر كل الأصول المتأثرة بوضوح، مثال: التأثير: إيجابي للكريبتو / سلبي للدولار / إيجابي للذهب. إذا كان الخبر يؤثر على أكثر من أصل، اذكرها كلها بنفس السطر. لا تشرح التأثير بتفصيل. اهتم بأخبار الفيدرالي والتضخم والوظائف والفائدة والدولار والذهب والنفط والكريبتو والحروب والتوترات الجيوسياسية ومفاوضات إيران وأمريكا والعقوبات لأنها تؤثر على الأسواق. لا تقدم توصية شراء أو بيع. لا تذكر المصدر ولا تضع روابط أخبار. لا تكتب أي جملة ختامية مثل تابعونا أو للمزيد من التحديثات. اجعل المنشور مباشرًا ومختصرًا: ننقل ما يهم المتداول فقط.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nمهم جدًا: لا تكتب رابط المصدر ولا تذكر اسم المصدر داخل المنشور. اكتب سطر التأثير بصيغة واضحة تشمل جميع الأصول المتأثرة، مثل: التأثير: إيجابي للكريبتو / سلبي للدولار / إيجابي للذهب.`,
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

    return `${cleanedAiText}\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`;
  } catch (error) {
    console.error("⚠️ AI Error:", error.response?.data || error.message);

    return `🚨 خبر اقتصادي عاجل\n\n📌 ${title}\n\nالتأثير: متباين على الدولار / الذهب / الكريبتو حسب ردّة فعل السوق\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi\n\n#Forex #Gold #Crypto #USD`;
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

    const latestNews = allItems.slice(0, 50).find((item) => {
      const newsDate = new Date(item.isoDate || item.pubDate || Date.now()).getTime();
      const maxAge = MAX_NEWS_AGE_HOURS * 60 * 60 * 1000;

      const isFresh = Date.now() - newsDate <= maxAge;
      const isNew = item.link && !publishedLinks.includes(item.link);
      const isImportant = TEMP_ALLOW_ALL_NEWS || isImportantNews(item.title || "");

      return isFresh && isNew && isImportant;
    });

    if (!latestNews) {
      console.log("⏭️ No new important news found.");
      return;
    }

    const latestLink = latestNews.link;

    const message = await analyzeNewsWithAI(latestNews.title, latestNews.link);
    const photoUrl = selectNewsImage(latestNews.title);
    const photoPath = await createNewsCard(latestNews.title, photoUrl);

    await sendTelegramPhoto(message, photoPath);
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