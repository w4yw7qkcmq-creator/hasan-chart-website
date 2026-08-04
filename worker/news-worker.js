const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const WebSocket = require("ws");
global.WebSocket = WebSocket;

const { createClient } = require("@supabase/supabase-js");
const { createUserNotification } = require("./create-user-notification");
const { evaluateDeliveryForRecipient } = require("./notification-delivery-gate");
const {
  buildEconomicNewsAnalysis,
  processDuePendingReleases,
  runEconomicReleaseDryRun,
  getProviderRegistry,
  getPendingQueue,
  mergeProviderMetricsIntoCycle,
  isStructuredTripleReleaseTitle,
  canPublishStructuredRelease,
  logEconomicReleaseDroppedIncomplete,
} = require("./lib/economic-releases");
const { buildPremiumImageContextFromRelease } = require("./lib/news-images/important-events");
const { deliverTelegramNewsWithOptionalPhoto } = require("./lib/news-images/telegram-delivery");
const { discoverTelegramNews } = require("./lib/telegram-news");
const {
  filterGeneralRssItems,
  markRssItemsAsGeneralOnly,
} = require("./lib/telegram-news/rss-filter");
const {
  fetchGeneralRssFeeds,
  processGeneralRssItems,
  GENERAL_RSS_FEEDS,
} = require("./lib/general-rss");
const { getTelegramMergeBuffer } = require("./lib/telegram-news/merge-buffer");
const { publishValidatedTelegramNewsCandidate } = require("./lib/telegram-news/atomic-publish");
const { syncPublishingTransition, setOnPublishingEnabledHook } = require("./lib/telegram-news/publish-state");

const parser = new Parser();

let telegramMergeBufferInstance = null;
const telegramMergePublishLog = [];

function getNewsWorkerTelegramMergeBuffer(dryRun) {
  syncPublishingTransition();
  if (!telegramMergeBufferInstance) {
    telegramMergeBufferInstance = getTelegramMergeBuffer({
      dryRun,
      onReady: publishTelegramMergeBufferItem,
    });
  }
  return telegramMergeBufferInstance;
}

setOnPublishingEnabledHook(() => {
  if (telegramMergeBufferInstance) {
    telegramMergeBufferInstance.destroy();
  }
});

async function buildTelegramPublishDedupContext() {
  const publishedItems = [
    ...(await loadPublishedNewsFromSupabase()),
    ...(await loadNewsPostsFromSupabase()),
    ...readPublishedNewsRecords(),
  ];

  return {
    existingLinks: publishedItems.map((item) => item.link).filter(Boolean),
    existingFingerprints: new Set(
      publishedItems
        .flatMap((item) => [item.topicCluster, item.normalizedTitle, item.duplicateKey])
        .filter(Boolean)
    ),
    existingNormalizedTitles: publishedItems.map((item) => item.normalizedTitle || "").filter(Boolean),
  };
}

async function deliverTelegramNews({ message, candidate }) {
  return deliverTelegramNewsWithOptionalPhoto({
    message,
    candidate,
    sendTelegramPhoto,
    sendTelegramMessage,
  });
}

