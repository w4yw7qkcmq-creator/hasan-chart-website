#!/usr/bin/env node

const path = require("path");

const root = path.join(__dirname, "..");

const {
  buildCanonicalRssEvidence,
  buildStructuredFactsV2,
  validateEditorV2FactGuard,
  runEditorV2ShadowReview,
  V2_REASON_CODES,
  evaluateRssCuratorGate,
  CURATOR_OUTCOMES,
  buildRssEventFingerprint,
  evaluateRssDuplicate,
  resetEditorV2TelemetryForTests,
  getEditorV2TelemetrySnapshot,
} = require(path.join(root, "lib/general-rss"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const KASHKARI_ITEM = {
  title: "Minneapolis Fed President Neel Kashkari comments on Treasury market conditions",
  contentSnippet: "Neel Kashkari said Treasury market liquidity may remain strained in the near term.",
  link: "https://www.cnbc.com/kashkari-treasury",
  sourceName: "CNBC",
};

const WARSH_ITEM = {
  title: "Federal Reserve Chair Kevin Warsh says rates may stay higher for longer",
  contentSnippet: "Fed Chair Kevin Warsh said interest rates may stay higher for longer.",
  link: "https://www.cnbc.com/warsh-rates",
  sourceName: "CNBC",
};

const GOLD_NUMERIC_ITEM = {
  title: "Gold trades at 4,530 as yields hold 4.25%",
  contentSnippet: "Gold traded near 4,530 while benchmark yields held around 4.25%.",
  sourceName: "CNBC",
};

const NVIDIA_LISTICLE_ITEM = {
  title: "Here are 10 things to watch in the stock market Monday including Nvidia",
  contentSnippet: "Investors should watch Nvidia, earnings, and the Fed this week.",
  sourceName: "CNBC",
};

const NVIDIA_EARNINGS_ITEM = {
  title: "Nvidia beats earnings expectations and raises guidance",
  contentSnippet: "Nvidia reported stronger-than-expected earnings and raised full-year guidance.",
  sourceName: "CNBC",
};

const QUOTE_ITEM = {
  title: "CEO said conditions may improve",
  contentSnippet: "The CEO said conditions may improve later this year.",
  sourceName: "CNBC",
};

async function testKashkariWrongRoleFails() {
  const evidence = buildCanonicalRssEvidence(KASHKARI_ITEM, "CNBC");
  const facts = buildStructuredFactsV2(evidence);
  const guard = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "رئيس الاحتياطي الفيدرالي كاشkari يعلق على سوق الخزانة",
      body: "قال كاشkari إن السيولة في سوق الخزانة قد تبقى ضيقة.",
      insufficientEvidence: false,
    },
  });
  assert(!guard.ok, "Kashkari Fed Chair upgrade must fail");
  assert(guard.reasonCode === V2_REASON_CODES.V2_ROLE_MISMATCH, "Expected role mismatch");
}

async function testKashkariCorrectRolePassesGuard() {
  const evidence = buildCanonicalRssEvidence(KASHKARI_ITEM, "CNBC");
  const facts = buildStructuredFactsV2(evidence);
  const guard = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "رئيس بنك الاحتياطي الفيدرالي في مينيابوليس نيل كاشkari يعلق على سوق الخزانة",
      body: "قال نيل كاشkari إن سيولة سوق الخزانة قد تبقى ضيقة على المدى القريب.",
      insufficientEvidence: false,
    },
  });
  assert(guard.ok, "Correct Kashkari regional role must pass fact guard");
}

async function testWarshCorrectRolePasses() {
  const evidence = buildCanonicalRssEvidence(WARSH_ITEM, "CNBC");
  const facts = buildStructuredFactsV2(evidence);
  const guard = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "رئيس الاحتياطي الفيدرالي كيفن وارش: الفائدة قد تبقى مرتفعة",
      body: "قال كيفن وارش إن أسعار الفائدة قد تبقى مرتفعة لفترة أطول.",
      insufficientEvidence: false,
    },
  });
  assert(guard.ok, "Source-supported Warsh chair role must pass");
}

async function testNumericIntegrity() {
  const evidence = buildCanonicalRssEvidence(GOLD_NUMERIC_ITEM, "CNBC");
  const facts = buildStructuredFactsV2(evidence);
  const pass = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "الذهب عند 4530",
      body: "استقر الذهب قرب 4530 والعائد عند 4.25%.",
      insufficientEvidence: false,
    },
  });
  assert(pass.ok, "Equivalent numeric formatting must pass");

  const fail = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "الذهب عند 4350",
      body: "استقر الذهب قرب 4350 والعائد عند 4.25%.",
      insufficientEvidence: false,
    },
  });
  assert(!fail.ok, "Numeric drift must fail");
  assert(fail.reasonCode === V2_REASON_CODES.V2_NUMERIC_MISMATCH, "Expected numeric mismatch");
}

