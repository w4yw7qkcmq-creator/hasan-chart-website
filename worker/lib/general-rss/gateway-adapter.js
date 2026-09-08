const { PUBLICATION_TYPES, DESTINATIONS, SOURCE_TYPES } = require("../news-intelligence/publication-types");
const { normalizeLink } = require("../news-ingestion/rss-item-identity");

/** @readonly */
const PREVALIDATED_RSS_CONTRACT = "rss_general_v1";

function isPrevalidatedRssGeneralPublication(publication = {}) {
  return (
    publication?.sourceType === SOURCE_TYPES.RSS_GENERAL &&
    publication?.publicationType === PUBLICATION_TYPES.GENERAL_NEWS &&
    publication?.metadata?.prevalidatedRssContract === PREVALIDATED_RSS_CONTRACT
  );
}

function buildRssPublicationEventKey(sourceLink = "") {
  const normalized = normalizeLink(sourceLink);
  if (!normalized) {
    return null;
  }
  return `rss:${normalized}`;
}

function buildPrevalidatedRssGatewayPublication(input = {}) {
  const {
    latestNews,
    approvedRssPresentation,
    publicationMessage,
    finalImage,
    sourceImageResult,
    imageTitle,
    combinedTopicCluster,
    combinedNewsIdentity,
    normalizedDedupeTitle,
  } = input;

  const sourceLink = latestNews?.link || null;
  const eventKey = buildRssPublicationEventKey(sourceLink);
  const siteTitle = approvedRssPresentation?.siteTitle || latestNews?.title || imageTitle || "";
  const siteContent = approvedRssPresentation?.siteContent || publicationMessage || "";
  const dedupeMarkerTitle = (approvedRssPresentation?.siteTitle || combinedNewsIdentity || siteTitle).slice(0, 500);

  return {
    eventKey,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    sourceId: latestNews?.sourceName || latestNews?.feedUrl || "rss",
    destination: DESTINATIONS.BOTH,
    title: siteTitle,
    body: publicationMessage,
    bodySource: "formatted",
    sourceLink,
    importance: latestNews?.impactLevel || "MEDIUM",
    imageUrl: finalImage || null,
    deferPostPublishSideEffects: true,
    metadata: {
      prevalidatedRssContract: PREVALIDATED_RSS_CONTRACT,
      siteContent,
      telegramMessage: publicationMessage,
      imageTitle,
      visualType: sourceImageResult?.visualType || null,
      rssImageResolutionAttempted: latestNews?.isTelegramSource !== true,
      topicCluster: combinedTopicCluster || null,
      dedupeMarkerTitle,
      dedupeMarkerNormalizedTitle: normalizedDedupeTitle || dedupeMarkerTitle,
      sourceLink,
    },
  };
}

async function publishPrevalidatedRssViaGateway(gateway, publication, deps = {}) {
  return gateway.publish(publication, deps);
}

async function retryPrevalidatedRssGatewayPublication(gateway, publicationRecord, options = {}, deps = {}) {
  return gateway.retryDelivery(publicationRecord, options, deps);
}

module.exports = {
  PREVALIDATED_RSS_CONTRACT,
  isPrevalidatedRssGeneralPublication,
  buildRssPublicationEventKey,
  buildPrevalidatedRssGatewayPublication,
  publishPrevalidatedRssViaGateway,
  retryPrevalidatedRssGatewayPublication,
};
