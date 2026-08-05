const FINDING = Object.freeze({
  VALID: "VALID",
  LEGACY: "LEGACY",
  DUPLICATE: "DUPLICATE",
  STUCK: "STUCK",
  MISSING_DELIVERY: "MISSING_DELIVERY",
  INVALID_DATA: "INVALID_DATA",
});

function classifyHistoricalIntegrity({ triggeredAlerts = [], deliveryAttempts = [] }) {
  const attemptsByAlert = new Map();
  for (const row of deliveryAttempts) {
    const key = String(row.alert_id);
    if (!attemptsByAlert.has(key)) attemptsByAlert.set(key, []);
    attemptsByAlert.get(key).push(row);
  }

  const table = [
    { classification: FINDING.VALID, count: 0, action: "none" },
    { classification: FINDING.LEGACY, count: 0, action: "none" },
    { classification: FINDING.DUPLICATE, count: 0, action: "dry_run_only" },
    { classification: FINDING.STUCK, count: 0, action: "dry_run_only" },
    { classification: FINDING.MISSING_DELIVERY, count: 0, action: "dry_run_only" },
    { classification: FINDING.INVALID_DATA, count: 0, action: "dry_run_only" },
  ];

  const bump = (classification) => {
    const row = table.find((item) => item.classification === classification);
    if (row) row.count += 1;
  };

  const findings = [];

  for (const alert of triggeredAlerts) {
    const alertId = String(alert.id);
    const attempts = attemptsByAlert.get(alertId) || [];
    let classification = FINDING.VALID;
    let reason = "triggered_with_expected_state";

    if (!alert.triggered_at) {
      classification = FINDING.INVALID_DATA;
      reason = "triggered_missing_timestamp";
    } else if (attempts.length === 0) {
      classification = FINDING.LEGACY;
      reason = "pre_delivery_attempts_tracking";
    } else {
      const dupChannel = attempts.some((channel, idx, arr) =>
        arr.findIndex((x) => x.channel === channel.channel) !== idx
      );
      if (dupChannel) {
        classification = FINDING.DUPLICATE;
        reason = "duplicate_channel_attempt_row";
      }
    }

    bump(classification);
    findings.push({
      alertId,
      email: alert.user_email,
      classification,
      reason,
    });
  }

  return {
    table,
    findings,
    unknownCount: 0,
  };
}

module.exports = {
  FINDING,
  classifyHistoricalIntegrity,
};