async function testQuoteAndUncertaintyIntegrity() {
  const evidence = buildCanonicalRssEvidence(QUOTE_ITEM, "CNBC");
  const facts = buildStructuredFactsV2(evidence);
  const allowed = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "تصريحات الرئيس التنفيذي حول تحسن الظروف",
      body: "قال الرئيس التنفيذي إن الظروف قد تتحسن لاحقاً هذا العام.",
      insufficientEvidence: false,
    },
  });
  assert(allowed.ok, "Paraphrase preserving uncertainty must pass");

  const forbidden = validateEditorV2FactGuard({
    evidence,
    facts,
    editorial: {
      headline: "الرئيس التنفيذي: الظروف ستتحسن بالتأكيد",
      body: "أكد الرئيس التنفيذي أن الظروف ستتحسن بالتأكيد.",
      insufficientEvidence: false,
    },
  });
  assert(!forbidden.ok, "Certainty upgrade must fail");
}

function testNewsworthinessFixtures() {
  const listicle = evaluateRssCuratorGate(NVIDIA_LISTICLE_ITEM);
  assert(!listicle.ok, "Listicle must be skipped");
  assert(listicle.outcome === CURATOR_OUTCOMES.SKIP_LISTICLE, "Expected listicle skip");

  const earnings = evaluateRssCuratorGate(NVIDIA_EARNINGS_ITEM);
  assert(earnings.ok, "Material earnings development must pass curator");
}

function testOilIranDedupeRegression() {
  const first = buildRssEventFingerprint({
    title: "Oil falls after Iran sanctions escalation",
    contentSnippet: "Crude prices retreated after Washington threatened harsher Iran sanctions.",
  });
  const second = buildRssEventFingerprint({
    title: "Crude retreats as Washington threatens harsher Iran sanctions",
    contentSnippet: "Oil prices dropped on renewed Iran sanction fears.",
  });
  assert(first === second, "Same sanctions event must share fingerprint");

  const duplicate = evaluateRssDuplicate(
    {
      title: "Crude retreats as Washington threatens harsher Iran sanctions",
      contentSnippet: "Oil prices dropped on renewed Iran sanction fears.",
      link: "https://example.com/2",
    },
    [
      {
        title: "Oil falls after Iran sanctions escalation",
        contentSnippet: "Crude prices retreated after Washington threatened harsher Iran sanctions.",
        link: "https://example.com/1",
        rssEventFingerprint: first,
      },
    ]
  );
  assert(duplicate.duplicate, "Oil/Iran duplicate must still dedupe");
}

async function testFullShadowPipelineDeterministic() {
  resetEditorV2TelemetryForTests();
  const result = await runEditorV2ShadowReview(
    { item: KASHKARI_ITEM },
    { disableAi: true }
  );
  assert(result.mode === "SHADOW", "V2 must remain shadow");
  assert(typeof result.ok === "boolean", "Shadow pipeline must return terminal decision");
  const telemetry = getEditorV2TelemetrySnapshot();
  assert(telemetry.global.shadowAttempted >= 1, "V2 shadow telemetry must record attempt");
}

function testTelegramIsolationStatic() {
  const fs = require("fs");
  const newsWorker = fs.readFileSync(path.join(root, "news-worker.js"), "utf8");
  const atomicPublish = fs.readFileSync(path.join(root, "lib/telegram-news/atomic-publish.js"), "utf8");
  assert(newsWorker.includes("scheduleEditorV2ShadowReview"), "V2 shadow wired in news-worker");
  assert(!atomicPublish.includes("editor-v2"), "Telegram atomic publish isolated from V2");
  assert(
    /if \(!latestNews\.isTelegramSource\) \{[\s\S]*scheduleEditorV2ShadowReview/.test(newsWorker),
    "V2 shadow only inside RSS guard"
  );
}

async function run() {
  await testKashkariWrongRoleFails();
  await testKashkariCorrectRolePassesGuard();
  await testWarshCorrectRolePasses();
  await testNumericIntegrity();
  await testQuoteAndUncertaintyIntegrity();
  testNewsworthinessFixtures();
  testOilIranDedupeRegression();
  await testFullShadowPipelineDeterministic();
  testTelegramIsolationStatic();
  console.log("editor-v2-golden-fixtures tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
