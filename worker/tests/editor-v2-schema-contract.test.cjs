#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const {
  V2_EDITOR_JSON_SCHEMA,
  validateLocalEditorialSchema,
  classifyAiDirectApiFailure,
  buildEditorialPayload,
  parseEditorialJson,
  finalizeEditorialResponse,
} = require(path.join(root, "lib/general-rss/editor-v2/editorial-ai"));
const { AI_DIRECT_FAILURE_REASONS } = require(path.join(root, "lib/general-rss/editor-v2/reason-codes"));
const {
  buildCanonicalRssEvidence,
  buildStructuredFactsV2,
  validateEditorV2FactGuard,
  runEditorV2ShadowReview,
  resetEditorV2TelemetryForTests,
} = require(path.join(root, "lib/general-rss"));
const { buildDeterministicArabicFallback } = require(path.join(root, "lib/general-rss/editor-v2/deterministic-arabic-fallback"));
const { classifyNumericRole, NUMERIC_ROLES } = require(path.join(root, "lib/general-rss/editor-v2/numeric-semantics"));
const { extractActionFromEvidence, ACTION_CLASSES } = require(path.join(root, "lib/general-rss/editor-v2/action-resolution"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testStrictSchemaContract() {
  const props = Object.keys(V2_EDITOR_JSON_SCHEMA.schema.properties);
  const required = V2_EDITOR_JSON_SCHEMA.schema.required;
  assert(V2_EDITOR_JSON_SCHEMA.strict === true, "schema must stay strict");
  assert(
    props.every((key) => required.includes(key)),
    `strict schema cannot define optional properties: ${props.filter((k) => !required.includes(k)).join(", ")}`
  );
  assert(required.length === 4, "schema must expose exactly 4 fields");
}

function testLocalSchemaValidation() {
  assert(
    validateLocalEditorialSchema({
      headline: "عنوان",
      body: "نص",
      insufficientEvidence: false,
      confidence: 0.8,
    }) === null,
    "valid local schema must pass"
  );
  assert(
    validateLocalEditorialSchema({ headline: "x", body: "y", insufficientEvidence: "no", confidence: 1 }) ===
      AI_DIRECT_FAILURE_REASONS.AI_DIRECT_LOCAL_SCHEMA_VALIDATION_FAILED,
    "invalid insufficientEvidence must fail locally"
  );
}

function testApiFailureClassification() {
  const schemaRejected = classifyAiDirectApiFailure({
    response: { status: 400, data: { error: { message: "Invalid json_schema for response_format" } } },
  });
  assert(
    schemaRejected === AI_DIRECT_FAILURE_REASONS.AI_DIRECT_SCHEMA_REJECTED_BY_API,
    `expected schema rejected, got ${schemaRejected}`
  );
}

function testParserRoundTrip() {
  const payload = JSON.stringify({
    headline: "النفط: تراجع",
    body: "سجل النفط تراجعاً وفق المصدر.",
    insufficientEvidence: false,
    confidence: 0.91,
  });
  const { parsed, failure } = parseEditorialJson(payload);
  assert(!failure, "parser must accept valid JSON");
  const finalized = finalizeEditorialResponse(parsed, { evidenceSufficiencyLevel: "SUFFICIENT_MINIMAL" });
  assert(finalized.headline && finalized.body, "finalizer must preserve headline/body");
}

function testProductionFixtures() {
  const fixtures = [
    {
      id: "technical_fx",
      item: {
        title: "Kickstart the trading day with a technical look at the EURUSD, USDJPY and GBPUSD: Bias, Risk and Targets",
        contentSnippet:
          "Tom Barkin said rates may rise. ECB sources report policymakers ready to raise rates to 0.35pct in Sep. Technical analysis for major FX pairs.",
        sourceName: "ForexLive",
        link: "https://investinglive.com/technical-fx",
      },
      mustNotMatch: /Barkin|0\.35|البنك المركزي الأوروبي/u,
      mustMatch: /تحليل فني|EUR\/USD/u,
      expectAction: ACTION_CLASSES.TECHNICAL_ANALYSIS,
    },
    {
      id: "bitcoin_breather",
      item: {
        title: "Bitcoin takes a breather after adding 23% in 7 days as price nears $79000",
        contentSnippet: "Bitcoin paused after a 23% rally as it approaches $79000.",
        sourceName: "CoinDesk",
        link: "https://www.coindesk.com/bitcoin-breather",
      },
      mustNotMatch: /بمقدار\s+79000/u,
      mustMatch: /23%|79000|البيتكوين/u,
    },
    {
      id: "oil_price_quote",
      item: {
        title: "Crude oil futures sell at $82.36",
        contentSnippet: "Crude oil futures traded at $82.36.",
        sourceName: "ForexLive",
        link: "https://investinglive.com/crude-8236",
      },
      mustNotMatch: /بمقدار\s+82/u,
      mustMatch: /82\.36|النفط/u,
    },
    {
      id: "oil_slide_2",
      item: {
        title: "Oil slides $2 on unconfirmed report of US Iran ceasefire, Hormuz reopening",
        contentSnippet: "Crude fell $2 on unconfirmed ceasefire headlines.",
        sourceName: "ForexLive",
        link: "https://investinglive.com/oil-slides",
      },
      mustMatch: /بمقدار\s+2|2/u,
    },
  ];

  for (const fixture of fixtures) {
    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const facts = buildStructuredFactsV2(evidence);
    if (fixture.expectAction) {
      const action = extractActionFromEvidence(evidence);
      assert(action.actionClass === fixture.expectAction, `${fixture.id} action ${action.actionClass}`);
    }
    const editorial = buildDeterministicArabicFallback(evidence, facts);
    assert(!editorial.insufficientEvidence, `${fixture.id} must produce fallback`);
    const text = `${editorial.headline} ${editorial.body}`;
    if (fixture.mustMatch) assert(fixture.mustMatch.test(text), `${fixture.id} missing ${fixture.mustMatch}`);
    if (fixture.mustNotMatch) assert(!fixture.mustNotMatch.test(text), `${fixture.id} forbidden ${fixture.mustNotMatch} in ${text}`);
    const guard = validateEditorV2FactGuard({ evidence, facts, editorial });
    assert(guard.ok, `${fixture.id} fact guard failed: ${guard.reasonCode}`);
  }
}

function testNumericSemanticRoles() {
  const btcText = "Bitcoin takes a breather after adding 23% in 7 days as price nears $79000";
  assert(classifyNumericRole("23%", btcText) === NUMERIC_ROLES.PERCENT_MOVE);
  assert(classifyNumericRole("79000", btcText) === NUMERIC_ROLES.PRICE_LEVEL);
  assert(classifyNumericRole("7", btcText) === NUMERIC_ROLES.COUNT);
  assert(classifyNumericRole("$2", "Oil slides $2 on report") === NUMERIC_ROLES.ABSOLUTE_MOVE);
  assert(classifyNumericRole("82.36", "Crude oil futures sell at $82.36") === NUMERIC_ROLES.PRICE_LEVEL);
}

async function testSequentialIsolation() {
  const a = {
    title: "ECB sources report: Policymakers are ready to raise rates in Sep",
    contentSnippet: "ECB sources say policymakers are ready to raise rates in September.",
    sourceName: "ForexLive",
    link: "https://investinglive.com/ecb-a",
  };
  const b = {
    title: "Kickstart the trading day with a technical look at the EURUSD, USDJPY and GBPUSD: Bias, Risk and Targets",
    contentSnippet: "Technical analysis only.",
    sourceName: "ForexLive",
    link: "https://investinglive.com/tech-b",
  };
  const outA = buildDeterministicArabicFallback(buildCanonicalRssEvidence(a, "ForexLive"), buildStructuredFactsV2(buildCanonicalRssEvidence(a, "ForexLive")));
  const outB = buildDeterministicArabicFallback(buildCanonicalRssEvidence(b, "ForexLive"), buildStructuredFactsV2(buildCanonicalRssEvidence(b, "ForexLive")));
  assert(/البنك المركزي الأوروبي|ECB/u.test(`${outA.headline} ${outA.body}`), "candidate A keeps ECB");
  assert(!/Barkin|0\.35/u.test(`${outB.headline} ${outB.body}`), "candidate B must not inherit ECB/Barkin");
  assert(/تحليل فني/u.test(`${outB.headline} ${outB.body}`), "candidate B stays technical");
}

async function testConcurrentIsolation() {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    title: `Asset ${index} moves on headline-only story ${index}`,
    contentSnippet: `Unique snippet ${index} without cross references.`,
    sourceName: "ForexLive",
    link: `https://investinglive.com/isolation-${index}`,
  }));

  const results = await Promise.all(
    candidates.map(async (item) => {
      const evidence = buildCanonicalRssEvidence(item, item.sourceName);
      const facts = buildStructuredFactsV2(evidence);
      const editorial = buildDeterministicArabicFallback(evidence, facts);
      return { index: item.link, text: `${editorial.headline} ${editorial.body}` };
    })
  );

  for (const result of results) {
    for (const other of candidates) {
      if (other.link === result.index) continue;
      assert(!result.text.includes(other.title), `leaked title from ${other.link}`);
    }
  }
}

function testEditorialPayloadShape() {
  const evidence = buildCanonicalRssEvidence(
    {
      title: "Oil slides $2 on report",
      contentSnippet: "Crude fell $2.",
      sourceName: "ForexLive",
    },
    "ForexLive"
  );
  const facts = buildStructuredFactsV2(evidence);
  const payload = buildEditorialPayload(evidence, facts, {});
  assert(payload.response_format.type === "json_schema");
  assert(payload.response_format.json_schema.name === "editor_v2_editorial");
}

async function main() {
  testStrictSchemaContract();
  testLocalSchemaValidation();
  testApiFailureClassification();
  testParserRoundTrip();
  testNumericSemanticRoles();
  testProductionFixtures();
  await testSequentialIsolation();
  await testConcurrentIsolation();
  testEditorialPayloadShape();
  console.log("editor-v2-schema-contract.test.cjs PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
