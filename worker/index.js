require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in worker/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { processEmailQueue } = require("./email-queue");
const { logWorkerEvent } = require("./alert-logger");
const { sendPriceAlertPushNotifications } = require("./push-sender");

const WORKER_ENTRY = "worker/index.js";
const PRICE_ALERTS_MODULE_VERSION = "2026-06-24-v5-worker-real-email-path";

const CHECK_INTERVAL_MS = 12000;
const MAX_ALERTS_PER_RUN = 20;

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const analysisJobs = new Map();

const normalizeSymbol = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const normalizeCondition = (value) => {
  return String(value || "above").trim().toLowerCase() === "below" ? "below" : "above";
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatCoinPair = (coin) => {
  const symbol = normalizeSymbol(coin);

  if (!symbol) return "";

  if (symbol.endsWith("USDT")) {
    return `${symbol.slice(0, -4)}-USDT`;
  }

  return symbol;
};

const getConditionLabel = (condition) => {
  return normalizeCondition(condition) === "below"
    ? "وصول السعر للأسفل"
    : "وصول السعر للأعلى";
};

const buildPriceAlertPushBody = ({ coin, targetPrice, currentPrice }) => {
  const coinLabel = formatCoinPair(coin);

  return [
    `العملة: ${coinLabel}`,
    `السعر المطلوب: ${formatNumber(targetPrice)}`,
    `السعر الحالي: ${formatNumber(currentPrice)}`,
  ].join(" | ");
};

async function doPushForAlertOwner({
  alertId,
  email,
  userId,
  coin,
  targetPrice,
  currentPrice,
  source = "worker/index.js",
}) {
  const pushBody = buildPriceAlertPushBody({ coin, targetPrice, currentPrice });

  console.log("PRICE_ALERT_PUSH_START", {
    alertId,
    email,
    userId: userId || null,
    source,
  });

  try {
    const stats = await sendPriceAlertPushNotifications({
      supabase,
      workerEntry: WORKER_ENTRY,
      alertId,
      email,
      userId,
      title: "✅ وصل السعر إلى هدف التنبيه",
      body: pushBody,
      url: "https://www.hasanchartworld.com/alerts",
    });

    if ((stats?.sent || 0) > 0) {
      console.log("PRICE_ALERT_PUSH_SENT", {
        alertId,
        email,
        userId: userId || null,
        source,
        stats,
      });
    }

    return stats;
  } catch (pushError) {
    console.log("PRICE_ALERT_PUSH_FAILED", pushError);
    logWorkerEvent("PRICE_ALERT_PUSH_FAILED", {
      worker: WORKER_ENTRY,
      success: false,
      alertId,
      email,
      userId: userId || null,
      source,
      message: pushError?.message || String(pushError),
      statusCode: pushError?.statusCode || null,
      body: pushError?.body || null,
      error: pushError?.message || String(pushError),
    });

    return { sent: 0, failed: 1, skipped: 0 };
  }
}

const buildPriceAlertNotificationMessage = ({
  coin,
  targetPrice,
  currentPrice,
  condition,
}) => {
  const coinLabel = formatCoinPair(coin);
  const conditionLabel = getConditionLabel(condition);

  return [
    `العملة: ${coinLabel}`,
    `السعر الذي طلبته: ${formatNumber(targetPrice)}`,
    `السعر الحالي عند التفعيل: ${formatNumber(currentPrice)}`,
    "",
    `نوع التنبيه: ${conditionLabel}`,
    "",
    "تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.",
  ].join("\n");
};

const formatNumber = (value) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return String(value || "");

  return numberValue.toLocaleString("en-US", {
    maximumFractionDigits: numberValue >= 1 ? 4 : 8,
  });
};


const getMarketPrice = async (symbol) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const okxSymbol = cleanSymbol.replace("USDT", "-USDT");

  const response = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(okxSymbol)}`
  );

  const data = await response.json();
  const price = Number(data?.data?.[0]?.last);

  if (Number.isFinite(price)) {
    return price;
  }

  throw new Error(`تعذر جلب سعر ${cleanSymbol} من OKX`);
};

const getMarketCandles = async (symbol, bar = "15m", limit = 120) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const okxSymbol = cleanSymbol.replace("USDT", "-USDT");
  const response = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(okxSymbol)}&bar=${encodeURIComponent(bar)}&limit=${encodeURIComponent(String(limit))}`
  );

  const data = await response.json();

  if (!response.ok || data?.code !== "0" || !Array.isArray(data?.data)) {
    throw new Error(`تعذر جلب شموع ${cleanSymbol} من OKX`);
  }

  return data.data
    .map((item) => ({
      time: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
    }))
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    )
    .reverse();
};

const average = (values) => {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (!cleanValues.length) return 0;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
};

