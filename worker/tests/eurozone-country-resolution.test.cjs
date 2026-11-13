#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..");
const { resolveCountryCode } = require(path.join(root, "lib/economic-releases/country-resolver"));
const { resolveCanonicalEventKey } = require(path.join(root, "lib/economic-releases/canonical-events"));
const { resolveEventTypeFromAliases } = require(path.join(root, "lib/news-intelligence/event-registry"));
const { decodeTelegramHtml, parseTelegramChannelHtml } = require(path.join(root, "lib/telegram-news/fetcher"));
const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { processTelegramPosts } = require(path.join(root, "lib/telegram-news/dedupe"));
const {
  buildSingleStructuredOutput,
  formatSingleEditorial,
} = require(path.join(root, "lib/news-intelligence/economic-editorial/arabic-formatter"));
const {
  resetCheckpointStoreForTests,
  hydrateFromDb,
  markTelegramMessageSeen,
  classifyTelegramMessage,
  getTelegramState,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));

function releaseText(titleLines, reading = "إيجابي لليورو الأوروبي") {
  return [
    "عاجل صدر الآن :",
    ...titleLines,
    "السابق : 0.5%",
    "التقدير : 1.3%",
    "الحالي : 1.3%",
    `النتيجة : ${reading}`,
  ].join("\n");
}

function post(id, rawText) {
  return {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: String(id),
    sourceUrl: `https://t.me/ForexBreakingNews/${id}`,
    sourcePublishedAt: "2026-11-13T10:00:00+00:00",
    priority: 1,
    rawText,
    sourceRawText: rawText,
  };
}

function headlineOf(facts) {
  const editorial = buildSingleStructuredOutput({
    eventType: facts.canonicalEventKey,
    countryCode: facts.countryCode,
    country: facts.country,
    previous: facts.previous,
    forecast: facts.forecast,
    actual: facts.actual,
    publishedReading: facts.publishedReading,
    canonicalDisplayName: facts.canonicalDisplayName,
  });
  return formatSingleEditorial(editorial);
}

function assertEurozoneGdp(facts, label) {
  assert.strictEqual(facts.countryCode, "EZ", `${label} country`);
  assert.strictEqual(facts.canonicalEventKey, "EZ_GDP", `${label} event`);
  assert.strictEqual(facts.previous, "0.5%", `${label} previous`);
  assert.strictEqual(facts.forecast, "1.3%", `${label} forecast`);
  assert.strictEqual(facts.actual, "1.3%", `${label} actual`);
  assert.match(String(facts.publishedReading || ""), /إيجابي لليورو/, `${label} reading`);
  const body = headlineOf(facts);
  assert.match(body, /الناتج المحلي لمنطقة اليورو/);
  assert.match(body, /منطقة اليورو 🇪🇺/);
  assert.doesNotMatch(body, /الأمريكي|🇺🇸/);
}

async function testEuropeWord() {
  const facts = extractFactsFromTelegramPost(
    post(1, releaseText(["أوروبا - الناتج الإجمالي المحلي"]))
  );
  assertEurozoneGdp(facts, "أوروبا");
}

async function testEuropeAlefVariant() {
  const facts = extractFactsFromTelegramPost(
    post(2, releaseText(["اوروبا - الناتج المحلي الإجمالي"]))
  );
  assertEurozoneGdp(facts, "اوروبا");
}

async function testEuropeFlag() {
  const facts = extractFactsFromTelegramPost(
    post(3, releaseText(["🇪🇺", "الناتج الإجمالي المحلي"]))
  );
  assertEurozoneGdp(facts, "flag");
}

async function testFlagInsideTgEmoji() {
  const html = [
    '<div class="tgme_widget_message_wrap">',
    '<div data-post="ForexBreakingNews/44" class="tgme_widget_message">',
    '<div class="tgme_widget_message_text js-message_text" dir="auto">',
    '<tg-emoji emoji-id="5388843996724754460"><i class="emoji"><b>🇪🇺</b></i></tg-emoji>',
    " الناتج الإجمالي المحلي<br/>السابق : 0.5%<br/>التقدير : 1.3%<br/>الحالي : 1.3%<br/>النتيجة : إيجابي لليورو الأوروبي",
    "</div>",
    '<time datetime="2026-11-13T10:00:00+00:00"></time>',
    "</div></div>",
  ].join("");
  const decoded = decodeTelegramHtml(
    '<tg-emoji emoji-id="1"><i class="emoji"><b>🇪🇺</b></i></tg-emoji> الناتج الإجمالي المحلي'
  );
  assert.match(decoded, /🇪🇺/, "tg-emoji fallback flag is kept");
  const parsed = parseTelegramChannelHtml(html, { name: "ForexBreakingNews", priority: 1 });
  assert.strictEqual(parsed.length, 1);
  assert.match(parsed[0].sourceRawText, /🇪🇺/);
  const facts = extractFactsFromTelegramPost(parsed[0]);
  assertEurozoneGdp(facts, "tg-emoji");
}

