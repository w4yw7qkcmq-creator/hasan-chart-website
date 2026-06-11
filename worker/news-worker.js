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
const TRADING_ECONOMICS_CLIENT =
  process.env.TRADING_ECONOMICS_CLIENT ||
  process.env.TRADING_ECONOMICS_API_KEY ||
  "guest:guest";

const INVESTING_CALENDAR_URL = "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData";
const INVESTING_US_COUNTRY_ID = "5";

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
const MAX_POSTS_PER_HOUR = 15;
const MAX_HIGH_IMPACT_POSTS_PER_HOUR = 25;
const ULTRA_PRIORITY_KEYWORDS = [
  "fed",
  "fomc",
  "interest rate decision",
  "cpi",
  "nfp",
  "jobless claims",
  "initial jobless claims",
  "unemployment claims",
  "weekly jobless claims",
  "claims",
  "initial claims",
  "continuing claims",
  "labor market",
  "job market",
  "employment",
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
  "طلبات إعانة البطالة",
  "إعانات البطالة",
  "الشكاوى من البطالة",
  "طلبات البطالة",
  "سوق العمل",
  "العمالة",
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
const USE_LOCAL_IMAGE_FALLBACK = true;

// Professional breaking-news mode: publish only market-moving items, not general articles.
const FOREX_BREAKING_STYLE = true;

const MIN_IMAGE_WIDTH = 1920;
const MIN_IMAGE_HEIGHT = 1080;

const IMPORTANT_EVENT_ALERTS = [
  {
    id: "us-nfp-2026-06-05",
    title: "تقرير الوظائف الأمريكية NFP والبطالة",
    eventTimeUtc: "2026-06-05T12:30:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
  },
  {
    id: "us-cpi-2026-06-10",
    title: "مؤشر التضخم الأمريكي CPI",
    eventTimeUtc: "2026-06-10T12:30:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
  },
  {
    id: "us-ppi-2026-06-11",
    title: "مؤشر أسعار المنتجين الأمريكي PPI",
    eventTimeUtc: "2026-06-11T12:30:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
  },
  {
    id: "fomc-rate-decision-2026-06-17",
    title: "قرار الفائدة الأمريكية FOMC",
    eventTimeUtc: "2026-06-17T18:00:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات، النفط والكريبتو",
  },
  {
    id: "us-consumer-confidence-2026-06-30",
    title: "مؤشر ثقة المستهلك الأمريكي CB Consumer Confidence",
    eventTimeUtc: "2026-06-30T14:00:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية والكريبتو",
  },
  {
    id: "us-nfp-2026-07-02",
    title: "تقرير الوظائف الأمريكية NFP والبطالة",
    eventTimeUtc: "2026-07-02T12:30:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
  },
  {
    id: "us-cpi-2026-07-14",
    title: "مؤشر التضخم الأمريكي CPI",
    eventTimeUtc: "2026-07-14T12:30:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
  },
  {
    id: "us-ppi-2026-07-15",
    title: "مؤشر أسعار المنتجين الأمريكي PPI",
    eventTimeUtc: "2026-07-15T12:30:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
  },
  {
    id: "fomc-rate-decision-2026-07-29",
    title: "قرار الفائدة الأمريكية FOMC",
    eventTimeUtc: "2026-07-29T18:00:00Z",
    assets: "الدولار، الذهب، الأسهم الأمريكية، السندات، النفط والكريبتو",
  },
  {
    id: "nvidia-earnings-2026-q2-placeholder",
    title: "أرباح شركة NVIDIA",
    eventTimeUtc: "2026-08-26T20:00:00Z",
    assets: "ناسداك، الأسهم الأمريكية، الذكاء الاصطناعي، الكريبتو",
  },
  {
    id: "apple-earnings-2026-q2-placeholder",
    title: "أرباح شركة Apple",
    eventTimeUtc: "2026-07-30T20:00:00Z",
    assets: "ناسداك، الأسهم الأمريكية، الدولار والكريبتو",
  },
  {
    id: "microsoft-earnings-2026-q2-placeholder",
    title: "أرباح شركة Microsoft",
    eventTimeUtc: "2026-07-29T20:00:00Z",
    assets: "ناسداك، الأسهم الأمريكية، الذكاء الاصطناعي والكريبتو",
  },
  {
    id: "amazon-earnings-2026-q2-placeholder",
    title: "أرباح شركة Amazon",
    eventTimeUtc: "2026-07-31T20:00:00Z",
    assets: "ناسداك، الأسهم الأمريكية، قطاع التكنولوجيا والكريبتو",
  },
  {
    id: "tesla-earnings-2026-q2-placeholder",
    title: "أرباح شركة Tesla",
    eventTimeUtc: "2026-07-23T20:00:00Z",
    assets: "ناسداك، الأسهم الأمريكية، قطاع السيارات والكريبتو",
  },
  {
    id: "meta-earnings-2026-q2-placeholder",
    title: "أرباح شركة Meta",
    eventTimeUtc: "2026-07-30T20:00:00Z",
    assets: "ناسداك، الأسهم الأمريكية، قطاع التكنولوجيا والكريبتو",
  },
];

const IMPORTANT_EVENT_ALERT_MINUTES = [120, 60, 15, 5];
const RECURRING_JOBLESS_CLAIMS_WEEKS = 8;
let cachedEconomicCalendarEvents = [];
let cachedEconomicCalendarEventsAt = 0;
const ECONOMIC_CALENDAR_CACHE_MS = 60 * 60 * 1000;
const ECONOMIC_RELEASE_LOOKBACK_MINUTES = 15;
function parseEconomicNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();

  if (!raw || raw === "-" || raw.toLowerCase() === "na") {
    return null;
  }

  const multiplier = /k$/i.test(raw)
    ? 1_000
    : /m$/i.test(raw)
      ? 1_000_000
      : /b$/i.test(raw)
        ? 1_000_000_000
        : 1;

  const cleaned = raw.replace(/[%,$,KkMmBb\s]/g, "");
  const number = Number(cleaned);

  if (Number.isNaN(number)) {
    return null;
  }

  return number * multiplier;
}

function getEconomicReleaseImpactText(title, actualValue, forecastValue) {
  const titleText = String(title || "").toLowerCase();
  const actual = parseEconomicNumber(actualValue);
  const forecast = parseEconomicNumber(forecastValue);

  if (actual === null || forecast === null) {
    return "التأثير غير واضح حتى الآن";
  }

  if (actual === forecast) {
    return "مطابق للتوقعات، التأثير محدود غالبًا";
  }

  const actualAboveForecast = actual > forecast;

  if (/jobless claims|initial claims|continuing claims|unemployment claims/i.test(titleText)) {
    return actualAboveForecast
      ? "سلبي للدولار الأمريكي / إيجابي للذهب"
      : "إيجابي للدولار الأمريكي / سلبي للذهب";
  }

  if (/unemployment rate/i.test(titleText)) {
    return actualAboveForecast
      ? "سلبي للدولار الأمريكي / إيجابي للذهب"
      : "إيجابي للدولار الأمريكي / سلبي للذهب";
  }

  if (/cpi|core cpi|ppi|pce|inflation/i.test(titleText)) {
    return actualAboveForecast
      ? "إيجابي للدولار الأمريكي / سلبي للذهب والأسهم"
      : "سلبي للدولار الأمريكي / إيجابي للذهب والأسهم";
  }

  if (/nfp|nonfarm payrolls|payrolls|employment/i.test(titleText)) {
    return actualAboveForecast
      ? "إيجابي للدولار الأمريكي / سلبي للذهب"
      : "سلبي للدولار الأمريكي / إيجابي للذهب";
  }

  if (/consumer confidence|consumer sentiment|retail sales|gdp|pmi|ism/i.test(titleText)) {
    return actualAboveForecast
      ? "إيجابي للدولار الأمريكي والأسهم / سلبي للذهب"
      : "سلبي للدولار الأمريكي والأسهم / إيجابي للذهب";
  }

  return actualAboveForecast
    ? "إيجابي للدولار الأمريكي غالبًا"
    : "سلبي للدولار الأمريكي غالبًا";
}


