#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const {
  generateRssEditorialDraft,
  RSS_EDITORIAL_ENDPOINT,
} = require(path.join(root, "lib/general-rss/rss-editorial-ai"));
const { EDITORIAL_CHAT_MODEL, EDITORIAL_REASONING_EFFORT } = require(path.join(root, "lib/openai/editorial-chat"));
const { validateGeneralRssEditorialOutput } = require(path.join(root, "lib/general-rss/editorial-safety"));

const API_KEY = "test-openai-key";
const TITLE = "Gold slips as the dollar rebounds";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function apiError(status, code, type, message) {
  const error = new Error("Request failed with status code " + status);
  error.response = {
    status,
    data: { error: { message, type, code } },
  };
  error.isAxiosError = true;
  return error;
}

function arabicDraft() {
  return "🚨 الذهب يتراجع مع صعود الدولار\n\nتراجعت أسعار الذهب بعد ارتفاع العملة الأمريكية في أسواق العملات.";
}

async function captureLogs(run) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => {
    lines.push(args.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "));
  };
  try {
    const result = await run();
    return { result, lines };
  } finally {
    console.error = original;
  }
}

async function postSuccess(url, body, config) {
  assert(url === RSS_EDITORIAL_ENDPOINT, "endpoint");
  assert(body.model === EDITORIAL_CHAT_MODEL, "model");
  assert(body.reasoning_effort === EDITORIAL_REASONING_EFFORT, "reasoning effort");
  assert(body.temperature === 0.4, "temperature");
  assert(body.max_completion_tokens === 350, "completion token budget");
  assert(body.max_tokens === undefined, "legacy max_tokens is not sent");
  assert(config.headers.Authorization === `Bearer ${API_KEY}`, "auth header stays on the request");
  assert(config.timeout === 12000, "timeout");
  return {
    data: {
      choices: [{ message: { content: arabicDraft() } }],
    },
  };
}

async function testSuccessfulArabicDraft() {
  const { result, lines } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    isEconomicReleaseTitle: () => false,
    httpPost: postSuccess,
  }));
  assert(result.message && result.message.includes("تراجعت أسعار الذهب"), "arabic body kept");
  assert(result.message.includes("https://t.me/EconomicNewsi"), "official channel footer kept");
  assert(!result.aiFailed, "success is not an AI failure");
  assert(!/https?:\/\/(?!t\.me\/EconomicNewsi)/.test(result.message), "source links stay removed");
  assert(lines.length === 0, "success does not log an API failure");
}

async function testModelUnavailable() {
  const { result, lines } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    httpPost: async () => {
      throw apiError(404, "model_not_found", "invalid_request_error", "The model has been deprecated");
    },
  }));
  assert(result.message === null, "model failure does not publish");
  assert(result.reason === "OPENAI_MODEL_UNAVAILABLE", "model failure reason");
  assert(lines.length === 1, "one concise log");
  assert(lines[0].includes("\"status\":404"), "status logged");
  assert(lines[0].includes("\"code\":\"model_not_found\""), "error code logged");
  assert(!lines[0].includes(API_KEY), "api key not logged");
  assert(!lines[0].includes("Authorization"), "auth header not logged");
  assert(!lines[0].includes("عنوان الخبر"), "request payload not logged");
}

async function testAuthenticationError() {
  const { result } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    httpPost: async () => {
      throw apiError(401, "invalid_api_key", "invalid_request_error", "Invalid API key");
    },
  }));
  assert(result.reason === "OPENAI_AUTH_ERROR", "auth reason");
  assert(result.message === null, "auth failure does not publish");
}

async function testQuotaAndRateLimit() {
  const { result: quota } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    httpPost: async () => {
      throw apiError(429, "insufficient_quota", "insufficient_quota", "You exceeded your current quota");
    },
  }));
  assert(quota.reason === "OPENAI_QUOTA_ERROR", "quota reason");

  const { result: rateLimit } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    httpPost: async () => {
      throw apiError(429, "rate_limit_exceeded", "rate_limit_error", "Rate limit reached");
    },
  }));
  assert(rateLimit.reason === "OPENAI_RATE_LIMIT", "rate limit reason");
  assert(quota.reason !== rateLimit.reason, "quota and rate limit stay distinct");
}

async function testEmptyResponse() {
  const { result } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    httpPost: async () => ({ data: { choices: [{ message: { content: "   " } }] } }),
  }));
  assert(result.reason === "OPENAI_RESPONSE_INVALID", "empty response reason");
  assert(result.message === null, "empty response does not publish");
}

async function testEnglishOnlyRejection() {
  const { result, lines } = await captureLogs(() => generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    isEconomicReleaseTitle: () => false,
    httpPost: async () => ({
      data: {
        choices: [{ message: { content: "Gold prices fell sharply after the dollar jumped in forex trading." } }],
      },
    }),
  }));
  assert(result.reason === "EDITORIAL_OUTPUT_INVALID", "english output stays an editorial rejection");
  assert(result.message === null, "english output is not published");
  assert(lines.length === 0, "editorial rejection is not logged as an API failure");
}

function testPublicationGuardsRemain() {
  const tooShort = validateGeneralRssEditorialOutput({
    title: "عنوان الخبر",
    body: "قصير",
    rawSourceText: "Gold slips as the dollar rebounds",
  });
  assert(tooShort.ok === false && tooShort.reason === "RSS_BODY_TOO_SHORT", "short body still blocked");

  const competitor = validateGeneralRssEditorialOutput({
    title: "عنوان الخبر",
    body: "هذا نص عربي طويل بما يكفي للنشر ولكنه يذكر forexLive داخل المتن بشكل غير مسموح به هنا.",
    rawSourceText: "A different source sentence about markets and currencies today.",
  });
  assert(competitor.ok === false && competitor.reason === "RSS_COMPETITOR_CHANNEL_PRESENT", "competitor mention still blocked");
}

async function testAcceptedDraftStillPassesGuards() {
  const result = await generateRssEditorialDraft(TITLE, {
    apiKey: API_KEY,
    timeoutMs: 12000,
    isEconomicReleaseTitle: () => false,
    httpPost: postSuccess,
  });
  const guard = validateGeneralRssEditorialOutput({
    title: TITLE,
    body: result.message,
    rawSourceText: "Gold slips as the dollar rebounds from a six week low in forex markets.",
  });
  assert(guard.ok === true, "accepted arabic draft still satisfies publication guards");
}

async function run() {
  await testSuccessfulArabicDraft();
  await testModelUnavailable();
  await testAuthenticationError();
  await testQuotaAndRateLimit();
  await testEmptyResponse();
  await testEnglishOnlyRejection();
  testPublicationGuardsRemain();
  await testAcceptedDraftStillPassesGuards();
  console.log("rss editorial openai tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