async function publishTelegramMergeBufferItem(item, ctx = {}) {
  syncPublishingTransition();

  if (!item || item.skipPublish || !item.formattedMessage) {
    return { skipped: true, reason: item?.reason || "skip_publish" };
  }

  const dedupContext = NEWS_DRY_RUN ? {} : await buildTelegramPublishDedupContext();

  const result = await publishValidatedTelegramNewsCandidate(
    item,
    { mergeKey: ctx.mergeKey, metrics: ctx.metrics },
    {
      dryRun: NEWS_DRY_RUN,
      memoryOnly: true,
      ...dedupContext,
      deliverTelegramNews,
      sendTelegramMessage,
      sendTelegramPhoto,
      saveNewsPostToSupabase,
      savePublishedNewsToSupabase,
      savePublishedNewsLink,
    }
  );

  if (result.published || result.dryRun) {
    telegramMergePublishLog.push({
      mergeKey: ctx.mergeKey,
      sourceLink: item.post?.sourceUrl,
      telegram: 1,
      db: result.dbInserted === false ? 0 : 1,
      fingerprint: result.fingerprint,
      resolvedTitle: result.resolvedTitle,
    });
  }

  return result;
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
function resolveSupabaseUrl() {
  const candidates = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL];

  for (const candidate of candidates) {
    const trimmed = String(candidate || "").trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

const SUPABASE_URL = resolveSupabaseUrl();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEWS_DRY_RUN = process.env.NEWS_DRY_RUN === "1" || process.env.NEWS_DRY_RUN === "true";
const TELEGRAM_NEWS_PUBLISH_ENABLED =
  process.env.TELEGRAM_NEWS_PUBLISH_ENABLED !== "0" && process.env.TELEGRAM_NEWS_PUBLISH_ENABLED !== "false";
const TRADING_ECONOMICS_CLIENT =
  process.env.TRADING_ECONOMICS_CLIENT ||
  process.env.TRADING_ECONOMICS_API_KEY ||
  "guest:guest";

const INVESTING_CALENDAR_URL = "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData";
const INVESTING_US_COUNTRY_ID = "5";

let supabase = null;

function getSupabaseClient() {
  if (supabase) {
    return supabase;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return supabase;
}

function createEmptyCycleStats() {
  return {
    fetched: 0,
    normalized: 0,
    rejectedInvalid: 0,
    rejectedLowImpact: 0,
    rejectedDuplicate: 0,
    rejectedStale: 0,
    rejectedFilter: 0,
    aiProcessed: 0,
    aiFailed: 0,
    dbInserted: 0,
    dbFailed: 0,
    telegramPublished: 0,
    telegramFailed: 0,
    eligible: 0,
    cycleDurationMs: 0,
    lastErrorSafe: null,
    sourceErrors: {},
    rejectionSamples: {},
    economicEventsDetected: 0,
    economicEventsComplete: 0,
    economicEventsPending: 0,
    economicEventsPublished: 0,
    economicEventsDroppedIncomplete: 0,
    economicEventsConflict: 0,
    providerMetrics: [],
  };
}

let lastCycleStats = createEmptyCycleStats();
let lastCycleCompletedAt = null;
let lastSuccessfulFetchAt = null;
let consecutiveFailures = 0;

function recordRejection(stats, reason, sample) {
  stats.rejectionSamples[reason] = stats.rejectionSamples[reason] || 0;
  stats.rejectionSamples[reason] += 1;

  if (sample && stats.rejectionSamples[`${reason}:sample`] == null) {
    stats.rejectionSamples[`${reason}:sample`] = String(sample).slice(0, 160);
  }
}

function buildTelegramCandidatePreview(item, options = {}) {
  const message = String(item.formattedMessage || "");
  return {
    classification: item.classification?.classification || item.newsType || null,
    sourceChannel: item.post?.sourceChannel || null,
    sourceMessageId: item.post?.sourceMessageId || null,
    titlePreview: String(item.facts?.title || item.post?.rawText || "").slice(0, 120),
    finalMessagePreview: message.slice(0, 280),
    characterCount: message.length,
    promoRemoved: item.promoFooterRemoved === true,
    qualityScore: item.newsValue?.score ?? null,
    aiResult: item.aiResult || "none",
    finalFactCheck: item.finalFactCheck?.ok === false ? item.finalFactCheck.reason || "failed" : "ok",
    publishBlockedByKillSwitch: options.publishBlockedByKillSwitch === true,
  };
}

function summarizeTelegramPipelineStats(processed, parseStats = {}) {
  const classificationCounts = {};
  for (const item of processed) {
    const key = item.classification?.classification || item.reason || "unknown";
    classificationCounts[key] = (classificationCounts[key] || 0) + 1;
  }

  return {
    publishable: processed.filter((item) => !item.skipPublish && item.formattedMessage).length,
    promotionSkipped: processed.filter((item) => item.reason === "TELEGRAM_PROMOTION_SKIPPED").length,
    subscriptionOfferSkipped: processed.filter((item) => item.reason === "TELEGRAM_POST_CLASSIFICATION_SUBSCRIPTION_OFFER").length,
    brokerAdSkipped: processed.filter((item) => item.reason === "TELEGRAM_POST_CLASSIFICATION_BROKER_AD").length,
    channelAnnouncementSkipped: processed.filter(
      (item) => item.reason === "TELEGRAM_POST_CLASSIFICATION_CHANNEL_ANNOUNCEMENT"
    ).length,
    unclearSkipped: parseStats.unclearSkipped || 0,
    lowValueSkipped: parseStats.lowValueSkipped || 0,
    promoFootersRemoved: parseStats.promoFootersRemoved || 0,
    preEventMissingName: parseStats.preEventMissingName || 0,
    economicAccepted: processed.filter((item) => item.newsType === "economic" && !item.skipPublish).length,
    economicIncompletePending: processed.filter((item) => item.newsType === "economic" && item.skipPublish).length,
    aiAccepted: processed.filter((item) => item.aiResult === "accepted").length,
    aiTooSimilar: processed.filter((item) =>
      item.editorialCheck?.issues?.includes("AI_EDITORIAL_DRAFT_TOO_SIMILAR")
    ).length,
    aiFactMismatch: processed.filter((item) => item.aiResult === "rejected_fact_mismatch").length,
    fallbackUsed: processed.filter(
      (item) => item.aiResult === "fallback" || item.usedFixedTemplate === true || item.aiResult === "rule_based"
    ).length,
    finalFactCheckFailures: processed.filter((item) => item.finalFactCheck?.ok === false).length,
    classificationCounts,
  };
}

function logTelegramPublishCandidatesPreview(processed, options = {}) {
  const candidates = processed
    .filter((item) => !item.skipPublish && item.formattedMessage)
    .sort((a, b) => (b.newsValue?.score || 0) - (a.newsValue?.score || 0))
    .slice(0, 10)
    .map((item) => buildTelegramCandidatePreview(item, options));

  if (!candidates.length) {
    return;
  }

  console.log(
    "TELEGRAM_NEWS_CANDIDATES_PREVIEW",
    JSON.stringify({
      count: candidates.length,
      publishBlockedByKillSwitch: options.publishBlockedByKillSwitch === true,
      candidates,
    })
  );
}

function getRequiredEnvStatus() {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHANNEL_ID",
    "OPENAI_API_KEY",
    "TRADING_ECONOMICS_API_KEY",
    "TRADING_ECONOMICS_CLIENT",
  ];

  return keys.map((name) => {
    const value = process.env[name];
    return {
      name,
      present: value != null && String(value).trim() !== "",
    };
  });
}

function logWorkerEnvStatus() {
  const status = getRequiredEnvStatus();
  console.log(
    "NEWS_WORKER_ENV",
    JSON.stringify({
      dryRun: NEWS_DRY_RUN,
      variables: status.map(({ name, present }) => ({
        name,
        present,
        empty: !present,
      })),
    })
  );
}

const LAST_NEWS_FILE = path.join(__dirname, "last-news.json");
const NEWS_CARD_FILE = path.join(__dirname, "news-card.png");
const CHANNEL_LOGO_FILE = path.join(__dirname, "assets", "logo.png");

// Temporary test mode: true = publish any latest news to test the image design.
// After testing, change this to false to activate the important-news filter again.
const TEMP_ALLOW_ALL_NEWS = false;

const MAX_NEWS_AGE_HOURS = 24;
const MAX_POSTS_PER_HOUR = 5;
const MAX_HIGH_IMPACT_POSTS_PER_HOUR = 5;
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

const IMPORTANT_EVENT_ALERT_MINUTES = [1440, 120, 60, 15, 5];
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
  // Official economic releases must come only from Telegram channels.
  // Disable Investing-based CPI/PPI/NFP/FOMC publishing.
  return;
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

function isOfficialEconomicReleaseText(title) {
  const value = String(title || "").toLowerCase();
  if (
    /spacex|space x|ipo|earnings|quarterly results|eps|revenue|guidance|google liability|artificial intelligence liability|crypto perpetuals|futures or swaps|coindesk tv|investors remain invested|court ruling|legal ruling|sk hynix|perpetual contracts|perpetual futures|ai-generated claims|false ai claims|lawsuit|court decision|court ruling|regulation debate|debate over|صناديق البيتكوين|العقود الدائمة|العقود المستمرة|العقود الآجلة الدائمة|مسؤولية الذكاء الاصطناعي|الادعاءات الكاذبة|حكم قضائي|قرار قضائي|محكمة|قانونياً|قانونيا|جدل قانوني|نقاشات تدور|طرح عام|اكتتاب|أرباح|إيرادات|شركة جوجل|جوجل/i.test(value)
  ) {
    return false;
  }

  const isOfficialKeyword =
    /fomc|fed rate|federal reserve|interest rate decision|rate decision|rate cut|rate hike|cpi|core cpi|consumer price index|ppi|producer price index|pce|core pce|nfp|nonfarm|payrolls|jobless claims|initial claims|continuing claims|unemployment rate|consumer confidence|consumer sentiment|retail sales|gdp|ism|pmi|actual|forecast|previous|الفيدرالي|قرار الفائدة|خفض الفائدة|رفع الفائدة|تثبيت الفائدة|التضخم|مؤشر أسعار المستهلك|مؤشر أسعار المنتجين|الوظائف|البطالة|طلبات إعانة البطالة|ثقة المستهلك|مبيعات التجزئة|الناتج المحلي|الحالي|المتوقع|التقدير|السابق|صدر الآن|صدر الان/i.test(value);

  const hasReleaseValues = /actual|forecast|previous|الحالي|المتوقع|التقدير|السابق/i.test(value);

  const isUsRelease =
    /united states|usa|america|u\.s\.|us |usd|dollar|أمريكا|امريكا|الولايات المتحدة|الأمريكي|الامريكي|الدولار/i.test(value);

  const isMajorCentralBank =
    /fomc|federal reserve|fed rate|ecb|european central bank|boe|bank of england|boj|bank of japan|powell|lagarde|الفيدرالي|البنك المركزي الأوروبي|المركزي الأوروبي|المركزي البريطاني|بنك إنجلترا|بنك انجلترا|المركزي الياباني|باول|لاغارد|قرار الفائدة/i.test(value);

  const blockedCountryRelease =
    /germany|deutschland|spain|italy|france|britain|uk\b|united kingdom|canada|australia|new zealand|switzerland|japan|china|ألـمانيا|المانيا|ألمانيا|إسبانيا|اسبانيا|إيطاليا|ايطاليا|فرنسا|بريطانيا|المملكة المتحدة|كندا|أستراليا|استراليا|نيوزيلندا|سويسرا|اليابان|الصين/i.test(value);

  if (!isOfficialKeyword) {
    return false;
  }

  if (blockedCountryRelease && !isMajorCentralBank) {
    return false;
  }

  return (isUsRelease || isMajorCentralBank) && (hasReleaseValues || isMajorCentralBank);
}
function isBlockedGeneralNews(title) {
  const value = String(title || "").toLowerCase();

  return /social security|retirement|pension|benefits|student loan|tax plan|mayor|murder|crime|lawsuit|legal|healthcare|drugmaker|pharma|obesity drug|ai jobs|white-collar jobs|الضمان الاجتماعي|التقاعد|المعاشات|قرض طلاب|خطة ضريبية|رئيس بلدية|مقتل|جريمة|محكمة|دعوى|الرعاية الصحية|الأدوية|الوظائف الإدارية/i.test(value);
}

function isStrongExternalMarketNews(title) {
  const value = String(title || "").toLowerCase();

  if (isBlockedGeneralNews(value)) return false;

  return /fed|fomc|powell|interest rate|cpi|ppi|nfp|jobless claims|gold|oil|bitcoin|crypto|nasdaq|dow jones|s&p 500|wall street|market crash|selloff|liquidations|iran|israel|hormuz|war|missile|attack|sanctions|tariffs|opec|الفيدرالي|باول|قرار الفائدة|التضخم|الذهب|النفط|البيتكوين|ناسداك|داو جونز|إيران|اسرائيل|هرمز|حرب|هجوم|عقوبات/i.test(value);
}
function shouldShowImpactForNews(title) {
  const value = String(title || "").toLowerCase();

  return /fomc|fed rate|federal reserve|interest rate decision|rate decision|rate cut|rate hike|cpi|ppi|pce|nfp|jobless claims|unemployment rate|consumer confidence|gdp|pmi|ism|الفيدرالي|قرار الفائدة|التضخم|البطالة|الوظائف|طلبات إعانة البطالة|ثقة المستهلك|الناتج المحلي/i.test(value);
}

function removeImpactLineIfNotAllowed(message, title) {
  if (shouldShowImpactForNews(title)) {
    return message;
  }

  return String(message || "")
    .replace(/^.*(?:⬅️\s*النتيجة|التأثير|تأثير الخبر).*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// RSS feeds — general market news only. Never used for previous/forecast/actual.
const NEWS_FEEDS = process.env.DISABLE_GENERAL_RSS === "1" ? [] : GENERAL_RSS_FEEDS;

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
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
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
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
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
        const compactText = text.replace(/\s+/g, " ").trim();

        if (!compactText || compactText.length < 15) continue;

        // Telegram is used only for official economic releases.
        // Everything else (gold, oil, crypto, wars, stocks, geopolitics)
        // should come from RSS/external sources.
        if (!isOfficialEconomicReleaseText(compactText)) {
          console.log("⏭️ Skipped non-economic Telegram news:", compactText.slice(0, 120));
          continue;
        }

        posts.push({
          title: compactText,
          link: `telegram-${channel.name}-${normalizeNewsTitle(compactText).slice(0, 80)}`,
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
  const usageFile = path.join(__dirname, "last-used-images.json");
  const todayKey = new Date().toISOString().slice(0, 10);

  const availableFiles = fileNames
    .map((fileName) => path.join(assetsDir, fileName))
    .filter((filePath) => fs.existsSync(filePath));

  if (!availableFiles.length) {
    const anyImageFile = fs.existsSync(assetsDir)
      ? fs
          .readdirSync(assetsDir)
          .find((fileName) => /\.(png|jpg|jpeg)$/i.test(fileName))
      : null;

    return anyImageFile ? path.join(assetsDir, anyImageFile) : path.join(assetsDir, "default.png");
  }

  let usage = { date: todayKey, files: [] };

  try {
    if (fs.existsSync(usageFile)) {
      usage = JSON.parse(fs.readFileSync(usageFile, "utf8"));
    }
  } catch (_) {
    usage = { date: todayKey, files: [] };
  }

  if (usage.date !== todayKey) {
    usage = { date: todayKey, files: [] };
  }

  const unusedFiles = availableFiles.filter(
    (filePath) => !usage.files.includes(path.basename(filePath))
  );

  const candidateFiles = unusedFiles.length ? unusedFiles : availableFiles;
  const selected = candidateFiles[Math.floor(Math.random() * candidateFiles.length)];
  const selectedName = path.basename(selected);

  try {
    usage.files = [
      selectedName,
      ...usage.files.filter((fileName) => fileName !== selectedName),
    ].slice(0, 40);

    fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2));
  } catch (_) {
    // Ignore local image usage cache write errors.
  }

  return selected;
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
    "stocks-1.png",
    "stocks-2.png",
    "stocks-3.png",
    "default-1.png",
    "default-2.png",
    "default-3.png",
    "default.png",
  ]);
}

function shouldUseLocalImageForMajorTopic(title) {
  const value = String(title || "").toLowerCase();
  if (isOfficialEconomicReleaseText(value)) {
    return false;
  }

  return /bitcoin|btc|crypto|ethereum|gold|xau|oil|crude|brent|wti|fed|fomc|powell|federal reserve|interest rate|cpi|ppi|nfp|jobless claims|unemployment|nasdaq|dow|s&p|stock market open|market open|war|missile|attack|iran|israel|hormuz|red sea|البيتكوين|الكريبتو|الذهب|النفط|الفيدرالي|باول|قرار الفائدة|التضخم|البطالة|الوظائف|طلبات إعانة البطالة|ناسداك|داو جونز|افتتاح السوق|حرب|هجوم|صاروخ|إيران|ايران|إسرائيل|اسرائيل|هرمز|البحر الأحمر/i.test(value);
}

function normalizeExternalImageUrl(value, baseUrl = "https://www.investing.com") {
  if (!value) return null;

  const rawValue = String(value).trim();
  if (!rawValue) return null;

  const firstSrcsetItem = rawValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
    ?.split(" ")?.[0];

  const candidate = firstSrcsetItem || rawValue;

  try {
    const normalizedUrl = candidate.startsWith("//")
      ? `https:${candidate}`
      : new URL(candidate, baseUrl).href;

    if (!/^https?:\/\//i.test(normalizedUrl)) return null;
    if (/t\.me|telegram\.me|telegram\.org/i.test(normalizedUrl)) return null;
    if (/logo|icon|avatar|author|profile|sprite|favicon|placeholder|default|blank|pixel|1x1/i.test(normalizedUrl)) return null;
    if (/\.svg(\?|$)/i.test(normalizedUrl)) return null;

    return normalizedUrl;
  } catch (_) {
    return null;
  }
}

function extractImageUrlsFromHtml(html, baseUrl) {
  const content = String(html || "");
  const images = [];

  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/gi,
    /<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-srcset|srcset)=["']([^"']+)["'][^>]*>/gi,
    /"(?:url|image|thumbnailUrl|thumbnail|imageUrl)"\s*:\s*"([^"\\]+(?:jpg|jpeg|png|webp)[^"\\]*)"/gi,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const imageUrl = normalizeExternalImageUrl(match?.[1], baseUrl);
      if (imageUrl) images.push(imageUrl);
    }
  }

  return images;
}

