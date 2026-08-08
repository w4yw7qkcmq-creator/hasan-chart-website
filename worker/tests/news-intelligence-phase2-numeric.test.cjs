#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const {
  validateNumericTokenIntegrity,
  extractNumericTokens,
  normalizeTokenForCompare,
} = require(path.join(__dirname, "..", "lib", "news-intelligence", "economic-editorial", "numeric-integrity"));

const {
  composeSingleEditorial,
} = require(path.join(__dirname, "..", "lib", "news-intelligence", "economic-editorial", "economic-editor"));

async function testLegitimateRepresentations() {
  const facts = { actual: "199K", forecast: "203K", previous: "197K" };
  const body = "الحالي: 199K\nالمتوقع: 203K\nالسابق: 197K";
  assert.strictEqual(validateNumericTokenIntegrity(body, facts, { structuredEvent: { eventType: "US_INITIAL_JOBLESS_CLAIMS" } }).ok, true);
}

async function testPercentagesAndRates() {
  const facts = { actual: "2.0%", forecast: "2.1%", previous: "1.9%" };
  const body = "الحالي: 2.0%\nالمتوقع: 2.1%\nالسابق: 1.9%";
  assert.strictEqual(validateNumericTokenIntegrity(body, facts, { structuredEvent: { eventType: "US_CPI_MOM" } }).ok, true);

  const rateFacts = { actual: "5.25%", forecast: "5.00%", previous: "5.25%" };
  const rateBody = "الحالي: 5.25%\nالمتوقع: 5.00%\nالسابق: 5.25%";
  assert.strictEqual(validateNumericTokenIntegrity(rateBody, rateFacts, { structuredEvent: { eventType: "US_FED_RATE_DECISION" } }).ok, true);
}

async function testNegativeAndDecimal() {
  const facts = { actual: "-0.2%", forecast: "0.1%", previous: "0.0%" };
  const body = "الحالي: -0.2%\nالمتوقع: 0.1%\nالسابق: 0.0%";
  assert.strictEqual(validateNumericTokenIntegrity(body, facts, { structuredEvent: { eventType: "US_GDP_QOQ" } }).ok, true);
}

async function testPmiThresholdAllowed() {
  const body =
    "📊 القراءة:\nجاءت القراءة فوق مستوى 50، ما يشير إلى التوسع.\nالحالي: 52.1\nالمتوقع: 51.0\nالسابق: 49.8";
  const facts = { actual: "52.1", forecast: "51.0", previous: "49.8" };
  const check = validateNumericTokenIntegrity(body, facts, { structuredEvent: { eventType: "US_ISM_MANUFACTURING" } });
  assert.strictEqual(check.ok, true, check.token || "pmi threshold should be allowed");
}

async function testHallucinatedStillBlocked() {
  const facts = { actual: "199K", forecast: "203K", previous: "197K" };
  const body = "الحالي: 999K\nالمتوقع: 203K\nالسابق: 197K";
  assert.strictEqual(validateNumericTokenIntegrity(body, facts, { structuredEvent: { eventType: "US_INITIAL_JOBLESS_CLAIMS" } }).ok, false);
}

async function testEditorialBodyPassesIntegrity() {
  const event = {
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    actual: "199K",
    forecast: "203K",
    previous: "197K",
    canonicalFacts: { actual: "199K", forecast: "203K", previous: "197K" },
  };
  const editorial = await composeSingleEditorial(event, {
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  assert.strictEqual(editorial.ok, true);
  const tokens = extractNumericTokens(editorial.body);
  assert.ok(tokens.includes("199K"));
  assert.ok(tokens.includes("203K"));
  assert.ok(tokens.includes("197K"));
  assert.strictEqual(normalizeTokenForCompare("199,000"), "199K");
}

async function main() {
  await testLegitimateRepresentations();
  await testPercentagesAndRates();
  await testNegativeAndDecimal();
  await testPmiThresholdAllowed();
  await testHallucinatedStillBlocked();
  await testEditorialBodyPassesIntegrity();
  console.log("news-intelligence-phase2-numeric.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error("news-intelligence-phase2-numeric.test.cjs FAIL", error);
  process.exit(1);
});
