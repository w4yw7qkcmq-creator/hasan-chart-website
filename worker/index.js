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

const CHECK_INTERVAL_MS = 15000;
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

const getFallbackAnalysis = ({ symbol, currentPrice }) => {
  const base = Number(currentPrice) || 1;
  const entry = base;
  const stopLoss = base * 0.985;
  const target1 = base * 1.015;
  const target2 = base * 1.03;

  return {
    success: true,
    symbol,
    trend: "neutral",
    direction: "neutral",
    currentPrice: base,
    summary: `تحليل ${symbol}: السعر حالياً عند ${formatNumber(base)}. الأفضل انتظار كسر واضح أو إعادة اختبار قبل الدخول.`,
    smartMoney: "SMC/ICT: راقب مناطق السيولة القريبة وأي CHOCH أو BOS واضح قبل اتخاذ القرار.",
    classic: "كلاسيكي: الاتجاه يحتاج تأكيد عبر كسر مقاومة أو فقدان دعم قريب.",
    risk: "إدارة المخاطر: لا تدخل بدون وقف خسارة واضح ولا تخاطر بأكثر من نسبة صغيرة من رأس المال.",
    entry,
    stopLoss,
    target1,
    target2,
    confidence: 55,
    scenario: "انتظار تأكيد الحركة هو الخيار الأفضل حالياً.",
    chartImage: buildAnalysisChartImage({
      symbol,
      currentPrice: base,
      direction: "neutral",
      entry,
      stopLoss,
      target1,
      target2,
    }),
    generatedAt: new Date().toISOString(),
  };
};

const generateOpenAiAnalysis = async ({ symbol, currentPrice }) => {
  if (!openaiApiKey) {
    return getFallbackAnalysis({ symbol, currentPrice });
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
            "أنت محلل كريبتو مؤسساتي احترافي لمنصة HasaN CharT World. مهمتك إنشاء تحليل لحظي احترافي جداً مثل TradingView والمؤسسات المالية. استخدم مفاهيم SMC و ICT والمدرسة الكلاسيكية مع BOS و CHOCH و Liquidity Sweep و Order Blocks و Fair Value Gap و Premium/Discount و Supply & Demand. يجب أن يكون التحليل قصير جداً لكنه قوي واحترافي. اكتب بلغة عربية احترافية. أعطِ Bias واضح للحركة القادمة. حدّد هل السوق Bullish أو Bearish أو Neutral. أعطِ أفضل Entry و Stop Loss و Target 1 و Target 2 بدقة. اشرح أين توجد السيولة ولماذا قد يتحرك السعر إليها. اجعل التحليل يبدو وكأنه صادر من محلل مؤسساتي محترف. لا تكتب أي مقدمات أو تحذيرات طويلة. لا تقدم وعود ربح. أعد JSON صالح فقط بدون markdown أو أي نص خارجي.",
        },
        {
          role: "user",
          content: JSON.stringify({
            symbol,
            currentPrice,
            requiredOutput: {
              trend: "bullish | bearish | neutral",
              direction: "bullish | bearish | neutral",
              summary: "سطرين كحد أقصى",
              smartMoney: "قراءة SMC/ICT مختصرة",
              classic: "قراءة كلاسيكية مختصرة",
              risk: "إدارة مخاطر مختصرة",
              entry: "number",
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
              analysis: "تحليل عربي مختصر ومنسق لا يتجاوز 8 أسطر",
            },
          }),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.log("❌ OpenAI analysis error:", JSON.stringify(data, null, 2));
    return getFallbackAnalysis({ symbol, currentPrice });
  }

  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);

  const entry = Number(parsed.entry) || Number(currentPrice);
  const stopLoss = Number(parsed.stopLoss) || Number(currentPrice) * 0.985;
  const target1 = Number(parsed.target1) || Number(currentPrice) * 1.015;
  const target2 = Number(parsed.target2) || Number(currentPrice) * 1.03;
  const direction = String(parsed.direction || parsed.trend || "neutral").toLowerCase();

  return {
    success: true,
    symbol,
    trend: parsed.trend || direction,
    direction,
    currentPrice,
    summary: parsed.summary || `تحليل ${symbol} عند ${formatNumber(currentPrice)}.` ,
    smartMoney: parsed.smartMoney || "راقب السيولة ومناطق الطلب والعرض قبل الدخول.",
    classic: parsed.classic || "انتظر تأكيد الكسر أو إعادة الاختبار.",
    risk: parsed.risk || "التزم بإدارة المخاطر ووقف خسارة واضح.",
    entry,
    stopLoss,
    target1,
    target2,
    confidence: Number(parsed.confidence) || 60,
    scenario: parsed.scenario || "الحركة المتوقعة تحتاج تأكيد من الإغلاق القادم.",
    chartImage: buildAnalysisChartImage({
      symbol,
      currentPrice,
      direction,
      entry,
      stopLoss,
      target1,
      target2,
    }),
    generatedAt: new Date().toISOString(),
  };
};

