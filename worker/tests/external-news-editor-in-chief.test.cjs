#!/usr/bin/env node

const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const {
  extractRssSourceEvidence,
  extractStructuredSourceFacts,
  validateExternalNewsDraftIntegrity,
  reviewExternalNewsBeforePublish,
  resetExternalNewsEditorStateForTests,
  EDITOR_REASON_CODES,
} = require(path.join(root, "lib/general-rss/external-news-editor"));
const {
  classifyImageVisualType,
  VISUAL_TYPES,
  resolveRssSourceImageWithChartPolicy,
  resetChartPolicyStateForTests,
  getChartPolicyTelemetrySnapshot,
} = require(path.join(root, "lib/general-rss/chart-visual-policy"));
const { getEditorTelemetrySnapshot } = require(path.join(root, "lib/general-rss/external-news-editor/telemetry"));
const { validateSemanticPublication } = require(path.join(root, "lib/news-intelligence/semantic-publication-validation"));
const { buildRssPublicationPresentation } = require(path.join(root, "lib/general-rss/publication-format"));

const FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  resetExternalNewsEditorStateForTests();
  resetChartPolicyStateForTests();

  const kashkariEvidence = extractRssSourceEvidence(
    {
      title: "Minneapolis Fed President Neel Kashkari says inflation may ease",
      contentSnippet: "Neel Kashkari said inflation may ease later this year.",
      link: "https://www.cnbc.com/kashkari",
    },
    "CNBC"
  );
  const kashkariFacts = extractStructuredSourceFacts(kashkariEvidence);
  assert(kashkariFacts.people.some((p) => p.id === "NEEL_KASHKARI"), "Kashkari extracted from source");

  const badKashkariBody =
    `🚨 رئيس الاحتياطي الفيدرالي نيل كاشkari: التضخم قد يتراجع` +
    `\n\nقال مسؤولون إن التضخم قد يتراجع خلال الفترة المقبلة حسب ما ورد في التصريح.` +
    FOOTER;
  const kashkariPresentation = buildRssPublicationPresentation({
    sourceTitle: kashkariEvidence.sourceTitle,
    editorialMessage: badKashkariBody,
    imageTitle: "رئيس الاحتياطي الفيدرالي نيل كاشkari",
  });
  const kashkariReview = await reviewExternalNewsBeforePublish(
    {
      item: { title: kashkariEvidence.sourceTitle, sourceName: "CNBC", impactLevel: "MEDIUM" },
      editorialMessage: badKashkariBody,
      rssPresentation: kashkariPresentation,
      evidence: kashkariEvidence,
      facts: kashkariFacts,
    },
    { disableAi: true }
  );
  assert(kashkariReview.ok, "Kashkari wrong role should repair and approve");
  assert(
    !/رئيس الاحتياطي الفيدرالي/i.test(kashkariReview.publicationMessage) ||
      /مينيابولis|مينيابولis|مينيابولis/i.test(kashkariReview.publicationMessage),
    "Kashkari repaired role must not keep Fed Chair title"
  );

  const warshEvidence = extractRssSourceEvidence(
    {
      title: "Federal Reserve Chair Kevin Warsh says rates may stay higher",
      contentSnippet: "Fed Chair Kevin Warsh said rates may stay higher for longer.",
    },
    "CNBC"
  );
  const warshFacts = extractStructuredSourceFacts(warshEvidence);
  assert(warshFacts.people.some((p) => p.id === "KEVIN_WARSH"), "Warsh extracted");
  const warshBody =
    `🚨 رئيس الاحتياطي الفيدرالي كيفن وارش: الفائدة قد تبقى مرتفعة` +
    `\n\nأشار كيفن وارش إلى أن الفائدة قد تبقى مرتفعة لفترة أطول.` +
    FOOTER;
  const warshReview = await reviewExternalNewsBeforePublish(
    {
      item: { title: warshEvidence.sourceTitle, sourceName: "CNBC", impactLevel: "MEDIUM" },
      editorialMessage: warshBody,
      rssPresentation: buildRssPublicationPresentation({
        sourceTitle: warshEvidence.sourceTitle,
        editorialMessage: warshBody,
      }),
      evidence: warshEvidence,
      facts: warshFacts,
    },
    { disableAi: true }
  );
  assert(warshReview.ok, "Warsh chair attribution should approve");

  const numericEvidence = extractRssSourceEvidence(
    { title: "Gold trades at 4,530 as yields hold 4.25%", contentSnippet: "Gold at 4,530 and yields at 4.25%." },
    "CNBC"
  );
  const numericFacts = extractStructuredSourceFacts(numericEvidence);
  const numericBad =
    `🚨 الذهب عند 4350` + `\n\nارتفع الذهب إلى 4350 بينما استقر العائد عند 4.5%.` + FOOTER;
  const numericCheck = validateExternalNewsDraftIntegrity({
    evidence: numericEvidence,
    facts: numericFacts,
    draft: { body: numericBad, headline: "الذهب عند 4350" },
  });
  assert(!numericCheck.ok, "Numeric drift must fail L1");
  assert(numericCheck.issues.some((i) => i.code === "NUMERIC_MISMATCH"), "Numeric mismatch code");

  const numericGood =
    `🚨 الذهب عند 4530` + `\n\nاستقر الذهب قرب 4530 والعائد عند 4.25%.` + FOOTER;
  const numericGoodCheck = validateExternalNewsDraftIntegrity({
    evidence: numericEvidence,
    facts: numericFacts,
    draft: { body: numericGood, headline: "الذهب عند 4530" },
  });
  assert(numericGoodCheck.ok, "Equivalent numeric formatting should pass");

  const uncertaintyEvidence = extractRssSourceEvidence(
    { title: "Oil may rise on supply concerns", contentSnippet: "Oil may rise if supply tightens." },
    "ForexLive"
  );
  const uncertaintyFacts = extractStructuredSourceFacts(uncertaintyEvidence);
  const uncertaintyBad = `🚨 النفط سيرتفع` + `\n\nمن المتوقع أن يرتفع النفط ب sharply.` + FOOTER;
  const uncertaintyCheck = validateExternalNewsDraftIntegrity({
    evidence: uncertaintyEvidence,
    facts: uncertaintyFacts,
    draft: { body: uncertaintyBad, headline: "النفط سيرتفع" },
  });
  assert(!uncertaintyCheck.ok, "Uncertainty upgrade must fail");
  assert(uncertaintyCheck.issues.some((i) => i.code === "UNCERTAINTY_UPGRADED"), "Uncertainty code");

  const quoteEvidence = extractRssSourceEvidence(
    { title: "CEO said profits improved", contentSnippet: "The CEO said profits improved last quarter." },
    "CNBC"
  );
  const quoteBad =
    `🚨 تحسن الأرباح` + `\n\nقال الرئيس التنفيذي: "الأرباح تحسنت بالتأكيد هذا الربع".` + FOOTER;
  const quoteCheck = validateExternalNewsDraftIntegrity({
    evidence: quoteEvidence,
    facts: extractStructuredSourceFacts(quoteEvidence),
    draft: { body: quoteBad, headline: "تحسن الأرباح" },
  });
  assert(!quoteCheck.ok, "Fabricated quote must fail");

  const goldFixture = JSON.parse(
    fs.readFileSync(
      path.join(root, "fixtures/news-intelligence/golden/production-incident-gold-malformed-editorial-20260820.json"),
      "utf8"
    )
  );
  const goldEvidence = extractRssSourceEvidence(
    {
      title: "Gold moves in session",
      contentSnippet: goldFixture.publication.rawSourceText,
    },
    "ForexLive"
  );
  const goldSemantic = validateSemanticPublication(goldFixture.publication, {
    body: goldFixture.malformedBody,
    title: goldFixture.publication.title,
  });
  assert(goldSemantic.ok === false, "Gold malformed fails semantic validation");
  const goldIntegrity = validateExternalNewsDraftIntegrity({
    evidence: goldEvidence,
    facts: extractStructuredSourceFacts(goldEvidence),
    draft: { body: goldFixture.malformedBody + FOOTER, headline: goldFixture.publication.title },
  });
  assert(!goldIntegrity.ok, "Gold malformed must fail editor L1");

  assert(classifyImageVisualType("https://cdn.example.com/chart/gold-daily.png") === VISUAL_TYPES.CHART, "Chart classify");
  const chartState = { stateOverride: { lastChartPublishedAt: new Date().toISOString() } };
  const chartItem = {
    title: "Gold update",
    link: "https://example.com/gold",
    mediaContent: [{ $: { url: "https://cdn.example.com/chart/gold-daily.png" } }],
  };
  const httpClient = {
    head: async () => ({ headers: { "content-type": "image/png", "content-length": "9000" } }),
    get: async () => ({ headers: { "content-type": "image/png", "content-length": "9000" }, data: { destroy() {} } }),
  };
  const chartLimited = await resolveRssSourceImageWithChartPolicy({
    source: "CNBC",
    item: chartItem,
    articleUrl: chartItem.link,
    httpClient,
    skipValidation: true,
    chartPolicy: chartState,
  });
  assert(chartLimited === null, "Second chart within 24h should be rate limited");
  const telemetry = getChartPolicyTelemetrySnapshot();
  assert(telemetry.chartImagesRateLimited >= 1, "Chart rate limit telemetry");

  const mediumTimeout = await reviewExternalNewsBeforePublish(
    {
      item: { title: "Sample market headline for medium fallback path", sourceName: "CNBC", impactLevel: "MEDIUM" },
      editorialMessage:
        `🚨 عينة` + `\n\nهذا نص قصير.` + FOOTER,
      rssPresentation: buildRssPublicationPresentation({
        sourceTitle: "Sample market headline for medium fallback path",
        editorialMessage: `🚨 عينة` + `\n\nهذا نص قصير.` + FOOTER,
      }),
      evidence: extractRssSourceEvidence({ title: "Sample market headline for medium fallback path", contentSnippet: "Sample snippet for market headline." }, "CNBC"),
    },
    { disableAi: true }
  );
  assert(mediumTimeout.ok || mediumTimeout.reasonCode, "Medium review returns terminal decision");

  const editorMetrics = getEditorTelemetrySnapshot();
  assert(editorMetrics.global.attempted >= 2, "Editor telemetry attempted");

  const workerSource = fs.readFileSync(path.join(root, "news-worker.js"), "utf8");
  assert(workerSource.includes("reviewExternalNewsBeforePublish"), "news-worker wires editor");
  assert(workerSource.includes("if (!latestNews.isTelegramSource)"), "Editor guarded to non-telegram RSS");
  assert(!/reviewExternalNewsBeforePublish[\s\S]{0,120}isTelegramSource/.test(workerSource), "Editor not called for telegram branch");

  console.log("external-news-editor-in-chief.test.cjs PASS");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