function formatDateForInvestingCalendar(date) {
  return date.toISOString().slice(0, 10);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInvestingCell(rowHtml, className) {
  const pattern = new RegExp(`<td[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i");
  const match = String(rowHtml || "").match(pattern);
  return stripHtml(match?.[1] || "");
}

function parseInvestingCalendarDate(value) {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .replace(/\//g, "-")
    .replace(" ", "T");

  const parsed = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInvestingCalendarRows(html) {
  const content = String(html || "");
  const rows =
    content.match(/<tr[^>]*id=["']eventRowId_[^"']+["'][\s\S]*?<\/tr>/gi) ||
    content.match(/<tr[^>]*class=["'][^"']*js-event-item[^"']*["'][\s\S]*?<\/tr>/gi) ||
    [];

  return rows
    .map((row) => {
      const dateMatch = row.match(/data-event-datetime=["']([^"']+)["']/i);
      const eventDate = parseInvestingCalendarDate(dateMatch?.[1]);

      const titleMatch =
        row.match(/<td[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i) ||
        row.match(/<td[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);

      const title = stripHtml(titleMatch?.[1] || "");
      const actual = extractInvestingCell(row, "act");
      const forecast = extractInvestingCell(row, "fore");
      const previous = extractInvestingCell(row, "prev");
      const importanceStars = (row.match(/grayFullBullishIcon|orangeFullBullishIcon|redFullBullishIcon/g) || []).length;

      if (!title || !eventDate) return null;

      return {
        Event: title,
        Date: eventDate.toISOString(),
        Actual: actual,
        Forecast: forecast,
        Previous: previous,
        Country: "United States",
        Importance: importanceStars >= 3 ? "high" : importanceStars === 2 ? "medium" : "low",
      };
    })
    .filter(Boolean);
}

async function fetchInvestingCalendarEvents(fromDate, toDate) {
  const form = new URLSearchParams();
  form.append("country[]", INVESTING_US_COUNTRY_ID);
  form.append("importance[]", "2");
  form.append("importance[]", "3");
  form.append("dateFrom", formatDateForInvestingCalendar(fromDate));
  form.append("dateTo", formatDateForInvestingCalendar(toDate));
  form.append("timeZone", "0");
  form.append("timeFilter", "timeRemain");
  form.append("currentTab", "custom");
  form.append("submitFilters", "1");
  form.append("limit_from", "0");

  const response = await axios.post(INVESTING_CALENDAR_URL, form.toString(), {
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": "https://www.investing.com/economic-calendar/",
      "Origin": "https://www.investing.com",
    },
  });

  const html = response.data?.data || response.data?.html || response.data;
  const events = parseInvestingCalendarRows(html);
  console.log(`✅ Loaded Investing calendar events: ${events.length}`);

  if (!events.length) {
    console.log("RAW INVESTING RESPONSE:", String(html).slice(0, 1000));
  }

  return events;
}

async function publishEconomicReleaseNow() {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - ECONOMIC_RELEASE_LOOKBACK_MINUTES * 60 * 1000);
    const to = new Date(now.getTime() + 5 * 60 * 1000);

    const events = await fetchInvestingCalendarEvents(from, to);

    for (const event of events) {
      const title = String(event.Event || event.event || "").trim();
      if (!title) continue;

      const actual = String(event.Actual ?? "").trim();
      const forecast = String(event.Forecast ?? "").trim();
      const previous = String(event.Previous ?? "").trim();
      const important = isHighImpactCalendarEvent(event);
      if (!important) continue;

      if (!actual || !forecast) {
        console.log("⏭️ Skipped release missing actual/forecast:", title);
        continue;
      }

      const releaseId = `investing-economic-release:${title}:${event.Date || event.date || actual}:${forecast}`;
      const publishedItems = await loadPublishedNewsFromSupabase();
      const alreadySent = publishedItems.some((item) => item.link === releaseId);
      if (alreadySent) continue;

      const eventName = guessArabicEconomicEventName(title);
      const impactText = getEconomicReleaseImpactText(title, actual, forecast);

      const message =
        `🟥 صدر الآن :\n\n` +
        `📊 أمريكا - 🇺🇸\n` +
        `💵 ${eventName}\n\n` +
        `▪️ السابق : ${previous || "غير متوفر"}\n` +
        `▪️ التقدير : ${forecast}\n` +
        `▫️ الحالي : ${actual}\n\n` +
        `⬅️ النتيجة : ${impactText}\n\n` +
        `📚 لمتابعة أخبار الأسهم والذهب والعملات:\nhttps://t.me/EconomicNewsi ✅`;

      const releaseImage = selectNewsImage(`${eventName} ${title} fed dollar stocks`);
      const photoPath = await createNewsCard(eventName, releaseImage, "HIGH");

      if (photoPath) {
        await sendTelegramPhoto(message, photoPath);
      } else {
        await sendTelegramMessage(message);
      }

      await savePublishedNewsToSupabase({
        link: releaseId,
        title: message,
        normalized_title: normalizeNewsTitle(message).slice(0, 500),
        topic_cluster: `economic_release_${normalizeNewsTitle(eventName)}`,
        published_at: new Date().toISOString(),
      });

      await saveNewsPostToSupabase({
        title: eventName,
        content: message,
        image_url: null,
        impact_level: "HIGH",
        source_link: releaseId,
      });

      savePublishedNewsLink(releaseId, message);
    }
  } catch (error) {
    console.error("❌ Investing Economic Release Publish Error:", error.response?.data || error.message);
  }
}


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
  "weekly jobless claims",
  "claims",
  "labor market",
  "job market",
  "employment",
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
  "weekly jobless claims",
  "claims",
  "labor market",
  "job market",
  "employment",
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
  "إعانات البطالة",
  "الشكاوى من البطالة",
  "طلبات البطالة",
  "سوق العمل",
];

function isEconomicCalendarNews(title) {
  const lowerTitle = String(title || "").toLowerCase();

  return ECONOMIC_CALENDAR_EVENTS.some((keyword) =>
    lowerTitle.includes(keyword.toLowerCase())
  );
}

// RSS news feeds disabled. Main live-news source is now ForexBreakingNews Telegram channel only.
// Economic calendar functions remain active separately for scheduled alerts and official releases.
const NEWS_FEEDS = [];

const TELEGRAM_SOURCE_CHANNELS = [
  {
    name: "ForexBreakingNews",
    url: "https://t.me/s/ForexBreakingNews",
    priority: 1,
  },
  {
    name: "ForexNewspaper",
    url: "https://t.me/s/ForexNewspaper",
    priority: 2,
  },
];

function decodeTelegramHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTelegramSourceText(value) {
  return String(value || "")
    .replace(/https?:\/\/t\.me\/\S+/gi, "")
    .replace(/Telegram\.me\/?/gi, "")
    .replace(/@ForexBreakingNews/gi, "")
    .replace(/@ForexNewspaper/gi, "")
    .replace(/ForexBreakingNews/gi, "")
    .replace(/ForexNewspaper/gi, "")
    .replace(/JOIN OUR CHANNEL/gi, "")
    .replace(/SUBSCRIBE/gi, "")
    .replace(/Follow us/gi, "")
    .replace(/Breaking News/gi, "")
    .replace(/اشترك|تابعنا/gi, "")
    .replace(/لمتابعة آخر أخبار الفوركس/gi, "")
    .replace(/نشرة أخبار الفوركس/gi, "")
    .replace(/آخر أخبار الفوركس العاجلة/gi, "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/#[^\s#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTelegramChannelPosts() {
  const posts = [];

  for (const channel of TELEGRAM_SOURCE_CHANNELS) {
    try {
      const response = await axios.get(channel.url, {
        timeout: 12000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      const html = String(response.data || "");

      const textMatches = [
        ...html.matchAll(
          /tgme_widget_message_text[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/gi
        ),
      ];

      for (const match of textMatches.slice(-15)) {
        const text = cleanTelegramSourceText(decodeTelegramHtml(match[1]));

        if (!text || text.length < 15) continue;

        posts.push({
          title: text,
          link: `telegram-${channel.name}-${normalizeNewsTitle(text).slice(0, 80)}`,
          contentSnippet: text,
          sourceName: channel.name,
          isTelegramSource: true,
          pubDate: new Date().toISOString(),
        });
      }

      console.log(
        `✅ Telegram source loaded ${channel.name}: ${posts.length}`
      );
    } catch (error) {
      console.error(
        `⚠️ Telegram source error ${channel.name}:`,
        error.message
      );
    }
  }

  return posts;
}

function isImportantNews(title) {
  const lowerTitle = title.toLowerCase();
  return IMPORTANT_KEYWORDS.some((keyword) =>
    lowerTitle.includes(keyword)
  );
}

function getMarketImpactLevel(text) {
  const value = String(text || "").toLowerCase();
  if (
    /weight loss drug|drug maker|pharma|pharmaceutical|biotech|healthcare company|medical company|clinical trial|fda approval|fda|obesity drug|safety data|drug safety|weight-loss|weight loss|أدوية خسارة الوزن|ادوية خسارة الوزن|دواء خسارة الوزن|مصنع أدوية|مصنع ادوية|شركة أدوية|شركة ادوية|بيانات سلامة|تجربة سريرية|التجارب السريرية|اعتماد هيئة الغذاء والدواء|الدواء والغذاء|الرعاية الصحية/i.test(value)
  ) {
    return "LOW";
  }

  const criticalPattern = /fed rate decision|fomc decision|interest rate decision|rate cut|rate hike|powell speaks|powell says|cpi|core cpi|pce inflation|core pce|nfp|nonfarm payrolls|unemployment rate|jobless claims|initial jobless claims|weekly jobless claims|unemployment claims|initial claims|continuing claims|claims data|labor market|job market|employment report|consumer confidence|ism manufacturing|ism services|gdp|market losses|market rout|market crash|selloff|sell-off|stocks plunge|stocks sink|stocks tumble|nasdaq falls|nasdaq plunges|dow falls|s&p falls|futures fall|futures plunge|liquidations|crypto liquidations|futures liquidations|margin call|risk-off|oil prices surge|oil prices jump|oil spikes|gold jumps|bitcoin plunges|bitcoin surges|war breaks out|missile attack|drone attack|airstrike|escalation|retaliation|port attack|ports attack|ship attack|ships attacked|vessel attack|tanker attack|red sea|persian gulf|strait of hormuz|naval attack|hormuz|sanctions announced|tariff announced|الفيدرالي|قرار الفائدة|خفض الفائدة|رفع الفائدة|التضخم|مؤشر ثقة المستهلك|البطالة|طلبات إعانة البطالة|إعانات البطالة|الشكاوى من البطالة|طلبات البطالة|سوق العمل|العمالة|الوظائف|خسائر الأسواق|هبوط الأسواق|انهيار السوق|تراجع الأسهم|خسائر الأسهم الأمريكية|تصفيات|تصفيات الفيوتشر|تصفيات العقود الآجلة|تصفية مراكز|النفط|الذهب|هرمز|عقوبات|هجوم|ضرب إيران|ضرب ايران|تصعيد|استهداف السفن|ضرب السفن|استهداف الموانئ|ضرب الموانئ|البحر الأحمر|الخليج العربي|مضيق هرمز|هجوم بطائرات مسيرة|رد انتقامي/i;

  const mediumPattern = /federal reserve|fomc|powell|interest rate|inflation|ppi|pce|payrolls|jobless claims|claims|initial claims|continuing claims|labor market|job market|employment|retail sales|pmi|ism|treasury yields|dollar index|brent|wti|gold|bitcoin|btc|ethereum|nasdaq|dow jones|s&p 500|futures|liquidation|selloff|risk off|market volatility|nvidia|apple|tesla|microsoft|earnings|revenue|guidance|iran|israel|russia|ukraine|opec|tariff|sanctions|missile|attack|ship|port|red sea|persian gulf|الفائدة|باول|مبيعات التجزئة|طلبات إعانة البطالة|إعانات البطالة|الشكاوى من البطالة|طلبات البطالة|سوق العمل|العمالة|الدولار|البيتكوين|إيران|ايران|إسرائيل|اسرائيل|روسيا|أوكرانيا|اوكرانيا|أرباح|خسائر|هبوط|تصفيات|الفيوتشر|العقود الآجلة|السفن|الموانئ|تصعيد/i;

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
  const assetsDir = path.join(__dirname, "assets");
  const availableFiles = fileNames
    .map((fileName) => path.join(assetsDir, fileName))
    .filter((filePath) => fs.existsSync(filePath));

  if (!availableFiles.length) {
    const anyImageFile = fs.existsSync(assetsDir)
      ? fs
          .readdirSync(assetsDir)
          .find((fileName) => /\.(png|jpg|jpeg)$/i.test(fileName))
      : null;

    if (anyImageFile) {
      return path.join(assetsDir, anyImageFile);
    }

    return path.join(assetsDir, "default.png");
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
      "BTC.png",
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
      "Gold.png",
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
      "OIL.png",
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
      "Fed.png",
      "Powellpng.png",
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
      "Trumppng.png",
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
      "War.png",
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
  "Inflation.png",
  "Stockpng.png",
  "stocks-1.png",
  "stocks-2.png",
  "stocks-3.png",
  "default-1.png",
  "default-2.png",
  "default-3.png",
  "default.png",
]);
  }

  if (
    lowerTitle.includes("stock") ||
    lowerTitle.includes("nasdaq") ||
    lowerTitle.includes("dow") ||
    lowerTitle.includes("s&p")
  ) {
    return pickRandomAsset([
      "Stockpng.png",
      "stocks-1.png",
      "stocks-2.png",
      "stocks-3.png",
      "stocks.png",
    ]);
  }

  return pickRandomAsset([
    "Inflation.png",
    "Stockpng.png",
    "Forex.png",
    "default-1.png",
    "default-2.png",
    "default-3.png",
    "default.png",
  ]);
}

function shouldUseLocalImageForMajorTopic(title) {
  const value = String(title || "").toLowerCase();

  return /bitcoin|btc|crypto|ethereum|gold|xau|oil|crude|brent|wti|fed|fomc|powell|federal reserve|interest rate|cpi|ppi|nfp|jobless claims|unemployment|nasdaq|dow|s&p|stock market open|market open|war|missile|attack|iran|israel|hormuz|red sea|البيتكوين|الكريبتو|الذهب|النفط|الفيدرالي|باول|قرار الفائدة|التضخم|البطالة|الوظائف|طلبات إعانة البطالة|ناسداك|داو جونز|افتتاح السوق|حرب|هجوم|صاروخ|إيران|ايران|إسرائيل|اسرائيل|هرمز|البحر الأحمر/i.test(value);
}

function getImageFromNewsItem(item) {
  if (!item) return null;

 if (item.isTelegramSource) {
  return null;
}

  const candidates = [];

  const pushCandidate = (value) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      candidates.push(value);
    }
  };

  pushCandidate(item.enclosure?.url);
  pushCandidate(item.thumbnail);
  pushCandidate(item.image);
  pushCandidate(item.imageUrl);
  pushCandidate(item.media?.content?.url);
  pushCandidate(item["media:content"]?.url);
  pushCandidate(item["media:content"]?.$?.url);
  pushCandidate(item["media:thumbnail"]?.url);
  pushCandidate(item["media:thumbnail"]?.$?.url);

  if (Array.isArray(item.mediaContent)) {
    item.mediaContent.forEach((media) => pushCandidate(media?.url));
  }

  if (Array.isArray(item.mediaThumbnail)) {
    item.mediaThumbnail.forEach((media) => pushCandidate(media?.url));
  }

  return (
    candidates
      .filter((imageUrl) => !/logo|icon|avatar|author|profile|sprite|favicon/i.test(imageUrl))
      .find((imageUrl) => /1200|1280|1440|1600|1920|2048|large|original|hero|main/i.test(imageUrl)) ||
    candidates.find((imageUrl) => !/logo|icon|avatar|author|profile|sprite|favicon/i.test(imageUrl)) ||
    null
  );
}

