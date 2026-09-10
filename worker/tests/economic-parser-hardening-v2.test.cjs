#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

const { extractFactsFromTelegramPost, extractField } = require(path.join(root, "lib/telegram-news/extractor"));
const { sanitizeSourceForParsing } = require(path.join(root, "lib/telegram-news/sanitize-source-for-parsing"));
const { composeSingleEditorial } = require(path.join(root, "lib/news-intelligence/economic-editorial/economic-editor"));
const { buildStructuredEventFromFacts } = require(path.join(
  root,
  "lib/news-intelligence/economic-editorial/pipeline"
));
const { validateQualityGateV2 } = require(path.join(root, "lib/news-intelligence/economic-editorial/quality-gate-v2"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runEcbProductionReplay() {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(root, "fixtures/news-intelligence/golden/production-incident-ecb-inline-20260910.json"),
      "utf8"
    )
  );
  const { expected } = fixture;
  const sanitized = sanitizeSourceForParsing(fixture.sourceText);
  const facts = extractFactsFromTelegramPost({
    sourceChannel: fixture.post.sourceChannel,
    sourceMessageId: fixture.post.sourceMessageId,
    sourceRawText: sanitized.sourceRawText,
    sanitizedText: sanitized.sanitizedText,
    rawText: sanitized.sanitizedText,
    sourceReading: sanitized.sourceReading,
  });

  assert(facts.canonicalEventKey === expected.canonicalEventKey, "canonicalEventId");
  for (const phrase of expected.sourceEventNameContains || expected.headlineContains || []) {
    assert(facts.sourceEventName.includes(phrase), `sourceEventName missing ${phrase}`);
  }
  assert(facts.previous === expected.previous, `previous ${facts.previous}`);
  assert(facts.forecast === expected.forecast, `forecast ${facts.forecast}`);
  assert(facts.actual === expected.actual, `actual ${facts.actual}`);
  for (const bad of expected.mustNotContainInFacts) {
    assert(!String(facts.actual || "").includes(bad), `actual must not contain ${bad}`);
  }
  for (const phrase of expected.sourceReadingContains) {
    assert(facts.sourceReading?.raw?.includes(phrase), `sourceReading missing ${phrase}`);
  }
  assert(facts.numericFieldValidation?.ok === true, "numericFieldValidation");

  const structured = buildStructuredEventFromFacts(facts, { telegramStructuredEconomic: true });
  const result = await composeSingleEditorial(structured, { rawSourceText: fixture.sourceText });
  assert(result.ok, `phase2 blocked: ${result.detail || result.reason}`);

  const gate = validateQualityGateV2({
    structured: result.structured,
    body: result.body,
    structuredEvent: structured,
    rawSourceText: fixture.sourceText,
    telegramStructuredEconomic: true,
  });
  assert(gate.ok, `quality gate: ${gate.detail}`);

  assert(result.body.includes(expected.countryLine), "country line");
  assert(!/\bEZ\b| — EZ/.test(result.body), "no EZ leak");
  assert(result.body.includes("📊"), "reading section marker");
  assert(!/ForexBreakingNews|Telegram\.me/i.test(result.body), "no promo leak");

  return result.body;
}

function runAdversarialParserTests() {
  const cases = [
    ["compact", "السابق:%2.40 التقدير:%2.65 الحالي:%2.65", { p: "2.40%", f: "2.65%", a: "2.65%" }],
    [
      "decorated",
      "السابق: 2.40% ▪️ المتوقع: 2.65% ▫️ الحالي: 2.65%",
      { p: "2.40%", f: "2.65%", a: "2.65%" },
    ],
    ["reading tail", "▫️ الحالي: 162K 👈 النتيجة : إيجابي للدولار", { a: "162K" }],
    ["promo tail", "▫️ الحالي: -4.450M لمتابعة الأخبار", { a: "-4.450M" }],
    ["plain", "▫️ الحالي: 54.2", { a: "54.2" }],
  ];

  for (const [name, text, expected] of cases) {
    if (expected.p) assert(extractField(text, "previous") === expected.p, `${name} previous`);
    if (expected.f) assert(extractField(text, "forecast") === expected.f, `${name} forecast`);
    if (expected.a) assert(extractField(text, "actual") === expected.a, `${name} actual`);
  }
}

async function main() {
  const body = await runEcbProductionReplay();
  runAdversarialParserTests();
  console.log("ECB replay output:\n", body);
  console.log("economic-parser-hardening-v2.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
