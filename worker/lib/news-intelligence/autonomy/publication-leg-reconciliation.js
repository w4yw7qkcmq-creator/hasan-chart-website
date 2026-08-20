const { logAutonomyEvent } = require("./structured-log");
const { LEG_STATUS } = require("../publication-store");

const DEFAULT_STALE_AGE_MS = 30 * 60_000;

function isCanaryPublicationRow(row = {}) {
  const metadata = row.metadata || {};
  return (
    metadata.canary === true ||
    metadata.test === true ||
    metadata.synthetic === true ||
    metadata.replay === true ||
    row.source_type === "canary" ||
    String(row.event_key || "").startsWith("CANARY:")
  );
}

function mapDbRow(row) {
  return {
    id: row.id,
    eventKey: row.event_key,
    publicationType: row.publication_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata: row.metadata || {},
    telegramLegStatus: row.telegram_leg_status || LEG_STATUS.PENDING,
    siteLegStatus: row.site_leg_status || LEG_STATUS.PENDING,
    acquiredAt: row.created_at,
  };
}

async function gatherDeliveryEvidence(supabase, row) {
  const metadata = row.metadata || {};
  const sourceLink = metadata.sourceLink || null;
  const eventKey = row.event_key;

  const checks = {
    telegramPublished: false,
    sitePublished: false,
    decisionPublished: false,
  };

  if (sourceLink) {
    const [publishedNews, newsPosts] = await Promise.all([
      supabase.from("published_news").select("id").eq("link", sourceLink).limit(1),
      supabase.from("news_posts").select("id").eq("source_link", sourceLink).limit(1),
    ]);
    checks.telegramPublished = Boolean(publishedNews.data?.length);
    checks.sitePublished = Boolean(newsPosts.data?.length);
  }

  if (eventKey) {
    const { data } = await supabase
      .from("news_decision_records")
      .select("reason_code, delivery_result")
      .eq("event_key", eventKey)
      .eq("reason_code", "PUBLISHED")
      .order("decision_at", { ascending: false })
      .limit(1);
    if (data?.length) {
      checks.decisionPublished = true;
      const delivery = data[0].delivery_result || {};
      if (delivery.telegramSent === true) checks.telegramPublished = true;
      if (delivery.siteInserted === true) checks.sitePublished = true;
    }
  }

  return checks;
}

function resolveLegStatesFromEvidence(evidence, row) {
  const telegramPending = row.telegram_leg_status === LEG_STATUS.PENDING;
  const sitePending = row.site_leg_status === LEG_STATUS.PENDING;

  if (!telegramPending && !sitePending) {
    return { action: "none" };
  }

  if (evidence.telegramPublished && evidence.sitePublished) {
    return {
      action: "mark_both_success",
      telegramLegStatus: LEG_STATUS.SUCCESS,
      siteLegStatus: LEG_STATUS.SUCCESS,
      reconciliationReason: "delivery_evidence_both",
    };
  }

  if (evidence.telegramPublished && !evidence.sitePublished) {
    return {
      action: "telegram_success_site_failed",
      telegramLegStatus: LEG_STATUS.SUCCESS,
      siteLegStatus: sitePending ? LEG_STATUS.FAILED : row.site_leg_status,
      reconciliationReason: "delivery_evidence_telegram_only",
    };
  }

  if (!evidence.telegramPublished && evidence.sitePublished) {
    return {
      action: "site_success_telegram_failed",
      telegramLegStatus: telegramPending ? LEG_STATUS.FAILED : row.telegram_leg_status,
      siteLegStatus: LEG_STATUS.SUCCESS,
      reconciliationReason: "delivery_evidence_site_only",
    };
  }

  if (evidence.decisionPublished) {
    return {
      action: "mark_both_success_from_decision",
      telegramLegStatus: LEG_STATUS.SUCCESS,
      siteLegStatus: LEG_STATUS.SUCCESS,
      reconciliationReason: "decision_record_published",
    };
  }

  return {
    action: "mark_stale_failed",
    telegramLegStatus: telegramPending ? LEG_STATUS.FAILED : row.telegram_leg_status,
    siteLegStatus: sitePending ? LEG_STATUS.FAILED : row.site_leg_status,
    reconciliationReason: "stale_pending_no_delivery_evidence",
  };
}

async function reconcilePublicationRow(supabase, row, options = {}) {
  if (isCanaryPublicationRow(row)) {
    const now = new Date().toISOString();
    const metadata = {
      ...(row.metadata || {}),
      canary: true,
      reconciliationReason: options.canaryReason || "canary_excluded_from_prod_health",
      reconciledAt: now,
    };
    const { error } = await supabase
      .from("news_event_publications")
      .update({
        telegram_leg_status: LEG_STATUS.SKIPPED,
        site_leg_status: LEG_STATUS.SKIPPED,
        metadata,
      })
      .eq("id", row.id)
      .or("telegram_leg_status.eq.pending,site_leg_status.eq.pending");

    return { ok: !error, action: "canary_skipped", error: error?.message || null };
  }

  const evidence = await gatherDeliveryEvidence(supabase, row);
  const resolution = resolveLegStatesFromEvidence(evidence, row);
  if (resolution.action === "none") {
    return { ok: true, action: "none" };
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(row.metadata || {}),
    reconciliationReason: resolution.reconciliationReason,
    reconciledAt: now,
    stalePendingDetected: true,
  };

  const { error } = await supabase
    .from("news_event_publications")
    .update({
      telegram_leg_status: resolution.telegramLegStatus,
      site_leg_status: resolution.siteLegStatus,
      metadata,
    })
    .eq("id", row.id);

  if (!error) {
    logAutonomyEvent("NEWS_PUBLICATION_LEG_RECONCILED", {
      eventKey: row.event_key,
      action: resolution.action,
      reconciliationReason: resolution.reconciliationReason,
    });
  }

  return {
    ok: !error,
    action: resolution.action,
    reconciliationReason: resolution.reconciliationReason,
    error: error?.message || null,
  };
}

async function reconcileStalePublicationLegs(supabase, options = {}) {
  if (!supabase) {
    return { reconciled: 0, skipped: true };
  }

  const staleAgeMs = options.staleAgeMs || DEFAULT_STALE_AGE_MS;
  const cutoff = new Date(Date.now() - staleAgeMs).toISOString();
  const { data, error } = await supabase
    .from("news_event_publications")
    .select("*")
    .or("telegram_leg_status.eq.pending,site_leg_status.eq.pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(options.limit || 50);

  if (error) {
    return { reconciled: 0, error: error.message };
  }

  let reconciled = 0;
  const results = [];
  for (const row of data || []) {
    const result = await reconcilePublicationRow(supabase, row, options);
    results.push({ eventKey: row.event_key, ...result });
    if (result.ok && result.action !== "none") {
      reconciled += 1;
    }
  }

  return { reconciled, examined: (data || []).length, results };
}

module.exports = {
  isCanaryPublicationRow,
  gatherDeliveryEvidence,
  resolveLegStatesFromEvidence,
  reconcilePublicationRow,
  reconcileStalePublicationLegs,
};