const analyzeCandles = (candles) => {
  if (!Array.isArray(candles) || candles.length < 40) {
    return {
      trend: "neutral",
      direction: "neutral",
      support: null,
      resistance: null,
      entry: null,
      stopLoss: null,
      target1: null,
      target2: null,
      confidence: 45,
      setupReady: false,
      signals: ["بيانات الشموع غير كافية للتحليل الكامل"],
      structureNotes: ["بانتظار بيانات كافية لتحديد BOS / CHOCH"],
    };
  }

  const last = candles[candles.length - 1];
  const recent = candles.slice(-60);
  const emaFast = average(candles.slice(-9).map((candle) => candle.close));
  const emaSlow = average(candles.slice(-21).map((candle) => candle.close));
  const avgVolume = average(recent.slice(0, -1).map((candle) => candle.volume));
  const volumeSpike = Number.isFinite(last.volume) && avgVolume > 0 && last.volume > avgVolume * 1.35;

  const swings = [];

  for (let i = 3; i < candles.length - 3; i += 1) {
    const window = candles.slice(i - 3, i + 4);
    const current = candles[i];
    const isSwingHigh = current.high === Math.max(...window.map((candle) => candle.high));
    const isSwingLow = current.low === Math.min(...window.map((candle) => candle.low));

    if (isSwingHigh) {
      swings.push({ type: "high", index: i, price: current.high, time: current.time });
    }

    if (isSwingLow) {
      swings.push({ type: "low", index: i, price: current.low, time: current.time });
    }
  }

  const recentSwingHighs = swings.filter((swing) => swing.type === "high").slice(-4);
  const recentSwingLows = swings.filter((swing) => swing.type === "low").slice(-4);
  const lastSwingHigh = recentSwingHighs[recentSwingHighs.length - 1];
  const previousSwingHigh = recentSwingHighs[recentSwingHighs.length - 2];
  const lastSwingLow = recentSwingLows[recentSwingLows.length - 1];
  const previousSwingLow = recentSwingLows[recentSwingLows.length - 2];
  const resistance = lastSwingHigh?.price || Math.max(...recent.slice(0, -1).map((candle) => candle.high));
  const support = lastSwingLow?.price || Math.min(...recent.slice(0, -1).map((candle) => candle.low));
  const brokeHigh = Number.isFinite(resistance) && last.close > resistance;
  const brokeLow = Number.isFinite(support) && last.close < support;
  const sweptHigh = Number.isFinite(resistance) && last.high > resistance && last.close < resistance;
  const sweptLow = Number.isFinite(support) && last.low < support && last.close > support;
  const higherHigh = Boolean(lastSwingHigh && previousSwingHigh && lastSwingHigh.price > previousSwingHigh.price);
  const higherLow = Boolean(lastSwingLow && previousSwingLow && lastSwingLow.price > previousSwingLow.price);
  const lowerHigh = Boolean(lastSwingHigh && previousSwingHigh && lastSwingHigh.price < previousSwingHigh.price);
  const lowerLow = Boolean(lastSwingLow && previousSwingLow && lastSwingLow.price < previousSwingLow.price);
  const bullishStructure = Boolean((higherHigh && higherLow) || (last.close > emaFast && emaFast > emaSlow));
  const bearishStructure = Boolean((lowerHigh && lowerLow) || (last.close < emaFast && emaFast < emaSlow));
  const bullishChoch = Boolean(sweptLow || (bearishStructure && brokeHigh));
  const bearishChoch = Boolean(sweptHigh || (bullishStructure && brokeLow));

  let direction = "neutral";
  if (brokeHigh || bullishChoch || bullishStructure) direction = "bullish";
  if (brokeLow || bearishChoch || bearishStructure) direction = "bearish";

  const range = Math.max(resistance - support, last.close * 0.008);
  const impulseCandles = recent
    .map((candle, offset) => ({
      ...candle,
      index: candles.length - recent.length + offset,
      body: Math.abs(candle.close - candle.open),
      range: candle.high - candle.low,
    }))
    .filter((candle) => candle.range > 0)
    .sort((a, b) => b.body / b.range - a.body / a.range);

  const orderBlockCandle =
    direction === "bullish"
      ? [...recent].reverse().find((candle) => candle.close < candle.open) || impulseCandles[0]
      : direction === "bearish"
        ? [...recent].reverse().find((candle) => candle.close > candle.open) || impulseCandles[0]
        : impulseCandles[0];

  const orderBlockLow = orderBlockCandle ? Math.min(orderBlockCandle.open, orderBlockCandle.close, orderBlockCandle.low) : support;
  const orderBlockHigh = orderBlockCandle ? Math.max(orderBlockCandle.open, orderBlockCandle.close, orderBlockCandle.high) : resistance;
  const premiumLevel = support + range * 0.7;
  const discountLevel = support + range * 0.3;
  const setupReady = direction !== "neutral" && (brokeHigh || brokeLow || sweptHigh || sweptLow || volumeSpike);
  const rawEntry = setupReady
    ? direction === "bullish"
      ? Math.min(orderBlockHigh, Math.max(orderBlockLow, discountLevel))
      : Math.max(orderBlockLow, Math.min(orderBlockHigh, premiumLevel))
    : null;
  const entry = setupReady
    ? direction === "bullish"
      ? Math.min(rawEntry, last.close * 0.999)
      : Math.max(rawEntry, last.close * 1.001)
    : null;
  const stopLoss = setupReady
    ? direction === "bullish"
      ? Math.min(support, orderBlockLow) - range * 0.08
      : Math.max(resistance, orderBlockHigh) + range * 0.08
    : null;
  const target1 = setupReady && entry && stopLoss
    ? direction === "bullish"
      ? entry + Math.abs(entry - stopLoss) * 1.4
      : entry - Math.abs(stopLoss - entry) * 1.4
    : null;
  const target2 = setupReady && entry && stopLoss
    ? direction === "bullish"
      ? entry + Math.abs(entry - stopLoss) * 2.2
      : entry - Math.abs(stopLoss - entry) * 2.2
    : null;

  const signals = [
    brokeHigh ? "BOS صاعد: إغلاق فوق آخر قمة معتبرة" : "",
    brokeLow ? "BOS هابط: إغلاق أسفل آخر قاع معتبر" : "",
    bullishChoch ? "CHOCH صاعد: تغير سلوك بعد ضغط بيعي" : "",
    bearishChoch ? "CHOCH هابط: تغير سلوك بعد ضغط شرائي" : "",
    sweptHigh ? "Liquidity Sweep: سحب سيولة أعلى القمم ثم رفض" : "",
    sweptLow ? "Liquidity Sweep: سحب سيولة أسفل القيعان ثم ارتداد" : "",
    volumeSpike ? "Volume Expansion: دخول حجم أعلى من المتوسط" : "",
    bullishStructure ? "Market Structure: قمم/قيعان صاعدة أو متوسطات داعمة" : "",
    bearishStructure ? "Market Structure: قمم/قيعان هابطة أو متوسطات ضاغطة" : "",
  ].filter(Boolean);

  const structureNotes = [
    `الدعم الأقرب: ${formatNumber(support)}`,
    `المقاومة الأقرب: ${formatNumber(resistance)}`,
    `السيولة الشرائية فوق: ${formatNumber(resistance)}`,
    `السيولة البيعية تحت: ${formatNumber(support)}`,
    direction === "bullish" ? `Order Block طلب: ${formatNumber(orderBlockLow)} - ${formatNumber(orderBlockHigh)}` : "",
    direction === "bearish" ? `Order Block عرض: ${formatNumber(orderBlockLow)} - ${formatNumber(orderBlockHigh)}` : "",
    `Premium: فوق ${formatNumber(premiumLevel)}`,
    `Discount: تحت ${formatNumber(discountLevel)}`,
  ].filter(Boolean);

  const confidence = Math.min(90, Math.max(50, 50 + signals.length * 6 + (setupReady ? 10 : 0)));

  return {
    trend: direction,
    direction,
    support,
    resistance,
    orderBlockLow,
    orderBlockHigh,
    premiumLevel,
    discountLevel,
    entry,
    stopLoss,
    target1,
    target2,
    confidence,
    setupReady,
    bos: brokeHigh ? "BOS صاعد مؤكد" : brokeLow ? "BOS هابط مؤكد" : "بانتظار BOS مؤكد",
    choch: bullishChoch ? "CHOCH صاعد محتمل" : bearishChoch ? "CHOCH هابط محتمل" : "راقب تغير السلوك السعري",
    liquiditySweep: sweptLow ? "سحب سيولة أسفل القيعان" : sweptHigh ? "سحب سيولة أعلى القمم" : "لا يوجد Sweep مؤكد حالياً",
    orderBlock: direction === "bullish" ? `منطقة طلب ${formatNumber(orderBlockLow)} - ${formatNumber(orderBlockHigh)}` : direction === "bearish" ? `منطقة عرض ${formatNumber(orderBlockLow)} - ${formatNumber(orderBlockHigh)}` : "بانتظار Order Block مؤكد",
    premiumZone: `Premium أعلى ${formatNumber(premiumLevel)}`,
    discountZone: `Discount أسفل ${formatNumber(discountLevel)}`,
    liquidityAbove: `فوق ${formatNumber(resistance)}`,
    liquidityBelow: `تحت ${formatNumber(support)}`,
    signals,
    structureNotes,
  };
};

