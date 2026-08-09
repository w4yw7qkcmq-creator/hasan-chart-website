const { REASON_CODES } = require("./reason-taxonomy");
const { recordDecision } = require("./decision-record");
const { logAutonomyEvent } = require("./structured-log");

async function reconcileDelivery(publicationRecord, gateway, deps = {}) {
  if (!publicationRecord) {
    return { ok: false, reason: "missing_publication_record" };
  }

  const telegramOk = publicationRecord.telegramLegStatus === "success";
  const siteOk = publicationRecord.siteLegStatus === "success";

  if (telegramOk && siteOk) {
    return { ok: true, action: "none" };
  }

  if (telegramOk && !siteOk) {
    logAutonomyEvent("NEWS_DELIVERY_RECONCILE", { retryLeg: "site_only", eventKey: publicationRecord.eventKey });
    const result = await gateway.retryDelivery(publicationRecord, { retryLeg: "site_only", skipTelegram: true }, deps);
    recordDecision({
      correlationId: deps.correlationId,
      eventKey: publicationRecord.eventKey,
      reasonCode: result.siteInserted ? REASON_CODES.DELIVERY_RECOVERED : REASON_CODES.DELIVERY_RETRIED,
      deliveryResult: { telegramOk, siteOk: result.siteInserted, retryLeg: "site_only" },
    });
    return { ok: result.siteInserted === true, action: "site_retry", result };
  }

  if (!telegramOk && siteOk) {
    logAutonomyEvent("NEWS_DELIVERY_RECONCILE", { retryLeg: "telegram_only", eventKey: publicationRecord.eventKey });
    const result = await gateway.retryDelivery(
      publicationRecord,
      { retryLeg: "telegram_only", skipSite: true },
      deps
    );
    recordDecision({
      correlationId: deps.correlationId,
      eventKey: publicationRecord.eventKey,
      reasonCode: result.telegramSent ? REASON_CODES.DELIVERY_RECOVERED : REASON_CODES.DELIVERY_RETRIED,
      deliveryResult: { telegramOk: result.telegramSent, siteOk, retryLeg: "telegram_only" },
    });
    return { ok: result.telegramSent === true, action: "telegram_retry", result };
  }

  recordDecision({
    correlationId: deps.correlationId,
    eventKey: publicationRecord.eventKey,
    reasonCode: REASON_CODES.DELIVERY_FAILED,
    deliveryResult: { telegramOk, siteOk },
  });
  return { ok: false, action: "both_failed" };
}

module.exports = {
  reconcileDelivery,
};