async function testEuropeEconomicContextWithoutFlag() {
  const facts = extractFactsFromTelegramPost(
    post(
      5,
      releaseText(["منطقة اليورو - الناتج الإجمالي المحلي"])
    )
  );
  assertEurozoneGdp(facts, "ecb context");
}

async function testExplicitUsGdp() {
  const facts = extractFactsFromTelegramPost(
    post(
      6,
      releaseText(["أمريكا - الناتج المحلي الإجمالي"], "إيجابي للدولار الأمريكي")
    )
  );
  assert.strictEqual(facts.countryCode, "US");
  assert.strictEqual(facts.canonicalEventKey, "US_GDP_QOQ");
  assert.strictEqual(facts.previous, "0.5%");
  assert.strictEqual(facts.forecast, "1.3%");
  assert.strictEqual(facts.actual, "1.3%");
  assert.match(String(facts.publishedReading || ""), /دولار/);
  assert.match(String(facts.publishedReading || ""), /أمريك/);
  const body = headlineOf(facts);
  assert.match(body, /الناتج المحلي الإجمالي الأمريكي/);
  assert.match(body, /الولايات المتحدة 🇺🇸/);
  assert.doesNotMatch(body, /منطقة اليورو|🇪🇺/);
}

async function testGdpWithoutCountryDoesNotDefaultToUs() {
  const facts = extractFactsFromTelegramPost(
    post(7, releaseText(["الناتج الإجمالي المحلي"], "دون اتجاه واضح"))
  );
  assert.notStrictEqual(facts.countryCode, "US");
  assert.notStrictEqual(facts.canonicalEventKey, "US_GDP_QOQ");
  assert.strictEqual(facts.eventMatchAmbiguous, true);
  const canonical = resolveCanonicalEventKey("الناتج الإجمالي المحلي");
  assert.strictEqual(canonical.eventKey, null);
  assert.strictEqual(canonical.ambiguous, true);
  const processed = await processTelegramPosts([post(7, releaseText(["الناتج الإجمالي المحلي"], "دون اتجاه واضح"))], {
    disableAi: true,
  });
  assert.strictEqual(processed.length, 1);
  assert.strictEqual(processed[0].skipPublish, true);
  assert.strictEqual(processed[0].formattedMessage, null);
}

async function testConflictingUsAndEuropeSignals() {
  const text = releaseText(["أمريكا - الناتج الإجمالي المحلي", "أوروبا - الناتج الإجمالي المحلي"]);
  assert.strictEqual(resolveCountryCode(text), null);
  const facts = extractFactsFromTelegramPost(post(8, text));
  assert.strictEqual(facts.countryResolutionStatus, "ambiguous");
  assert.strictEqual(facts.countryCode, null);
  const processed = await processTelegramPosts([post(8, text)], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, true);
  assert.strictEqual(processed[0].formattedMessage, null);
  assert.strictEqual(processed[0].reason, "AMBIGUOUS_REGION_SKIPPED");
}

async function testGeographicEuropeDoesNotOverrideExplicitCountry() {
  const uk = extractFactsFromTelegramPost(
    post(
      9,
      [
        "بريطانيا - الناتج المحلي الإجمالي",
        "السابق : 0.1%",
        "التقدير : 0.2%",
        "الحالي : 0.3%",
        "النمو في أوروبا بقي ضعيفًا",
      ].join("\n")
    )
  );
  assert.strictEqual(uk.countryCode, "UK");
  assert.strictEqual(uk.canonicalEventKey, "UK_GDP");
  assert.strictEqual(uk.previous, "0.1%");
  const ukBody = headlineOf(uk);
  assert.match(ukBody, /المملكة المتحدة 🇬🇧/);
  assert.doesNotMatch(ukBody, /منطقة اليورو|🇪🇺/);

  const ch = extractFactsFromTelegramPost(
    post(
      10,
      [
        "سويسرا - الناتج المحلي الإجمالي",
        "السابق : 0.1%",
        "التقدير : 0.2%",
        "الحالي : 0.3%",
        "الطلب من أوروبا تراجع",
      ].join("\n")
    )
  );
  assert.strictEqual(ch.countryCode, "CH");
  assert.strictEqual(ch.canonicalEventKey, "CH_GDP");
  const chBody = headlineOf(ch);
  assert.match(chBody, /سويسرا 🇨🇭/);
  assert.doesNotMatch(chBody, /منطقة اليورو|🇪🇺/);
}

