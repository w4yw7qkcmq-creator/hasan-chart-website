const FINDING = Object.freeze({
  VALID_LEGACY_DELIVERED: "VALID_LEGACY_DELIVERED",
  VALID_LEGACY_UNKNOWN_CHANNELS: "VALID_LEGACY_UNKNOWN_CHANNELS",
  MISSING_DELIVERY_EVIDENCE: "MISSING_DELIVERY_EVIDENCE",
  DUPLICATE: "DUPLICATE",
  STUCK: "STUCK",
  INVALID: "INVALID",
});

function hasDeliveryEvidence(alert, { notificationsByAlert = new Map(), attemptsByAlert = new Map() }) {
  const alertId = String(alert.id);
  const attempts = attemptsByAlert.get(alertId) || [];
  const notifications = notificationsByAlert.get(alertId) || [];

  if (attempts.some((row) => row.status === "sent")) return "delivery_attempts";
  if (notifications.length > 0) return "site_notification";
  if (alert.email_sent_at) return "email_sent_at";
  return null;
}

function classifyHistoricalIntegrity({
  triggeredAlerts = [],
  deliveryAttempts = [],
  notificationsByAlert = new Map(),
  activeAlertsBeyondTarget = [],
}) {
  const attemptsByAlert = new Map();
  for (const row of deliveryAttempts) {
    const key = String(row.alert_id);
    if (!attemptsByAlert.has(key)) attemptsByAlert.set(key, []);
    attemptsByAlert.get(key).push(row);
  }

  const table = [
    { classification: FINDING.VALID_LEGACY_DELIVERED, count: 0, action: "none" },
    { classification: FINDING.VALID_LEGACY_UNKNOWN_CHANNELS, count: 0, action: "none" },
    { classification: FINDING.MISSING_DELIVERY_EVIDENCE, count: 0, action: "dry_run_only" },
    { classification: FINDING.DUPLICATE, count: 0, action: "dry_run_only" },
    { classification: FINDING.STUCK, count: 0, action: "dry_run_only" },
    { classification: FINDING.INVALID, count: 0, action: "dry_run_only" },
  ];

  const bump = (classification) => {
    const row = table.find((item) => item.classification === classification);
    if (row) row.count += 1;
  };

  const findings = [];

  for (const alert of triggeredAlerts) {
    const alertId = String(alert.id);
    const attempts = attemptsByAlert.get(alertId) || [];
    let classification = FINDING.VALID_LEGACY_DELIVERED;
    let reason = "triggered_with_delivery_evidence";

    if (!alert.triggered_at) {
      classification = FINDING.INVALID;
      reason = "triggered_missing_timestamp";
    } else {
      const evidence = hasDeliveryEvidence(alert, { notificationsByAlert, attemptsByAlert });
      const dupNotifications = (notificationsByAlert.get(alertId) || []).length > 1;
      const dupAttempts = attempts.length > 3;

      if (dupNotifications || dupAttempts) {
        classification = FINDING.DUPLICATE;
        reason = dupNotifications ? "duplicate_site_notifications" : "duplicate_delivery_attempt_rows";
      } else if (evidence === "email_sent_at" || evidence === "site_notification" || evidence === "delivery_attempts") {
        classification = FINDING.VALID_LEGACY_DELIVERED;
        reason = evidence;
      } else if (alert.status === "triggered" && alert.triggered_at) {
        classification = FINDING.VALID_LEGACY_UNKNOWN_CHANNELS;
        reason = "triggered_status_legacy_semantics";
      } else {
        classification = FINDING.MISSING_DELIVERY_EVIDENCE;
        reason = "no_site_email_or_attempt_evidence";
      }
    }

    bump(classification);
    findings.push({ alertId, classification, reason });
  }

  for (const stuck of activeAlertsBeyondTarget) {
    bump(FINDING.STUCK);
    findings.push({
      alertId: String(stuck.id),
      classification: FINDING.STUCK,
      reason: stuck.reason || "active_beyond_target_with_fresh_quote",
    });
  }

  return {
    table,
    findings,
    unknownCount: 0,
    missingDeliveryEvidenceCount: findings.filter(
      (f) => f.classification === FINDING.MISSING_DELIVERY_EVIDENCE
    ).length,
    duplicateCount: findings.filter((f) => f.classification === FINDING.DUPLICATE).length,
  };
}

module.exports = {
  FINDING,
  classifyHistoricalIntegrity,
  hasDeliveryEvidence,
};
