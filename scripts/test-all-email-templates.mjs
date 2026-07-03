/**
 * Validates unified email branding and optionally sends test messages via Resend.
 * Usage:
 *   node scripts/test-all-email-templates.mjs
 *   node scripts/test-all-email-templates.mjs --send-to=user@example.com
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const require = createRequire(import.meta.url);
const { buildPriceAlertEmailPayload } = require(resolve(root, "worker/price-alert-email.js"));

const emailModule = await import(pathToFileURL(resolve(root, "lib/email.js")).href);
const layoutModule = await import(pathToFileURL(resolve(root, "lib/email-layout.js")).href);
const edgeLayoutModule = await import(
  pathToFileURL(resolve(root, "supabase/functions/_shared/email-layout.ts")).href
).catch(() => null);

const {
  buildEmailLayout,
  getSiteUrl,
} = emailModule;

const {
  buildAnalysisReplyEmailHtml,
  buildVipSignalEmailContent,
  buildSubscriptionExpiryEmailContent,
  buildAdminSubscriptionRequestEmailContent,
  buildAdminAccountRequestEmailContent,
  EMAIL_LAYOUT_VERSION,
} = layoutModule;

const REQUIRED_MARKERS = [
  'lang="ar"',
  'dir="rtl"',
  "HasaN CharT World",
  "linear-gradient(135deg,#06b6d4,#2563eb)",
  "class=\"email-header\"",
  "class=\"email-footer\"",
  "class=\"email-btn\"",
  "© HasaN CharT World",
  "https://www.hasanchartworld.com",
  "Cairo",
  "mso-hide:all",
  'alt="شعار HasaN CharT World"',
  "linear-gradient(90deg,transparent,#334155",
];

const FORBIDDEN_MARKERS = [
  "background:#f8fafc",
  "background:white",
  "email-logo.png",
  "هذه رسالة آلية من منصة",
  "linear-gradient(135deg,#0ea5e9,#2563eb)",
  EMAIL_LAYOUT_VERSION === "hasan-chart-dark-v2" ? "__never__" : "",
].filter(Boolean);

function validateHtml(label, html) {
  const missing = REQUIRED_MARKERS.filter((marker) => !html.includes(marker));
  const forbidden = FORBIDDEN_MARKERS.filter((marker) => html.includes(marker));

  return {
    label,
    ok: missing.length === 0 && forbidden.length === 0,
    missing,
    forbidden,
    length: html.length,
  };
}

function buildAllSamples() {
  const siteUrl = getSiteUrl();

  return [
    {
      id: "price-alert",
      subject: "[TEST] تنبيه السعر",
      html: buildPriceAlertEmailPayload({
        email: "test@example.com",
        coinLabel: "BTC-USDT",
        conditionLabel: "وصول السعر للأعلى",
        targetPrice: "65000",
        currentPrice: "65012.45",
        alertId: "template-test",
      }).html,
      from: "HasaN CharT Alerts <alerts@hasanchartworld.com>",
    },
    {
      id: "analysis-reply",
      subject: "[TEST] رد التحليل",
      html: buildAnalysisReplyEmailHtml({
        coin: "BTCUSDT",
        reply: "هذا رد تجريبي على طلب التحليل للتحقق من القالب الموحد.",
        siteUrl,
      }),
    },
    {
      id: "analysis-reply-edge",
      subject: "[TEST] رد التحليل (Edge)",
      html: edgeLayoutModule
        ? edgeLayoutModule.buildAnalysisReplyEmailHtml({
            coin: "ETHUSDT",
            reply: "رد تجريبي من Edge Function layout.",
          })
        : buildAnalysisReplyEmailHtml({
            coin: "ETHUSDT",
            reply: "رد تجريبي (fallback — Edge TS not loaded).",
            siteUrl,
          }),
    },
    {
      id: "vip-signal",
      subject: "[TEST] VIP Signal",
      html: buildEmailLayout({
        title: "🚨 توصية VIP Spot جديدة",
        content: buildVipSignalEmailContent({
          coin: "BTCUSDT",
          entry: "65000 - 64500",
          targets: "66000\n67000",
          stopLoss: "63800",
          notes: "اختبار قالب VIP",
        }),
        actionText: "فتح صفحة التوصيات",
        actionUrl: `${siteUrl}/vip-spot`,
        preheader: "توصية VIP تجريبية — BTCUSDT",
      }),
    },
    {
      id: "subscription-request",
      subject: "[TEST] طلب اشتراك",
      html: buildEmailLayout({
        title: "طلب اشتراك جديد 💳",
        content: buildAdminSubscriptionRequestEmailContent({
          planName: "VIP Spot - 3 Months",
          category: "spot",
          price: "$99",
          userEmail: "test@example.com",
          username: "test_user",
          telegramUsername: "@test_user",
          paymentProofHtml: "صورة إثبات الدفع محفوظة داخل الطلب",
        }),
        actionText: "فتح لوحة الإدارة",
        actionUrl: `${siteUrl}/admin`,
      }),
    },
    {
      id: "account-management",
      subject: "[TEST] طلب إدارة حساب",
      html: buildEmailLayout({
        title: "طلب إدارة حساب جديد 📂",
        content: buildAdminAccountRequestEmailContent({
          email: "test@example.com",
          platform: "Binance",
          capital: "$5000",
          accountType: "Futures",
          contactMethod: "Telegram",
        }),
        actionText: "فتح لوحة الإدارة",
        actionUrl: `${siteUrl}/admin`,
      }),
    },
    {
      id: "subscription-reminder",
      subject: "[TEST] تذكير انتهاء الاشتراك",
      html: buildEmailLayout({
        title: "باقي 3 أيام على انتهاء اشتراكك ⏳",
        content: buildSubscriptionExpiryEmailContent({
          planName: "VIP Spot - 3 Months",
          message: "باقي 3 أيام على انتهاء VIP Spot - 3 Months.",
          variant: "reminder",
        }),
        actionText: "تجديد الاشتراك",
        actionUrl: `${siteUrl}/subscriptions`,
      }),
    },
    {
      id: "subscription-expired",
      subject: "[TEST] انتهاء الاشتراك",
      html: buildEmailLayout({
        title: "انتهت صلاحية اشتراكك ⚠️",
        content: buildSubscriptionExpiryEmailContent({
          planName: "VIP Spot - 3 Months",
          variant: "expired",
        }),
        actionText: "تجديد الاشتراك",
        actionUrl: `${siteUrl}/subscriptions`,
      }),
    },
  ];
}

async function sendViaResend({ to, from, subject, html }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: from || "HasaN CharT World <support@hasanchartworld.com>",
      to: [to],
      subject,
      html,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || response.statusText || "Resend error");
  }

  return data;
}

async function main() {
  const sendToArg = process.argv.find((arg) => arg.startsWith("--send-to="));
  const sendTo = sendToArg ? sendToArg.split("=")[1]?.trim() : "";

  const samples = buildAllSamples();
  const results = samples.map((sample) => validateHtml(sample.id, sample.html));

  console.log("EMAIL_TEMPLATE_VALIDATION", {
    layoutVersion: EMAIL_LAYOUT_VERSION,
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
  });

  for (const result of results) {
    console.log(result.ok ? "PASS" : "FAIL", result.label, {
      missing: result.missing,
      forbidden: result.forbidden,
      length: result.length,
    });
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!sendTo) {
    console.log("SEND_SKIPPED: pass --send-to=email to deliver test messages via Resend");
    return;
  }

  console.log("EMAIL_SEND_START", { to: sendTo, count: samples.length });

  for (const sample of samples) {
    const data = await sendViaResend({
      to: sendTo,
      from: sample.from,
      subject: sample.subject,
      html: sample.html,
    });

    console.log("EMAIL_SENT", {
      id: sample.id,
      resendId: data?.id || null,
      subject: sample.subject,
    });

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
  }

  console.log("EMAIL_SEND_DONE", { to: sendTo, count: samples.length });
}

main().catch((error) => {
  console.error("test-all-email-templates: FAILED", error?.message || error);
  process.exit(1);
});