async function testSkippedMessageDoesNotBlockEligibleSibling() {
  const ambiguous = post(200, releaseText(["الناتج الإجمالي المحلي"], "دون اتجاه واضح"));
  const eligible = post(
    201,
    releaseText(["أوروبا - الناتج الإجمالي المحلي"]).replace("0.5%", "0.4%").replace("1.3%", "0.6%")
  );
  eligible.sourcePublishedAt = "2026-11-13T10:05:00+00:00";
  const processed = await processTelegramPosts([ambiguous, eligible], { disableAi: true });
  const skipped = processed.find((item) => String(item.post.sourceMessageId) === "200");
  const published = processed.filter((item) => String(item.post.sourceMessageId) === "201");
  assert.ok(skipped);
  assert.strictEqual(skipped.skipPublish, true);
  assert.strictEqual(published.length, 1, "eligible message is not duplicated");
  assert.strictEqual(published[0].skipPublish, false);
  assert.match(published[0].formattedMessage, /0\.4%/);
  assert.match(published[0].formattedMessage, /منطقة اليورو|اليورو/);
  assert.doesNotMatch(published[0].formattedMessage, /الأمريكي/);
}

function testCheckpointSkipDoesNotHideLaterNews() {
  resetCheckpointStoreForTests();
  hydrateFromDb(null);
  const channel = "ForexBreakingNews";
  markTelegramMessageSeen(channel, { sourceMessageId: "200" }, { outcome: "processed" });
  const state = getTelegramState(channel);
  assert.strictEqual(state.highestMessageId, 0);
  assert.strictEqual(classifyTelegramMessage(channel, { sourceMessageId: "200" }).new, false);
  assert.strictEqual(classifyTelegramMessage(channel, { sourceMessageId: "201" }).new, true);
  assert.strictEqual(classifyTelegramMessage(channel, { sourceMessageId: "199" }).new, true);
}

async function testEcbInstitutionNameDoesNotClassifyGdpAsRate() {
  const facts = extractFactsFromTelegramPost(
    post(11, releaseText(["البنك المركزي الأوروبي", "الناتج الإجمالي المحلي"]))
  );
  assertEurozoneGdp(facts, "ecb institution on gdp");
  assert.doesNotMatch(headlineOf(facts), /قرار الفائدة/);
  assert.strictEqual(
    resolveCanonicalEventKey("البنك المركزي الأوروبي\nالناتج المحلي", { countryCode: "EZ" }).eventKey,
    "EZ_GDP"
  );
}

async function testEcbRateDecisionStillRequiresRateLanguage() {
  const facts = extractFactsFromTelegramPost(
    post(12, releaseText(["البنك المركزي الأوروبي", "قرار الفائدة"], "محايد"))
  );
  assert.strictEqual(facts.countryCode, "EZ");
  assert.strictEqual(facts.canonicalEventKey, "EZ_ECB_RATE_DECISION");
  assert.match(headlineOf(facts), /قرار الفائدة الأوروبية/);
  assert.strictEqual(
    resolveEventTypeFromAliases("ECB rate decision previous 2.40 forecast 2.65 actual 2.65", { countryCode: "EZ" }),
    "EZ_ECB_RATE_DECISION"
  );
  assert.strictEqual(
    resolveCanonicalEventKey("European Central Bank rate decision", { countryCode: "EZ" }).eventKey,
    "EZ_ECB_RATE_DECISION"
  );
  assert.notStrictEqual(
    resolveEventTypeFromAliases("البنك المركزي الأوروبي\nالناتج الإجمالي المحلي", { countryCode: "EZ" }),
    "EZ_ECB_RATE_DECISION"
  );
}

function testKnownUsEventsStayStable() {
  assert.strictEqual(resolveEventTypeFromAliases("Initial Jobless Claims"), "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(resolveCanonicalEventKey("Nonfarm Payrolls").eventKey, "US_NFP");
  assert.strictEqual(resolveCanonicalEventKey("US CPI", { countryCode: "US" }).eventKey, "US_CPI_GENERIC");
}

async function main() {
  await testEuropeWord();
  await testEuropeAlefVariant();
  await testEuropeFlag();
  await testFlagInsideTgEmoji();
  await testEuropeEconomicContextWithoutFlag();
  await testExplicitUsGdp();
  await testGdpWithoutCountryDoesNotDefaultToUs();
  await testConflictingUsAndEuropeSignals();
  await testGeographicEuropeDoesNotOverrideExplicitCountry();
  await testSkippedMessageDoesNotBlockEligibleSibling();
  testCheckpointSkipDoesNotHideLaterNews();
  await testEcbInstitutionNameDoesNotClassifyGdpAsRate();
  await testEcbRateDecisionStillRequiresRateLanguage();
  testKnownUsEventsStayStable();
  console.log("eurozone-country-resolution: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
