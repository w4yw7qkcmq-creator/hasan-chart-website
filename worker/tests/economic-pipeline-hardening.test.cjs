#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { sanitizeSourceForParsing } = require(path.join(root, "lib/telegram-news/sanitize-source-for-parsing"));
const { resolveCanonicalEventKey } = require(path.join(root, "lib/economic-releases/canonical-events"));
const { composeSingleEditorial } = require(path.join(
  root,
  "lib/news-intelligence/economic-editorial/economic-editor"
));
const { buildStructuredEventFromFacts } = require(path.join(
  root,
  "lib/news-intelligence/economic-editorial/pipeline"
));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CRUDE_SOURCE = `🟥 صدر الآن :

🇺🇸 أمريكا
مخزون النفط الخام الأمريكي

▪️ السابق : 0.095M
▪️ المتوقع : -0.400M
▫️ الحالي : -4.450M

👈 النتيجة : إيجابي لأسعار النفط الأمريكي

لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:
Telegram.me/ForexBreakingNews
https://t.me/ForexBreakingNews`;

const ISM_SOURCE = `🟥 صدر الآن :

🇺🇸 أمريكا
مؤشر مديري المشتريات في القطاع غير الصناعي
الصادر عن معهد إدارة التوريدات

▪️ السابق : 54.1
▪️ المتوقع : 54.2
▫️ الحالي : 55.4

👈 النتيجة : إيجابي للدولار الأمريكي

لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة
https://t.me/ForexBreakingNews`;

const NO_READING_SOURCE = `صدر الآن
🇺🇸
تقرير الوظائف الأمريكية NFP

▪️ السابق: 150K
▪️ المتوقع: 180K
▫️ الحالي: 200K`;

function runCrudeOilTest() {
  const sanitized = sanitizeSourceForParsing(CRUDE_SOURCE);
  assert(sanitized.sourceRawText.includes("ForexBreakingNews"), "sourceRawText preserves audit source");
  assert(!sanitized.sanitizedText.includes("ForexBreakingNews"), "sanitizedText removes competitor branding");
  assert(!sanitized.sanitizedText.includes("لمتابعة"), "sanitizedText removes promo CTA");

  const post = {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "crude-1",
    sourcePublishedAt: "2026-09-04T12:00:00.000Z",
    sourceRawText: sanitized.sourceRawText,
    sanitizedText: sanitized.sanitizedText,
    rawText: sanitized.sanitizedText,
    sourceReading: sanitized.sourceReading,
  };
  const facts = extractFactsFromTelegramPost(post);
  assert(facts.canonicalEventKey === "US_EIA_CRUDE_OIL_INVENTORIES", "crude canonical");
  assert(facts.previous === "0.095M", "crude previous preserved");
  assert(facts.forecast === "-0.400M", "crude forecast preserved");
  assert(facts.actual === "-4.450M", "crude actual preserved");
  assert(facts.sourceReading?.direction === "POSITIVE", "crude reading direction");
  assert(facts.sourceReading?.asset === "OIL", "crude reading asset");
  assert(!facts.factualSummary.includes("لمتابعة"), "factualSummary excludes promo");
}

async function runCrudePhase2Test() {
  const facts = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "crude-2",
    sourcePublishedAt: "2026-09-04T12:00:00.000Z",
    sourceRawText: CRUDE_SOURCE,
    sanitizedText: sanitizeSourceForParsing(CRUDE_SOURCE).sanitizedText,
    rawText: sanitizeSourceForParsing(CRUDE_SOURCE).sanitizedText,
  });
  const structuredEvent = buildStructuredEventFromFacts(facts, { telegramStructuredEconomic: true });
  const result = await composeSingleEditorial(structuredEvent, {
    rawSourceText: CRUDE_SOURCE,
  });
  assert(result.ok === true, "crude phase2 passes quality gate");
  assert(result.body.includes("مخزون النفط الخام الأمريكي"), "crude headline");
  assert(result.body.includes("0.095M"), "crude body previous");
  assert(result.body.includes("-0.400M"), "crude body forecast");
  assert(result.body.includes("-4.450M"), "crude body actual");
  assert(result.body.includes("📊 القراءة:"), "crude reading section");
  assert(/داعمة|إيجاب/i.test(result.body), "crude source-derived reading");
  assert(!result.body.includes("ForexBreakingNews"), "crude final body has no competitor branding");
  assert(!/تأثير محدود|تعذر تحديد/i.test(result.body), "crude no invented reading");
}