const extractJsonObject = (value) => {
  const text = String(value || "").trim();

  try {
    return JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("INVALID_AI_JSON");
  }
};

const buildAnalysisChartImage = ({ symbol, currentPrice, direction, entry, stopLoss, target1, target2 }) => {
  const safeSymbol = escapeHtml(symbol);
  const safeCurrent = escapeHtml(formatNumber(currentPrice));
  const safeEntry = escapeHtml(formatNumber(entry));
  const safeStop = escapeHtml(formatNumber(stopLoss));
  const safeTarget1 = escapeHtml(formatNumber(target1));
  const safeTarget2 = escapeHtml(formatNumber(target2));
  const cleanDirection = String(direction || "neutral").toLowerCase();
  const isBearish = cleanDirection.includes("bear");
  const isBullish = cleanDirection.includes("bull");
  const biasText = isBullish ? "Bullish Setup" : isBearish ? "Bearish Setup" : "Neutral Setup";
  const biasColor = isBullish ? "#34d399" : isBearish ? "#fb7185" : "#22d3ee";

  const candles = (isBearish
    ? [
        { x: 150, o: 205, c: 250, h: 178, l: 285 },
        { x: 225, o: 245, c: 300, h: 220, l: 330 },
        { x: 300, o: 292, c: 270, h: 238, l: 318 },
        { x: 375, o: 274, c: 330, h: 250, l: 356 },
        { x: 450, o: 326, c: 382, h: 300, l: 412 },
        { x: 525, o: 376, c: 348, h: 318, l: 404 },
        { x: 600, o: 350, c: 420, h: 332, l: 452 },
        { x: 675, o: 415, c: 470, h: 390, l: 508 },
        { x: 750, o: 462, c: 438, h: 408, l: 492 },
        { x: 825, o: 440, c: 510, h: 418, l: 550 },
      ]
    : [
        { x: 150, o: 480, c: 440, h: 415, l: 510 },
        { x: 225, o: 445, c: 390, h: 360, l: 470 },
        { x: 300, o: 398, c: 420, h: 372, l: 452 },
        { x: 375, o: 414, c: 350, h: 322, l: 438 },
        { x: 450, o: 352, c: 292, h: 268, l: 382 },
        { x: 525, o: 300, c: 330, h: 282, l: 360 },
        { x: 600, o: 326, c: 260, h: 235, l: 350 },
        { x: 675, o: 268, c: 220, h: 190, l: 300 },
        { x: 750, o: 228, c: 250, h: 205, l: 278 },
        { x: 825, o: 246, c: 182, h: 158, l: 270 },
      ])
    .map((candle) => {
      const up = candle.c < candle.o;
      const color = up ? "#34d399" : "#fb7185";
      const bodyY = Math.min(candle.o, candle.c);
      const bodyH = Math.max(12, Math.abs(candle.o - candle.c));

      return `
        <line x1="${candle.x}" y1="${candle.h}" x2="${candle.x}" y2="${candle.l}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
        <rect x="${candle.x - 18}" y="${bodyY}" width="36" height="${bodyH}" rx="7" fill="${color}" fill-opacity="0.95"/>
      `;
    })
    .join("");

  const projectionPath = isBearish
    ? "M520 250 C620 318 690 405 840 500"
    : "M520 400 C620 332 690 245 840 165";
  const arrowPoints = isBearish ? "840,500 805,494 824,466" : "840,165 805,171 824,199";
  const demandY = isBearish ? 450 : 398;
  const supplyY = isBearish ? 150 : 112;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="760" viewBox="0 0 1280 760">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="52%" stop-color="#081733"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="cyanLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>

  <rect width="1280" height="760" fill="url(#bg)"/>
  <rect x="36" y="32" width="1208" height="696" rx="34" fill="#020817" fill-opacity="0.82" stroke="#22d3ee" stroke-opacity="0.18"/>

  <g opacity="0.14" stroke="#94a3b8" stroke-width="1">
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${92 + i * 86}" y1="138" x2="${92 + i * 86}" y2="620"/>`).join("")}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="70" y1="${150 + i * 72}" x2="1210" y2="${150 + i * 72}"/>`).join("")}
  </g>

  <text x="78" y="82" fill="#ffffff" font-size="34" font-weight="900" font-family="Arial">HasaN CharT World</text>
  <text x="78" y="120" fill="#67e8f9" font-size="23" font-weight="800" font-family="Arial">${safeSymbol} · SMC / ICT / CLASSIC</text>

  <rect x="830" y="58" width="350" height="86" rx="26" fill="#0b1b3a" stroke="#22d3ee" stroke-opacity="0.26"/>
  <text x="858" y="94" fill="#94a3b8" font-size="17" font-family="Arial">Current Price</text>
  <text x="858" y="126" fill="#ffffff" font-size="30" font-weight="900" font-family="Arial">${safeCurrent}</text>

  <rect x="92" y="${supplyY}" width="1060" height="76" rx="18" fill="#7f1d1d" fill-opacity="0.18" stroke="#fb7185" stroke-dasharray="12 10" stroke-opacity="0.52"/>
  <text x="112" y="${supplyY + 48}" fill="#fecaca" font-size="20" font-weight="900" font-family="Arial">Supply / Premium Liquidity</text>

  <rect x="92" y="${demandY}" width="1060" height="86" rx="18" fill="#064e3b" fill-opacity="0.18" stroke="#34d399" stroke-dasharray="12 10" stroke-opacity="0.52"/>
  <text x="112" y="${demandY + 52}" fill="#a7f3d0" font-size="20" font-weight="900" font-family="Arial">Demand / Discount Order Block</text>

  <g filter="url(#glow)">
    ${candles}
  </g>

  <path d="${projectionPath}" fill="none" stroke="url(#cyanLine)" stroke-width="8" stroke-linecap="round" stroke-dasharray="18 12" filter="url(#glow)"/>
  <polygon points="${arrowPoints}" fill="#22d3ee" filter="url(#glow)"/>

  <text x="315" y="260" fill="#cbd5e1" font-size="18" font-weight="900" font-family="Arial">CHOCH</text>
  <text x="535" y="330" fill="#cbd5e1" font-size="18" font-weight="900" font-family="Arial">BOS</text>

  <rect x="78" y="620" width="320" height="62" rx="22" fill="#07142f" stroke="${biasColor}" stroke-opacity="0.65"/>
  <circle cx="112" cy="651" r="10" fill="${biasColor}"/>
  <text x="138" y="660" fill="#ffffff" font-size="22" font-weight="900" font-family="Arial">${biasText}</text>

  <rect x="430" y="608" width="300" height="82" rx="22" fill="#022c22" fill-opacity="0.78" stroke="#34d399" stroke-opacity="0.75"/>
  <text x="456" y="638" fill="#6ee7b7" font-size="17" font-weight="900" font-family="Arial">Entry</text>
  <text x="456" y="670" fill="#ffffff" font-size="25" font-weight="900" font-family="Arial">${safeEntry}</text>

  <rect x="760" y="608" width="370" height="82" rx="22" fill="#172554" fill-opacity="0.86" stroke="#60a5fa" stroke-opacity="0.78"/>
  <text x="786" y="638" fill="#93c5fd" font-size="17" font-weight="900" font-family="Arial">Targets</text>
  <text x="786" y="670" fill="#ffffff" font-size="23" font-weight="900" font-family="Arial">T1 ${safeTarget1} · T2 ${safeTarget2}</text>

  <rect x="882" y="482" width="300" height="64" rx="20" fill="#450a0a" fill-opacity="0.76" stroke="#f87171" stroke-opacity="0.75"/>
  <text x="906" y="523" fill="#fecaca" font-size="21" font-weight="900" font-family="Arial">SL ${safeStop}</text>

  <text x="80" y="710" fill="#cbd5e1" font-size="18" font-family="Arial">Educational analysis only · Manage risk strictly · Not financial advice</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

const getFallbackAnalysis = ({ symbol, currentPrice, candles = [], technicalAnalysis = null }) => {
  const base = Number(currentPrice) || 1;
  const entry = technicalAnalysis?.entry || base;
  const stopLoss = technicalAnalysis?.stopLoss || base * 0.985;
  const target1 = technicalAnalysis?.target1 || base * 1.015;
  const target2 = technicalAnalysis?.target2 || base * 1.03;

  return {
    success: true,
    symbol,
    trend: "neutral",
    direction: "neutral",
    currentPrice: base,
    summary: technicalAnalysis?.setupReady
      ? `السعر عند ${formatNumber(base)} والهيكل الحالي يميل إلى ${technicalAnalysis.direction === "bullish" ? "الصعود" : "الهبوط"} بعد قراءة السيولة والهيكل.`
      : `السعر عند ${formatNumber(base)} داخل نطاق مراقبة. لا يوجد إعداد دخول مؤكد حتى تظهر إشارة BOS أو CHOCH واضحة.`,
    smartMoney: technicalAnalysis?.signals?.length
      ? `SMC/ICT: ${technicalAnalysis.signals.slice(0, 3).join("، ")}.`
      : "SMC/ICT: راقب مناطق السيولة القريبة وأي CHOCH أو BOS واضح قبل اتخاذ القرار.",
    classic: technicalAnalysis?.support && technicalAnalysis?.resistance
      ? `كلاسيكي: السعر بين دعم ${formatNumber(technicalAnalysis.support)} ومقاومة ${formatNumber(technicalAnalysis.resistance)}.`
      : "كلاسيكي: الاتجاه يحتاج تأكيد عبر كسر مقاومة أو فقدان دعم قريب.",
    risk: technicalAnalysis?.setupReady
      ? "إدارة المخاطر: لا يتم الدخول إلا بعد تأكيد الإغلاق أو إعادة الاختبار، مع وقف واضح خلف منطقة الهيكل."
      : "إدارة المخاطر: لا يوجد إعداد دخول مؤكد حالياً، الأفضل الانتظار وعدم ملاحقة السعر.",
    entry,
    stopLoss,
    target1,
    target2,
    confidence: technicalAnalysis?.confidence || 55,
    support: technicalAnalysis?.support || null,
    resistance: technicalAnalysis?.resistance || null,
    signals: technicalAnalysis?.signals || [],
    scenario: "انتظار تأكيد الحركة هو الخيار الأفضل حالياً.",
    marketBias: technicalAnalysis?.direction || "neutral",
    bos: technicalAnalysis?.bos || "بانتظار BOS مؤكد",
    choch: technicalAnalysis?.choch || "راقب تغير السلوك السعري",
    liquiditySweep: technicalAnalysis?.liquiditySweep || "لا يوجد Sweep مؤكد حالياً",
    orderBlock: technicalAnalysis?.orderBlock || "بانتظار Order Block مؤكد",
    premiumZone: technicalAnalysis?.premiumZone || "غير مؤكد",
    discountZone: technicalAnalysis?.discountZone || "غير مؤكد",
    liquidityAbove: technicalAnalysis?.liquidityAbove || null,
    liquidityBelow: technicalAnalysis?.liquidityBelow || null,
    structureNotes: technicalAnalysis?.structureNotes || [],
    analysis:
      [
        technicalAnalysis?.setupReady
          ? `الملخص: يوجد إعداد مراقبة مبني على هيكل السوق الحالي، والاتجاه المرجح ${technicalAnalysis.direction === "bullish" ? "صاعد" : technicalAnalysis.direction === "bearish" ? "هابط" : "محايد"}.`
          : "الملخص: لا يوجد إعداد دخول مؤكد حالياً، والسوق يحتاج تأكيد BOS أو CHOCH.",
        `SMC / ICT: ${technicalAnalysis?.signals?.length ? technicalAnalysis.signals.join("، ") : "السيولة ما زالت تحت المراقبة ولا يوجد Sweep مؤكد."}`,
        `الكلاسيكي: الدعم ${formatNumber(technicalAnalysis?.support || base)} والمقاومة ${formatNumber(technicalAnalysis?.resistance || base)} هما أهم مناطق القرار الحالية.`,
        `Order Block: ${technicalAnalysis?.orderBlock || "بانتظار منطقة مؤكدة"}.`,
        `السيولة: أعلى ${formatNumber(technicalAnalysis?.resistance || base)} وأسفل ${formatNumber(technicalAnalysis?.support || base)}.`,
        technicalAnalysis?.setupReady
          ? "الخطة: انتظار إعادة اختبار منطقة الهيكل قبل أي دخول، وعدم الدخول من منتصف النطاق."
          : "الخطة: انتظار كسر واضح أو إعادة اختبار، ولا يوجد دخول مباشر الآن.",
        `الثقة: ${technicalAnalysis?.confidence || 55}%`,
      ].join("\n\n"),
    chartData: Array.isArray(candles) ? candles : [],
    chartImage: null,
    generatedAt: new Date().toISOString(),
  };
};

const generateOpenAiAnalysis = async ({ symbol, currentPrice, candles, technicalAnalysis }) => {
  if (!openaiApiKey) {
    return getFallbackAnalysis({ symbol, currentPrice, candles, technicalAnalysis });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 750,
      messages: [
        {
          role: "system",
          content:
            "أنت محلل كريبتو مؤسساتي احترافي لمنصة HasaN CharT World. مهمتك إنشاء تحليل لحظي احترافي جداً مثل TradingView والمؤسسات المالية بناءً على الشموع والبيانات الفنية المرسلة فقط، ولا تخترع مستويات من نفسك. استخدم SMC و ICT والمدرسة الكلاسيكية مع BOS و CHOCH و Liquidity Sweep و Order Blocks و Fair Value Gap و Premium/Discount و Supply & Demand. إذا كان الاتجاه Bearish فلا تجعل سعر الدخول تحت السعر الحالي؛ الدخول المنطقي يكون من إعادة اختبار أو منطقة عرض أعلى السعر الحالي. إذا كان الاتجاه Bullish فلا تجعل سعر الدخول فوق السعر الحالي؛ الدخول المنطقي يكون من إعادة اختبار أو منطقة طلب أسفل السعر الحالي. إذا لا يوجد إعداد مؤكد قل بوضوح لا يوجد دخول الآن. يجب أن يكون التحليل قصير جداً لكنه قوي واحترافي. لا تقدم وعود ربح. أعد JSON صالح فقط بدون markdown أو أي نص خارجي.",
        },
        {
          role: "user",
          content: JSON.stringify({
            symbol,
            currentPrice,
            candles: candles.slice(-80),
            technicalAnalysis,
            requiredOutput: {
              trend: "bullish | bearish | neutral",
              direction: "bullish | bearish | neutral",
              summary: "سطرين كحد أقصى",
              smartMoney: "قراءة SMC/ICT مختصرة",
              classic: "قراءة كلاسيكية مختصرة",
              risk: "إدارة مخاطر مختصرة",
              entry: "number أو null. إذا كان Bearish يجب أن يكون الدخول أعلى السعر الحالي كإعادة اختبار. إذا كان Bullish يجب أن يكون الدخول أسفل السعر الحالي كإعادة اختبار. إذا لا يوجد Setup مؤكد اجعله null",
              stopLoss: "number",
              target1: "number",
              target2: "number",
              confidence: "number 0-100",
              scenario: "سيناريو الحركة المتوقعة باختصار",
              marketBias: "تحيز السوق المختصر",
              bos: "BOS مختصر",
              choch: "CHOCH مختصر",
              liquiditySweep: "هل توجد ملامح سحب سيولة؟",
              orderBlock: "منطقة Order Block الأقرب",
              fvg: "Fair Value Gap إن وجد",
              premiumDiscount: "Premium أو Discount",
              liquidityAbove: "السيولة أعلى السعر",
              liquidityBelow: "السيولة أسفل السعر",
             analysis: "تحليل عربي منسق لا يتجاوز 8 أسطر ويحتوي حرفياً على: الاتجاه العام في SMC، قراءة ICT، التحليل الكلاسيكي، السيناريو المتوقع، فشل السيناريو، قرار الدخول",
            },
          }),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.log("❌ OpenAI analysis error:", JSON.stringify(data, null, 2));
    return getFallbackAnalysis({ symbol, currentPrice, candles, technicalAnalysis });
  }

  const content = data?.choices?.[0]?.message?.content;
  let parsed;

  try {
    parsed = extractJsonObject(content);
  } catch (error) {
    console.log("⚠️ Invalid OpenAI JSON, using technical fallback:", error?.message || error);
    return getFallbackAnalysis({ symbol, currentPrice, candles, technicalAnalysis });
  }

  const direction = String(parsed.direction || parsed.trend || technicalAnalysis?.direction || "neutral").toLowerCase();
  const parsedEntry = Number(parsed.entry);
  const correctedEntry =
    Number.isFinite(Number(technicalAnalysis?.entry))
      ? Number(technicalAnalysis.entry)
      : Number.isFinite(parsedEntry)
        ? parsedEntry
        : null;
  const entry = correctedEntry;
  const stopLoss = Number.isFinite(Number(technicalAnalysis?.stopLoss)) ? Number(technicalAnalysis.stopLoss) : Number(parsed.stopLoss) || null;
  const target1 = Number.isFinite(Number(technicalAnalysis?.target1)) ? Number(technicalAnalysis.target1) : Number(parsed.target1) || null;
  const target2 = Number.isFinite(Number(technicalAnalysis?.target2)) ? Number(technicalAnalysis.target2) : Number(parsed.target2) || null;

  return {
    success: true,
    symbol,
    trend: parsed.trend || direction,
    direction,
    currentPrice,
    summary: technicalAnalysis?.setupReady
      ? parsed.summary || `تحليل ${symbol} عند ${formatNumber(currentPrice)} مع إعداد مراقبة مبني على هيكل السوق.`
      : `تحليل ${symbol} عند ${formatNumber(currentPrice)}. لا يوجد دخول مباشر الآن حتى يظهر تأكيد واضح.` ,
    smartMoney: parsed.smartMoney || "راقب السيولة ومناطق الطلب والعرض قبل الدخول.",
    classic: parsed.classic || "انتظر تأكيد الكسر أو إعادة الاختبار.",
    risk: parsed.risk || "التزم بإدارة المخاطر ووقف خسارة واضح.",
    entry,
    stopLoss,
    target1,
    target2,
    confidence: Number(parsed.confidence) || technicalAnalysis?.confidence || 60,
    support: technicalAnalysis?.support || null,
    resistance: technicalAnalysis?.resistance || null,
    signals: technicalAnalysis?.signals || [],
    structureNotes: technicalAnalysis?.structureNotes || [],
    orderBlock: parsed.orderBlock || technicalAnalysis?.orderBlock || "بانتظار Order Block مؤكد",
    liquiditySweep: parsed.liquiditySweep || technicalAnalysis?.liquiditySweep || "لا يوجد Sweep مؤكد حالياً",
    liquidityAbove: parsed.liquidityAbove || technicalAnalysis?.liquidityAbove || null,
    liquidityBelow: parsed.liquidityBelow || technicalAnalysis?.liquidityBelow || null,
    chartData: candles,
    scenario: parsed.scenario || "الحركة المتوقعة تحتاج تأكيد من الإغلاق القادم.",
    chartImage: null,
    generatedAt: new Date().toISOString(),
  };
};

const sendTriggeredAlertEmail = async ({
  email,
  coin,
  condition,
  targetPrice,
  currentPrice,
  alertId = null,
  userId = null,
}) => {
  const coinLabel = formatCoinPair(coin);

  logWorkerEvent("PRICE_ALERT_EMAIL_REAL_PATH_FOUND", {
    worker: WORKER_ENTRY,
    file: "worker/index.js",
    function: "sendTriggeredAlertEmail",
    alertId,
    email,
    userId: userId || null,
    coin: coinLabel,
    targetPrice,
    currentPrice,
    condition,
  });

  logWorkerEvent("ALERT_EMAIL_SEND_START", {
    worker: WORKER_ENTRY,
    alertId,
    email,
    coin: coinLabel,
    targetPrice,
    requestedPrice: targetPrice,
    currentPrice,
    condition,
    conditionLabel: getConditionLabel(condition),
  });

  if (!resendApiKey || !email) {
    logWorkerEvent("ALERT_EMAIL_SEND_SKIPPED", {
      worker: WORKER_ENTRY,
      alertId,
      email,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    });

    return {
      success: false,
      skipped: true,
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  const safeCoin = escapeHtml(coinLabel);
  const conditionLabel = getConditionLabel(condition);
  const safeConditionLabel = escapeHtml(conditionLabel);
  const safeTargetPrice = escapeHtml(formatNumber(targetPrice));
  const safeCurrentPrice = escapeHtml(formatNumber(currentPrice));

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "HasaN CharT World <alerts@hasanchartworld.com>",
      to: email,
      subject: `✅ وصل السعر إلى هدف التنبيه - ${safeCoin}`,
      html: `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border-radius:24px;overflow:hidden;border:1px solid rgba(34,211,238,0.18);box-shadow:0 0 40px rgba(37,99,235,0.22);">
          <tr>
            <td style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:34px 22px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.6;font-weight:900;text-align:center;">
                ✅ وصل السعر إلى هدف التنبيه
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 20px 10px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.16);border-radius:20px;padding:22px;color:#e2e8f0;font-size:18px;line-height:2;font-weight:600;text-align:right;">
                <p style="margin:0 0 8px;"><strong>العملة:</strong> ${safeCoin}</p>
                <p style="margin:0 0 8px;"><strong>السعر الذي طلبته:</strong> ${safeTargetPrice}</p>
                <p style="margin:0 0 8px;"><strong>السعر الحالي عند التفعيل:</strong> ${safeCurrentPrice}</p>
                <p style="margin:0 0 8px;"><strong>نوع التنبيه:</strong> ${safeConditionLabel}</p>
                <p style="margin:16px 0 0;color:#94a3b8;font-size:15px;">تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 20px 34px;">
              <a href="https://www.hasanchartworld.com" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;padding:18px 34px;border-radius:18px;font-size:17px;font-weight:900;box-shadow:0 0 22px rgba(37,99,235,0.35);">
                فتح منصة HasaN CharT
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
      `,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    logWorkerEvent("ALERT_EMAIL_SEND_FAILED", {
      worker: WORKER_ENTRY,
      alertId,
      email,
      coin: coinLabel,
      targetPrice,
      currentPrice,
      status: response.status,
      error: data?.message || response.statusText || "Email provider error",
    });

    return {
      success: false,
      sent: false,
      status: response.status,
      error: data?.message || response.statusText || "Email provider error",
      result: data,
    };
  }

  logWorkerEvent("ALERT_EMAIL_SENT", {
    worker: WORKER_ENTRY,
    alertId,
    email,
    coin: coinLabel,
    targetPrice,
    currentPrice,
    resendId: data?.id || null,
  });

  await doPushForAlertOwner({
    alertId,
    email,
    userId,
    coin,
    targetPrice,
    currentPrice,
    source: "worker/index.js::sendTriggeredAlertEmail",
  });

  return {
    success: true,
    sent: true,
    status: response.status,
    id: data?.id || null,
    data,
  };
};

const shouldTriggerAlert = ({ condition, targetPrice, currentPrice }) => {
  const cleanCondition = normalizeCondition(condition);

  if (!Number.isFinite(targetPrice) || !Number.isFinite(currentPrice)) {
    return false;
  }

  if (cleanCondition === "below") {
    return currentPrice <= targetPrice;
  }

  return currentPrice >= targetPrice;
};

async function checkPriceAlerts() {
  const startedAt = new Date().toISOString();

  logWorkerEvent("ALERT_CHECK_STARTED", {
    worker: WORKER_ENTRY,
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    timestamp: startedAt,
    intervalMs: CHECK_INTERVAL_MS,
  });

  const summary = {
    checked: 0,
    uniqueCoins: 0,
    triggered: 0,
    notificationsCreated: 0,
    pushesSent: 0,
    pushesFailed: 0,
    pushesSkipped: 0,
    emailsQueued: 0,
    alertsUpdated: 0,
    skippedInvalid: 0,
    emailStats: null,
  };

  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("status", "active")
    .limit(MAX_ALERTS_PER_RUN);

  if (error) {
    logWorkerEvent("ALERT_CHECK_FINISHED", {
      ...summary,
      worker: WORKER_ENTRY,
      error: error.message,
    });
    return;
  }

  if (!alerts || alerts.length === 0) {
    logWorkerEvent("ALERT_CHECK_FINISHED", {
      ...summary,
      worker: WORKER_ENTRY,
    });
    return;
  }

  summary.checked = alerts.length;

  const alertsByCoin = new Map();

  for (const alert of alerts) {
    const coin = normalizeSymbol(alert.coin);

    if (!coin) {
      summary.skippedInvalid += 1;
      continue;
    }

    if (!alertsByCoin.has(coin)) {
      alertsByCoin.set(coin, []);
    }

    alertsByCoin.get(coin).push(alert);
  }

  summary.uniqueCoins = alertsByCoin.size;

  const triggeredItems = [];
  const emailJobs = [];

  for (const [coin, coinAlerts] of alertsByCoin.entries()) {
    try {
      const currentPrice = await getMarketPrice(coin);

      for (const alert of coinAlerts) {
        const targetPrice = Number(alert.target_price);
        const condition = normalizeCondition(alert.condition);
        const userEmail = String(alert.user_email || "").trim().toLowerCase();

        if (!userEmail || !Number.isFinite(targetPrice)) {
          summary.skippedInvalid += 1;
          continue;
        }

        const triggered = shouldTriggerAlert({
          condition,
          targetPrice,
          currentPrice,
        });

        if (!triggered) {
          continue;
        }

        const conditionLabel = getConditionLabel(condition);

        logWorkerEvent("PRICE_ALERT_TRIGGERED", {
          worker: WORKER_ENTRY,
          alertId: alert.id,
          email: userEmail,
          coin: formatCoinPair(coin),
          targetPrice,
          requestedPrice: targetPrice,
          currentPrice,
          condition,
          conditionLabel,
        });

        const notificationMessage = buildPriceAlertNotificationMessage({
          coin,
          targetPrice,
          currentPrice,
          condition,
        });

        const { data: notificationRow, error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_email: userEmail,
            title: "✅ وصل السعر إلى هدف التنبيه",
            message: notificationMessage,
            type: "price-alert",
            is_read: false,
          })
          .select("id")
          .single();

        if (notificationError) {
          logWorkerEvent("ALERT_NOTIFICATION_CREATED", {
            worker: WORKER_ENTRY,
            alertId: alert.id,
            email: userEmail,
            success: false,
            error: notificationError.message,
          });
        } else {
          summary.notificationsCreated += 1;
          logWorkerEvent("ALERT_NOTIFICATION_CREATED", {
            worker: WORKER_ENTRY,
            alertId: alert.id,
            email: userEmail,
            notificationId: notificationRow?.id || null,
            success: true,
          });
        }

        const { error: updateError } = await supabase
          .from("price_alerts")
          .update({
            status: "triggered",
            triggered_at: new Date().toISOString(),
            triggered_price: String(currentPrice),
          })
          .eq("id", alert.id);

        if (updateError) {
          logWorkerEvent("ALERT_STATUS_UPDATE_FAILED", {
            worker: WORKER_ENTRY,
            alertId: alert.id,
            error: updateError.message,
          });
        } else {
          summary.alertsUpdated += 1;
        }

        emailJobs.push({
          to: userEmail,
          alertId: alert.id,
          send: () =>
            sendTriggeredAlertEmail({
              email: userEmail,
              coin,
              condition,
              targetPrice,
              currentPrice,
              alertId: alert.id,
              userId: alert.user_id || null,
            }),
        });

        summary.emailsQueued += 1;
        summary.triggered += 1;

        logWorkerEvent("ALERT_EMAIL_QUEUED", {
          worker: WORKER_ENTRY,
          alertId: alert.id,
          email: userEmail,
          coin: formatCoinPair(coin),
          targetPrice,
          currentPrice,
        });

        triggeredItems.push({
          alertId: alert.id,
          email: userEmail,
          coin,
        });
      }
    } catch (error) {
      logWorkerEvent("ALERT_COIN_CHECK_FAILED", {
        worker: WORKER_ENTRY,
        coin,
        error: error?.message || String(error),
      });
    }
  }

  if (emailJobs.length > 0) {
    summary.emailStats = await processEmailQueue(emailJobs, {
      label: "price-alerts",
      worker: WORKER_ENTRY,
    });
  }

  logWorkerEvent("ALERT_CHECK_FINISHED", {
    ...summary,
    worker: WORKER_ENTRY,
    triggeredItems,
    finishedAt: new Date().toISOString(),
  });
}

app.get("/health", async (_req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "hasan-chart-worker",
    workerEntry: WORKER_ENTRY,
    priceAlertsModuleVersion: PRICE_ALERTS_MODULE_VERSION,
    alertsWorker: true,
    checkIntervalMs: CHECK_INTERVAL_MS,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/instant-analysis", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.body?.symbol);

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: "رمز العملة مطلوب",
      });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    analysisJobs.set(jobId, {
      id: jobId,
      status: "processing",
      symbol,
      createdAt: new Date().toISOString(),
    });

    process.nextTick(async () => {
      try {
        const candles = await getMarketCandles(symbol, "15m", 120);
        const currentPrice = candles[candles.length - 1]?.close || (await getMarketPrice(symbol));
        const technicalAnalysis = analyzeCandles(candles);
        const analysis = await generateOpenAiAnalysis({ symbol, currentPrice, candles, technicalAnalysis });

        analysisJobs.set(jobId, {
          id: jobId,
          status: "completed",
          result: analysis,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        analysisJobs.set(jobId, {
          id: jobId,
          status: "failed",
          error: error?.message || "ANALYSIS_FAILED",
          failedAt: new Date().toISOString(),
        });
      }
    });

    return res.json({
      success: true,
      queued: true,
      jobId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "SERVER_ERROR",
    });
  }
});

app.get("/api/instant-analysis/:jobId", async (req, res) => {
  try {
    const jobId = String(req.params?.jobId || "").trim();

    const job = analysisJobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "JOB_NOT_FOUND",
      });
    }

    return res.json({
      success: true,
      ...job,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "SERVER_ERROR",
    });
  }
});