const sendTriggeredAlertEmail = async ({ email, coin, condition, targetPrice, currentPrice }) => {
  if (!resendApiKey || !email) {
    return {
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  const safeCoin = escapeHtml(coin);
  const conditionText = normalizeCondition(condition) === "below" ? "هبط السعر إلى" : "صعد السعر إلى";
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
      subject: `🔔 تحقق تنبيه ${safeCoin}`,
      html: `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border-radius:24px;overflow:hidden;border:1px solid rgba(34,211,238,0.18);box-shadow:0 0 40px rgba(37,99,235,0.22);">

          <tr>
            <td style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:34px 22px;text-align:center;">
              <div style="display:inline-block;background:rgba(2,6,23,0.28);border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:10px 18px;color:#ffffff;font-size:14px;font-weight:900;">
                🔔 Price Alert Triggered
              </div>

              <h1 style="margin:24px 0 0;color:#ffffff;font-size:34px;line-height:1.5;font-weight:900;text-align:center;">
                تم تفعيل تنبيه السعر
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 20px 10px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.16);border-radius:20px;padding:22px;color:#e2e8f0;font-size:20px;line-height:2.1;font-weight:600;text-align:center;">
                تم تفعيل التنبيه لعملة
                <strong style="color:#67e8f9;">${safeCoin}</strong>
                لأن السعر ${conditionText} المستوى المحدد.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 20px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="50%" style="padding-left:6px;">
                    <div style="background:#0b1b3a;border:1px solid rgba(34,211,238,0.16);border-radius:18px;padding:22px;text-align:center;">
                      <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:10px;">
                        السعر المستهدف
                      </div>

                      <div style="color:#67e8f9;font-size:28px;font-weight:900;word-break:break-word;">
                        ${safeTargetPrice}
                      </div>
                    </div>
                  </td>

                  <td width="50%" style="padding-right:6px;">
                    <div style="background:#0b1b3a;border:1px solid rgba(34,211,238,0.16);border-radius:18px;padding:22px;text-align:center;">
                      <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:10px;">
                        السعر الحالي
                      </div>

                      <div style="color:#ffffff;font-size:28px;font-weight:900;word-break:break-word;">
                        ${safeCurrentPrice}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
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

  return {
    sent: response.ok,
    status: response.status,
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
  console.log("🔍 Checking active price alerts...");

  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("status", "active")
    .limit(MAX_ALERTS_PER_RUN);

  if (error) {
    console.log("❌ Error fetching price alerts:", error.message);
    return;
  }

  if (!alerts || alerts.length === 0) {
    console.log("📭 No active price alerts.");
    return;
  }

  const priceCache = new Map();

  for (const alert of alerts) {
    const coin = normalizeSymbol(alert.coin);
    const targetPrice = Number(alert.target_price);
    const condition = normalizeCondition(alert.condition);

    if (!alert.user_email || !coin || !Number.isFinite(targetPrice)) {
      console.log("⚠️ Skipping invalid alert:", alert.id);
      continue;
    }

    try {
      let currentPrice = priceCache.get(coin);

      if (!currentPrice) {
        currentPrice = await getMarketPrice(coin);
        priceCache.set(coin, currentPrice);
      }

      console.log(
        `📊 ${coin}: current=${formatNumber(currentPrice)} target=${formatNumber(targetPrice)} condition=${condition}`
      );

      const triggered = shouldTriggerAlert({
        condition,
        targetPrice,
        currentPrice,
      });

      if (!triggered) continue;

      console.log("🚨 Price alert triggered:", coin, alert.user_email);

      const emailResult = await sendTriggeredAlertEmail({
        email: alert.user_email,
        coin,
        condition,
        targetPrice,
        currentPrice,
      });

      if (!emailResult.sent) {
        console.log("❌ Alert email failed:", JSON.stringify(emailResult, null, 2));
        continue;
      }

      const { error: updateError } = await supabase
        .from("price_alerts")
        .update({
          status: "triggered",
        })
        .eq("id", alert.id);

      if (updateError) {
        console.log("❌ Alert status update error:", updateError.message);
      } else {
        console.log("✅ Alert email sent and status updated:", coin);
      }
    } catch (error) {
      console.log("❌ Price alert processing error:", coin, error?.message || error);
    }
  }
}

app.get("/health", async (_req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "hasan-chart-worker",
    alertsWorker: true,
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
        const currentPrice = await getMarketPrice(symbol);
        const analysis = await generateOpenAiAnalysis({ symbol, currentPrice });

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
  console.log(`🚀 Railway Worker API listening on port ${PORT}`);
});

setInterval(checkPriceAlerts, CHECK_INTERVAL_MS);

console.log("🚀 Price Alerts + AI Worker started...");
checkPriceAlerts();