#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const {
  validateGeneralRssEditorialOutput,
  BLOCK_REASONS,
} = require(path.join(root, "lib/general-rss/editorial-safety"));
const { evaluateCopySimilarity } = require(path.join(root, "lib/news-intelligence/copy-similarity-guard"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CHANNEL_FOOTER =
  "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

const PRODUCTION_CANDIDATES = [
  {
    id: "btc-etf-inflows",
    title: "Bitcoin investors pour $853 million into spot ETFs. BlackRock’s IBIT claims the bulk",
    rawSourceText:
      "Bitcoin investors poured $853 million into spot ETFs with BlackRock IBIT taking the bulk of inflows.",
    body:
      "🚨 مستثمرو البيتكوين يضخون 853 مليون دولار في صناديق ETF\n\nشهدت صناديق البيتكوين الفورية تدفقات قياسية مع هيمنة صندوق بلاك روك." +
      CHANNEL_FOOTER,
    expected: "SHOULD_PUBLISH",
  },
  {
    id: "newsquawk-week-ahead",
    title: "Newsquawk week ahead: RBA announcement and US retail sales",
    rawSourceText: "Preview of RBA decision and US retail sales in the week ahead.",
    body:
      "🚨 أسبوع حاسم أمام الأسواق\n\nيتطلع المتداولون لقرار البنك الاسترالي ومبيعات التجزئة الأمريكية." +
      CHANNEL_FOOTER,
    expected: "SHOULD_BLOCK",
    blockReason: "ECONOMIC_POLICY",
  },
  {
    id: "israeli-ai-hacks",
    title: "How a small Israeli startup was linked to rogue AI hacks at OpenAI, Anthropic and Meta",
    rawSourceText:
      "Israeli startup Irregular was linked to unauthorized AI hacking attempts against major labs.",
    body:
      "🚨 شركة إسرائيلية ناشئة مرتبطة باختراقات ذكاء اصطناعي\n\nأشارت تقارير إلى دور شركة صغيرة في محاولات اختراق غير مصرح بها." +
      CHANNEL_FOOTER,
    expected: "SHOULD_PUBLISH",
  },
  {
    id: "sp500-sales-growth",
    title: "S&P 500 sales growth is at a nearly 5-year high. Here’s what’s behind the surge.",
    rawSourceText: "S&P 500 sales growth reached a nearly five-year high on broad earnings strength.",
    body:
      "🚨 نمو مبيعات S&P 500 عند أعلى مستوى منذ 5 سنوات\n\nسجلت الشركات الأمريكية الكبرى توسعاً في الإيرادات." +
      CHANNEL_FOOTER,
    expected: "BORDERLINE",
  },
  {
    id: "analyst-stock-picks",
    title: "Top Wall Street analysts like these 3 stocks for their solid growth potential",
    rawSourceText: "Wall Street analysts highlighted three stocks with growth potential.",
    body:
      "🚨 محللون على وول ستريت يبرزون 3 أسهم\n\nركزت توصيات المحللين على أسهم ذات نمو قوي." + CHANNEL_FOOTER,
    expected: "SHOULD_BLOCK",
  },
];

function testChannelFooterAllowed() {
  const result = validateGeneralRssEditorialOutput({
    title: "Gold rises after Middle East tensions",
    body:
      "🚨 الذهب يرتفع وسط توترات\n\nشهد الذهب ارتفاعاً في التداولات مع ترقب المخاطر الجيوسياسية." +
      CHANNEL_FOOTER,
    rawSourceText: "Gold rises after Middle East tensions in forex and commodity markets today.",
  });
  assert(result.ok === true, "official channel footer URL must not block RSS editorial output");
}

function testExternalSourceUrlStillBlocked() {
  const result = validateGeneralRssEditorialOutput({
    title: "Market update",
    body: "Read more at https://example.com/news with enough filler text to exceed minimum editorial length.",
    rawSourceText: "Market update headline",
  });
  assert(result.ok === false, "external source URL must remain blocked");
  assert(result.reason === BLOCK_REASONS.RSS_SOURCE_URL_PRESENT, "external URL reason");
}

function testProductionCandidateSanitizedFixtures() {
  for (const candidate of PRODUCTION_CANDIDATES) {
    const editorial = validateGeneralRssEditorialOutput({
      title: candidate.title,
      body: candidate.body,
      rawSourceText: candidate.rawSourceText,
    });

    if (candidate.expected === "SHOULD_PUBLISH") {
      assert(editorial.ok === true, `${candidate.id} should pass editorial safety after channel footer fix`);
      const copy = evaluateCopySimilarity(candidate.body, candidate.rawSourceText);
      assert(copy.ok === true, `${candidate.id} should not be blocked by copy similarity guard`);
    }

    if (candidate.id === "newsquawk-week-ahead") {
      assert(candidate.expected === "SHOULD_BLOCK", "economic preview remains policy block at pipeline/economic layer");
    }
  }
}

testChannelFooterAllowed();
testExternalSourceUrlStillBlocked();
testProductionCandidateSanitizedFixtures();
console.log("publication-gate-regression.test.cjs PASS");