app.listen(PORT, () => {
  logWorkerEvent("PRICE_ALERT_WORKER_STARTED", {
    worker: WORKER_ENTRY,
    service: "hasan-chart-price-alerts-worker",
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    port: PORT,
    checkIntervalMs: CHECK_INTERVAL_MS,
    priceAlertsEnabled: true,
    webPushConfigured: Boolean(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT
    ),
    note: "Price alert email + Web Push are sent from worker/index.js sendTriggeredAlertEmail",
  });

  logWorkerEvent("WORKER_BOOT", {
    worker: WORKER_ENTRY,
    service: "hasan-chart-price-alerts-worker",
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    port: PORT,
    checkIntervalMs: CHECK_INTERVAL_MS,
    priceAlertsEnabled: true,
    note: "Price alert email + Web Push are sent from worker/index.js sendTriggeredAlertEmail",
  });

  console.log(`🚀 Railway Worker API listening on port ${PORT}`);
});

logWorkerEvent("PRICE_ALERTS_SCHEDULER_DISABLED", {
  worker: WORKER_ENTRY,
  moduleVersion: PRICE_ALERTS_MODULE_VERSION,
  note: "Price alerts run on Next.js instrumentation (lib/price-alerts-runner sendTriggeredAlertEmail). Worker scheduler disabled to avoid duplicate emails.",
});
