const {
  createNewsPublisherGateway,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
  BLOCK_REASONS,
} = require("../../worker/lib/news-intelligence/publisher-gateway");
const { detectNumericEconomicReleaseCandidate } = require("../../worker/lib/news-intelligence/economic-event-detector");
const { formatEconomicReleaseMessage } = require("../../worker/lib/economic-releases/format");
const { CANONICAL_EVENT_DEFINITIONS } = require("../../worker/lib/economic-releases/canonical-events");
const { mergeProviderEvents } = require("../../worker/lib/economic-releases/normalize");

function buildManualPublicationBody(body) {
  const analysis = String(body.analysis || "").trim();
  return (
    `🚨 ${body.title}\n\n` +
    `▪️ السابق: ${body.previous}\n` +
    `▪️ المتوقع: ${body.forecast}\n` +
    `▫️ الحالي: ${body.actual}\n\n` +
    (analysis ? `📊 ${analysis}\n\n` : "") +
    `📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅`
  );
}

async function handleManualSendNewsRequest(body, deps = {}) {
  const detected = detectNumericEconomicReleaseCandidate({
    title: body?.title,
    text: body?.analysis,
    actual: body?.actual,
    forecast: body?.forecast,
    previous: body?.previous,
  });

  if (detected.isNumericEconomicCandidate) {
    const gateway = createNewsPublisherGateway({
      runtimeMode: deps.runtimeMode,
      forceMemory: deps.forceMemory === true,
      supabase: deps.supabase || null,
    });

    let formattedBody = buildManualPublicationBody(body);
    if (detected.eventType && CANONICAL_EVENT_DEFINITIONS[detected.eventType]) {
      try {
        const merged = mergeProviderEvents([
          {
            eventKey: detected.eventType,
            title: body.title,
            country: "US",
            scheduledAt: new Date().toISOString(),
            actual: body.actual,
            forecast: body.forecast,
            previous: body.previous,
            sourceName: "manual_api",
            sourceTimestamp: new Date().toISOString(),
          },
        ]);
        formattedBody = formatEconomicReleaseMessage(merged, CANONICAL_EVENT_DEFINITIONS[detected.eventType]);
      } catch (_error) {
        // keep manual formatted body
      }
    }

    const result = await gateway.publish(
      {
        eventType: detected.eventType,
        publicationType: PUBLICATION_TYPES.RELEASE,
        sourceType: SOURCE_TYPES.MANUAL_API,
        sourceId: body?.claimedSourceChannel || body?.sourceChannel || "manual_admin",
        title: body?.title,
        body: formattedBody,
        bodySource: "formatted",
        releaseDate: new Date().toISOString(),
        facts: detected.facts,
        destination: "telegram",
        sourceLink: `manual-api:${Date.now()}`,
      },
      {
        dryRun: body?.dryRun === true,
        sendTelegramMessage: deps.sendTelegramMessage,
      }
    );

    if (result.blocked) {
      return {
        success: false,
        blocked: true,
        reason: result.reason,
        stage: result.stage,
        eventKey: result.eventKey,
      };
    }

    if (result.failed) {
      return { success: false, error: result.reason || "publication_failed" };
    }

    return {
      success: true,
      dryRun: result.dryRun === true,
      eventKey: result.eventKey,
      published: result.published === true,
    };
  }

  return {
    success: false,
    blocked: true,
    reason: BLOCK_REASONS.EDITORIAL_OUTPUT_INVALID,
    detail: "manual_non_economic_not_supported_in_phase1",
  };
}

module.exports = {
  handleManualSendNewsRequest,
  buildManualPublicationBody,
};