// Try to extract an image from the article's HTML if not found in the RSS item.
async function getImageFromArticleUrl(articleUrl) {
  if (!articleUrl || !/^https?:\/\//i.test(articleUrl)) {
    return null;
  }
  
if (/t\.me|telegram\.me|telegram\.org/i.test(articleUrl)) {
  return null;
}
  try {
    const response = await axios.get(articleUrl, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const html = String(response.data || "");
    const candidates = new Set();

    const metaPatterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/gi,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/gi,
      /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image:src["']/gi,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/gi,
    ];

    for (const pattern of metaPatterns) {
      for (const match of html.matchAll(pattern)) {
        if (match?.[1]) {
          candidates.add(new URL(match[1], articleUrl).href);
        }
      }
    }

    const jsonLdPatterns = [
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ];

    for (const pattern of jsonLdPatterns) {
      for (const match of html.matchAll(pattern)) {
        try {
          const jsonText = String(match?.[1] || "").trim();
          if (!jsonText) continue;

          const parsed = JSON.parse(jsonText);
          const nodes = Array.isArray(parsed) ? parsed : [parsed];

          const collectImages = (node) => {
            if (!node || typeof node !== "object") return;

            const image = node.image || node.thumbnailUrl || node.url;

            if (typeof image === "string") {
              candidates.add(new URL(image, articleUrl).href);
            }

            if (Array.isArray(image)) {
              image.forEach((item) => {
                if (typeof item === "string") {
                  candidates.add(new URL(item, articleUrl).href);
                } else if (item?.url) {
                  candidates.add(new URL(item.url, articleUrl).href);
                }
              });
            }

            if (image?.url) {
              candidates.add(new URL(image.url, articleUrl).href);
            }

            Object.values(node).forEach((value) => {
              if (value && typeof value === "object") {
                if (Array.isArray(value)) {
                  value.forEach(collectImages);
                } else {
                  collectImages(value);
                }
              }
            });
          };

          nodes.forEach(collectImages);
        } catch (_) {
          // Ignore broken JSON-LD blocks.
        }
      }
    }

    const imageCandidates = [...candidates]
      .filter((imageUrl) => /^https?:\/\//i.test(imageUrl))
      .filter((imageUrl) => !/logo|icon|avatar|author|profile|sprite|favicon/i.test(imageUrl))
      .sort((a, b) => {
        const score = (url) => {
          let total = 0;
          if (/1200|1280|1440|1600|1920|2048/i.test(url)) total += 5;
          if (/og|social|article|lead|hero|main|large/i.test(url)) total += 3;
          if (/thumb|thumbnail|small|80x|120x|150x|300x/i.test(url)) total -= 5;
          return total;
        };

        return score(b) - score(a);
      });

    return imageCandidates[0] || null;
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
    "fundraise",
    "fundraising",
    "raises capital",
    "capital raise",
    "reserve increase",
    "reserve boost",
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
    "جمع تبرعات",
    "جمع تمويل",
    "زيادة رأس المال",
    "زيادة راس المال",
    "رفع الاحتياطي",
    "زيادة الاحتياطي",
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

  return commonWords / smallerSetSize >= 0.78;
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
      terms: [
        "fomc",
        "federal reserve",
        "interest rate decision",
        "rate decision",
        "fed interest rate",
        "powell",
        "press conference",
        "الفيدرالي",
        "قرار الفائدة",
        "باول",
        "مؤتمر صحفي",
        "خفض الفائدة",
        "رفع الفائدة",
      ],
    },
    {
      key: "us_inflation_jobs",
      terms: ["cpi", "inflation", "pce", "nfp", "payrolls", "jobs", "unemployment", "التضخم", "الوظائف", "البطالة", "الرواتب"],
    },
    {
      key: "bitcoin_crypto",
      terms: ["bitcoin", "btc", "crypto", "ethereum", "eth", "xrp", "ripple", "etf", "بيتكوين", "البيتكوين", "كريبتو", "العملات الرقمية", "إيثريوم", "ايثريوم", "ريبل"],
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
    const requiredMatches = cluster.key === "fed_rates" ? 1 : 2;

    if (matches.length >= requiredMatches) {
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

  const maxDuplicateWindowHours = 0.5;
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

  const cooldownHours = longCooldownClusters.includes(topicCluster) ? 0.5 : 0.25;

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
  const width = 1920;
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
    let finalImageUrl = imageUrl;

    if (!finalImageUrl) {
  finalImageUrl = selectNewsImage(title);
}

    let image = await loadImage(finalImageUrl);
    let isLocalAssetImage = typeof finalImageUrl === "string" && !/^https?:\/\//i.test(finalImageUrl);

    const useLocalFallbackImage = async (reason) => {
      console.log(`⏭️ ${reason}: ${image.width}x${image.height}. Using local fallback image.`);
      finalImageUrl = selectNewsImage(title);
      image = await loadImage(finalImageUrl);
      isLocalAssetImage = typeof finalImageUrl === "string" && !/^https?:\/\//i.test(finalImageUrl);
      console.log(`✅ Local fallback image loaded: ${image.width}x${image.height}`);
    };

    if (!isLocalAssetImage && (image.width < MIN_IMAGE_WIDTH || image.height < MIN_IMAGE_HEIGHT)) {
      console.log(`⚠️ External image is below preferred quality: ${image.width}x${image.height}. Using it anyway for variety.`);
    }

    const imageAspectRatio = image.width / image.height;
    if (!isLocalAssetImage && (imageAspectRatio < 1.35 || imageAspectRatio > 2.2)) {
      console.log(`⚠️ External image shape is not ideal: ${image.width}x${image.height}. Using it anyway for variety.`);
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
    ctx.filter = "contrast(115%) saturate(120%) brightness(105%)";
    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
    ctx.filter = "none";
    ctx.restore();

    const imageOverlay = ctx.createLinearGradient(0, 0, 0, height);
    imageOverlay.addColorStop(0, "rgba(2, 6, 23, 0.00)");
    imageOverlay.addColorStop(1, "rgba(2, 6, 23, 0.05)");
    ctx.fillStyle = imageOverlay;
    ctx.fillRect(0, 0, width, height);

    // --- New design overlay block ---
    const bottomFade = ctx.createLinearGradient(0, height * 0.58, 0, height);
    bottomFade.addColorStop(0, "rgba(2, 6, 23, 0.00)");
    bottomFade.addColorStop(0.62, "rgba(2, 6, 23, 0.18)");
    bottomFade.addColorStop(1, "rgba(2, 6, 23, 0.46)");
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(56, 189, 248, 0.92)";
    ctx.fillRect(0, height - 8, width, 8);
    // --- End new design overlay block ---
  } catch (error) {
    console.error("⚠️ Image load failed:", error.message);
    return null;
  }


  // --- Impact badge only: keep the image clean and avoid empty title boxes ---
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
  // --- End impact badge block ---

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

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(2, 6, 23, 0.58)";
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

  ctx.filter = "none";
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

async function loadNewsPostsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("news_posts")
      .select("title, content, source_link, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("❌ News Posts Load Error:", error.message);
      return [];
    }

    return (data || []).map((item) => ({
      link: item.source_link,
      title: item.title || item.content || "",
      normalizedTitle: normalizeNewsTitle(`${item.title || ""} ${item.content || ""}`),
      topicCluster: getNewsTopicCluster(`${item.title || ""} ${item.content || ""}`),
      duplicateKey: getStrongDuplicateKey(`${item.title || ""} ${item.content || ""}`),
      publishedAt: item.created_at || null,
    }));
  } catch (error) {
    console.error("❌ News Posts Load Exception:", error.message);
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

function formatDateForCalendar(date) {
  return date.toISOString().slice(0, 10);
}

function parseTradingEconomicsDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && value.includes("/Date(")) {
    const match = value.match(/\/Date\((\d+)\)\//);
    if (match?.[1]) {
      return new Date(Number(match[1]));
    }
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isHighImpactCalendarEvent(event) {
  const importance = String(
    event.Importance || event.importance || event.importanceLevel || event.Impact || ""
  ).toLowerCase();

  const eventName = String(event.Event || event.event || event.Name || event.name || "");
  const category = String(event.Category || event.category || "");
  const text = `${eventName} ${category}`.toLowerCase();

  const highImportance =
    importance.includes("high") ||
    importance === "3" ||
    importance.includes("3") ||
    importance.includes("high volatility");

  const blockedCalendarEvents = /average hourly earnings|participation rate|u6 unemployment|business inventories|wholesale inventories|goods trade balance|trade balance|factory orders|durable goods|housing starts|building permits|existing home sales|new home sales|pending home sales|industrial production|capacity utilization|chicago pmi|michigan 5-year inflation expectations|michigan inflation expectations/i;

  if (blockedCalendarEvents.test(text)) {
    return false;
  }

  const majorCalendarEvent = /fomc|federal reserve|interest rate decision|fed interest rate|rate decision|powell|press conference|cpi|core cpi|consumer price index|ppi|producer price|pce price index|core pce|non farm payrolls|nonfarm payrolls|nfp|unemployment rate|jobless claims|initial claims|continuing claims|unemployment claims|gdp|retail sales|consumer confidence|consumer sentiment|ism manufacturing|ism services|manufacturing pmi|services pmi/i.test(text);

  return highImportance && majorCalendarEvent;
}

function mapCalendarEventAssets(eventTitle) {
  const title = String(eventTitle || "").toLowerCase();

  if (title.includes("oil") || title.includes("crude")) {
    return "النفط، الدولار، الذهب والأسهم الأمريكية";
  }

  if (title.includes("fomc") || title.includes("interest rate") || title.includes("fed")) {
    return "الدولار، الذهب، الأسهم الأمريكية، السندات، النفط والكريبتو";
  }

  if (
    title.includes("cpi") ||
    title.includes("ppi") ||
    title.includes("pce") ||
    title.includes("inflation") ||
    title.includes("payroll") ||
    title.includes("nfp") ||
    title.includes("unemployment")
  ) {
    return "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو";
  }

  return "الدولار، الذهب، الأسهم الأمريكية والكريبتو";
}

function normalizeCalendarEvent(event) {
  const eventTitle = String(event.Event || event.event || event.Name || event.name || "").trim();
  const country = String(event.Country || event.country || "").trim();
  const eventDate = parseTradingEconomicsDate(event.Date || event.date || event.CalendarDate || event.datetime || event.eventTimeUtc);

  if (!eventTitle || !eventDate) {
    return null;
  }

  const idDate = eventDate.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const normalizedTitle = normalizeNewsTitle(eventTitle).replace(/\s+/g, "-").slice(0, 60);

  return {
    id: `auto-${country || "us"}-${normalizedTitle}-${idDate}`.toLowerCase(),
    title: eventTitle,
    eventTimeUtc: eventDate.toISOString(),
    assets: mapCalendarEventAssets(eventTitle),
  };
}

async function fetchAutomaticEconomicCalendarEvents() {
  try {
    if (Date.now() - cachedEconomicCalendarEventsAt < ECONOMIC_CALENDAR_CACHE_MS) {
      return cachedEconomicCalendarEvents;
    }

    const today = new Date();
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const rawEvents = await fetchInvestingCalendarEvents(today, endDate);
    const events = rawEvents
      .filter(isHighImpactCalendarEvent)
      .map(normalizeCalendarEvent)
      .filter(Boolean)
      .filter((event) => new Date(event.eventTimeUtc).getTime() > Date.now())
      .slice(0, 30);

    cachedEconomicCalendarEvents = events;
    cachedEconomicCalendarEventsAt = Date.now();

    console.log(`✅ Loaded automatic Investing calendar events: ${events.length}`);
    return events;
  } catch (error) {
    console.error("⚠️ Investing calendar fetch failed:", error.response?.data || error.message);
    return cachedEconomicCalendarEvents || [];
  }
}

// -----------------------------------------------------------------------
// Weekly Economic Calendar Telegram Post (every Monday 13:00 Damascus time)
async function sendWeeklyEconomicCalendarPost() {
  try {
    const now = new Date();
    const syriaParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Damascus",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});

    const weekday = syriaParts.weekday;
    const hour = Number(syriaParts.hour);
    const minute = Number(syriaParts.minute);
    const weekKey = `${syriaParts.year}-${syriaParts.month}-${syriaParts.day}`;

    if (weekday !== "Mon" || hour !== 13 || minute !== 0) {
      return;
    }

    const alertId = `weekly-economic-calendar:${weekKey}`;
    const publishedItems = await loadPublishedNewsFromSupabase();
    const alreadySent = publishedItems.some((item) => item.link === alertId);

    if (alreadySent) {
      return;
    }

    const startOfWeek = now.getTime() - 6 * 60 * 60 * 1000;
    const endOfWeek = now.getTime() + 7 * 24 * 60 * 60 * 1000;

    const weeklyEvents = IMPORTANT_EVENT_ALERTS
      .map((event) => ({
        ...event,
        timestamp: new Date(event.eventTimeUtc).getTime(),
      }))
      .filter((event) => !Number.isNaN(event.timestamp))
      .filter((event) => event.timestamp >= startOfWeek && event.timestamp <= endOfWeek)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (!weeklyEvents.length) {
      console.log("⏭️ No weekly economic calendar events found for this week.");
      return;
    }

    const dayFormatter = new Intl.DateTimeFormat("ar-SY", {
      timeZone: "Asia/Damascus",
      weekday: "long",
      month: "2-digit",
      day: "2-digit",
    });

    const timeFormatter = new Intl.DateTimeFormat("ar-SY", {
      timeZone: "Asia/Damascus",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const eventLines = weeklyEvents
      .map((event) => {
        const eventDate = new Date(event.eventTimeUtc);
        return `• ${dayFormatter.format(eventDate)} - ${timeFormatter.format(eventDate)}\n  ${event.title}\n  الأصول المتأثرة: ${event.assets}`;
      })
      .join("\n\n");

    const message =
      `📅 التقويم الاقتصادي لهذا الأسبوع\n\n` +
      `${eventLines}\n\n` +
      `⏰ التوقيت حسب سوريا.\n` +
      `⚠️ سيتم إرسال تنبيهات قبل الأخبار المهمة بـ 120 / 60 / 15 / 5 دقائق.\n\n` +
      `📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`;

    await sendTelegramMessage(message);

    await savePublishedNewsToSupabase({
      link: alertId,
      title: message,
      normalized_title: normalizeNewsTitle(message).slice(0, 500),
      topic_cluster: "weekly_economic_calendar",
      published_at: new Date().toISOString(),
    });

    savePublishedNewsLink(alertId, message);
  } catch (error) {
    console.error("❌ Weekly Economic Calendar Error:", error.message);
  }
}
function buildRecurringEconomicEventAlerts() {
  const events = [];
  const now = new Date();
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    12,
    30,
    0
  ));

  for (let dayOffset = 0; events.length < RECURRING_JOBLESS_CLAIMS_WEEKS && dayOffset < 70; dayOffset += 1) {
    const candidate = new Date(start.getTime() + dayOffset * 24 * 60 * 60 * 1000);

    // US weekly initial jobless claims usually publish on Thursday at 08:30 New York time.
    // During US daylight saving time, this equals 12:30 UTC.
    if (candidate.getUTCDay() !== 4) {
      continue;
    }

    if (candidate.getTime() <= Date.now() - 2 * 60 * 60 * 1000) {
      continue;
    }

    const dateKey = candidate.toISOString().slice(0, 10);
    events.push({
      id: `us-jobless-claims-${dateKey}`,
      title: "معدلات الشكاوى من البطالة الأمريكية Initial Jobless Claims",
      eventTimeUtc: candidate.toISOString(),
      assets: "الدولار، الذهب، الأسهم الأمريكية، السندات والكريبتو",
    });
  }

  return events;
}

function formatAssetsForAlert(assetsText) {
  return String(assetsText || "")
    .split(/[،,]/)
    .map((asset) => asset.trim())
    .filter(Boolean)
    .map((asset) => `• ${asset}`)
    .join("\n");
}

function buildScheduledAlertMessage(event, minutesBefore) {
  const assetsLines = formatAssetsForAlert(event.assets);

  return (
    `🟨 تنبيه اقتصادي هام\n\n` +
    `🇺🇸 أمريكا\n` +
    `💵 ${event.title}\n\n` +
    `⏰ متبقي: ${minutesBefore} دقيقة\n\n` +
    `📊 الأصول المتأثرة:\n${assetsLines || "• الدولار الأمريكي\n• الذهب\n• المؤشرات الأمريكية"}\n\n` +
    `⚠️ متوقع ارتفاع التذبذب بشكل ملحوظ وقت صدور الخبر.\n\n` +
    `📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`
  );
}

// Send alerts for major scheduled economic events (custom events)
async function sendImportantEconomicEventAlerts() {
  try {
    const allImportantEvents = [
      ...buildRecurringEconomicEventAlerts(),
      ...IMPORTANT_EVENT_ALERTS,
    ];

    if (!allImportantEvents.length) {
      return;
    }

    const now = Date.now();

    for (const event of allImportantEvents) {
      const eventTime = new Date(event.eventTimeUtc).getTime();

      if (!eventTime || Number.isNaN(eventTime)) {
        continue;
      }

      for (const minutesBefore of IMPORTANT_EVENT_ALERT_MINUTES) {
        const alertTime = eventTime - minutesBefore * 60 * 1000;
        const diffMs = now - alertTime;

        if (diffMs < 0 || diffMs > 60 * 1000) {
          continue;
        }

        const alertId = `important-event-alert:${event.id}:${minutesBefore}m`;
        const publishedItems = await loadPublishedNewsFromSupabase();
        const alreadySent = publishedItems.some((item) => item.link === alertId);

        if (alreadySent) {
          continue;
        }

        const message = buildScheduledAlertMessage(event, minutesBefore);
        const alertImage = selectNewsImage(event.title);
        const photoPath = await createNewsCard(event.title, alertImage, "HIGH");

        if (photoPath) {
          await sendTelegramPhoto(message, photoPath);
        } else {
          await sendTelegramMessage(message);
        }

        await savePublishedNewsToSupabase({
          link: alertId,
          title: message,
          normalized_title: normalizeNewsTitle(message).slice(0, 500),
          topic_cluster: "important_economic_event_alert",
          published_at: new Date().toISOString(),
        });

        savePublishedNewsLink(alertId, message);
      }
    }
  } catch (error) {
    console.error("❌ Important Event Alert Error:", error.message);
  }
}

async function fetchYahooQuote(symbol) {
  try {
    const response = await axios.get("https://query1.finance.yahoo.com/v7/finance/quote", {
      timeout: 10000,
      params: {
        symbols: symbol,
        fields: "regularMarketPrice,regularMarketChangePercent,shortName,symbol",
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });

    const quote = response.data?.quoteResponse?.result?.[0];

    if (!quote) {
      return null;
    }

    return {
      symbol,
      price: Number(quote.regularMarketPrice),
      changePercent: Number(quote.regularMarketChangePercent),
    };
  } catch (error) {
    console.error(`⚠️ Yahoo quote fetch failed for ${symbol}:`, error.message);
    return null;
  }
}

function formatMarketChangeLine(label, quote) {
  if (!quote || Number.isNaN(quote.changePercent)) {
    return `• ${label}: غير متوفر الآن`;
  }

  const arrow = quote.changePercent > 0 ? "🟢" : quote.changePercent < 0 ? "🔴" : "⚪";
  const sign = quote.changePercent > 0 ? "+" : "";
  return `${arrow} ${label}: ${sign}${quote.changePercent.toFixed(2)}%`;
}

async function buildUsMarketOpenReportMessage() {
  const [nasdaq, sp500, dow, gold, silver, dollar] = await Promise.all([
    fetchYahooQuote("^IXIC"),
    fetchYahooQuote("^GSPC"),
    fetchYahooQuote("^DJI"),
    fetchYahooQuote("GC=F"),
    fetchYahooQuote("SI=F"),
    fetchYahooQuote("DX-Y.NYB"),
  ]);
  
  if (!nasdaq || !sp500 || !dow || !gold || !silver || !dollar) {
  console.log("⏭️ Skipped US market open report: missing market quotes");
  return null;
}

  const reportLines = [
    formatMarketChangeLine("ناسداك", nasdaq),
    formatMarketChangeLine("ستاندرد آند بورز 500", sp500),
    formatMarketChangeLine("داو جونز", dow),
    formatMarketChangeLine("الذهب", gold),
    formatMarketChangeLine("الفضة", silver),
    formatMarketChangeLine("مؤشر الدولار", dollar),
  ].join("\n");

  const riskTone =
    nasdaq?.changePercent > 0 && sp500?.changePercent > 0
      ? "شهية المخاطرة إيجابية مع بداية الجلسة."
      : nasdaq?.changePercent < 0 && sp500?.changePercent < 0
        ? "ضغط بيعي واضح مع بداية الجلسة."
        : "الأسواق متباينة مع بداية الجلسة.";

  return (
    "📊 تقرير افتتاح السوق الأمريكي\n\n" +
    "🇺🇸 بدأ تداول وول ستريت الآن.\n\n" +
    `${reportLines}\n\n` +
    `التأثير: ${riskTone}\n\n` +
    "⚠️ أول 30 دقيقة غالباً تكون الأعلى تذبذباً، خصوصاً على الذهب والفضة والمؤشرات الأمريكية والكريبتو.\n\n" +
    "📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi"
  );
}

async function sendScheduledMarketAlerts() {
  try {
    const now = new Date();

    const nyParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});

    const weekday = nyParts.weekday;
    const hour = Number(nyParts.hour);
    const minute = Number(nyParts.minute);
    const eventDateKey = `${nyParts.year}-${nyParts.month}-${nyParts.day}`;

    if (weekday === "Sat" || weekday === "Sun") {
      return;
    }

    const scheduledAlerts = [
      {
        id: `us-market-open-60m-${eventDateKey}`,
        hour: 8,
        minute: 30,
        message:
          "⏰ تنبيه مهم\n\n🇺🇸 متبقي ساعة واحدة على افتتاح السوق الأمريكي.\n\n📊 راقب تحركات الدولار، الذهب، ناسداك، داو جونز و S&P 500.\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi",
      },
      {
        id: `us-market-open-5m-${eventDateKey}`,
        hour: 9,
        minute: 25,
        message:
          "🚨 تنبيه عاجل\n\n🇺🇸 متبقي 5 دقائق على افتتاح السوق الأمريكي.\n\n⚠️ متوقع ارتفاع التذبذب على الدولار، الذهب، المؤشرات الأمريكية والكريبتو.\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi",
      },
      {
        id: `us-market-open-report-${eventDateKey}`,
        hour: 9,
        minute: 30,
        imageTitle: "US stock market open Nasdaq Dow S&P 500 gold silver",
        impactLevel: "HIGH",
        buildMarketOpenReport: true,
        message:
          "📊 تقرير افتتاح السوق الأمريكي\n\n" +
          "🇺🇸 بدأ تداول وول ستريت الآن.\n\n" +
          "راقب حركة ناسداك، داو جونز و S&P 500 مع بداية الجلسة، إضافة إلى الدولار والذهب والفضة والكريبتو.\n\n" +
          "⚠️ أول 30 دقيقة غالباً تكون الأعلى تذبذباً.\n\n" +
          "📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi",
      },
    ];

    const currentAlert = scheduledAlerts.find(
      (alert) => alert.hour === hour && alert.minute === minute
    );

    if (!currentAlert) {
      return;
    }

    const publishedItems = await loadPublishedNewsFromSupabase();
    const alreadySent = publishedItems.some(
      (item) => item.link === `scheduled-alert:${currentAlert.id}`
    );

    if (alreadySent) {
      return;
    }

    const alertMessage = currentAlert.buildMarketOpenReport
      ? await buildUsMarketOpenReportMessage()
      : currentAlert.message;

    if (!alertMessage) {
      console.log(
        "⏭️ Scheduled alert skipped because message builder returned null:",
        currentAlert.id
      );
      return;
    }

    if (currentAlert.imageTitle) {
      const photoPath = await createNewsCard(
        currentAlert.imageTitle,
        selectNewsImage(currentAlert.imageTitle),
        currentAlert.impactLevel || "MEDIUM"
      );

      if (photoPath) {
        await sendTelegramPhoto(alertMessage, photoPath);
      } else {
        await sendTelegramMessage(alertMessage);
      }
    } else {
      await sendTelegramMessage(alertMessage);
    }

    await savePublishedNewsToSupabase({
      link: `scheduled-alert:${currentAlert.id}`,
      title: alertMessage,
      normalized_title: normalizeNewsTitle(alertMessage).slice(0, 500),
      topic_cluster: "scheduled_market_alert",
      published_at: new Date().toISOString(),
    });

    savePublishedNewsLink(`scheduled-alert:${currentAlert.id}`, alertMessage);
  } catch (error) {
    console.error("❌ Scheduled Alert Error:", error.message);
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
  if (
    /technical analysis|market outlook|week ahead|outlook|signs of|what to expect|investor sentiment|analysis after|forecast|technical|support level|moving average|glimmer of hope|better start|healthy reset|تحليل فني|توقعات السوق|توقعات الأسبوع|الأسبوع القادم|مستوى دعم|المتوسط المتحرك|بداية أسبوع|معنويات المستثمرين/i.test(title)
  ) {
    return false;
  }
  if (
    /marvell|micron|paramount|warner bros|softbank|nvidia|samsung|sk hynix|ipo|serena|williams|individual stock|single stock|openai|open ai|oracle|starbucks|airport|airline|sports team|data center|datacenter|أوراكل|اوراكل|ستاربكس|مطار|طيران|شركة رياضية|مركز بيانات/i.test(title)
  ) {
    return false;
  }
  if (TEMP_ALLOW_ALL_NEWS) {
    return true;
  }

  const value = String(title || "").toLowerCase();
  if (FOREX_BREAKING_STYLE) {
    const weakArticlePattern =
      /rebound|rebounds|eases|steady|mixed|unchanged|little changed|set to|could|may|might|what to buy|how to|why|guide|explainer|opinion|survey|household worries|consumer worries|video game|videogame|console|merger|private equity|bidding|shares rise|shares fall|stock jumps|stock sinks|single stock|individual stock|analyst says|research firm|top things|watch this week|better hardware|red flags|healthy reset|nasdaq rebound|s&p rebound|dow seesaws|أسهم شركة|سهم شركة|توصي|توصية|يرى محللون|لماذا|كيف|قد|ربما|استطلاع|قلق الأسر|مخاوف الأسر|يتعافى|ينتعش|متباين|بدون تغيير|أسهم فردية|اندماج|استحواذ|ملكية خاصة|ألعاب الفيديو|الألعاب|اختيارات|أفضل الأسهم/i;

    const directMarketEventPattern =
      /breaking|urgent|fed|fomc|powell|interest rate|rate decision|rate cut|rate hike|cpi|ppi|pce|inflation|nfp|nonfarm|payrolls|jobless claims|initial claims|continuing claims|unemployment|consumer confidence|retail sales|gdp|ism|pmi|nasdaq plunges|nasdaq falls|dow falls|s&p falls|stock futures fall|stock futures plunge|stocks plunge|stocks sink|market crash|selloff|sell-off|liquidations|bitcoin plunges|bitcoin surges|btc plunges|btc surges|gold jumps|gold plunges|oil spikes|oil jumps|crude jumps|brent jumps|war|missile|attack|airstrike|hormuz|red sea|iran|israel|sanctions|tariff|عاجل|الفيدرالي|باول|قرار الفائدة|خفض الفائدة|رفع الفائدة|التضخم|مؤشر أسعار|البطالة|الوظائف|طلبات إعانة البطالة|ثقة المستهلك|مبيعات التجزئة|الناتج المحلي|ناسداك يهبط|داو جونز يهبط|ستاندرد آند بورز يهبط|انهيار|خسائر حادة|هبوط حاد|تصفيات|البيتكوين يهبط|البيتكوين يرتفع|الذهب يرتفع|الذهب يهبط|النفط يرتفع|النفط يقفز|حرب|هجوم|صاروخ|إيران|ايران|إسرائيل|اسرائيل|هرمز|البحر الأحمر|عقوبات|تعريفات/i;

    if (weakArticlePattern.test(value) && !directMarketEventPattern.test(value)) {
      return false;
    }
  }
  if (
    /weight loss drug|drug maker|pharma|pharmaceutical|biotech|healthcare company|medical company|clinical trial|fda approval|fda|obesity drug|safety data|drug safety|weight-loss|weight loss|أدوية خسارة الوزن|ادوية خسارة الوزن|دواء خسارة الوزن|مصنع أدوية|مصنع ادوية|شركة أدوية|شركة ادوية|بيانات سلامة|تجربة سريرية|التجارب السريرية|اعتماد هيئة الغذاء والدواء|الدواء والغذاء|الرعاية الصحية/i.test(value)
  ) {
    return false;
  }

  if (
    /social security|retirement|pension|acquisition opportunities|acquisition target|merger talks|takeover talks|morgan stanley follows|how to calculate|guide|explains|explainer|الضمان الاجتماعي|التقاعد|المعاشات|كيف تحسب|كيفية حساب|شرح|دليل|فرص الاستحواذ|صفقات الاستحواذ|عمليات الاستحواذ/i.test(value)
  ) {
    return false;
  }

  if (
    /openai|open ai|oracle|starbucks|airport|airline|sports|sports team|ipo|share offering|stock offering|data center|datacenter|lease|rental|analyst says|analyst expects|company plans|company considers|company explores|company studies|studies leasing|studies renting|plans to lease|plans to rent|could buy|could sell|may buy|may sell|might buy|might sell|potential deal|possible deal|استئجار مركز بيانات|مركز بيانات|ستاربكس|أوراكل|اوراكل|مطار|طيران|شركة طيران|رياضة|شركة رياضية|طرح أسهم|طرح اسهم|طرح عام|اكتتاب|بيع حصة|شراء حصة|يدرس|تدرس|تخطط|تبحث|قد تبيع|قد تشتري|صفقة محتملة|محلل يقول|يقول محلل/i.test(value)
  ) {
    const allowIfMajorMarketEvent =
      /fed|fomc|powell|cpi|ppi|pce|nfp|nonfarm|jobless claims|initial claims|continuing claims|unemployment|consumer confidence|retail sales|gdp|ism|pmi|rate decision|interest rate|war|attack|missile|airstrike|hormuz|red sea|iran|israel|sanctions|tariff|stocks plunge|stocks sink|market crash|selloff|liquidations|bitcoin plunges|bitcoin surges|gold jumps|gold plunges|oil spikes|oil jumps|الفيدرالي|باول|قرار الفائدة|التضخم|البطالة|طلبات إعانة البطالة|ثقة المستهلك|الناتج المحلي|مبيعات التجزئة|حرب|هجوم|صاروخ|إيران|ايران|إسرائيل|اسرائيل|هرمز|البحر الأحمر|عقوبات|تعريفات|انهيار السوق|هبوط حاد|خسائر حادة|تصفيات|البيتكوين يهبط|البيتكوين يرتفع|الذهب يرتفع|الذهب يهبط|النفط يرتفع|النفط يقفز/i.test(value);

    if (!allowIfMajorMarketEvent) {
      return false;
    }
  }

  const blocked =
    /irs|audit|watchlist|what to watch|forced labor|forced labour|labor abuses|cotton field|cotton import|cotton ban|العمل القسري|القطن|حقل القطن|street calls|wall street picks|wall street bet|top 10|top stocks|best stocks|stock picks|stock pick|dividend stocks|dividend|buy these stocks|shares to buy|portfolio|investment strategy|investing strategy|how to invest|retail investors|analyst|analysts|analysis|opinion|explainer|guide|preview|recap|why|how|without clear reason|according to|price target|upgrade|downgrade|options trading|stock offering|artificial intelligence stocks|ai stocks|tokenization|tokenisation|tokenized assets|morning moves|currencies focus|focus on|weekly outlook|week ahead|market outlook|market focus|morning briefing|at the close|close of trading|stocks closed|moscow index|intervention likely|investor sentiment|institutional sentiment|near 60000|near 61000|near 61k|above 61k|below 61k|helicopter|chopper|rumor|rumour|reportedly|unconfirmed|تحديث عاجل|هليكوبتر|طائرة هليكوبتر|غير مؤكد|تقارير عن|يتراجع إلى 61|61 ألف|sports|world cup|football|soccer|lawsuit|legal action|paramount|warner bros|boeing 737|retailer|individual stock|single stock|could soon|may soon|might|توصية|توصيات|أفضل الأسهم|افضل الأسهم|أسهم للشراء|اسهم للشراء|أسهم توزيعات|اسهم توزيعات|توزيعات أرباح|توزيعات ارباح|استراتيجية استثمار|استراتيجيات استثمار|محفظة استثمارية|المستثمرين الأفراد|المستثمرين الافراد|اختيارات الأسهم|اختيارات الاسهم|وول ستريت يوصي|تحليل وول ستريت|تحليل|رأي|توقع|يتوقع|يرى محللون|بدون سبب واضح|وفقاً|وفقا|تحركات العملات|أسبوع حاسم|اسبوع حاسم|أسبوع الأسواق|اسبوع الأسواق|عند الإغلاق|عند الاغلاق|مؤشر موسكو|معنويات المستثمرين|الذكاء الاصطناعي المدعومة|الرهان على التوكنيشن|serena|williams|real estate|tennis|celebrity|softbank|nvidia|samsung|sk hynix|ipo|valuation|quant strategy|red flags|asian tech|korean tech|nasdaq analysis|stock strategy|technical support level|moving average|سيرينا|عقارات|مشاهير|سوفت بنك|نفيديا|سامسونج|طرح عام أولي|التقييم|تحليل في مؤشر|متوسطه المتحرك|مستويات الدعم/i.test(value);

  const critical =
    /fed|fomc|powell|cpi|ppi|pce|nfp|nonfarm|jobless claims|unemployment|consumer confidence|retail sales|ism|pmi|gdp|interest rate|rate decision|stocks plunge|market crash|selloff|liquidations|bitcoin plunges|oil spikes|gold jumps|war|attack|iran|israel|hormuz|sanctions/i.test(value);

  if (blocked && !critical) {
    return false;
  }

  const officialMarketMoving =
    /breaking|urgent|fed|fomc|powell|cpi|core cpi|ppi|pce|nfp|nonfarm|payrolls|jobless claims|initial claims|continuing claims|unemployment|consumer confidence|retail sales|ism|pmi|gdp|interest rate|rate decision|rate cut|rate hike|treasury yields spike|dollar jumps|dollar plunges|gold jumps|gold plunges|oil spikes|oil jumps|crude jumps|brent jumps|bitcoin plunges|bitcoin surges|btc plunges|btc surges|crypto liquidations|liquidations|stocks plunge|stocks sink|stocks tumble|nasdaq falls|nasdaq plunges|dow falls|s&p falls|stock futures fall|stock futures plunge|market crash|selloff|sell-off|risk-off|war|attack|missile|airstrike|iran|israel|hormuz|red sea|sanctions|tariff|عاجل|الفيدرالي|باول|قرار الفائدة|خفض الفائدة|رفع الفائدة|التضخم|مؤشر أسعار|البطالة|الوظائف|طلبات إعانة البطالة|ثقة المستهلك|مبيعات التجزئة|الناتج المحلي|هبوط الأسواق|خسائر الأسواق|انهيار السوق|هبوط حاد|خسائر حادة|تصفيات|البيتكوين يهبط|البيتكوين يرتفع|النفط يرتفع|النفط يقفز|الذهب يرتفع|الذهب يهبط|إيران|ايران|إسرائيل|اسرائيل|هرمز|البحر الأحمر|عقوبات|تعريفات/i.test(value);

  if (!officialMarketMoving) {
    return false;
  }

  return ["HIGH", "MEDIUM"].includes(getMarketImpactLevel(title));
}


function hasEconomicReleaseNumbers(title) {
  const value = String(title || "");

  if (/\b\d+(?:\.\d+)?\s?(?:k|m|b|%|thousand|million|billion)\b/i.test(value)) {
    return true;
  }

  if (/actual|forecast|previous|estimate|est\.|consensus|vs\.?/i.test(value)) {
    return true;
  }

  if (/السابق|التقدير|الحالي|المتوقع|الفعلي|مقابل/i.test(value)) {
    return true;
  }

  return false;
}

function shouldUseEconomicReleaseTemplate(title) {
  const value = String(title || "").toLowerCase();

  const directCriticalRelease = /jobless claims|initial claims|continuing claims|unemployment claims|cpi|core cpi|ppi|pce|nfp|nonfarm payrolls|unemployment rate|consumer confidence|consumer sentiment|retail sales|ism|pmi|gdp|fomc|rate decision|interest rate decision|powell/i.test(value);

  return directCriticalRelease && hasEconomicReleaseNumbers(title);
}

function isEconomicReleaseTitle(title) {
  const value = String(title || "").toLowerCase();
  return /fomc|federal reserve|fed rate|interest rate decision|rate decision|rate cut|rate hike|powell|press conference|fed chair|jobless claims|initial claims|continuing claims|unemployment claims|cpi|core cpi|ppi|pce|nfp|nonfarm payrolls|unemployment rate|consumer confidence|consumer sentiment|retail sales|pmi|ism|gdp|الفيدرالي|قرار الفائدة|خفض الفائدة|رفع الفائدة|باول|مؤتمر صحفي|طلبات إعانة البطالة|إعانات البطالة|الشكاوى من البطالة|طلبات البطالة|مؤشر ثقة المستهلك|التضخم|البطالة|الوظائف/i.test(value);
}

function guessArabicEconomicEventName(title) {
  const value = String(title || "").toLowerCase();

  if (/fomc|federal reserve|fed rate|interest rate decision|rate decision|rate cut|rate hike|قرار الفائدة|الفيدرالي|خفض الفائدة|رفع الفائدة/i.test(value)) {
    return "قرار الفائدة الأمريكية";
  }

  if (/powell|press conference|fed chair|باول|مؤتمر صحفي/i.test(value)) {
    return "تصريحات جيروم باول / المؤتمر الصحفي للفيدرالي";
  }

  if (/jobless claims|initial claims|continuing claims|unemployment claims|طلبات إعانة البطالة|إعانات البطالة|الشكاوى من البطالة|طلبات البطالة/i.test(value)) {
    return "معدلات الشكاوى من البطالة";
  }

  if (/cpi|core cpi|inflation|التضخم/i.test(value)) {
    return "مؤشر التضخم الأمريكي";
  }

  if (/ppi|producer price/i.test(value)) {
    return "مؤشر أسعار المنتجين الأمريكي";
  }

  if (/nfp|nonfarm payrolls|payrolls|الوظائف/i.test(value)) {
    return "تقرير الوظائف الأمريكية";
  }

  if (/consumer confidence|consumer sentiment|ثقة المستهلك/i.test(value)) {
    return "مؤشر ثقة المستهلك الأمريكي";
  }

  if (/retail sales|مبيعات التجزئة/i.test(value)) {
    return "مبيعات التجزئة الأمريكية";
  }

  if (/pmi|ism/i.test(value)) {
    return "مؤشر مديري المشتريات الأمريكي";
  }

  if (/gdp|الناتج المحلي/i.test(value)) {
    return "الناتج المحلي الإجمالي الأمريكي";
  }

  return "خبر اقتصادي أمريكي مهم";
}

async function analyzeEconomicReleaseWithAI(title, link) {
  const eventName = guessArabicEconomicEventName(title);

  if (!OPENAI_API_KEY) {
    return {
      message:
        `🟥 صدر الآن :\n\n` +
        `📊 أمريكا - 🇺🇸\n` +
        `💵 ${eventName}\n\n` +
        `▫️ التفاصيل : ${title}\n\n` +
        `⬅️ النتيجة : بانتظار قراءة التأثير على الدولار الأمريكي\n\n` +
        `📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅`,
      imageTitle: eventName,
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
              "أنت محرر أخبار اقتصادية عاجلة. حوّل عنوان الخبر إلى منشور عربي منسق مثل قنوات الفوركس الاحترافية. استخدم القالب التالي فقط بدون روابط مصادر وبدون شرح إضافي:\n\n🟥 صدر الآن :\n\n📊 أمريكا - 🇺🇸\n💵 اسم الخبر بالعربي\n\n▪️ السابق : القيمة السابقة إن وجدت\n▪️ التقدير : التوقع أو التقدير إن وجد\n▫️ الحالي : القراءة الحالية إن وجدت\n\n⬅️ النتيجة : اكتب سلبي/إيجابي للدولار الأمريكي أو الذهب أو الأسهم حسب المقارنة بين الحالي والتقدير. إذا لا توجد أرقام كافية اكتب: التأثير غير واضح حتى الآن\n\n📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅\n\nممنوع اختراع أرقام غير موجودة في العنوان. إذا رقم غير موجود اكتب: غير متوفر.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nاسم الخبر المتوقع بالعربي: ${eventName}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 450,
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
      throw new Error("Empty economic release AI response");
    }

    return {
      message: aiText
        .replace(/Telegram\.me\/ForexBreakingNews/gi, "https://t.me/EconomicNewsi")
        .replace(/https?:\/\/t\.me\/ForexBreakingNews/gi, "https://t.me/EconomicNewsi")
        .trim(),
      imageTitle: eventName,
    };
  } catch (error) {
    console.error("⚠️ Economic Release AI Error:", error.response?.data || error.message);
    return {
      message:
        `🟥 صدر الآن :\n\n` +
        `📊 أمريكا - 🇺🇸\n` +
        `💵 ${eventName}\n\n` +
        `▫️ التفاصيل : ${title}\n\n` +
        `⬅️ النتيجة : التأثير غير واضح حتى الآن\n\n` +
        `📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅`,
      imageTitle: eventName,
    };
  }
}

async function analyzeNewsWithAI(title, link) {
  if (isEconomicReleaseTitle(title) && shouldUseEconomicReleaseTemplate(title)) {
    return analyzeEconomicReleaseWithAI(title, link);
  }
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
              "أنت محرر أخبار مالية عاجلة لقناة تيليجرام احترافية مختصة بالفوركس والأسواق العالمية. اكتب الخبر باللغة العربية فقط. ممنوع كتابة أي كلمات إنجليزية نهائياً حتى لو كان عنوان المصدر بالإنجليزية، باستثناء الرموز الاقتصادية الضرورية مثل CPI أو PPI أو NFP أو FOMC. ترجم أسماء الأخبار والأسواق والشركات إلى العربية أو احذفها إذا كانت غير مهمة. لا تخلط العربية والإنجليزية في نفس السطر. اكتب بأسلوب أخبار عاجلة ومختصرة. التنسيق الإجباري: السطر الأول عنوان عربي عاجل مع إيموجي مناسب. بعده سطر فارغ. بعده ملخص الخبر بالعربية بجملة أو جملتين فقط. لا تكتب كلمة التأثير إلا إذا كان الخبر نتيجة اقتصادية رسمية مثل CPI أو PPI أو NFP أو Jobless Claims أو FOMC أو قرار فائدة أو بيانات بطالة أو GDP أو PMI. أما أخبار الذهب أو النفط أو الكريبتو أو الأسهم أو إيران أو إسرائيل أو الحروب أو العقوبات أو التصعيدات الجيوسياسية فلا تكتب فيها كلمة التأثير نهائياً. إذا كان الخبر نتيجة اقتصادية رسمية وكان التأثير واضحاً، اكتب سطر التأثير بصيغة مختصرة. إذا كان التأثير غير واضح أو غير مؤكد، لا تكتب كلمة التأثير ولا تضف سطر التأثير نهائيًا. لا تقدم توصية شراء أو بيع. لا تستخدم عبارات فرصة استثمارية أو فرصة شراء أو فرصة بيع أو بناء مراكز أو هدف سعري. لا تذكر المصدر ولا تضع روابط. لا تكتب أي جملة ختامية.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nمهم جدًا: لا تكتب رابط المصدر ولا تذكر اسم المصدر داخل المنشور. أعد صياغة الخبر بالكامل بصياغة عربية مختلفة عن المصدر ولا تنسخ نفس ترتيب الجمل. لا تكتب كلمة "التأثير" إلا إذا كان الخبر نتيجة اقتصادية رسمية مثل CPI أو PPI أو NFP أو Jobless Claims أو FOMC أو قرار فائدة أو بيانات بطالة أو GDP أو PMI. أما أخبار الذهب أو النفط أو الكريبتو أو الأسهم أو إيران أو إسرائيل أو الحروب أو العقوبات فلا تكتب فيها كلمة التأثير نهائياً. للأخبار العادية اكتب عنواناً عاجلاً وملخصاً قصيراً فقط. ممنوع عبارات فرصة استثمارية أو فرصة شراء أو فرصة بيع أو بناء مراكز أو توصية أو هدف سعري.`,
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
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/[A-Za-z]{4,}/.test(line))
      .filter((line) => !/التأثير\s*:\s*(غير مؤكد|غير واضح|غير معروف|متباين)/i.test(line.trim()))
      .filter((line) => isEconomicReleaseTitle(title) || !/^\s*(?:📊\s*)?(?:التأثير|تأثير الخبر|النتيجة)\s*[:：]/i.test(line.trim()))
      .join("\n")
      .trim();

    if (!cleanedAiText || /[A-Za-z]{4,}/.test(cleanedAiText)) {
      throw new Error("AI response contains English or empty Arabic text");
    }

    const firstLine = cleanedAiText
      .split("\n")
      .find((line) => line.trim().length > 10) || title;

    return {
      message: `${cleanedAiText.replace(/\n/g, "\n\n")}\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`,
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
    await sendScheduledMarketAlerts();
    // sendWeeklyEconomicCalendarPost();
    // sendImportantEconomicEventAlerts();
    // publishEconomicReleaseNow();

    const allItems = [];

    // Telegram source channels (ForexBreakingNews + ForexNewspaper)
    try {
      const telegramSources = TELEGRAM_SOURCE_CHANNELS.map((channel) => channel.url);

      for (const sourceUrl of telegramSources) {
        try {
          const response = await axios.get(sourceUrl, {
            timeout: 15000,
            headers: {
              "User-Agent": "Mozilla/5.0"
            }
          });

          const html = String(response.data || "");
          const matches = [...html.matchAll(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi)];

          for (const match of matches.slice(-10)) {
            const text = cleanTelegramSourceText(
  decodeTelegramHtml(String(match[1] || ""))
);

            if (text.length < 40) continue;

            allItems.push({
              title: text,
              contentSnippet: text,
              summary: text,
              description: text,
              link: `${sourceUrl}#${Buffer.from(text).toString("base64").slice(0, 24)}`,
              isoDate: new Date().toISOString(),
              feedUrl: sourceUrl,
              sourceName: "ForexBreakingNews",
isTelegramSource: true,
imageUrl: null,
enclosure: null,
thumbnail: null,
image: null,
media: null,
mediaContent: null,
mediaThumbnail: null,
            });
          }
        } catch (error) {
          console.error(`⚠️ Telegram source failed: ${sourceUrl}`, error.message);
        }
      }
    } catch (error) {
      console.error("⚠️ Telegram sources error:", error.message);
    }



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
    const supabaseNewsPostItems = await loadNewsPostsFromSupabase();
    const publishedItems = [
      ...supabasePublishedItems,
      ...supabaseNewsPostItems,
      ...localPublishedItems,
    ];

    const publishStats = getRecentPublishStats(publishedItems);

    const normalHourlyLimitReached = publishStats.postsLastHour >= MAX_POSTS_PER_HOUR;
    const hardHourlyLimitReached = publishStats.postsLastHour >= MAX_HIGH_IMPACT_POSTS_PER_HOUR;

    if (hardHourlyLimitReached) {
      console.log(`⚠️ Hard hourly post limit reached: ${publishStats.postsLastHour}/${MAX_HIGH_IMPACT_POSTS_PER_HOUR}. Only ULTRA priority news can pass now.`);
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

      if (TEMP_ALLOW_ALL_NEWS && isFresh && isNew) {
        console.log("🧪 TEMP_ALLOW_ALL_NEWS selected latest item:", item.title);
        latestNews = item;
        break;
      }

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

      if (
        hardHourlyLimitReached &&
        !isUltraPriority &&
        !isEconomicNews
      ) {
        console.log("⏭️ Hard hourly limit reached. Skipped non-ULTRA priority story:", item.title);
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
      "weekly jobless claims",
      "claims",
      "labor market",
      "job market",
      "employment",
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
    if (veryImportantNews || latestNews.impactLevel === "HIGH") {
      const rssImage = latestNews.isTelegramSource ? null : getImageFromNewsItem(latestNews);
const articleImage = latestNews.isTelegramSource || rssImage ? null : await getImageFromArticleUrl(latestNews.link);
      const shouldUseLocalFallbackImage =
        latestNews.impactLevel === "HIGH" ||
        ULTRA_PRIORITY_KEYWORDS.some((keyword) =>
          `${latestNews.title || ""} ${latestNews.contentSnippet || ""}`
            .toLowerCase()
            .includes(keyword.toLowerCase())
        );

      const localFallbackImage =
        USE_LOCAL_IMAGE_FALLBACK && shouldUseLocalFallbackImage
          ? selectNewsImage(latestNews.title)
          : null;
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