function scoreImageUrl(url) {
  let total = 0;
  const value = String(url || "").toLowerCase();

  if (/1200|1280|1440|1600|1920|2048|2560/.test(value)) total += 8;
  if (/og|social|article|lead|hero|main|large|photo|image|cdn|prod|original|primary/.test(value)) total += 5;
  if (/i-invdn\.com|cnbc\.com|marketwatch\.com|coindesk\.com|images\.investinglive\.com|images\.financemagnates\.com/.test(value)) total += 4;
  if (/thumb|thumbnail|small|80x|120x|150x|300x|sprite|avatar|logo|icon|favicon|placeholder|default/.test(value)) total -= 8;
  if (/\.webp(\?|$)|\.jpg(\?|$)|\.jpeg(\?|$)|\.png(\?|$)/.test(value)) total += 3;

  return total;
}

function getImageFromNewsItem(item) {
  if (!item) return null;

  if (item.isTelegramSource) {
    return null;
  }

  const candidates = [];

  const pushCandidate = (value, baseUrl = item.link || item.guid || "https://www.investing.com") => {
    const imageUrl = normalizeExternalImageUrl(value, baseUrl);
    if (imageUrl) {
      candidates.push(imageUrl);
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

  extractImageUrlsFromHtml(item.content, item.link).forEach((imageUrl) => pushCandidate(imageUrl, item.link));
  extractImageUrlsFromHtml(item.contentSnippet, item.link).forEach((imageUrl) => pushCandidate(imageUrl, item.link));
  extractImageUrlsFromHtml(item.description, item.link).forEach((imageUrl) => pushCandidate(imageUrl, item.link));

  const validCandidates = [...new Set(candidates)]
    .filter((imageUrl) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(imageUrl) || /image|photo|media|cdn|static|prod/i.test(imageUrl))
    .sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));

  return validCandidates[0] || null;
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
    extractImageUrlsFromHtml(html, articleUrl).forEach((imageUrl) => candidates.add(imageUrl));

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
              const imageUrl = normalizeExternalImageUrl(image, articleUrl);
              if (imageUrl) candidates.add(imageUrl);
            }

            if (Array.isArray(image)) {
              image.forEach((item) => {
                if (typeof item === "string") {
                  const imageUrl = normalizeExternalImageUrl(item, articleUrl);
                  if (imageUrl) candidates.add(imageUrl);
                } else if (item?.url) {
                  const imageUrl = normalizeExternalImageUrl(item.url, articleUrl);
                  if (imageUrl) candidates.add(imageUrl);
                }
              });
            }

            if (image?.url) {
              const imageUrl = normalizeExternalImageUrl(image.url, articleUrl);
              if (imageUrl) candidates.add(imageUrl);
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
    const imageCandidates = [...new Set(candidates)]
      .map((imageUrl) => normalizeExternalImageUrl(imageUrl, articleUrl))
      .filter(Boolean)
      .filter((imageUrl) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(imageUrl) || /image|photo|media|cdn|static|prod/i.test(imageUrl))
      .sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));

    const selectedImage = imageCandidates[0] || null;

    if (selectedImage) {
      console.log("✅ Article image extracted:", selectedImage);
    } else {
      console.log("⚠️ No article image candidates found for:", articleUrl);
    }

    return selectedImage;
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