function runEiaSiblingCollisionTests() {
  const cases = [
    ["US_EIA_GASOLINE_INVENTORIES", "Gasoline Inventories\n▪️ السابق: 1M\n▪️ المتوقع: -2M\n▫️ الحالي: -3M"],
    ["US_EIA_DISTILLATE_INVENTORIES", "Distillate Inventories\n▪️ السابق: 1M\n▪️ المتوقع: -2M\n▫️ الحالي: -3M"],
    ["US_EIA_CUSHING_CRUDE_INVENTORIES", "Cushing Crude Oil Inventories\n▪️ السابق: 1M\n▪️ المتوقع: -2M\n▫️ الحالي: -3M"],
  ];
  const keys = new Set();
  for (const [expected, text] of cases) {
    const key = resolveCanonicalEventKey(text, { countryCode: "US" }).eventKey;
    assert(key === expected, `${expected} resolves distinctly`);
    keys.add(key);
  }
  assert(keys.size === 3, "EIA siblings remain distinct");
}

function runIsmArabicTest() {
  const sanitized = sanitizeSourceForParsing(ISM_SOURCE);
  const facts = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "ism-1",
    sourcePublishedAt: "2026-09-04T12:00:00.000Z",
    sourceRawText: sanitized.sourceRawText,
    sanitizedText: sanitized.sanitizedText,
    rawText: sanitized.sanitizedText,
    sourceReading: sanitized.sourceReading,
  });
  assert(facts.canonicalEventKey === "US_ISM_NON_MANUFACTURING_PMI", "ISM non-manufacturing canonical");
  assert(facts.canonicalEventKey !== "US_PMI", "ISM does not fall through to US_PMI");
  assert(facts.canonicalDisplayName.includes("غير الصناعي"), "ISM display name semantics");
  assert(facts.sourceReading?.direction === "POSITIVE", "ISM reading direction");
}

async function runIsmPhase2Test() {
  const facts = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "ism-2",
    sourcePublishedAt: "2026-09-04T12:00:00.000Z",
    sourceRawText: ISM_SOURCE,
    sanitizedText: sanitizeSourceForParsing(ISM_SOURCE).sanitizedText,
    rawText: sanitizeSourceForParsing(ISM_SOURCE).sanitizedText,
  });
  const result = await composeSingleEditorial(buildStructuredEventFromFacts(facts, { telegramStructuredEconomic: true }), {
    rawSourceText: ISM_SOURCE,
  });
  assert(result.ok === true, "ISM phase2 passes");
  assert(result.body.includes("غير الصناعي"), "ISM headline semantics");
  assert(result.body.includes("54.1"), "ISM previous");
  assert(result.body.includes("55.4"), "ISM actual");
  assert(/إيجاب/i.test(result.body), "ISM source reading preserved");
  assert(!/تأثير محدود|تعذر تحديد|الذهب|الأسهم/i.test(result.body), "ISM no invented analysis");
}

async function runNoReadingTest() {
  const facts = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "nfp-1",
    sourcePublishedAt: "2026-09-04T12:00:00.000Z",
    rawText: NO_READING_SOURCE,
  });
  assert(!facts.sourceReading, "no source reading extracted");
  const result = await composeSingleEditorial(buildStructuredEventFromFacts(facts, { telegramStructuredEconomic: true }), {
    rawSourceText: NO_READING_SOURCE,
  });
  assert(result.ok === true, "no-reading event still publishes");
  assert(!result.body.includes("📊 القراءة:"), "no reading section when source has none");
  assert(!/تأثير محدود|تعذر تحديد|الذهب|الأسهم/i.test(result.body), "no invented impact");
}

function runPromoHardeningTest() {
  const sanitized = sanitizeSourceForParsing(CRUDE_SOURCE);
  const facts = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "promo-1",
    sourcePublishedAt: "2026-09-04T12:00:00.000Z",
    sourceRawText: sanitized.sourceRawText,
    sanitizedText: sanitized.sanitizedText,
    rawText: sanitized.sanitizedText,
  });
  assert(sanitized.sourceRawText.includes("Telegram.me/ForexBreakingNews"), "audit retains source URL");
  assert(!facts.factualSummary.includes("ForexBreakingNews"), "factualSummary excludes competitor");
  assert(!facts.sanitizedText.includes("انضم للقناة"), "sanitized excludes join CTA");
}

async function main() {
  runCrudeOilTest();
  await runCrudePhase2Test();
  runEiaSiblingCollisionTests();
  runIsmArabicTest();
  await runIsmPhase2Test();
  await runNoReadingTest();
  runPromoHardeningTest();
  console.log("economic-pipeline-hardening.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