function createNewsSlug(title, fallback = "market-news") {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "as",
    "by",
    "from",
    "after",
    "before",
    "over",
    "under",
    "into",
    "at",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "says",
    "said",
    "breaking",
    "news",
    "update",
    "latest",
    "live",
  ]);

  const latinWords = String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&amp;/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !stopWords.has(word));

  const slug = latinWords
    .slice(0, 8)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || fallback;
}

function shortStableHash(value) {
  return crypto
    .createHash("sha1")
    .update(String(value || Date.now()))
    .digest("hex")
    .slice(0, 6);
}

async function buildUniqueNewsSlug(title, sourceLink) {
  const baseSlug = createNewsSlug(title);
  const hash = shortStableHash(sourceLink || title);
  const preferredSlug = baseSlug;
  const fallbackSlug = `${baseSlug}-${hash}`;

  try {
    const client = getSupabaseClient();
    if (!client) {
      return fallbackSlug;
    }

    const { data, error } = await client
      .from("news_posts")
      .select("id,source_link,slug")
      .in("slug", [preferredSlug, fallbackSlug])
      .limit(2);

    if (error) {
      console.error("⚠️ Slug check error:", error.message);
      return fallbackSlug;
    }

    const samePreferred = (data || []).find((item) => item.slug === preferredSlug);

    if (!samePreferred || samePreferred.source_link === sourceLink) {
      return preferredSlug;
    }

    return fallbackSlug;
  } catch (error) {
    console.error("⚠️ Slug build exception:", error.message);
    return fallbackSlug;
  }
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

async function createNewsCard(title, imageUrl, impactLevel = "HIGH", premiumImageContext = null) {
  void title;
  void impactLevel;

  let resolvedImageUrl = imageUrl;

  if (!resolvedImageUrl && premiumImageContext) {
    try {
      const { resolvePremiumNewsImagePath } = require("./lib/news-images");
      resolvedImageUrl = await resolvePremiumNewsImagePath(premiumImageContext);
    } catch (error) {
      console.error("⚠️ Premium news image generation failed:", error.message);
    }
  }

  if (!resolvedImageUrl) {
    return null;
  }

  try {
    let buffer = null;

    if (/^https?:\/\//i.test(resolvedImageUrl)) {
      const response = await axios.get(resolvedImageUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      buffer = Buffer.from(response.data);
    } else if (fs.existsSync(resolvedImageUrl)) {
      buffer = fs.readFileSync(resolvedImageUrl);
    }

    if (!buffer || buffer.length === 0) {
      return null;
    }

    fs.writeFileSync(NEWS_CARD_FILE, buffer);
    return NEWS_CARD_FILE;
  } catch (error) {
    console.error("⚠️ Image save failed:", error.message);
    return null;
  }
}

async function loadPublishedNewsFromSupabase() {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return [];
    }

    const { data, error } = await client
      .from("published_news")
      .select("link,title,normalized_title,topic_cluster,published_at,created_at")
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
    const client = getSupabaseClient();
    if (!client) {
      return [];
    }

    const { data, error } = await client
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
  if (NEWS_DRY_RUN) {
    return { skipped: true, reason: "dry_run" };
  }

  try {
    const client = getSupabaseClient();
    if (!client) {
      console.error("❌ Supabase Save Error: client unavailable");
      return { error: "client_unavailable" };
    }

    const { error } = await client
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
      return { error: error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("❌ Supabase Save Exception:", error.message);
    return { error: error.message };
  }
}

async function dispatchMarketNewsNotifications({ title, sourceLink, impactLevel }) {
  if (impactLevel !== "HIGH" || NEWS_DRY_RUN) {
    return;
  }

  try {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    const { data: subscriptions, error } = await client
      .from("push_subscriptions")
      .select("email")
      .not("email", "is", null);

    if (error) {
      console.error("MARKET_NEWS_NOTIFICATION_LOAD_ERROR:", error.message);
      return;
    }

    const emails = [
      ...new Set(
        (subscriptions || [])
          .map((row) => String(row.email || "").trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    if (!emails.length) {
      console.log("MARKET_NEWS_NOTIFICATION_SKIPPED", JSON.stringify({ reason: "no-subscribers" }));
      return;
    }

    const titleText = String(title || "").trim();
    const isBreaking = /breaking|عاجل|urgent|emergency|fomc|rate decision/i.test(titleText);
    const notificationKey = isBreaking ? "breaking_news" : "market_news";
    const type = isBreaking ? "breaking-news" : "market_news";
    const notificationTitle = isBreaking
      ? `🚨 خبر عاجل: ${titleText.slice(0, 120)}`
      : `📰 ${titleText.slice(0, 120)}`;
    const notificationMessage = "خبر جديد في أخبار السوق. اضغط للاطلاع على التفاصيل.";

    let dispatched = 0;

    for (const email of emails) {
      const delivery = await evaluateDeliveryForRecipient(client, {
        userEmail: email,
        notificationKey,
      });

      if (!delivery.inApp) {
        continue;
      }

      const { error: insertError } = await createUserNotification(client, {
        userEmail: email,
        title: notificationTitle,
        message: notificationMessage,
        type,
        notificationKey,
        url: "/news",
        metadata: {
          sourceLink: sourceLink || null,
          impactLevel,
          notification_key: notificationKey,
        },
        skipDeliveryGate: true,
      });

      if (!insertError) {
        dispatched += 1;
      }
    }

    console.log(
      "MARKET_NEWS_NOTIFICATIONS_DISPATCHED",
      JSON.stringify({
        dispatched,
        recipients: emails.length,
        notificationKey,
      })
    );
  } catch (error) {
    console.error("MARKET_NEWS_NOTIFICATION_ERROR:", error.message);
  }
}

async function saveNewsPostToSupabase(post) {
  if (NEWS_DRY_RUN) {
    console.log("NEWS_DRY_RUN skip saveNewsPostToSupabase:", post.title || post.source_link);
    return { skipped: true, reason: "dry_run" };
  }

  try {
    const client = getSupabaseClient();
    if (!client) {
      console.error("❌ News Post Save Error: client unavailable");
      return { error: "client_unavailable" };
    }

    if (!post.image_url && post.source_link) {
      post.image_url = await getImageFromArticleUrl(post.source_link);
    }

    if (post.image_url) {
      console.log("🖼️ Saving news image:", post.image_url);
    } else {
      console.log("⚠️ Saving news without image:", post.source_link || post.title);
    }

    const slug = post.slug || (await buildUniqueNewsSlug(post.title || post.content, post.source_link));
    console.log("🔗 News slug:", slug);

    const { error } = await client
      .from("news_posts")
      .upsert(
        [
          {
            title: post.title,
            content: post.content,
            image_url: post.image_url || null,
            impact_level: post.impact_level || "MEDIUM",
            source_link: post.source_link,
            slug,
            created_at: new Date().toISOString(),
          },
        ],
        { onConflict: "source_link" }
      );

    if (error) {
      console.error("❌ News Post Save Error:", error.message);
      return { error: error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("❌ News Post Save Exception:", error.message);
    return { error: error.message };
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
  if (NEWS_DRY_RUN) {
    console.log("NEWS_DRY_RUN skip sendTelegramMessage:", String(message || "").slice(0, 120));
    return { skipped: true, reason: "dry_run" };
  }

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
      `⏰ التوقيت حسب مكة المكرمة.\n` +
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

  const timeLabel = minutesBefore === 1440 ? "غداً" : `${minutesBefore} دقيقة`;

  return (
    `🟨 تنبيه اقتصادي هام\n\n` +
    `🇺🇸 أمريكا\n` +
    `💵 ${event.title}\n\n` +
    `⏰ الموعد: ${timeLabel}\n` +
    `🕋 بتوقيت مكة المكرمة\n\n` +
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
        const major24hEvents =
          /fomc|interest rate|rate decision|cpi|ppi|nfp|unemployment|jobless claims|powell|ecb|boe|fed|الفيدرالي|قرار الفائدة|التضخم|البطالة|الوظائف|طلبات إعانة البطالة|باول/i.test(event.title);

        if (minutesBefore === 1440 && !major24hEvents) {
          continue;
        }
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

async function buildUsMarketOpenFollowupMessage() {
  const [nasdaq, sp500, dow] = await Promise.all([
    fetchYahooQuote("^IXIC"),
    fetchYahooQuote("^GSPC"),
    fetchYahooQuote("^DJI"),
  ]);

  if (!nasdaq || !sp500 || !dow) {
    console.log("⏭️ Skipped US market open follow-up: missing market quotes");
    return null;
  }

  const lines = [
    formatMarketChangeLine("ناسداك", nasdaq),
    formatMarketChangeLine("ستاندرد آند بورز 500", sp500),
    formatMarketChangeLine("داو جونز", dow),
  ].join("\n");

  let summary = "افتتاح متوازن نسبياً مع ترقب اتجاه الجلسة خلال الدقائق القادمة.";

  if (nasdaq.changePercent > 0.5 && sp500.changePercent > 0.3) {
    summary = "أسهم التكنولوجيا تقود المكاسب بعد الافتتاح، مع تحسن شهية المخاطرة في وول ستريت.";
  } else if (nasdaq.changePercent < -0.5 && sp500.changePercent < -0.3) {
    summary = "ضغوط بيعية واضحة على الأسهم الأمريكية بعد الافتتاح، خصوصاً في قطاع التكنولوجيا.";
  } else if (dow.changePercent > 0.3 && nasdaq.changePercent < 0) {
    summary = "افتتاح متباين؛ داو جونز يحاول التماسك بينما يتعرض ناسداك لضغط نسبي.";
  } else if (nasdaq.changePercent > 0 && dow.changePercent < 0) {
    summary = "افتتاح متباين؛ ناسداك يتماسك بدعم أسهم التكنولوجيا بينما يتراجع داو جونز.";
  }

  return (
    "📊 تحديث السوق الأمريكي بعد الافتتاح\n\n" +
    "🇺🇸 مرور 15 دقيقة تقريباً على افتتاح وول ستريت.\n\n" +
    `${lines}\n\n` +
    `📈 ${summary}\n\n` +
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
      {
        id: `us-market-open-followup-${eventDateKey}`,
        hour: 9,
        minute: 45,
        imageTitle: "US market update Nasdaq Dow S&P 500 Wall Street",
        impactLevel: "HIGH",
        buildMarketOpenFollowup: true,
        message:
          "📊 تحديث السوق الأمريكي بعد الافتتاح\n\n" +
          "متابعة لأداء ناسداك وداو جونز و S&P 500 بعد أول 15 دقيقة من التداول.\n\n" +
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
      : currentAlert.buildMarketOpenFollowup
        ? await buildUsMarketOpenFollowupMessage()
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

async function sendTelegramPhoto(message, photoPath, options = {}) {
  if (NEWS_DRY_RUN) {
    console.log("NEWS_DRY_RUN skip sendTelegramPhoto:", photoPath);
    return { skipped: true, reason: "dry_run" };
  }

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
    if (!options.skipTextFallback) {
      await sendTelegramMessage(message);
    } else {
      throw error;
    }
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

  const blockedPoliticalNoise =
  /peace deal|peace talks|agreement expected|expected agreement|activist|deported|deportation|lawsuit|court|legal|negotiations|talks|scientists|researchers|quantum|portfolio review|hidden mistake|civil society|اتفاق سلام|مفاوضات سلام|محادثات|توقع اتفاق|ناشط|ترحيل|محكمة|قضية|دعوى|قانوني|باحثون|علماء|نقاش|استعراض محفظة|خطأ خفي|منظمات المجتمع المدني/i;

if (blockedPoliticalNoise.test(value)) {
  return false;
}

  if (isOfficialEconomicReleaseText(value)) {
    return false;
  }

  const blockedNoisePattern =
    /earnings|quarterly results|eps|revenue|guidance|stock earnings|ipo|spacex debut|wall st futures gain|wall st futures rise|wall street futures gain|peace hopes|blockbuster|company results|shares of|تريب\.كوم|أرباح شركة|الأرباح الفصلية|تراجع الأرباح|رغم تجاوز الإيرادات|افتتاح وول ستريت.*سبيس إكس|عقود وول ستريت الآجلة.*سبيس إكس|توقعات حاسمة قبل افتتاح وول ستريت/i;

  if (blockedNoisePattern.test(value)) {
    return false;
  }
  // External RSS/news sources must be strictly market-moving.
  // Do not publish light or medium stories just because they mention markets.
  const majorMarketImpactPattern =
    /breaking|urgent|fed|fomc|powell|interest rate decision|rate decision|rate cut|rate hike|cpi|ppi|pce|nfp|nonfarm|payrolls|jobless claims|initial claims|continuing claims|unemployment|consumer confidence|retail sales|gdp|ism|pmi|central bank decision|ecb decision|boe decision|boj decision|stocks plunge|stocks sink|stocks tumble|stock futures plunge|market crash|selloff|sell-off|nasdaq plunges|nasdaq falls sharply|dow plunges|s&p falls sharply|treasury yields spike|dollar surges|dollar plunges|gold jumps|gold surges|gold hits record|gold falls sharply|gold plunges|oil spikes|oil surges|oil jumps|oil plunges|crude jumps|brent jumps|bitcoin plunges|bitcoin surges|btc plunges|btc surges|crypto liquidations|liquidations top|billion liquidations|war|missile attack|airstrike|drone attack|military strike|attack on ships|tanker attack|red sea|hormuz|iran attacks|israel attacks|us strikes|sanctions announced|tariffs announced|عاجل|الفيدرالي|باول|قرار الفائدة|خفض الفائدة|رفع الفائدة|التضخم|مؤشر أسعار|البطالة|الوظائف|طلبات إعانة البطالة|ثقة المستهلك|مبيعات التجزئة|الناتج المحلي|قرار بنك مركزي|انهيار السوق|خسائر حادة|هبوط حاد|ناسداك يهبط بقوة|داو جونز يهبط بقوة|تصفيات|تصفيات كبرى|البيتكوين يهبط بقوة|البيتكوين يرتفع بقوة|الذهب يرتفع بقوة|الذهب يقفز|الذهب يسجل مستوى قياسي|الذهب يهبط بقوة|النفط يقفز|النفط يرتفع بقوة|النفط يهبط بقوة|حرب|هجوم صاروخي|ضربة جوية|هجوم بطائرات مسيرة|ضربة عسكرية|استهداف سفن|ناقلة نفط|البحر الأحمر|هرمز|إيران تهاجم|ايران تهاجم|إسرائيل تهاجم|اسرائيل تهاجم|ضربات أمريكية|ضربات امريكية|عقوبات|تعريفات/i;

  const lightOrMediumStoryPattern =
    /edges higher|edges lower|little changed|steady|mixed|rebounds|rebound|eases|slips|ticks up|ticks down|modestly|slightly|near|around|holds above|holds below|set to|could|may|might|expected to|analyst says|forecast|outlook|technical|support|resistance|what to watch|preview|recap|opinion|guide|explainer|توقعات|تحليل|فني|دعم|مقاومة|يرى محللون|قد|ربما|قرب|حول|يتماسك|يتراجع قليلاً|يرتفع قليلاً|متباين|مستقر|توقع|نظرة|قراءة فنية/i;

  if (!majorMarketImpactPattern.test(value)) {
    return false;
  }

  if (lightOrMediumStoryPattern.test(value) && !majorMarketImpactPattern.test(value)) {
    return false;
  }
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


function isEconomicReleaseTitle(title) {
  const value = String(title || "").toLowerCase();
  return /fomc|federal reserve|fed rate|interest rate decision|rate decision|rate cut|rate hike|powell|press conference|fed chair|jobless claims|initial claims|continuing claims|unemployment claims|cpi|core cpi|ppi|pce|nfp|nonfarm payrolls|unemployment rate|consumer confidence|consumer sentiment|retail sales|pmi|ism|gdp|الفيدرالي|قرار الفائدة|خفض الفائدة|رفع الفائدة|باول|مؤتمر صحفي|طلبات إعانة البطالة|إعانات البطالة|الشكاوى من البطالة|طلبات البطالة|مؤشر ثقة المستهلك|التضخم|البطالة|الوظائف/i.test(value);
}

async function analyzeNewsWithAI(title, link, options = {}) {
  const dryRun = options.dryRun === true || NEWS_DRY_RUN;
  const telegramItem = options.telegramItem || null;

  if (telegramItem?.isTelegramSource) {
    if (telegramItem.skipPublish || !telegramItem.formattedMessage) {
      return {
        message: null,
        imageTitle: telegramItem.title,
        skipPublish: true,
        reason: telegramItem.validation?.reason || "telegram_template_incomplete",
        missingFields: telegramItem.missingFields || [],
        usedTemplate: true,
        telegramSource: {
          sourceChannel: telegramItem.sourceChannel,
          sourceMessageId: telegramItem.sourceMessageId,
          sourceUrl: telegramItem.sourceUrl,
          sourcePublishedAt: telegramItem.sourcePublishedAt,
        },
      };
    }

    return {
      message: telegramItem.formattedMessage,
      imageTitle: telegramItem.title,
      skipPublish: false,
      usedTemplate: true,
      reason: "telegram_template_ready",
      telegramSource: {
        sourceChannel: telegramItem.sourceChannel,
        sourceMessageId: telegramItem.sourceMessageId,
        sourceUrl: telegramItem.sourceUrl,
        sourcePublishedAt: telegramItem.sourcePublishedAt,
      },
    };
  }

  if (isEconomicReleaseTitle(title)) {
    const structured = await buildEconomicNewsAnalysis({
      title,
      link,
      registry: getProviderRegistry({ tradingEconomicsClient: TRADING_ECONOMICS_CLIENT }),
      queue: getPendingQueue(),
      dryRun,
    });

    if (structured.handled) {
      return {
        message: structured.message,
        imageTitle: structured.imageTitle,
        skipPublish: structured.skipPublish === true,
        reason: structured.reason || null,
        missingFields: structured.missingFields || [],
        economicAnalysis: structured,
      };
    }

    if (isStructuredTripleReleaseTitle(title)) {
      return {
        message: null,
        imageTitle: null,
        skipPublish: true,
        reason: "structured_release_no_ai_fallback",
        missingFields: ["previous", "forecast", "actual"],
        economicAnalysis: {
          handled: true,
          skipPublish: true,
          reason: "structured_release_no_ai_fallback",
        },
      };
    }
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

async function publishStructuredEconomicReleaseResult(result, stats, dryRun) {
  const publishCheck = canPublishStructuredRelease(result.validation, result.message);
  if (!publishCheck.allowed || !result?.message) {
    return false;
  }

  const message = result.message;
  const imageTitle = result.imageTitle || "خبر اقتصادي";
  const sourceLink = result.sourceLink || `economic-release:${result.idempotencyKey}`;

  if (dryRun) {
    console.log("NEWS_DRY_RUN economic release publish-ready:", imageTitle);
    stats.economicEventsPublished += 1;
    return true;
  }

  const premiumImageContext = buildPremiumImageContextFromRelease(result);
  const photoPath = await createNewsCard(imageTitle, null, "HIGH", premiumImageContext);
  if (photoPath) {
    await sendTelegramPhoto(message, photoPath);
  } else {
    await sendTelegramMessage(message);
  }
  stats.telegramPublished += 1;
  stats.economicEventsPublished += 1;

  const saveResult = await saveNewsPostToSupabase({
    title: imageTitle,
    content: message,
    image_url: null,
    impact_level: "HIGH",
    source_link: sourceLink,
  });
  if (saveResult?.error) {
    stats.dbFailed += 1;
  } else {
    stats.dbInserted += 1;
  }

  await dispatchMarketNewsNotifications({
    title: imageTitle,
    sourceLink,
    impactLevel: "HIGH",
  });

  savePublishedNewsLink(sourceLink, `${imageTitle} ${message}`);
  await savePublishedNewsToSupabase({
    link: sourceLink,
    title: `${imageTitle} ${message}`,
    normalized_title: normalizeNewsTitle(`${imageTitle} ${message}`).slice(0, 500),
    topic_cluster: getNewsTopicCluster(imageTitle),
    published_at: new Date().toISOString(),
  });

  return true;
}

async function fetchForexNews(options = {}) {
  const dryRun = options.dryRun === true || NEWS_DRY_RUN;
  const skipScheduledAlerts = options.skipScheduledAlerts === true || dryRun;
  const cycleStartedAt = Date.now();
  const stats = createEmptyCycleStats();

  if (isFetchingNews) {
    console.log("⏭️ Previous news fetch still running. Skipping overlap.");
    return { skipped: true, reason: "overlap", stats };
  }

  isFetchingNews = true;
  try {
    console.log("🚀 Fetching forex news...", JSON.stringify({ dryRun }));
    if (!skipScheduledAlerts) {
      await sendScheduledMarketAlerts();
    }

    const economicRegistry = getProviderRegistry({ tradingEconomicsClient: TRADING_ECONOMICS_CLIENT });
    mergeProviderMetricsIntoCycle(stats, economicRegistry.getAllMetrics());

    const pendingResults = await processDuePendingReleases({
      registry: economicRegistry,
      queue: getPendingQueue(),
      dryRun,
    });

    for (const pendingResult of pendingResults) {
      if (pendingResult.action === "publish") {
        stats.economicEventsDetected += 1;
        stats.economicEventsComplete += 1;
        await publishStructuredEconomicReleaseResult(pendingResult, stats, dryRun);
      } else if (pendingResult.action === "drop") {
        stats.economicEventsDroppedIncomplete += 1;
        logEconomicReleaseDroppedIncomplete(pendingResult, pendingResult.validation);
      } else if (pendingResult.action === "retry") {
        stats.economicEventsPending += 1;
      }
    }

    const allItems = [];

    try {
      const parseStats = {
        promoOnlySkipped: 0,
        promoFootersRemoved: 0,
        unclearSkipped: 0,
        lowValueSkipped: 0,
        preEventMissingName: 0,
      };
      const mergeBuffer = getNewsWorkerTelegramMergeBuffer(dryRun);
      const telegramDiscovery = await discoverTelegramNews({
        limitTotal: 100,
        limitPerChannel: 50,
        disableAi: dryRun,
        dryRun,
        parseStats,
        pipelineStats: parseStats,
        useMergeBuffer: true,
        mergeBuffer,
        flushImmediately: dryRun,
      });

      stats.telegramFetched = telegramDiscovery.posts.length;
      stats.telegramDeduped = telegramDiscovery.processed.length;
      stats.telegramMerged = telegramDiscovery.processed.filter((item) => item.mergedFrom?.length > 0).length;
      stats.telegramEconomicIncomplete = telegramDiscovery.processed.filter(
        (item) => item.newsType === "economic" && item.skipPublish
      ).length;
      stats.telegramPromoSkipped = parseStats.promoOnlySkipped;
      stats.telegramPromoFootersRemoved = parseStats.promoFootersRemoved;
      stats.telegramMergeBufferTimers = telegramDiscovery.mergeBufferTimers;
      stats.telegramMergeBufferPeak = telegramDiscovery.mergeBufferMetrics?.peakSize || 0;
      stats.telegramPipeline = summarizeTelegramPipelineStats(telegramDiscovery.processed, parseStats);
      stats.publishBlockedByKillSwitch = !TELEGRAM_NEWS_PUBLISH_ENABLED;
      logTelegramPublishCandidatesPreview(telegramDiscovery.processed, {
        publishBlockedByKillSwitch: !TELEGRAM_NEWS_PUBLISH_ENABLED,
      });

      if (dryRun) {
        allItems.push(...telegramDiscovery.items.filter((item) => !item.skipPublish));
      }

      for (const processedItem of telegramDiscovery.processed) {
        if (processedItem.newsType !== "economic" || !processedItem.skipPublish) {
          continue;
        }

        if (!dryRun) {
          getPendingQueue().enqueue({
            title: processedItem.facts.title || processedItem.post.rawText.slice(0, 120),
            link: processedItem.post.sourceUrl,
            canonical: processedItem.facts.canonical,
            scheduledAt: processedItem.post.sourcePublishedAt,
            validation: processedItem.validation,
            idempotencyKey: `TG|${processedItem.fingerprint}`,
          });
        }
      }
    } catch (error) {
      stats.lastErrorSafe = error.message;
      console.error("⚠️ Telegram discovery error:", error.message);
    }

    let rssFetchResult = { items: [], feedReports: [], fetched: 0 };
    if (NEWS_FEEDS.length) {
      rssFetchResult = await fetchGeneralRssFeeds({ feeds: NEWS_FEEDS });
      for (const feedReport of rssFetchResult.feedReports) {
        if (!feedReport.ok) {
          stats.sourceErrors[feedReport.feedUrl] = feedReport.error || `HTTP ${feedReport.httpStatus}`;
          console.error(`⚠️ Feed failed: ${feedReport.name}`, stats.sourceErrors[feedReport.feedUrl]);
        }
      }
    }

    stats.fetched = allItems.length + rssFetchResult.fetched;
    stats.normalized = allItems.length + rssFetchResult.fetched;
    stats.rssFeedReports = rssFetchResult.feedReports;

    if (!allItems.length && !rssFetchResult.items.length) {
      console.log("⚠️ No news found from all feeds");
      stats.cycleDurationMs = Date.now() - cycleStartedAt;
      lastCycleStats = stats;
      lastCycleCompletedAt = new Date().toISOString();
      consecutiveFailures += 1;
      console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
      return stats;
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
      stats.cycleDurationMs = Date.now() - cycleStartedAt;
      lastCycleStats = stats;
      lastCycleCompletedAt = new Date().toISOString();
      console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
      return stats;
    }

    const rssPipeline = processGeneralRssItems(rssFetchResult.items, {
      publishedItems,
      publishStats,
      feedReports: rssFetchResult.feedReports,
      dryRun,
      limits: {
        maxPostsPerHour: MAX_POSTS_PER_HOUR,
        maxHighImpactPostsPerHour: MAX_HIGH_IMPACT_POSTS_PER_HOUR,
      },
    });

    stats.rss = rssPipeline.diagnostics;
    for (const feedReport of rssFetchResult.feedReports) {
      const feedEligible = rssPipeline.diagnostics.items.filter(
        (entry) =>
          entry.source === feedReport.name &&
          (entry.action === "RSS_ELIGIBLE" || entry.action === "RSS_WOULD_PUBLISH_RATE_LIMITED")
      ).length;
      const feedRejected = rssPipeline.diagnostics.items.filter(
        (entry) => entry.source === feedReport.name && entry.action !== "RSS_ELIGIBLE" && entry.action !== "RSS_WOULD_PUBLISH_RATE_LIMITED"
      ).length;
      feedReport.accepted = feedEligible;
      feedReport.rejected = feedRejected;
    }
    stats.rssFeedReports = rssFetchResult.feedReports;

    let latestNews = rssPipeline.selectedItem || null;

    if (!latestNews) {
      console.log("⏭️ No new AI-approved important news found.");
      stats.cycleDurationMs = Date.now() - cycleStartedAt;
      lastCycleStats = stats;
      lastCycleCompletedAt = new Date().toISOString();
      consecutiveFailures += 1;
      console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
      return stats;
    }

    stats.eligible = 1;
    const latestLink = latestNews.link;

    const aiResult = await analyzeNewsWithAI(latestNews.title, latestNews.link, {
      dryRun,
      telegramItem: latestNews,
    });
    stats.aiProcessed = 1;

    if (aiResult?.economicAnalysis?.handled) {
      stats.economicEventsDetected += 1;
      mergeProviderMetricsIntoCycle(stats, economicRegistry.getAllMetrics());

      if (aiResult.skipPublish) {
        stats.economicEventsPending += 1;
        if (aiResult.reason === "source_conflict") {
          stats.economicEventsConflict += 1;
        }
        console.log(
          "⏭️ Economic release incomplete. Queued for enrichment:",
          latestNews.title,
          JSON.stringify({
            reason: aiResult.reason,
            missingFields: aiResult.missingFields,
            idempotencyKey: aiResult.economicAnalysis?.idempotencyKey,
          })
        );
        stats.cycleDurationMs = Date.now() - cycleStartedAt;
        lastCycleStats = stats;
        lastCycleCompletedAt = new Date().toISOString();
        console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
        return stats;
      }

      if (aiResult.economicAnalysis?.validation?.complete) {
        stats.economicEventsComplete += 1;
      }
    }

    if (!aiResult?.message) {
      stats.aiFailed = 1;
      stats.cycleDurationMs = Date.now() - cycleStartedAt;
      lastCycleStats = stats;
      lastCycleCompletedAt = new Date().toISOString();
      console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
      return stats;
    }

    if (latestNews.isTelegramSource && !TELEGRAM_NEWS_PUBLISH_ENABLED) {
      console.log("TELEGRAM_NEWS_PUBLISH_DISABLED skip cycle publish:", latestNews.title);
      stats.cycleDurationMs = Date.now() - cycleStartedAt;
      lastCycleStats = stats;
      lastCycleCompletedAt = new Date().toISOString();
      console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
      return stats;
    }

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
        stats.rejectedDuplicate += 1;
        recordRejection(stats, "duplicate_after_ai_cluster", latestNews.title);
        if (!dryRun) {
          savePublishedNewsLink(latestLink, combinedNewsIdentity);
          await savePublishedNewsToSupabase({
            link: latestLink,
            title: combinedNewsIdentity,
            normalized_title: normalizeNewsTitle(combinedNewsIdentity).slice(0, 500),
            topic_cluster: combinedTopicCluster,
            published_at: new Date().toISOString(),
          });
        }
        stats.cycleDurationMs = Date.now() - cycleStartedAt;
        lastCycleStats = stats;
        lastCycleCompletedAt = new Date().toISOString();
        console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
        return stats;
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
      finalImage = rssImage || articleImage || null;
    }

    if (dryRun) {
      console.log("NEWS_DRY_RUN eligible publish-ready item:", latestNews.title);
    } else {
      if (veryImportantNews || latestNews.impactLevel === "HIGH") {
        if (finalImage) {
          const photoPath = await createNewsCard(imageTitle, finalImage, latestNews.impactLevel || "HIGH");

          if (photoPath) {
            await sendTelegramPhoto(message, photoPath);
            stats.telegramPublished += 1;
          } else {
            console.log("⏭️ Image rejected or unavailable. Sending text only.");
            await sendTelegramMessage(message);
            stats.telegramPublished += 1;
          }
        } else {
          await sendTelegramMessage(message);
          stats.telegramPublished += 1;
        }
      } else {
        await sendTelegramMessage(message);
        stats.telegramPublished += 1;
      }

      const saveResult = await saveNewsPostToSupabase({
        title: latestNews.title || imageTitle,
        content: message,
        image_url: finalImage || null,
        impact_level: latestNews.impactLevel || "MEDIUM",
        source_link: latestLink,
      });
      if (saveResult?.error) {
        stats.dbFailed += 1;
      } else {
        stats.dbInserted += 1;
        if (stats.rss) {
          stats.rss.published = 1;
        }
      }

      await dispatchMarketNewsNotifications({
        title: latestNews.title || imageTitle,
        sourceLink: latestLink,
        impactLevel: latestNews.impactLevel || "MEDIUM",
      });
      savePublishedNewsLink(latestLink, combinedNewsIdentity);
      await savePublishedNewsToSupabase({
        link: latestLink,
        title: combinedNewsIdentity,
        normalized_title: normalizeNewsTitle(combinedNewsIdentity).slice(0, 500),
        topic_cluster: combinedTopicCluster,
        published_at: new Date().toISOString(),
      });
    }

    lastSuccessfulFetchAt = new Date().toISOString();
    consecutiveFailures = 0;
    stats.cycleDurationMs = Date.now() - cycleStartedAt;
    lastCycleStats = stats;
    lastCycleCompletedAt = lastSuccessfulFetchAt;
    console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
    return stats;
  } catch (error) {
    stats.lastErrorSafe = error.message;
    consecutiveFailures += 1;
    console.error("❌ RSS Error:", error.message);
    stats.cycleDurationMs = Date.now() - cycleStartedAt;
    lastCycleStats = stats;
    lastCycleCompletedAt = new Date().toISOString();
    console.log("NEWS_CYCLE_COMPLETE", JSON.stringify(stats));
    return stats;
  } finally {
    isFetchingNews = false;
  }
}

async function runRssGeneralDryRun(options = {}) {
  const { fetchGeneralRssFeeds, processGeneralRssItems, resetRssObservationStateForTests } = require("./lib/general-rss");

  if (options.resetObservation !== false) {
    resetRssObservationStateForTests();
  }

  const fetchResult = await fetchGeneralRssFeeds();
  const pipeline = processGeneralRssItems(fetchResult.items, {
    publishedItems: options.publishedItems || [],
    publishStats: options.publishStats || { postsLastHour: 0 },
    feedReports: fetchResult.feedReports,
    dryRun: true,
    skipObservationInit: true,
    skipBacklogCheck: true,
    limits: {
      maxPostsPerHour: MAX_POSTS_PER_HOUR,
      maxHighImpactPostsPerHour: MAX_HIGH_IMPACT_POSTS_PER_HOUR,
    },
  });

  const table = pipeline.diagnostics.items.slice(0, 50);
  const topEligible = pipeline.eligibleItems.slice(0, 10);

  return {
    feedReports: fetchResult.feedReports,
    summary: {
      fetched: pipeline.diagnostics.fetched,
      normalized: pipeline.diagnostics.normalized,
      eligible: pipeline.diagnostics.eligible,
      duplicate: pipeline.diagnostics.duplicateSkipped,
      stale: pipeline.diagnostics.staleSkipped,
      lowValue: pipeline.diagnostics.lowValueSkipped,
      noMarketAngle: pipeline.diagnostics.noMarketAngleSkipped,
      qualityRejected: pipeline.diagnostics.qualityRejected,
      rateLimited: pipeline.diagnostics.rateLimited,
      wouldPublish: pipeline.diagnostics.wouldPublish,
      structuredEconomicSkipped: pipeline.diagnostics.structuredEconomicSkipped,
      backlogSkipped: pipeline.diagnostics.backlogSkipped,
    },
    table,
    topEligible,
    diagnostics: pipeline.diagnostics,
  };
}

async function runNewsCycleDiagnostic(options = {}) {
  logWorkerEnvStatus();
  const cycleReport = await fetchForexNews({
    dryRun: true,
    skipScheduledAlerts: true,
    ...options,
  });

  let economicDryRun = null;
  let telegramDryRun = null;
  try {
    economicDryRun = await runEconomicReleaseDryRun({ limit: 50 });
  } catch (error) {
    economicDryRun = {
      error: error.message,
    };
  }

  try {
    const { discoverTelegramNews } = require("./lib/telegram-news");
    telegramDryRun = await discoverTelegramNews({ limitTotal: 100, limitPerChannel: 50 });
  } catch (error) {
    telegramDryRun = { error: error.message };
  }

  return {
    ...cycleReport,
    economicDryRun,
    telegramDryRun,
    pendingQueue: getPendingQueue().getSnapshot(),
  };
}

function getNewsWorkerHealthSnapshot() {
  return {
    enabled: true,
    running: !isFetchingNews,
    dryRun: NEWS_DRY_RUN,
    lastCycleCompletedAt,
    lastSuccessfulFetchAt,
    consecutiveFailures,
    nextRunAt: null,
    lastErrorSafe: lastCycleStats.lastErrorSafe || null,
    ...lastCycleStats,
  };
}

process.on("unhandledRejection", (reason) => {
  console.error("NEWS_WORKER_UNHANDLED_REJECTION", reason?.message || String(reason));
});

process.on("uncaughtException", (error) => {
  console.error("NEWS_WORKER_UNCAUGHT_EXCEPTION", error.message);
});

module.exports = {
  fetchForexNews,
  runNewsCycleDiagnostic,
  runRssGeneralDryRun,
  getNewsWorkerHealthSnapshot,
  getRequiredEnvStatus,
  runEconomicReleaseDryRun,
};

if (process.env.NEWS_WORKER_NO_BOOT === "1") {
  // Diagnostic import mode.
} else {
  logWorkerEnvStatus();

  const missingCritical = ["SUPABASE_SERVICE_ROLE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID"]
    .filter((name) => !process.env[name] || !String(process.env[name]).trim());

  if (!SUPABASE_URL) {
    missingCritical.unshift("SUPABASE_URL");
  }

  if (missingCritical.length) {
    console.error(
      "NEWS_WORKER_BOOT_BLOCKED",
      JSON.stringify({
        missingCritical,
        note: "News worker will stay alive but cycles cannot publish until Railway variables are restored.",
      })
    );
  } else {
    console.log(
      "WORKER_BOOT",
      JSON.stringify({
        worker: "worker/news-worker.js",
        service: "hasan-chart-news-worker",
        priceAlertsEnabled: false,
        note: "This service does NOT send price alert emails. Use worker/index.js for price_alerts.",
      })
    );
    console.log("🚀 News Worker Started...");
    fetchForexNews();
    setInterval(() => {
      fetchForexNews();
    }, 60 * 1000);
  }
}